import { App, createLogger } from '@crumbjs/core';
import { MongoClient, type MongoClientOptions } from 'mongodb';
import type { ZodObject } from 'zod';
import { Repository } from './repository';

// Mongo client instance holder
let client: MongoClient | null = null;

export const mongoLogger = createLogger('@crumbjs/mongo');

/**
 * Connects to MongoDB and keeps a singleton client instance.
 *
 * Ensures that the connection is established only once, even if called multiple times.
 *
 * @param uri - MongoDB connection string.
 * @param opts - Optional MongoClient configuration.
 * @returns A Promise that resolves when the client is connected.
 * @throws If the connection fails.
 */
export async function connect(uri: string, opts?: MongoClientOptions) {
	if (!client) {
		client = new MongoClient(uri, opts);
		await client.connect(); // <- conecta una sola vez
		mongoLogger.debug('✅ Mongo connected');
	}
}

/**
 * Returns a MongoDB client instance from the connected client.
 *
 * @returns The MongoClient instance.
 * @throws If the Mongo client has not been initialized via {@link connect} or {@link mongoPlugin}.
 */
export function getClient() {
	if (!client) throw new Error(`MongoClient not ready. Use connect() or mongoPlugin before accesing mongoDb()`);
	return client;
}

/**
 * Returns a MongoDB database instance from the connected client.
 *
 * @param name - Database name to select.
 * @returns The database instance.
 * @throws If the Mongo client has not been initialized via {@link connect} or {@link mongoPlugin}.
 */
export function db(name: string) {
	if (!client) throw new Error(`MongoClient not ready. Use connect() or mongoPlugin before accesing mongoDb()`);
	return client.db(name);
}

function detectUri() {
	if (process.env.MONGO_URI) return process.env.MONGO_URI;
	if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
	return null;
}

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
export function useRespository<S extends ZodObject>(
	dbName: string,
	collection: string,
	schema: S,
	softDeletes: string | false = 'deletedAt',
) {
	return new Repository(db(dbName), collection, schema, softDeletes);
}

type PluginOptions = {
	uri?: string;
	clientOpts?: MongoClientOptions;
};

/**
 * CrumbJS plugin for MongoDB integration.
 *
 * - Connects automatically to MongoDB at app startup.
 * - Exposes the Mongo client on the request context (`c.get('mongo')`).
 * - Accepts URI from parameter or environment (`MONGO_URI` or `DATABASE_URL`).
 *
 * @param uri - Optional MongoDB connection string. Falls back to env vars if omitted.
 * @param opts - Optional MongoClient configuration.
 * @returns An {@link App} instance with Mongo integration.
 * @throws If no connection string is provided via parameter or environment variables.
 */
export function mongoPlugin(opts: PluginOptions = {}) {
	if (!opts.uri && !detectUri()) {
		throw Error(`Database uri must be set on mongoPlugin() or in env 'MONGO_URI' or 'DATABASE_URL'`);
	}
	const mongoUri = (opts.uri ?? detectUri()) as string;

	return new App()
		.onStart(() => connect(mongoUri, opts.clientOpts), '@crumbjs/mongo')
		.use(async (c) => {
			c.set('mongo', client);
			return await c.next();
		});
}
