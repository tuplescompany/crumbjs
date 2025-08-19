import z, { type ZodObject } from 'zod';

export const createPaginationSchema = <T extends ZodObject>(data: T) => {
	return z.object({
		total: z.number(),
		pageSize: z.number(),
		pages: z.number(),
		currentPage: z.number(),
		prevPage: z.number().nullable(),
		nextPage: z.number().nullable(),
		data: z.array(data),
	});
};
