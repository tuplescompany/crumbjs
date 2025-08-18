import { App, createLogger } from '@crumbjs/core';
import { buildEvent } from './queueable';
import { Queue, Worker } from 'bullmq';
import { bullmqConfig, bullmqConnection } from './instances';
import type { Job } from 'bullmq';

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

export const bullmqLogger = createLogger('crumbjs/bullmq');

/** Creates or retrieves the default queue instance. */
export const useQueue = () => {
	return new Queue('bullmq-queue', { connection: bullmqConnection.get() });
};

/**
 * Crumbjs plugin that starts a BullMQ worker and exposes a `queue` utility.
 */
export const bullmqPlugin = (opts: Partial<PluginOptions> = {}) => {
	bullmqConfig.set(opts); // set user preferences on startup

	return new App().onStart(() => {
		const worker = new Worker(
			'bullmq-queue',
			async (job: Job) => {
				const event = buildEvent(job.name, job.data);
				const result = await event.safeHandle();

				return result ?? {};
			},
			{ connection: bullmqConnection.get(), autorun: false, concurrency: bullmqConfig.concurrency() },
		);

		worker.on('completed', (job, result) => {
			bullmqLogger.info(`${job.name} completed | attemps: ${job.attemptsMade}`);
			bullmqLogger.debug(`${job.name} Payload:`, job.data);
			bullmqLogger.debug(`${job.name} Result: `, result);
		});

		worker.on('failed', (job, err) => {
			bullmqLogger.error(`${job?.name} failed, attemps: ${job?.attemptsMade ?? 0 + 1}, error: ${err.message}`);
			bullmqLogger.debug(`${job?.name} payload:`, job?.data);
		});

		bullmqLogger.info('👷 BullMQ queue worker starts');

		worker.run();
	}, 'crumbjs-bullmq');
};
