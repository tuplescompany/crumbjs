import { ZodDefault, ZodObject, ZodOptional, type ZodRawShape, type ZodType } from 'zod';

type FieldMetadata = {
	schemaName?: string;
	description?: string;
	example?: any;
};

/**
 * Extracts fields from a ZodObject along with metadata and whether they are required.
 */
export function extractFields<T extends ZodRawShape>(schema: ZodObject<T>) {
	return Object.entries(schema.shape).map(([key, field]) => {
		const typed = field as ZodType;

		const isRequired = !(typed instanceof ZodOptional || typed instanceof ZodDefault);

		return {
			key,
			schema: typed,
			metadata: getMetadata(typed),
			required: isRequired,
		};
	});
}

/**
 * Extracts metadata (description and example) from any Zod schema.
 * If is a ZodObject will extract metadata from each field with getObjectMetadata
 */
export function getMetadata(schema: ZodType): FieldMetadata {
	return schema instanceof ZodObject ? getObjectMetadata(schema) : getAnyMetadata(schema);
}

export function getAnyMetadata(schema: ZodType): FieldMetadata {
	const meta = schema.meta?.() ?? {};

	return {
		schemaName: typeof meta.schemaName === 'string' ? meta.schemaName : undefined,
		description: meta.description,
		example: meta.example,
	};
}

/**
 * Extracts metadata from a ZodObject, including:
 * - its own description and example (if any)
 * - the example values of its fields
 */
export function getObjectMetadata<T extends ZodRawShape>(schema: ZodObject<T>): FieldMetadata {
	const fields = extractFields(schema);

	const objectMeta = getAnyMetadata(schema);
	const example: Record<string, any> = { ...(objectMeta.example ?? {}) };

	// Only 'example' pass from field example to object example
	for (const { key, metadata } of fields) {
		if (metadata.example !== undefined) {
			example[key] = metadata.example;
		}
	}

	return {
		schemaName: objectMeta.schemaName,
		description: objectMeta.description,
		example: Object.keys(example).length > 0 ? example : undefined,
	};
}
