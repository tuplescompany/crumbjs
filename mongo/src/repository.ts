import type { ZodObject, infer as ZodInfer, input as ZodInput } from 'zod';
import { Collection, Db, type Filter, ObjectId } from 'mongodb';
import type { PaginationResult } from './types';
import { mongoLogger } from './manager';
import { Exception, validate } from '@crumbjs/core';

/**
 * Generic MongoDB repository with Zod validation and optional soft deletes.
 *
 * Strongly-typed CRUD, pagination, and filter handling. Inputs are validated
 * via the provided Zod schema for runtime safety.
 *
 * @typeParam S - Zod schema for collection documents.
 * @typeParam Entity - Inferred entity type from the schema.
 * @typeParam EntityInput - Input type when creating documents (Zod input).
 * @typeParam EntityPartial - Partial update type for PATCH-like operations.
 */
export class Repository<S extends ZodObject, Entity = ZodInfer<S>, EntityInput = ZodInput<S>, EntityPartial = Partial<Entity>> {
	protected collection: Collection<ZodInfer<S>>;

	/**
	 * Binds the repository to a database, collection, and schema.
	 *
	 * @param db - MongoDB database instance.
	 * @param collectionName - Target collection name.
	 * @param schema - Zod schema used for validation.
	 * @param softDeletes - Field name for soft deletes, or `false` to disable (default: `"deletedAt"`).
	 */
	constructor(
		private readonly db: Db,
		protected readonly collectionName: string,
		protected readonly schema: S,
		protected readonly softDeletes: string | false = 'deletedAt',
	) {
		this.collection = this.db.collection<ZodInfer<S>>(this.collectionName);
	}

	/**
	 * Parses a string into a MongoDB ObjectId.
	 *
	 * @param id - String representation of ObjectId.
	 * @returns Parsed ObjectId.
	 * @throws {Exception} If the value is not a valid ObjectId.
	 */
	protected parseObjectId(id: string) {
		try {
			return new ObjectId(id);
		} catch {
			throw new Exception(`Invalid value for ${this.collectionName}._id`, 400);
		}
	}

	/**
	 * Validates a partial payload against the schema (ignores `undefined` keys).
	 * Useful for PATCH-like updates. `_id` is always omitted from validation.
	 *
	 * @param data - Partial entity data.
	 * @returns Parsed/validated data with only defined keys.
	 */
	protected parsePartial(data: EntityPartial) {
		const picks: any = {};
		for (const key in data) {
			if (data[key] !== undefined) {
				picks[key] = true;
			}
		}
		const sch = this.schema.omit({ _id: true }).pick(picks);
		return validate(sch, data);
	}

	/**
	 * Applies soft-delete filtering unless `withTrash` is true.
	 *
	 * @param filters - Base MongoDB filter.
	 * @param withTrash - Include soft-deleted documents if true.
	 * @returns Effective filter used against the collection.
	 */
	protected parseFilters(filters: Filter<Entity>, withTrash: boolean): any {
		if (!this.softDeletes || withTrash) return filters;

		return {
			$or: [{ [this.softDeletes]: { $exists: false } }, { [this.softDeletes]: null }],
			...filters,
		};
	}

	/**
	 * Starts a raw `find()` query on the collection.
	 * Use this when you need full MongoDB cursor control.
	 */
	find() {
		return this.collection.find();
	}

	/**
	 * Counts documents matching the filters (honors soft deletes by default).
	 *
	 * @param filters - MongoDB filter query.
	 * @param withTrash - Include soft-deleted documents if true.
	 * @returns Promise with the total count.
	 */
	count(filters: Filter<Entity> = {}, withTrash: boolean = false) {
		const query = this.parseFilters(filters, withTrash);
		return this.collection.countDocuments(query);
	}

