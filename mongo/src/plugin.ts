import { App } from '@crumbjs/core';
import type { MongoClientOptions } from 'mongodb';
import { mongo } from './manager';

type Connections = {
	name: string;
	uri: string;
	opts?: MongoClientOptions;
}[];

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
export function mongoPlugin(connections: Connections = []) {
	for (const conn of connections) {
		mongo.add(conn.uri, conn.opts, conn.name);
	}

	return new App().onStart(() => mongo.connect(), '@crumbjs/mongo');
}
