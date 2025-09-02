import { codecs } from '@crumbjs/core';
import z, { ZodBoolean, ZodDate, ZodNumber, ZodObject, ZodType } from 'zod';

export const createPaginationQuerySchema = <T extends ZodObject>(schema: T) => {
	const simpleFiltersShape = createSimpleFiltersShape(schema);
	return paginateQuerySchema
		.extend({
			sortField: createSimpleSortByShape(schema),
			sortDirection: z.enum(['asc', 'desc']).optional(),
		})
		.extend(simpleFiltersShape);
};

export const paginateQuerySchema = z.object({
	page: z.coerce.number().optional().default(1),
	pageSize: z.coerce.number().optional().default(10),
	withTrash: z.enum(['yes', 'no']).optional(),
});

function createSimpleSortByShape<T extends ZodObject>(schema: T) {
	const fields = Object.keys(createSimpleFiltersShape(schema));
	fields.push('_id');
	return z.enum(fields).optional();
}

function unwrap(schema: ZodType): ZodType {
	if ('unwrap' in schema && typeof schema.unwrap === 'function') {
		return unwrap(schema.unwrap());
	}

	return schema;
}

/**
 * Converts a ZodObject to a flatten representations of it with subobject separated by prefix.
 * Ignores default attributes, and all are optionals
 * Ignora defaults and nullables
 */
export function createSimpleFiltersShape<T extends ZodObject>(
	schema: T,
	prefix = '',
	ignoreKeys: string[] = ['_id', 'createdAt', 'deletedAt', 'updatedAt'],
) {
	const shape = schema.shape;
	const result: Record<string, ZodType> = {};

	for (const [key, value] of Object.entries(shape)) {
		if (ignoreKeys.includes(key)) continue;

		const path = prefix ? `${prefix}.${key}` : key;

		const base = unwrap(value);

		if (base instanceof ZodObject) {
			Object.assign(result, createSimpleFiltersShape(base, path));
		} else if (base instanceof ZodBoolean) {
			result[path] = codecs.stringBoolean.optional();
		} else if (base instanceof ZodNumber) {
			result[path] = codecs.stringNumber.optional();
		} else if (base instanceof ZodDate) {
			result[path] = codecs.stringDate.optional();
		} else {
			result[path] = base.optional();
		}
	}

	return result;
}
