import z, { type ZodObject } from 'zod';
import { Repository } from './repository';
import { mongo } from './manager';

/**
 * Utility to construct a {@link Repository} instance using the current MongoDB client.
 *
 * Useful when no custom repository methods are required.
 * For advanced use cases, extend the {@link Repository} class instead.
 *
 * @typeParam S - A Zod schema representing the collection’s document shape.
 * @param dbName - Name of the database.
 * @param collection - Collection name.
 * @param schema - Zod schema for validation and typing.
 * @param softDeletes - Field used for soft deletes, or `false` to disable. Defaults to `"deletedAt"`.
 * @returns A new {@link Repository} instance.
 */
export function useRepository<S extends ZodObject>(
	dbName: string,
	collection: string,
	schema: S,
	softDeletes: string | false = 'deletedAt',
) {
	return new Repository(mongo.db(dbName), collection, schema, softDeletes);
}

/**
 * Utility to create a Zod Object based on repository.getPaginated() result
 * Ideal for document responses with crumbjs
 * @param schema The collection schema
 * @returns pagination result zod schema
 */
export const createPaginationSchema = <T extends ZodObject>(schema: T) => {
	return z.object({
		total: z.number(),
		pageSize: z.number(),
		pages: z.number(),
		currentPage: z.number(),
		prevPage: z.number().nullable(),
		nextPage: z.number().nullable(),
		data: z.array(schema),
	});
};

export const createInsertSchema = <T extends ZodObject>(schema: T) => {
	return schema.omit({
		_id: true,
		deletedAt: true,
		updatedAt: true,
		createdAt: true,
	});
};

export const createUpdateSchema = <T extends ZodObject>(schema: T) => {
	return schema
		.omit({
			_id: true,
		})
		.partial();
};

export const boolSchema = z
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
	.default(false);
