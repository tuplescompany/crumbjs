import { App, Middleware, NotFound, spec, Unauthorized, UnprocessableEntity } from '@crumbjs/core';
import { createPaginationQuerySchema } from './pagination';
import { createPaginationSchema, useRepository } from '../utils';
import z, { ZodObject, infer as ZodInfer } from 'zod';
import { RootContext } from '@crumbjs/core/dist/types';
import { Filter, ObjectId } from 'mongodb';
import { mongoLogger } from '../manager';

type Resource<T extends ZodObject, Entity = ZodInfer<T>> = {
	/**
	 * Zod schema representing the structure and validation rules
	 * of documents stored in this collection.
	 *
	 * Used for:
	 * - Validating request payloads
	 * - Typing responses and filters
	 */
	schema: T;

	/**
	 * Name of the MongoDB connection to use, as defined
	 * in the Mongo manager.
	 *
	 * @default "default"
	 */
	connection?: string;

	/**
	 * Name of the MongoDB database where this resource lives.
	 */
	db: string;

	/**
	 * Name of the MongoDB collection where this resource lives.
	 */
	collection: string;

	/**
	 * URL path prefix for all routes generated for this resource.
	 *
	 * Example:
	 * - prefix = "employee" → `/employee`, `/employee/:id`, etc.
	 *
	 * @default Collection name
	 */
	prefix?: string;

	/**
	 * OpenAPI tags applied to all routes of this resource.
	 * You can add additional tags later when extending the OpenAPI spec.
	 *
	 * @default Collection name
	 */
	tag?: string;

	/**
	 * Middleware functions applied to all routes of this resource.
	 *
	 * Useful for:
	 * - Authentication/authorization checks
	 * - Request/response transformations
	 * - Logging or tracing
	 */
	use?: Middleware[];

	/**
	 * Builds a MongoDB filter that will be automatically applied
	 * to all operations on this resource (except POST).
	 *
	 * Operations supported:
	 * - `"get"`     → Query collection (list resources)
	 * - `"getById"` → Fetch a single resource by ID
	 * - `"put"`     → Replace a resource
	 * - `"patch"`   → Partially update a resource
	 * - `"delete"`  → Delete a resource
	 *
	 * Typical use cases:
	 * - Restricting access to resources owned by the authenticated user
	 * - Enforcing tenant scoping (multi-tenant apps)
	 * - Applying soft-delete or visibility constraints
	 * - Custom filters per operation type
	 *
	 * ⚠️ For POST requests, use {@link authorizeCreate} instead.
	 *
	 * @param c The request context.
	 * @param triggeredBy The type of operation being executed.
	 * @returns A MongoDB filter object to be merged into the query.
	 */
	prefilter?: (c: RootContext, triggeredBy: 'get' | 'getById' | 'put' | 'patch' | 'delete') => Promise<Filter<Entity>>;

	/**
	 * Determines whether the current request is authorized to create a new resource.
	 *
	 * Typical use cases:
	 * - Checking user roles or permissions
	 * - Validating request body or headers beyond schema validation
	 * - Enforcing business rules (e.g., max items per user)
	 *
	 * @param c The request context, including the raw request body.
	 * @returns
	 *  - `true` → Creation is allowed.
	 *  - `string` → Creation is denied. The string will be used as an error message.
	 */
	authorizeCreate?: (c: RootContext & { rawBody: any }) => Promise<true | string>;
};

const createObjectIdFilter = (id: string) => {
	try {
		return { _id: new ObjectId(id) };
	} catch (error) {
		throw new UnprocessableEntity({
			id: 'Invalid hex format',
		});
	}
};

const createFilters = async (
	triggeredBy: 'get' | 'getById' | 'put' | 'patch' | 'delete',
	options: Resource<any>,
	c: RootContext,
	prev?: object,
): Promise<Filter<any>> => {
	if (options.prefilter) {
		const prefilters = await options.prefilter(c, triggeredBy);
		return {
			...(prev ?? {}),
			...prefilters,
		};
	}

	return prev ?? {};
};

