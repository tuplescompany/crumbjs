import { SchemaObject } from 'openapi3-ts/oas31';
import z, { ZodDefault, ZodEmail, ZodObject, ZodOptional, ZodRawShape, ZodType } from 'zod';
import { JSONSchema } from 'zod/v4/core';
import { objectCleanUndefined } from '../helpers/utils';
import { FieldInfo, FieldMeta } from '../types';

/**
 * Convert a given Zod schema into an OpenAPI 3.1 `SchemaObject`.
 * Internally uses `safeToJsonSchema` for tolerant conversion and then maps the JSON Schema
 * into OpenAPI-compatible format (recursive).
 */
export function convert(schema: ZodType, io: 'input' | 'output' = 'output'): SchemaObject {
	return jsonSchemaToOpenApi(safeToJsonSchema(schema, io));
}

/**
 * Wrapper for toJSONSchema with overrides
 */
export function safeToJsonSchema(schema: ZodType, io: 'input' | 'output' = 'output'): JSONSchema.BaseSchema {
	// Implicit definition of JSON schema
	const meta = schema.meta();
	if (meta?.json) {
		return meta.json as JSONSchema.BaseSchema;
	}

	return z.toJSONSchema(schema, {
		unrepresentable: 'any',
		target: 'openapi-3.0',
		io,
		override: (ctx) => {
			const def = ctx.zodSchema._zod.def;
			if (def.type === 'date') {
				ctx.jsonSchema.type = 'string';
				ctx.jsonSchema.format = 'date-time';
			}
			if (def.type === 'bigint') {
				ctx.jsonSchema.type = 'integer';
				ctx.jsonSchema.format = 'int64';
			}
			if (ctx.zodSchema instanceof ZodEmail && !ctx.jsonSchema.examples?.length && ctx.zodSchema.meta() === undefined) {
				ctx.jsonSchema.examples = ['smith.agent@matrix.com'];
			}
		},
	});
}

/**
 * Recursively transform a JSON Schema object into an OpenAPI 3.1 `SchemaObject`.
 * Preserves structure, constraints, examples, and combinators (`allOf`, `oneOf`, `anyOf`, etc.).
 */
function jsonSchemaToOpenApi(src: JSONSchema.BaseSchema): SchemaObject {
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
	} = src as JSONSchema.BaseSchema & { [k: string]: unknown };

	const out: SchemaObject = objectCleanUndefined({
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
		out.additionalProperties = jsonSchemaToOpenApi(additionalProperties);
	}

	/* array props */
	if (Array.isArray(items)) {
		out.prefixItems = items.map((i) => jsonSchemaToOpenApi(i as JSONSchema.BaseSchema));
	} else if (items) {
		out.items = jsonSchemaToOpenApi(items as JSONSchema.BaseSchema);
	}

	if (prefixItems) out.prefixItems = prefixItems.map((i) => jsonSchemaToOpenApi(i as JSONSchema.BaseSchema));
	if (propertyNames) out.propertyNames = jsonSchemaToOpenApi(propertyNames as JSONSchema.BaseSchema);

	/* combinators */
	if (allOf) out.allOf = allOf.map(jsonSchemaToOpenApi);
	if (anyOf) out.anyOf = anyOf.map(jsonSchemaToOpenApi);
	if (oneOf) out.oneOf = oneOf.map(jsonSchemaToOpenApi);
	if (not) out.not = jsonSchemaToOpenApi(not as JSONSchema.BaseSchema);

	return out;
}

/**
 * Extract high-level field information from a Zod object schema.
 * Each field is returned with:
 * - `key`: property name
 * - `schema`: raw Zod schema
 * - `required`: whether the field is required (not optional/defaulted)
 * - `metadata`: description & example metadata
 */
export function extractFields(obj: ZodObject): FieldInfo[] {
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

/**
 * Resolve metadata (description/example) for any Zod schema.
 * - For `ZodObject`, recursively collects nested field metadata.
 * - For leaf schemas, extracts `meta()` values directly.
 */
export function getMetadata(schema: ZodType) {
	return schema instanceof ZodObject ? objectMetadata(schema) : leafMetadata(schema);
}

/**
 * Extract description and example metadata for a non-object Zod schema.
 * Reads from `schema.meta()`, falling back to `{}` if not defined.
 */
function leafMetadata(schema: ZodType): FieldMeta {
	const meta = schema.meta?.() ?? {};
	return {
		description: meta.description,
		example: meta.example,
	};
}

/**
 * Recursively extract description and example metadata from a Zod object schema.
 * Aggregates examples from child fields when present.
 */
function objectMetadata<T extends ZodRawShape>(obj: ZodObject<T>): FieldMeta {
	const own = leafMetadata(obj);
	const ex: Record<string, unknown> = { ...(own.example ?? {}) };

	for (const { key, schema } of extractFields(obj)) {
		const childMeta = getMetadata(schema);
		if (childMeta.example !== undefined) {
			ex[key] = childMeta.example;
		}
	}

	return { description: own.description, example: Object.keys(ex).length ? ex : undefined };
}

/**
 * Safely cast a value to `number` if it is numeric, otherwise `undefined`.
 * Used when normalizing OpenAPI numeric constraints.
 */
const num = (v: unknown): number | undefined => (typeof v === 'number' ? v : undefined);

/**
 * Map over the values of an object while preserving its keys.
 * - Skips boolean literal values (commonly used in JSON Schema flags).
 * - Applies a transform function `fn` to each non-boolean value.
 */
const mapVals = <T, R>(obj: Record<string, T | boolean>, fn: (v: T) => R): Record<string, R> => {
	const out: Record<string, R> = {};

	for (const [k, v] of Object.entries(obj)) {
		if (typeof v !== 'boolean') {
			out[k] = fn(v);
		}
	}
	return out;
};
