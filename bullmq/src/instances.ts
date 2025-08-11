import Redis from 'ioredis';
import type { Queueable } from './queueable';

/** Global map to store registered event classes keyed by their name. */
export const queueableRegistry = new Map<string, new (payload: any) => Queueable<any>>();

export type PluginOptions = {
	/** Redis HOST @default '127.0.0.1' */
	host: string;
	/** Redis PORT @default 6379 */
	port: number;
	/** Redis USERNAME @default undefined */
	user?: string;
	/** Redis PASSWORD @default undefined */
	pass?: string;
	/**
	 * Amount of jobs that a single worker is allowed to work on in parallel.
	 * @default 10
	 */
	concurrency: number;
};

export const bullMqConfig = (() => {
	// default options
	let opts: PluginOptions = {
		host: '127.0.0.1',
		port: 6379,
		user: undefined,
		pass: undefined,
		concurrency: 10,
	};

	return {
		concurrency() {
			return opts.concurrency;
		},
		set(options: Partial<PluginOptions>) {
			const cleaned = Object.fromEntries(Object.entries(options).filter(([, v]) => v !== undefined));
			opts = {
				...opts,
				...cleaned,
			};
		},
		get() {
			return opts;
		},
	};
})();

/**
 * Singleton that holds the Redis connection used by the queue and workers.
 */
export const bullMqConnection = (() => {
	let connection: Redis | null = null;

	return {
		/** Initializes the Redis connection if it hasn't been set yet or Returns the active Redis connection. */
		get(): Redis {
			if (!connection) {
				const { host, port, user, pass } = bullMqConfig.get();
				return new Redis({ host, port, username: user, password: pass, maxRetriesPerRequest: null });
			}
			return connection;
		},
	};
})();
