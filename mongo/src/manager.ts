import { createLogger } from '@crumbjs/core';
import { Db, MongoClient, type MongoClientOptions } from 'mongodb';

export const mongoLogger = createLogger('@crumbjs/mongo');

/**
 * Interface for the Mongo connection manager.
 *
 * Provides methods to register, connect, and retrieve MongoDB connections
 * and databases by name.
 */
export interface MongoManager {
	/**
	 * Adds (or overrides) a named MongoDB connection config.
	 *
	 * @param uri - MongoDB connection string.
	 * @param opts - Optional MongoClient options.
	 * @param conn - Connection name (defaults to `"default"`).
	 */
	add(uri: string, opts?: MongoClientOptions, conn?: string): void;

	/**
	 * Connects all configured MongoClients.
	 *
	 * Recommended to run at server startup to "warm up" all connections.
	 */
	connect(): Promise<void>;

	/**
	 * Retrieves a MongoClient by connection name.
	 *
	 * @param conn - Connection name (defaults to `"default"`).
	 * @throws If the connection is not configured.
	 */
	get(conn?: string): MongoClient;

	/**
	 * Retrieves a MongoDB database instance by database and connection name.
	 *
	 * @param db - Target database name.
	 * @param conn - Connection name (defaults to `"default"`).
	 * @throws If the connection is not configured.
	 */
	db(db: string, conn?: string): Db;
}

/**
 * Mongo connection manager (singleton).
 *
 * - Supports multiple named MongoDB connections.
 * - Lazily initializes clients from configs.
 * - Auto-detects default connection from `MONGO_URI` or `DATABASE_URL`.
 */
export const mongo: MongoManager = (() => {
	/** Connection configs indexed by name */
	let connectionConfigs: Record<string, { uri: string; opts?: MongoClientOptions }> | undefined;

	/** Active MongoClient instances indexed by name */
	let clients: Record<string, MongoClient> = {};

	/**
	 * Creates a default connection config from environment variables.
	 *
	 * Used when no explicit connection is registered.
	 * Requires `MONGO_URI` or `DATABASE_URL` to be set.
	 */
	const createDefaultConfig = () => {
		mongoLogger.debug('Creating default mongo configuration from env varaibles MONGO_URI or DATABASE_URL');
		const uri = process.env.MONGO_URI || process.env.DATABASE_URL;
		if (!uri) {
			throw new Error(`Cannot initialize default MongoDB connection. Set 'MONGO_URI' or 'DATABASE_URL' in environment.`);
		}
		return { default: { uri } };
	};

	/**
	 * Returns all connection configs (initializes default if none are set).
	 */
	const getConfigs = () => {
		if (!connectionConfigs) {
			connectionConfigs = createDefaultConfig();
		}

		return connectionConfigs;
	};

	/**
	 * Ensures MongoClient instances exist for each config.
	 * Lazily creates them but does not connect.
	 */
	const ensureClients = () => {
		for (const [name, { uri, opts }] of Object.entries(getConfigs())) {
			if (!clients[name]) {
				clients[name] = new MongoClient(uri, opts);
			}
		}
		return clients;
	};

	/**
	 * Retrieves a MongoClient by name, ensuring configs are loaded.
	 */
	const getConnection = (name: string) => {
		const all = ensureClients();
		if (!all[name]) throw new Error(`Mongo connection '${name}' is not configured.`);
		return all[name];
	};

	return {
		add(uri: string, opts?: MongoClientOptions, conn: string = 'default') {
			if (!connectionConfigs) connectionConfigs = {};
			connectionConfigs[conn] = { uri, opts };
		},

		async connect() {
			for (const [name, client] of Object.entries(ensureClients())) {
				await client.connect();
				mongoLogger.debug(`✅ Mongo connection '${name}' established`);
			}
		},

		get(conn: string = 'default') {
			return getConnection(conn);
		},

		db(db: string, conn: string = 'default') {
			return getConnection(conn).db(db);
		},
	};
})();
