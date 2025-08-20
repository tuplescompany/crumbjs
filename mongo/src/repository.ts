import type { ZodObject, infer as ZodInfer, input as ZodInput } from 'zod';
import { Collection, Db, type Filter, ObjectId } from 'mongodb';
import type { PaginationResult } from './types';

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

	private parseFilters(filters: Filter<Entity>, withTrash: boolean): any {
		if (!this.softDeletes || withTrash) return filters; // unmodified

		return {
			$or: [{ [this.softDeletes]: { $exists: false } }, { [this.softDeletes]: null }],
		};
	}

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

		const data = await this.collection.find(query).skip(skip).limit(size).toArray();

		return {
			total: count,
			pageSize: size,
			pages,
			currentPage,
			prevPage: currentPage > 1 ? currentPage - 1 : null,
			nextPage: currentPage < pages ? currentPage + 1 : null,
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
		return this.findOneBy({ _id: new ObjectId(id) } as any, withTrash);
	}

	/**
	 * Finds a single document by custom filters.
	 *
	 * @param filters - MongoDB filter query.
	 * @param withTrash - Whether to include soft-deleted documents.
	 * @returns The entity, or `null` if not found.
	 */
	async findOneBy(filters: Filter<Entity>, withTrash: boolean = false): Promise<Entity | null> {
		const query = this.parseFilters(filters, withTrash);
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
	async create(data: EntityInput): Promise<Entity> {
		const createData = this.schema.omit({ _id: true }).parse(data);
		createData._id = new ObjectId();

		const result = await this.collection.insertOne(createData as any);

		if (!result.acknowledged || !result.insertedId)
			throw new Error(`Failed to create a document on collection ${this.collectionName}`, {
				cause: 'acknowledged or insertedId not found in MongoClient response',
			});

		return { _id: result.insertedId, ...createData } as Entity;
	}

	/**
	 * Updates a document matching the given filters.
	 *
	 * @param filters - MongoDB filter query.
	 * @param data - Partial entity data (validated via schema).
	 * @returns The updated entity, or `null` if not found.
	 */
	async update(filters: Filter<Entity>, data: EntityPartial): Promise<Entity | null> {
		const updateData = this.schema.partial().omit({ _id: true }).parse(data);
		const set = { $set: updateData } as any;

		const updated = await this.collection.findOneAndUpdate(filters as any, set, { returnDocument: 'after' });

		return updated as Entity | null;
	}

	/**
	 * Updates a document by its MongoDB ObjectId.
	 *
	 * @param id - Document ObjectId as string.
	 * @param data - Partial entity data.
	 * @returns The updated entity, or `null` if not found.
	 */
	updateById(id: string, data: EntityPartial) {
		return this.update({ _id: new ObjectId(id) } as any, data);
	}

	/**
	 * Deletes a document by its MongoDB ObjectId.
	 * - If `softDeletes` is enabled, sets the delete field instead of removing.
	 * - Otherwise, performs a hard delete.
	 *
	 * @param id - Document ObjectId as string.
	 * @returns `true` if deletion (or soft deletion) was successful, `false` otherwise.
	 * @throws If soft delete is enabled but no matching document is found.
	 */
	async deleteById(id: string): Promise<boolean> {
		if (this.softDeletes) {
			const res = await this.updateById(id, { [this.softDeletes]: new Date() } as any);
			if (!res) {
				throw new Error(`Deletion could not be completed`, {
					cause: `Soft deletes are enabled, but no matching document was found during the update operation.`,
				});
			}

			return true;
		}

		const res = await this.collection.deleteOne({ _id: new ObjectId(id) } as any);
		return res.deletedCount > 0;
	}
}
