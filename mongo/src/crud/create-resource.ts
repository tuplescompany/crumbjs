import { App, BadRequest, Middleware, NotFound, spec, UnprocessableEntity, type Context } from '@crumbjs/core';
import { createPaginationQuerySchema } from './pagination';
import { createPaginationSchema, useRepository } from '../utils';
import z, { ZodObject, infer as ZodInfer } from 'zod';
import { Filter, ObjectId } from 'mongodb';
import { mongoLogger } from '../manager';
import { verifySchema } from './verify-schema';

type BodylessContext = Omit<Context, 'body' | 'rawBody'>;

type Endpoints = {
	get: boolean;
	getById: boolean;
	post: boolean;
	put: boolean;
	patch: boolean;
	delete: boolean;
};

const defaultEndpoints = {
	get: true,
	getById: true,
	post: true,
	put: true,
	patch: true,
	delete: true,
};

export type Resource<
	T extends ZodObject,
	Entity = ZodInfer<T>,
	EntityBefore = Omit<Entity, '_id' | 'createdAt' | 'deletedAt' | 'updatedAt'>,
> = {
	/** Zod schema of the documents in this collection. */
	schema: T;

	/** MongoDB connection name (default: "default"). */
	connection?: string;

	/** MongoDB database name. */
	db: string;

	/** MongoDB collection name. */
	collection: string;

	/** URL path prefix for generated routes (default: collection name). */
	prefix?: string;

	/** OpenAPI tag for all routes (default: collection name). */
	tag?: string;

	/** Middlewares applied to all routes. */
	use?: Middleware[];

	/** Disable endpoints. Default all avaiable endpoints will be created */
	endpoints?: Partial<Endpoints>;

	/**
	 * Builds a MongoDB filter applied to all ops (except POST).
	 * Useful for access restrictions (e.g. user-owned resources).
	 */
	prefilter?: (c: Context, triggeredBy: 'get' | 'getById' | 'put' | 'patch' | 'delete') => Promise<Filter<Entity>>;

	/**
	 * Runs before creating a document (POST /{prefix}).
	 * Use to mutate input or throw to block creation.
	 */
	beforeCreate?: (ctx: BodylessContext, document: EntityBefore) => void | Promise<void>;

	/**
	 * Runs after a document is created.
	 * Typical use: side-effects (e.g. send email).
	 */
	afterCreate?: (document: Entity) => void | Promise<void>;

	/**
	 * Runs before updating a document (PUT /{prefix}).
	 * Use to validate/mutate or throw to stop update.
	 */
	beforeUpdate?: (ctx: BodylessContext, document: EntityBefore) => void | Promise<void>;

	/**
	 * Runs after a document is updated.
	 * Receives old and new entities.
	 */
	afterUpdate?: (oldDocument: Entity, newDocument: Entity) => void | Promise<void>;

	/**
	 * Runs before patching a document (PATCH /{prefix}).
	 * Use to validate/mutate partials or throw to block.
	 */
	beforePatch?: (ctx: BodylessContext, document: Partial<EntityBefore>) => void | Promise<void>;

	/**
	 * Runs after a document is patched.
	 * Receives old and new entities.
	 */
	afterPatch?: (oldDocument: Entity, newDocument: Entity) => void | Promise<void>;

	/**
	 * Runs before deleting a document (DELETE /{prefix}).
	 * Use to check permissions or throw to block.
	 */
	beforeDelete?: (ctx: BodylessContext, document: EntityBefore) => void | Promise<void>;

	/**
	 * Runs after a document is deleted.
	 * Receives deleted entity.
	 */
	afterDelete?: (deleted: Entity) => void | Promise<void>;
};

const createObjectIdFilter = (id: string) => {
	try {
		return { _id: new ObjectId(id) };
	} catch (error) {
		throw new BadRequest({
			id: 'Invalid ID',
		});
	}
};

