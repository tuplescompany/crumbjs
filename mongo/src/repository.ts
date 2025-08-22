import type { ZodObject, infer as ZodInfer, input as ZodInput } from 'zod';
import { Collection, Db, type Filter, ObjectId } from 'mongodb';
import type { PaginationResult } from './types';
import { mongoLogger } from './manager';
import { Exception, validate } from '@crumbjs/core';

/**
 * Generic MongoDB Repository with Zod validation and optional soft deletes.
 *
 * Provides a strongly-typed interface for common CRUD operations, pagination,
 * and query handling. The repository validates input using a Zod schema,
 * ensuring consistent data shape and safety at runtime.
 *
 * @typeParam S - Zod schema for the collection's documents.
 * @typeParam Entity - Inferred entity type from schema.
 * @typeParam EntityInput - Input type accepted when creating documents.
 * @typeParam EntityPartial - Partial update type for documents.
 */
export class Repository<S extends ZodObject, Entity = ZodInfer<S>, EntityInput = ZodInput<S>, EntityPartial = Partial<Entity>> {
	protected collection: Collection<ZodInfer<S>>;

	/**
	 * Creates a new repository bound to a specific database and collection.
	 *
	 * @param db - MongoDB database instance.
	 * @param collectionName - Collection name.
	 * @param schema - Zod schema for validation.
	 * @param softDeletes - Field name used for soft deletes, or `false` to disable.
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
	 * helper ->
	 * @param id
	 * @returns
	 */
	protected parseObjectId(id: string) {
		try {
			return new ObjectId(id);
		} catch (error) {
			throw new Exception(`Invalid value for ${this.collectionName}._id`, 400);
		}
	}

	/**
	 * helper -> Return an schema only with not-undefined data keys
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
	 * helper ->
	 * @param filters
	 * @param withTrash
	 * @returns
	 */
	protected parseFilters(filters: Filter<Entity>, withTrash: boolean): any {
		if (!this.softDeletes || withTrash) return filters; // unmodified

		return {
			$or: [{ [this.softDeletes]: { $exists: false } }, { [this.softDeletes]: null }],
			...filters,
		};
	}

	/**
	 * Start a MongoClient raw query
	 * @returns
	 */
	find() {
		return this.collection.find();
	}

	/**
	 * Counts the number of documents matching the given filters.
	 *
	 * @param filters - MongoDB filter query.
	 * @param withTrash - Whether to include soft-deleted documents.
	 * @returns Number of matching documents.
	 */
	count(filters: Filter<Entity> = {}, withTrash: boolean = false) {
		const query = this.parseFilters(filters, withTrash);
		return this.collection.countDocuments(query);
	}

	/**
	 * Retrieves a paginated list of documents.
	 *
	 * @param filters - MongoDB filter query.
	 * @param page - Page number (1-based).
	 * @param size - Page size (default: 10).
	 * @param withTrash - Whether to include soft-deleted documents.
	 * @returns A {@link PaginationResult} with metadata and document array.
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
	 * Retrieves all documents matching the given filters.
	 *
	 * @param filters - MongoDB filter query.
	 * @param withTrash - Whether to include soft-deleted documents.
	 * @returns Array of entities.
	 */
	get(filters: Filter<Entity> = {}, withTrash: boolean = false): Promise<Entity[]> {
		const query = this.parseFilters(filters, withTrash);

		mongoLogger.debug(`Getting  ${this.collectionName} documents, filters: ${JSON.stringify(query)}`);
		return this.collection.find(query).toArray() as Promise<Entity[]>;
	}

	/**
	 * Finds a single document by its MongoDB ObjectId.
	 *
	 * @param id - Document ObjectId as string.
	 * @param withTrash - Whether to include soft-deleted documents.
	 * @returns The entity, or `null` if not found.
	 */
	async findById(id: string, withTrash: boolean = false) {
		return this.findOne({ _id: this.parseObjectId(id) } as any, withTrash);
	}

	/**
	 * Finds a single document by custom filters.
	 *
	 * @param filters - MongoDB filter query.
	 * @param withTrash - Whether to include soft-deleted documents.
	 * @returns The entity, or `null` if not found.
	 */
	async findOne(filters: Filter<Entity>, withTrash: boolean = false): Promise<Entity | null> {
		const query = this.parseFilters(filters, withTrash);
		mongoLogger.debug(`Finding on ${this.collectionName}, filters: ${JSON.stringify(query)}`);
		const res = await this.collection.findOne(query);
		return res as Entity | null;
	}

	/**
	 * Creates a new document after validating against the Zod schema.
	 *
	 * @param data - Data to insert (validated via schema).
	 * @returns The created entity with `_id`.
	 * @throws If insertion fails or schema validation fails.
	 */
	async create(data: Omit<EntityInput, '_id'>): Promise<Entity> {
		const createData = validate(this.schema.omit({ _id: true }), data);
		createData._id = new ObjectId();

		mongoLogger.debug(`Creating document on ${this.collectionName}, data: ${JSON.stringify(createData)}`);

		const result = await this.collection.insertOne(createData as any);

		if (!result.acknowledged || !result.insertedId)
			throw new Exception(
				'Failed to create a document on collection ${this.collectionName}, acknowledged or insertedId not found in MongoClient response.',
				503,
			);

		return { _id: result.insertedId, ...createData } as Entity;
	}

	/**
	 * key-method -> Updates a document matching the given filters.
	 *
	 * @param filters - MongoDB filter query.
	 * @param data - Partial entity data (validated via schema).
	 * @returns The updated entity, or `null` if not found.
	 */
	async updateOne(filters: Filter<Entity>, data: EntityPartial): Promise<Entity | null> {
		const updateData = this.parsePartial(data);
		const set = { $set: updateData } as any;

		mongoLogger.debug(
			`Updating one document on ${this.collectionName}, filters: ${JSON.stringify(filters)} data: ${JSON.stringify(updateData)}`,
		);

		const updated = await this.collection.findOneAndUpdate(filters as any, set, { returnDocument: 'after' });

		return updated as Entity | null;
	}

	/**
	 * shortcut -> Updates a document by its MongoDB ObjectId.
	 *
	 * @param id - Document ObjectId as string.
	 * @param data - Partial entity data.
	 * @returns The updated entity, or `null` if not found.
	 */
	updateById(id: string, data: EntityPartial) {
		return this.updateOne({ _id: this.parseObjectId(id) } as any, data);
	}

	/**
	 * key-method ->
	 * @param filters
	 * @returns
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
	 * shortcut
	 * @param id
	 * @returns
	 */
	deleteById(id: string): Promise<boolean> {
		return this.deleteOne({ _id: this.parseObjectId(id) } as any);
	}
}