export function createResourse<T extends ZodObject>(options: Resource<T>) {
	if (!options.prefilter)
		mongoLogger.warn(`Resource endpoints for collection '${options.collection}' is working without 'prefilter' rules`);
	if (!options.authorizeCreate)
		mongoLogger.warn(`Resource endpoints for collection '${options.collection}' is working without 'authorizeCreate' rule`);

	const connectionName = options.connection ?? 'default';

	const repository = useRepository(options.db, options.collection, options.schema, 'deletedAt', connectionName);

	const resource = new App().prefix(options.prefix ?? options.collection);

	if (options.use) options.use.forEach((middleware) => resource.use(middleware));

	resource.tag(options.tag ?? options.collection);

	/**
	 * [GET] /{prefix} Get paginated collection document, optionally filtered by simple query filters (asserts only equals)
	 */
	resource.get(
		'/',
		async (c) => {
			// filters type is {} but is Record<string, ZodType> | undefined
			const { page, pageSize, withTrash, ...filters } = c.query;

			const finalFilters = await createFilters('get', options, c, filters);

			return await repository.getPaginated(finalFilters, page, pageSize, withTrash === 'yes');
		},
		{
			query: createPaginationQuerySchema(options.schema),
			responses: [spec.response(200, createPaginationSchema(options.schema)), spec.response(400, z.object({ status: z.number() }))],
		},
	);

	/**
	 * [GET] /{prefix}/:id Finds a document by ObjectId
	 */
	resource.get(
		'/:id',
		async (c) => {
			const filters = await createFilters('getById', options, c, createObjectIdFilter(c.params.id));

			const document = await repository.findOne(filters);
			if (!document) throw new NotFound();

			return document;
		},
		{
			responses: [spec.response(200, options.schema), spec.response(404, z.object({ status: z.number() }))],
		},
	);

	/**
	 * [POST] /{prefix} Validates and creates a document
	 */
	resource.post(
		'/',
		async (c) => {
			if (options.authorizeCreate) {
				const canOrMessage = await options.authorizeCreate(c);
				if (canOrMessage !== true) throw new Unauthorized(canOrMessage);
			}

			return await repository.create(c.rawBody as any);
		},
		{
			type: 'application/json',
			body: options.schema.omit({
				_id: true,
				deletedAt: true,
				updatedAt: true,
				createdAt: true,
			}),
			responses: [spec.response(201, options.schema)],
		},
	);

	/**
	 * [PUT] /{prefix}/:id Replace the entire document
	 * Similar to patch, but the entire valid resource will be required to the replacement
	 */
	resource.put(
		'/:id',
		async (c) => {
			const filters = await createFilters('put', options, c, createObjectIdFilter(c.params.id));

			c.body.updatedAt = new Date();
			const updated = await repository.updateOne(filters, c.rawBody as any);

			if (!updated) throw new NotFound();
			return updated;
		},
		{
			type: 'application/json',
			body: options.schema.omit({
				_id: true,
			}),
		},
	);

	/**
	 * [PATCH] /{prefix}/:id Partial update of a document by his ObjectId
	 */
	resource.patch(
		'/:id',
		async (c) => {
			const filters = await createFilters('patch', options, c, createObjectIdFilter(c.params.id));

			if (Object.keys(c.rawBody).length === 0) throw new UnprocessableEntity('At least one field should be updated');

			c.rawBody.updatedAt = new Date();
			const updated = await repository.updateOne(filters, c.rawBody as any);

			if (!updated) throw new NotFound();
			return updated;
		},
		{
			type: 'application/json',
			body: options.schema
				.omit({
					_id: true,
				})
				.partial(),
		},
	);

	/**
	 * [DELETE] /{prefix}/:id Deletes a document by ObjectID - if softDeletes enabled (recommended) will update his updateAt field
	 */
	resource.delete(
		'/:id',
		async (c) => {
			const filters = await createFilters('delete', options, c, createObjectIdFilter(c.params.id));

			const deleted = await repository.deleteOne(filters);
			return { success: deleted };
		},
		{
			responses: [spec.response(200, z.object({ success: z.boolean() }))],
		},
	);

	return resource;
}
