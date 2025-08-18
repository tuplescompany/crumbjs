import type { Queueable } from './queueable';
import { bullmqLogger, useQueue } from './plugin';

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
			bullmqLogger.debug(`${event.constructor.name} queued, Payload:`, added.data);
		})
		.catch((err) => {
			bullmqLogger.error('Error adding job to queue', err);
		});
};
