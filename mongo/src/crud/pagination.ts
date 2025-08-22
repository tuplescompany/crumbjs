import z, { ZodObject } from 'zod';
import { createSimpleFiltersShape } from './filters';

// type helper to avoid page, pageSize, withTrash unknowns at crud
type PaginationQuerySchema = z.ZodObject<
	{
		page: z.ZodDefault<z.ZodOptional<z.ZodCoercedNumber<unknown>>>;
		pageSize: z.ZodDefault<z.ZodOptional<z.ZodCoercedNumber<unknown>>>;
		withTrash: z.ZodOptional<
			z.ZodEnum<{
				yes: 'yes';
				no: 'no';
			}>
		>;
	},
	z.core.$strip
>;

export const createPaginationQuerySchema = <T extends ZodObject>(schema: T): PaginationQuerySchema => {
	const simpleFiltersShape = createSimpleFiltersShape(schema);
	return paginateQuerySchema.extend(simpleFiltersShape) as PaginationQuerySchema;
};

export const paginateQuerySchema = z.object({
	page: z.coerce.number().optional().default(1),
	pageSize: z.coerce.number().max(50).min(10).optional().default(10),
	withTrash: z.enum(['yes', 'no']).optional(),
});
