import z, { ZodObject } from 'zod';
import { createSimpleFiltersShape } from './filters';

export const createPaginationQuerySchema = <T extends ZodObject>(schema: T) => {
	const simpleFiltersShape = createSimpleFiltersShape(schema);
	return paginateQuerySchema.extend(simpleFiltersShape);
};

export const paginateQuerySchema = z.object({
	page: z.coerce.number().optional().default(1),
	pageSize: z.coerce.number().max(50).min(10).optional().default(10),
	withTrash: z.enum(['yes', 'no']).optional(),
});