	/**
	 * Retrieves a paginated list of documents.
	 *
	 * @param filters - MongoDB filter query.
	 * @param page - 1-based page number (default: 1).
	 * @param size - Page size (default: 10).
	 * @param withTrash - Include soft-deleted documents if true.
	 * @returns Pagination metadata and items as {@link PaginationResult}.
	 */
	async getPaginated(filters: Filter<Entity> = {}, page: number = 1, size: number = 10, withTrash: boolean = false) {
		const query = this.parseFilters(filters, withTrash);

		const count = await this.count(query);
		const pages = Math.max(1, Math.ceil(count / size));
		const currentPage = Math.min(Math.max(page, 1), pages);
		const skip = (currentPage - 1) * size;

		mongoLogger.debug(
			`Getting paginated ${this.collectionName} documents, filters: ${JSON.stringify(query)}, limit: ${size}, skip ${skip}`,
		);

		const data = await this.collection.find(query).skip(skip).limit(size).toArray();

		return {
			total: count,
			pageSize: size,
			pages,
			currentPage,
			prevPage: currentPage > 1 ? currentPage - 1 : null,
			nextPage: currentPage < pages ? currentPage + 1 : null,
			filters: query,
			data: data as Entity[],
		} as PaginationResult<Entity>;
	}

	/**
	 * Retrieves all documents matching the filters (honors soft deletes by default).
	 *
	 * @param filters - MongoDB filter query.
	 * @param withTrash - Include soft-deleted documents if true.
	 * @returns Promise with the list of entities.
	 */
	get(filters: Filter<Entity> = {}, withTrash: boolean = false): Promise<Entity[]> {
		const query = this.parseFilters(filters, withTrash);

		mongoLogger.debug(`Getting  ${this.collectionName} documents, filters: ${JSON.stringify(query)}`);
		return this.collection.find(query).toArray() as Promise<Entity[]>;
	}

	/**
	 * Finds a single document by its ObjectId value.
	 *
	 * @param id - Document ObjectId as string.
	 * @param withTrash - Include soft-deleted documents if true.
	 * @returns Promise with the entity or `null` if not found.
	 */
	async findById(id: string, withTrash: boolean = false) {
		return this.findOne({ _id: this.parseObjectId(id) } as any, withTrash);
	}

	/**
	 * Finds a single document by custom filters.
	 *
	 * @param filters - MongoDB filter query.
	 * @param withTrash - Include soft-deleted documents if true.
	 * @returns Promise with the entity or `null` if not found.
	 */
	async findOne(filters: Filter<Entity>, withTrash: boolean = false): Promise<Entity | null> {
		const query = this.parseFilters(filters, withTrash);
		mongoLogger.debug(`Finding on ${this.collectionName}, filters: ${JSON.stringify(query)}`);
		const res = await this.collection.findOne(query);
		return res as Entity | null;
	}

	/**
	 * Creates a new document (optionally validated with Zod).
	 *
	 * @param data - Document payload (validated against `schema` unless `parse=false`).
	 * @param parse - Enable input validation (default: true). ⚠️ Disable only if you understand the risks.
	 * @returns Promise with the created entity (including `_id`).
	 * @throws {Exception} If the insert fails or validation fails.
	 */
	async create(data: Omit<EntityInput, '_id'>, parse: boolean = true): Promise<Entity> {
		const createData = parse ? validate(this.schema.omit({ _id: true }), data) : data;
		(createData as any)._id = new ObjectId();

		mongoLogger.debug(`Creating document on ${this.collectionName}, data: ${JSON.stringify(createData)}`);

		const result = await this.collection.insertOne(createData as any);

		if (!result.acknowledged || !result.insertedId)
			throw new Exception(
				'Failed to create a document on collection ${this.collectionName}, acknowledged or insertedId not found in MongoClient response.',
				503,
			);

		return { _id: result.insertedId, ...(createData as any) } as Entity;
	}

	/**
	 * Updates a single document matching the filters (PATCH-like).
	 *
	 * @param filters - MongoDB filter query.
	 * @param data - Partial payload. Only defined keys are validated/set.
	 * @param parse - Enable input validation (default: true). ⚠️ Disable only if you understand the risks.
	 * @returns Promise with the updated entity, or `null` if not found.
	 */
	async updateOne(filters: Filter<Entity>, data: EntityPartial, parse: boolean = true): Promise<Entity | null> {
		const updateData = parse ? this.parsePartial(data) : data;
		const set = { $set: updateData } as any;

		mongoLogger.debug(
			`Updating one document on ${this.collectionName}, filters: ${JSON.stringify(filters)} data: ${JSON.stringify(updateData)}`,
		);

		const updated = await this.collection.findOneAndUpdate(filters as any, set, { returnDocument: 'after' });

		return updated as Entity | null;
	}

