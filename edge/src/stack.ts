import { IExecutionContext } from './cloudflare/types';
import { logger } from './helpers/logger';
import { OnClose, ResolvedContext } from './types';

type Task<T = any> = {
	name: string;
	promise: Promise<T>;
};

/**
 * Manages a stack of background tasks to be executed using Cloudflare Workers `ExecutionContext.waitUntil`.
 *
 * - Allows naming each background task for better traceability in logs.
 * - Automatically logs when each task is resolved (successfully or with error).
 * - Ensures the database connection is closed only after all tasks have settled.
 *
 * ## Example
 * ```ts
 * const stack = new Stack(ctx, close);
 * stack.onClose(closePromise);
 *
 * stack.add('send-welcome-email', emailService.send(user));
 * stack.add('audit-login', auditService.track(user));
 *
 * stack.execute(); // All tasks will run in background, and 'db' will close afterward
 * ```
 */
export class Stack {
	private readonly tasks: Task[] = [];
	private readonly names: string[] = [];

	constructor(
		private readonly executionContext: IExecutionContext,
		private readonly close: OnClose | false = false,
	) {}

	add(name: string, promise: Promise<any>) {
		logger.debug(`Pushing background task: ${name}`);
		this.tasks.push({ name, promise });
		this.names.push(name);
	}

	execute(ctx: ResolvedContext) {
		logger.debug(`Executing task stack:`, this.names);

		const wrapped = this.tasks.map(({ name, promise }) =>
			promise
				.then((result) => {
					logger.debug(`Background task ${name} resolved, result:`, result);
					return result;
				})
				.catch((error) => {
					logger.error(`Background task ${name} failed, error:`, error);
					throw error;
				}),
		);

		this.executionContext.waitUntil(
			Promise.allSettled(wrapped).then(() => {
				if (this.close) {
					logger.debug('All background tasks settled, executing close promise');
					return this.close(ctx);
				}
			}),
		);
	}
}