export function createResource<T extends ZodObject>(options: Resource<T>) {
	verifySchema(options.schema, options.collection);

	if (options.schema.shape)
		if (!options.prefilter)
			mongoLogger.warn(`Resource endpoints for collection '${options.collection}' is working without 'prefilter' rules`);
	if (!options.beforeCreate)
		mongoLogger.warn(`Resource endpoints for collection '${options.collection}' is working without 'beforeCreate' rule`);

	const connectionName = options.connection ?? 'default';

	const createEndpoints = options.endpoints
		? {
				...defaultEndpoints,
				...options.endpoints,
			}
		: defaultEndpoints;

	const repository = useRepository(options.db, options.collection, options.schema, 'deletedAt', connectionName);

	const resource = new App().prefix(options.prefix ?? options.collection);

	if (options.use) options.use.forEach((middleware) => resource.use(middleware));

	resource.tag(options.tag ?? options.collection);

	const schemaWithoutSystemFields = options.schema.omit({
		_id: true,
		deletedAt: true,
		updatedAt: true,
		createdAt: true,
	});

	const partialUpdateBodySchema = schemaWithoutSystemFields.partial();

	// Creates query filters using prefilter() if is set
	const createFilters = async (
		triggeredBy: 'get' | 'getById' | 'put' | 'patch' | 'delete',
		c: Context,
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

	if (createEndpoints.get) {
		/**
		 * [GET] /{prefix} Get paginated collection document, optionally filtered by simple query filters (asserts only equals)
		 */
		resource.get(
			'/',
			async (c) => {
				const { page, pageSize, withTrash, ...filters } = c.query as any;

				const finalFilters = await createFilters('get', c, filters);

				return await repository.getPaginated(finalFilters, page, pageSize, withTrash === 'yes');
			},
			{
				query: createPaginationQuerySchema(options.schema),
				responses: [spec.response(200, createPaginationSchema(options.schema)), spec.exception(400)],
				summary: `Get a paginated list of '${options.collection}' documents`,
				description: `Retrieves a paginated collection of documents from **${options.db}.${options.collection}**.
- Supports query filters (only equality conditions) based on schema fields.
- Pagination handled via \`page\` and \`pageSize\`.
- Can include trashed (soft-deleted) documents if \`withTrash=yes\`.
- Automatically merges \`prefilter\` rules if defined.`,
			},
		);
	}

	if (createEndpoints.getById) {
		/**
		 * [GET] /{prefix}/:id Finds a document by ObjectId
		 */
		resource.get(
			'/:id',
			async (c) => {
				const filters = await createFilters('getById', c, createObjectIdFilter(c.params.id));

				const document = await repository.findOne(filters);
				if (!document) throw new NotFound();

				return document;
			},
			{
				responses: [spec.response(200, options.schema), spec.exception(404)],
				summary: `Find a '${options.collection}' document by ID`,
				description: `Fetches a single document from **${options.db}.${options.collection}** by its MongoDB ObjectId.
- Applies \`prefilter\` rules if provided.
- Returns **404 Not Found** if the document does not exist or does not satisfy filters.`,
			},
		);
	}

	if (createEndpoints.post) {
		/**
		 * [POST] /{prefix} Validates and creates a document
		 */
		resource.post(
			'/',
			async (c) => {
				if (options.beforeCreate) await options.beforeCreate(c as any, c.body as any);

				c.setStatus(201);
				const created = await repository.create(c.body as any);

				if (options.afterCreate) await options.afterCreate(created);

				return created;
			},
			{
				type: 'application/json',
				body: schemaWithoutSystemFields,
				responses: [spec.response(201, options.schema), spec.invalid(schemaWithoutSystemFields)],
				summary: `Create a new '${options.collection}' document`,
				description: `Creates a new document in **${options.db}.${options.collection}** after validating the request payload against the schema.
- Excludes system fields (\`_id\`, \`createdAt\`, \`updatedAt\`, \`deletedAt\`) from the request body.
- Runs resource \`beforeCreate\` hook (if defined).
- If validation fails, responds with detailed schema validation errors.
- Runs resource \`afterCreate\` hook (if defined) with the new document.
- Returns **201 Created** with the inserted document.`,
			},
		);
	}

	if (createEndpoints.put) {
		/**
		 * [PUT] /{prefix}/:id Replace the entire document
		 * Similar to patch, but the entire valid resource will be required to the replacement
		 */
		resource.put(
			'/:id',
			async (c) => {
				if (options.beforeUpdate) await options.beforeUpdate(c as any, c.body as any);

				const filters = await createFilters('put', c, createObjectIdFilter(c.params.id));

				// We will need the old record if afterUpdate is set
				let oldDocument: any;
				if (options.afterUpdate) {
					oldDocument = await repository.findOne(filters);
					if (!oldDocument) throw new NotFound(); // the update will fail too, so stop it here
				}

				c.body.updatedAt = new Date();
				const updated = await repository.updateOne(filters, c.body as any);

				if (!updated) throw new NotFound();

				if (options.afterUpdate) await options.afterUpdate(oldDocument, updated);

				return updated;
			},
			{
				type: 'application/json',
				body: schemaWithoutSystemFields,
				responses: [spec.response(200, options.schema), spec.invalid(schemaWithoutSystemFields), spec.exception(404)],
				summary: `Replace a '${options.collection}' document by ID`,
				description: `Fully replaces a document in **${options.db}.${options.collection}** with the provided request body.
- Requires all fields defined in the schema (except system fields).
- Runs resource \`beforeUpdate\` hook (if defined).
- Applies \`prefilter\` rules if provided.
- Runs resource \`afterUpdate\` hook (if defined) with old and new document.
- Responds with the replaced document or **404 Not Found** if no match is found.`,
			},
		);
	}

	if (createEndpoints.patch) {
		/**
		 * [PATCH] /{prefix}/:id Partial update of a document by itsObjectId
		 */
		resource.patch(
			'/:id',
			async (c) => {
				if (options.beforePatch) await options.beforePatch(c as any, c.body as any);

				const filters = await createFilters('patch', c, createObjectIdFilter(c.params.id));

				if (Object.keys(c.body).length === 0) throw new UnprocessableEntity('At least one field should be updated');

				// We will need the old record if afterUpdate is set
				let oldDocument: any;
				if (options.afterPatch) {
					oldDocument = await repository.findOne(filters);
					if (!oldDocument) throw new NotFound(); // the update will fail too, so stop it here
				}

				c.body.updatedAt = new Date();
				const updated = await repository.updateOne(filters, c.body as any);

				if (!updated) throw new NotFound();

				if (options.afterPatch) await options.afterPatch(oldDocument, updated);

				return updated;
			},
			{
				type: 'application/json',
				body: partialUpdateBodySchema,
				responses: [spec.response(200, options.schema), spec.invalid(partialUpdateBodySchema), spec.exception(404)],
				summary: `Partially update a '${options.collection}' document by ID`,
				description: `Applies a partial update to an existing document in **${options.db}.${options.collection}**.
- At least one field must be provided; empty bodies are rejected.
- Runs resource \`beforePath\` hook (if defined).
- Applies \`prefilter\` rules if provided.
- Runs resource \`afterPatch\` hook (if defined) with old and new document.
- Responds with the updated document or **404 Not Found** if no match is found.`,
			},
		);
	}

	if (createEndpoints.delete) {
		/**
		 * [DELETE] /{prefix}/:id Deletes a document by ObjectID - if softDeletes enabled (recommended) will update his updateAt field
		 */
		resource.delete(
			'/:id',
			async (c) => {
				const filters = await createFilters('delete', c, createObjectIdFilter(c.params.id));

				const docBeforeDelete = await repository.findOne(filters);
				if (!docBeforeDelete) throw new NotFound();

				if (options.beforeDelete) await options.beforeDelete(c as any, docBeforeDelete);

				const deleted = await repository.deleteOne(filters);

				if (options.afterDelete) await options.afterDelete(docBeforeDelete);

				return { success: deleted };
			},
			{
				responses: [spec.response(200, z.object({ success: z.boolean() })), spec.exception(404)],
				summary: `Delete a '${options.collection}' document by ID`,
				description: `Deletes a document from **${options.db}.${options.collection}** by its MongoDB ObjectId.
- The operation is soft-delete, sets the \`deletedAt\` timestamp instead of permanently removing the document.
- Applies \`prefilter\` rules if provided.
- Runs resource \`beforeDelete\` hook (if defined).
- Runs resource \`afterDelete\` hook (if defined) with the deleted document.
- Returns an object with \`success: true/false\` or **404 Not Found** if no match is found.`,
			},
		);
	}

	return resource;
}