	/**
	 * Convenience wrapper around {@link updateOne} using an ObjectId.
	 *
	 * @param id - Document ObjectId as string.
	 * @param data - Partial payload.
	 * @param parse - Enable input validation (default: true).
	 * @returns Promise with the updated entity, or `null` if not found.
	 */
	updateById(id: string, data: EntityPartial, parse: boolean = true) {
		return this.updateOne({ _id: this.parseObjectId(id) } as any, data, parse);
	}

	/**
	 * Deletes a single document. Performs a soft delete if configured, otherwise hard delete.
	 *
	 * @param filters - MongoDB filter query.
	 * @returns Promise resolving to `true` if a document was deleted/soft-deleted, otherwise `false`.
	 * @throws {Exception} If soft delete is enabled but no document matches.
	 */
	async deleteOne(filters: Filter<Entity>): Promise<boolean> {
		const softDeleteText = this.softDeletes ? 'Soft' : 'Hard';
		mongoLogger.debug(`${softDeleteText} deleting document from ${this.collectionName} collection, filters: ${JSON.stringify(filters)}`);

		if (this.softDeletes) {
			const res = await this.updateOne(filters, { [this.softDeletes]: new Date() } as any);
			if (!res) {
				throw new Exception(
					'Deletion could not be completed, soft deletes are enabled, but no matching document was found during the update operation.',
					503,
				);
			}

			return true;
		}

		const res = await this.collection.deleteOne(filters as any);
		return res.deletedCount > 0;
	}

	/**
	 * Convenience wrapper around {@link deleteOne} using an ObjectId.
	 *
	 * @param id - Document ObjectId as string.
	 * @returns Promise resolving to `true` if a document was deleted, otherwise `false`.
	 */
	deleteById(id: string): Promise<boolean> {
		return this.deleteOne({ _id: this.parseObjectId(id) } as any);
	}

	/**
	 * Creates multiple documents (optionally validated with Zod).
	 *
	 * @param items - Array of payloads (validated against `schema` unless `parse=false`).
	 * @param parse - Enable input validation (default: true). ⚠️ Disable only if you understand the risks.
	 * @returns Promise with the created entities (each including `_id`).
	 * @throws {Exception} If the insert fails or validation fails.
	 */
	async createMany(items: ReadonlyArray<Omit<EntityInput, '_id'>>, parse: boolean = true): Promise<Entity[]> {
		if (!items.length) return [];

		const payloads = items.map((it) => (parse ? validate(this.schema.omit({ _id: true }), it) : (it as any)));
		const docs = payloads.map((p) => ({ ...(p as any), _id: new ObjectId() }));

		mongoLogger.debug(`Creating ${docs.length} documents on ${this.collectionName}`);

		const res = await this.collection.insertMany(docs as any[], { ordered: true });

		if (!res.acknowledged)
			throw new Exception(
				`Failed to create documents on collection ${this.collectionName}, MongoClient did not acknowledge the operation.`,
				503,
			);

		return docs as unknown as Entity[];
	}

	/**
	 * Updates multiple documents matching the filters (PATCH-like).
	 *
	 * @param filters - MongoDB filter query.
	 * @param data - Partial payload. Only defined keys are validated/set.
	 * @param parse - Enable input validation (default: true). ⚠️ Disable only if you understand the risks.
	 * @returns Promise with the update summary: matched and modified counts.
	 */
	async updateMany(
		filters: Filter<Entity>,
		data: EntityPartial,
		parse: boolean = true,
	): Promise<{ matchedCount: number; modifiedCount: number }> {
		const updateData = parse ? this.parsePartial(data) : data;
		const keys = Object.keys(updateData as any);
		if (keys.length === 0) {
			mongoLogger.debug(`updateMany on ${this.collectionName} received empty payload. Skipping.`);
			return { matchedCount: 0, modifiedCount: 0 };
		}

		mongoLogger.debug(
			`Updating many documents on ${this.collectionName}, filters: ${JSON.stringify(filters)}, keys: ${JSON.stringify(keys)}`,
		);

		const res = await this.collection.updateMany(filters as any, { $set: updateData as any });

		return { matchedCount: res.matchedCount ?? 0, modifiedCount: res.modifiedCount ?? 0 };
	}
}
