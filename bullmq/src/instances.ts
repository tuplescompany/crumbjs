import Redis from 'ioredis';
import type { Queueable } from './queueable';
import { PluginOptions } from './plugin';

/** Global map to store registered event classes keyed by their name. */
export const queueableRegistry = new Map<string, new (payload: any) => Queueable<any>>();

export const bullmqConfig = (() => {
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
 * Singleton that holds the Redis connection used by the queue and worker.
 */
export const bullmqConnection = (() => {
	let connection: Redis | null = null;

	return {
		/** Initializes the Redis connection if it hasn't been set yet or Returns the active Redis connection. */
		get(): Redis {
			if (!connection) {
				const { host, port, user, pass } = bullmqConfig.get();
				return new Redis({ host, port, username: user, password: pass, maxRetriesPerRequest: null });
			}
			return connection;
		},
	};
})();
