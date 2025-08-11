import type { Queueable } from './queueable';
import { useQueue } from './plugin';
import { logger } from '@crumbjs/core';

/**
 * Queues an event using the default queue.
 */
export const dispatch = <T extends Record<string, any> = any>(event: Queueable<T>) => {
	useQueue()
		.add(event.constructor.name, event.getPayload(), {
			removeOnComplete: event.removeOnComplete,
			removeOnFail: event.removeOnFail,
			attempts: event.retries,
			backoff: {
				type: 'fixed',
				delay: event.delayOnFailure,
			},
		})
		.then((added) => {
			logger.debug(`[crumbjs/bullmq] ${event.constructor.name} queued, Payload:`, added.data);
		})
		.catch((err) => {
			logger.error('[crumbjs/bullmq] Error adding job to queue', err);
		});
};
