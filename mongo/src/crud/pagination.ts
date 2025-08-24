import z, { ZodBoolean, ZodDate, ZodNumber, ZodObject, ZodType } from 'zod';

export const createPaginationQuerySchema = <T extends ZodObject>(schema: T) => {
	const simpleFiltersShape = createSimpleFiltersShape(schema);
	return paginateQuerySchema.extend(simpleFiltersShape);
};

export const paginateQuerySchema = z.object({
	page: z.coerce.number().optional().default(1),
	pageSize: z.coerce.number().optional().default(10),
	withTrash: z.enum(['yes', 'no']).optional(),
});

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

		let base: ZodType = value as ZodType;

		// si tiene default → unwrap
		if (base instanceof z.ZodDefault) {
			base = (base as any).def.innerType;

			// unwrap default+nullable
			if (base instanceof z.ZodNullable) base = base.def.innerType as any;
		}

		if (base instanceof ZodObject) {
			Object.assign(result, createSimpleFiltersShape(base, path));
		} else if (base instanceof ZodBoolean) {
			result[path] = z
				.union([
					z.boolean(),
					z
						.string()
						.toLowerCase()
						.transform((val) => {
							if (['false', '0', ''].includes(val)) return false;
							if (['true', '1'].includes(val)) return true;
							throw new Error('Invalid boolean string');
						}),
					z.number().transform((val) => val === 1),
				])
				.optional();
		} else if (base instanceof ZodNumber) {
			result[path] = z.coerce.number().optional();
		} else if (base instanceof ZodDate) {
			result[path] = z.string().transform((val) => new Date(val));
		} else {
			result[path] = base.optional();
		}
	}

	return result;
}
