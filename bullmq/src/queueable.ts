import { logger } from '@crumbjs/core';
import { queueableRegistry } from './instances';

/**
 * Registers an event class in the global registry so it can be resolved later.
 */
export function IsQueueable() {
	return function <T extends new (...args: any[]) => any>(constructor: T) {
		queueableRegistry.set(constructor.name, constructor as any);
		logger.info(`[crumbjs/bullmq] ⚡️ ${constructor.name} registered`);
	};
}

/**
 * Instantiates an event from its registered name.
 * @param name Event class name.
 * @param payload Data passed to the event constructor.
 */
export function buildEvent(name: string, payload: any): Queueable<any> {
	const EventClass = queueableRegistry.get(name);
	if (!EventClass) throw new Error(`Event ${name} not registered. Did you forget @IsQueueable() decorator?`);
	return new EventClass(payload);
}

/**
 * Base class that every queue event should extend.
 * @template T Payload shape for the event.
 */
export abstract class Queueable<T extends Record<string, any> = any> {
	/**
	 * How many times the job will be retried on failure.
	 */
	public retries: number = 5;
	/**
	 * Delay in milliseconds before retrying a failed job.
	 */
	public delayOnFailure: number = 15000;
	/**
	 * If true, removes the job when it successfully completes When given a number,
	 * it specifies the maximum amount of jobs to keep, or you can provide an object specifying max age and/or count to keep.
	 * @default true (delete job after complete)
	 */
	public removeOnComplete: boolean | number = true;
	/**
	 * If true, removes the job when it fails after all attempts. When given a number,
	 * it specifies the maximum amount of jobs to keep, or you can provide an object specifying max age and/or count to keep.
	 * @default 100 (keep 100 failed attempts in redis)
	 */
	public removeOnFail: boolean | number = 100;

	constructor(protected readonly payload: T) {}

	/**
	 * Executes the event logic.
	 * @returns A value that will be stored as the job result.
	 */
	abstract handle(): Promise<any> | Promise<void>;

	/**
	 * Executes {@link handle} and makes sure thrown values are `Error` objects.
	 */
	async safeHandle() {
		try {
			return await this.handle();
		} catch (error) {
			if (error instanceof Error) {
				throw error;
			}

			throw new Error(typeof error === 'string' ? error : JSON.stringify(error));
		}
	}

	/** Returns the original event payload. */
	getPayload(): T {
		return this.payload;
	}
}
