import { SchemaObject } from 'openapi3-ts/oas31';
import z, { ZodArray, ZodDefault, ZodObject, ZodOptional, ZodRawShape, ZodType } from 'zod';
import { JSONSchema } from 'zod/v4/core';
import { objectCleanUndefined } from '../helpers/utils';
import { FieldInfo, FieldMeta } from '../types';

/**
 * Convert a given Zod schema into an OpenAPI 3.1 `SchemaObject`.
 * Internally uses `safeToJsonSchema` for tolerant conversion and then maps the JSON Schema
 * into OpenAPI-compatible format (recursive).
 */
export function convert(schema: ZodType): SchemaObject {
	return jsonSchemaToOpenApi(safeToJsonSchema(schema));
}

function isRequired(schema: ZodType): boolean {
	return !(schema instanceof ZodOptional || schema instanceof ZodDefault);
}

/**
 * Attempt to convert a Zod schema into a JSON Schema.
 * - Falls back to manual mapping for unrepresentable fields (objects, arrays, custom types).
 * - Ensures recursive handling of nested properties.
 * - Always returns a valid `JSONSchema.BaseSchema`.
 */
export function safeToJsonSchema(schema: ZodType): JSONSchema.BaseSchema {
	try {
		return z.toJSONSchema(schema, { unrepresentable: 'throw' });
	} catch {
		// When object is unable to parse with toJSONSchema is because some field is unrepresentable
		// loop all fields and map unrepresentables to a type
		if (schema.def.type === 'object') {
			const obj = schema as ZodObject<any>;
			const shape = obj.shape;

			const properties: Record<string, JSONSchema.BaseSchema> = {};
			const required: string[] = [];

			for (const [key, child] of Object.entries(shape)) {
				// recurse per property
				const childSchema = safeToJsonSchema(child as ZodType);
				properties[key] = childSchema;

				if (isRequired(child as ZodType)) {
					required.push(key);
				}
			}

			return {
				type: 'object',
				properties,
				...(required.length ? { required } : {}),
			};
		}

		// Handle unrepresentable array elements
		if (schema.def.type === 'array') {
			const defType = (schema as ZodArray).element._zod.def.type;
			return {
				type: 'array',
				items: mapUnrepresentable(defType) as JSONSchema.BaseSchema,
			};
		}

		// fallback for a non-object / non-array unrepresentable
		return mapUnrepresentable(schema.def.type) as JSONSchema.BaseSchema;
	}
}

/**
 * Map Zod internal "def.type" values that are unrepresentable by JSON Schema
 * into a best-effort JSON Schema equivalent.
 * For example: `bigint` → `{ type: 'integer', format: 'bigint' }`.
 */
function mapUnrepresentable(defType: string) {
	if (defType === 'string') {
		return { type: 'string', format: 'objectId' };
	}

	if (defType === 'date') {
		return { type: 'string', format: 'date-time' };
	}

	if (defType === 'bigint') {
		return { type: 'integer', format: 'bigint' };
	}

	if (defType === 'custom') {
		return { type: 'object' };
	}

	return { type: 'string' };
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
export function extractFields<T extends ZodRawShape>(obj: ZodObject<T>): FieldInfo[] {
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
