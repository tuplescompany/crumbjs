// converter.ts Basic utils to convert zod JSONSchema to openapi SchemaObject
import type { SchemaObject } from 'openapi3-ts/oas31';
import { z, type ZodType } from 'zod';
import type { JSONSchema } from 'zod/v4/core';

type ZodJSONSchema = JSONSchema.BaseSchema;

export function toSchemaObject(schema: ZodType) {
	const jsonSchema = z.toJSONSchema(schema);
	return convertJsonSchemaToSchemaObject(jsonSchema);
}

export function convertJsonSchemaToSchemaObject(schema: ZodJSONSchema): SchemaObject {
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
		enum: enumValues,
		const: constValue,
		type,
		format,
		contentMediaType,
		contentEncoding,
		examples,
		properties,
		additionalProperties,
		items,
		allOf,
		anyOf,
		oneOf,
		not,
		prefixItems,
		propertyNames,
	} = schema;

	// Conversión básica
	const result: SchemaObject = {
		$ref,
		readOnly,
		writeOnly,
		description,
		default: def,
		title,
		multipleOf,
		maximum,
		exclusiveMaximum: typeof exclusiveMaximum === 'number' ? exclusiveMaximum : undefined,
		minimum,
		exclusiveMinimum: typeof exclusiveMinimum === 'number' ? exclusiveMinimum : undefined,
		maxLength,
		minLength,
		pattern,
		maxItems,
		minItems,
		uniqueItems,
		maxProperties,
		minProperties,
		required,
		enum: enumValues,
		const: constValue,
		type,
		format,
		contentMediaType,
		contentEncoding,
		example: Array.isArray(examples) && examples.length > 0 ? examples[0] : undefined,
		examples,
	};

	// Propiedades
	if (properties) {
		result.properties = {};
		for (const [key, value] of Object.entries(properties)) {
			result.properties[key] = convertJsonSchemaToSchemaObject(value as ZodJSONSchema);
		}
	}

	// additionalProperties puede ser boolean, schema o undefined
	if (typeof additionalProperties === 'boolean') {
		result.additionalProperties = additionalProperties;
	} else if (additionalProperties) {
		result.additionalProperties = convertJsonSchemaToSchemaObject(additionalProperties as ZodJSONSchema);
	}

	// items (array)
	if (items) {
		if (Array.isArray(items)) {
			// JSON Schema draft 2020-12: items: [] + prefixItems
			result.prefixItems = items.map((i) => convertJsonSchemaToSchemaObject(i as ZodJSONSchema));
		} else {
			result.items = convertJsonSchemaToSchemaObject(items as ZodJSONSchema);
		}
	}

	if (propertyNames) {
		result.propertyNames = convertJsonSchemaToSchemaObject(propertyNames as ZodJSONSchema);
	}

	// combinaciones
	if (allOf) result.allOf = allOf.map((s) => convertJsonSchemaToSchemaObject(s));
	if (anyOf) result.anyOf = anyOf.map((s) => convertJsonSchemaToSchemaObject(s));
	if (oneOf) result.oneOf = oneOf.map((s) => convertJsonSchemaToSchemaObject(s));
	if (not) result.not = convertJsonSchemaToSchemaObject(not as ZodJSONSchema);

	if (prefixItems) {
		result.prefixItems = prefixItems.map((i) => convertJsonSchemaToSchemaObject(i as ZodJSONSchema));
	}

	return result;
}
