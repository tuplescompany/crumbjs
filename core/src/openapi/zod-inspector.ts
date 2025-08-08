// zod-schema.inspector.ts
// ──────────────────────────────────────────────────────────────────────────────
import { z, type ZodType, ZodObject, ZodOptional, ZodDefault, type ZodRawShape } from 'zod';
import type { JSONSchema } from 'zod/v4/core';
import type { SchemaObject } from 'openapi3-ts/oas31';

type DraftSchema = JSONSchema.BaseSchema;

export interface FieldMeta {
	description?: string;
	example?: unknown;
}

export interface FieldInfo {
	key: string;
	schema: ZodType;
	required: boolean;
	metadata: FieldMeta;
}

/**
 * Immutable wrapper around a single Zod schema that can:
 *  • expose OpenAPI 3.1 `SchemaObject`
 *  • expose JSON Schema (draft-2020-12)
 *  • collect description / example metadata
 *  • list object fields with `required` flags
 */
export class ZodInspector {
	constructor(private readonly schema: ZodType) {}

	// ---------------------------------------------------------------------------
	// • High-level views
	// ---------------------------------------------------------------------------

	/** Draft JSON Schema, as produced by `z.toJSONSchema()`. */
	toJsonSchema(): DraftSchema {
		return z.toJSONSchema(this.schema);
	}

	/** OpenAPI 3.1 SchemaObject (recursive conversion). */
	toOpenApiSchema(): SchemaObject {
		return jsonSchemaToOpenApi(this.toJsonSchema());
	}

	/** Unified metadata for this schema (objects merge child examples). */
	getMetadata(): FieldMeta {
		return getMetadata(this.schema);
	}

	/** Field list only if the wrapped schema is a ZodObject; otherwise `[]`. */
	getFields(): FieldInfo[] {
		if (!(this.schema instanceof ZodObject)) return [];
		return extractFields(this.schema);
	}

	// ---------------------------------------------------------------------------
	// • Static convenience helpers
	// ---------------------------------------------------------------------------

	static convert(schema: ZodType): SchemaObject {
		return new ZodInspector(schema).toOpenApiSchema();
	}

	static metadata(schema: ZodType): FieldMeta {
		return new ZodInspector(schema).getMetadata();
	}

	static fields(schema: ZodType): FieldInfo[] {
		return new ZodInspector(schema).getFields();
	}
}

/* ───────────────────────── Internal utilities ──────────────────────────── */

/** Recursively convert JSON Schema → OpenAPI SchemaObject. */
function jsonSchemaToOpenApi(src: DraftSchema): SchemaObject {
	const {
		$ref,
		readOnly,
		writeOnly,
		description,
		default: def,
		title,
		multipleOf,
		maximum,
		exclusiveMaximum,
		minimum,
		exclusiveMinimum,
		maxLength,
		minLength,
		pattern,
		maxItems,
		minItems,
		uniqueItems,
		maxProperties,
		minProperties,
		required,
		enum: enums,
		const: constVal,
		type,
		format,
		contentMediaType,
		contentEncoding,
		examples,
		properties,
		additionalProperties,
		items,
		prefixItems,
		allOf,
		anyOf,
		oneOf,
		not,
		propertyNames,
	} = src as DraftSchema & { [k: string]: unknown };

	const out: SchemaObject = stripUndef({
		$ref,
		readOnly,
		writeOnly,
		description,
		default: def,
		title,
		multipleOf,
		maximum,
		exclusiveMaximum: num(exclusiveMaximum),
		minimum,
		exclusiveMinimum: num(exclusiveMinimum),
		maxLength,
		minLength,
		pattern,
		maxItems,
		minItems,
		uniqueItems,
		maxProperties,
		minProperties,
		required,
		enum: enums,
		const: constVal,
		type,
		format,
		contentMediaType,
		contentEncoding,
		example: Array.isArray(examples) && examples.length ? examples[0] : undefined,
		examples,
	});

	/* object props */
	if (properties) out.properties = mapVals(properties, jsonSchemaToOpenApi);

	if (typeof additionalProperties === 'boolean') {
		out.additionalProperties = additionalProperties;
	} else if (additionalProperties) {
		out.additionalProperties = jsonSchemaToOpenApi(additionalProperties as DraftSchema);
	}

	/* array props */
	if (Array.isArray(items)) {
		out.prefixItems = items.map((i) => jsonSchemaToOpenApi(i as DraftSchema));
	} else if (items) {
		out.items = jsonSchemaToOpenApi(items as DraftSchema);
	}

	if (prefixItems) out.prefixItems = prefixItems.map((i) => jsonSchemaToOpenApi(i as DraftSchema));
	if (propertyNames) out.propertyNames = jsonSchemaToOpenApi(propertyNames as DraftSchema);

	/* combinators */
	if (allOf) out.allOf = allOf.map(jsonSchemaToOpenApi);
	if (anyOf) out.anyOf = anyOf.map(jsonSchemaToOpenApi);
	if (oneOf) out.oneOf = oneOf.map(jsonSchemaToOpenApi);
	if (not) out.not = jsonSchemaToOpenApi(not as DraftSchema);

	return out;
}

/* ------------------------------ meta helpers ----------------------------- */

function extractFields<T extends ZodRawShape>(obj: ZodObject<T>): FieldInfo[] {
	return Object.entries(obj.shape).map(([key, raw]) => {
		const schema = raw as ZodType;
		return {
			key,
			schema,
			required: !(schema instanceof ZodOptional || schema instanceof ZodDefault),
			metadata: getMetadata(schema),
		};
	});
}

function getMetadata(schema: ZodType) {
	return schema instanceof ZodObject ? objectMetadata(schema) : leafMetadata(schema);
}

function leafMetadata(schema: ZodType): FieldMeta {
	const meta = schema.meta?.() ?? {};
	return {
		description: meta.description,
		example: meta.example,
	};
}

function objectMetadata<T extends ZodRawShape>(obj: ZodObject<T>): FieldMeta {
	const own = leafMetadata(obj);
	const ex: Record<string, unknown> = { ...(own.example ?? {}) };

	for (const { key, metadata } of extractFields(obj)) {
		if (metadata.example !== undefined) ex[key] = metadata.example;
	}

	return { description: own.description, example: Object.keys(ex).length ? ex : undefined };
}

/* ----------------------------- util one-liners --------------------------- */

const num = (v: unknown): number | undefined => (typeof v === 'number' ? v : undefined);

const stripUndef = <T extends Record<string, unknown>>(o: T): T =>
	Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as T;

/** Map an object's values, preserving its keys – skips boolean literals. */
const mapVals = <T, R>(obj: Record<string, T | boolean>, fn: (v: T) => R): Record<string, R> => {
	const out: Record<string, R> = {};

	for (const [k, v] of Object.entries(obj)) {
		if (typeof v !== 'boolean') {
			out[k] = fn(v as T);
		}
	}
	return out;
};
