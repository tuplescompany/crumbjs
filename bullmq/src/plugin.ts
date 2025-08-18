import { App, logger } from '@crumbjs/core';
import { buildEvent } from './queueable';
import { Queue, Worker } from 'bullmq';
import { type PluginOptions, bullMqConfig, bullMqConnection } from './instances';
import type { Job } from 'bullmq';

/** Creates or retrieves the default queue instance. */
export const useQueue = () => {
	return new Queue('bullmq-queue', { connection: bullMqConnection.get() });
};


/**
 * Crumbjs plugin that starts a BullMQ worker and exposes a `queue` utility.
 */
export const bullmqPlugin = (opts: Partial<PluginOptions> = {}) => {
	bullMqConfig.set(opts); // set user preferences on startup

	return new App().onStart(() => {
		const worker = new Worker(
			'bullmq-queue',
			async (job: Job) => {
				const event = buildEvent(job.name, job.data);
				const result = await event.safeHandle();

				return result ?? {};
			},
			{ connection: bullMqConnection.get(), autorun: false, concurrency: bullMqConfig.concurrency() },
		);

		worker.on('completed', (job, result) => {
			logger.info(`[crumbjs/bullmq] ${job.name} completed | attemps: ${job.attemptsMade}`);
			logger.debug(`[crumbjs/bullmq] ${job.name} Payload:`, job.data);
			logger.debug(`[crumbjs/bullmq] ${job.name} Result: `, result);
		});

		worker.on('failed', (job, err) => {
			logger.error(`[crumbjs/bullmq] ${job?.name} failed, attemps: ${job?.attemptsMade ?? 0 + 1}, error: ${err.message}`);
			logger.debug(`[crumbjs/bullmq] ${job?.name} payload:`, job?.data);
		});

		logger.info('[crumbjs/bullmq] 👷 BullMQ queue worker starts');

		worker.run();
	}, 'crumbjs-bullmq');
};
