import { IExecutionContext } from './cloudflare';
import { logger } from './helpers/logger';

type NamedPromise<T = any> = {
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
 * const stack = new Stack(ctx, [db.close]);
 *
 * stack.push('send-welcome-email', emailService.send(user));
 * stack.push('audit-login', auditService.track(user));
 *
 * stack.execute(); // All tasks will run in background, and DB will close afterward
 * ```
 */
export class Stack {
	private readonly tasks: NamedPromise[] = [];

	constructor(
		private readonly executionContext: IExecutionContext,
		private readonly closeTasks: Record<string, Promise<any>> = {},
	) {}

	push(name: string, promise: Promise<any>) {
		this.tasks.push({ name, promise });
	}

	execute() {
		if (!this.tasks.length && !this.closeTasks.length) return; // nothing to execute

		const tasksList = this.tasks.length ? this.tasks.map((t) => t.name).join(', ') : 'none';

		logger.debug(`Executing tasks: ${tasksList}`);

		const wrapped = this.tasks.map(({ name, promise }) =>
			promise
				.then((result) => {
					logger.debug(`Task '${name}' resolved`);
					return result;
				})
				.catch((error) => {
					logger.error(`Task '${name}' fail`);
					console.error(error);
				}),
		);

		this.executionContext.waitUntil(
			Promise.allSettled(wrapped).finally(async () => {
				logger.debug('All background tasks settled, executing close promise/s');

				const closingTasks = Object.keys(this.closeTasks);

				if (closingTasks.length) {
					logger.debug(`Closing tasks: ${closingTasks.join(',')}`);
					for (const closeTaskName of closingTasks) {
						await this.closeTasks[closeTaskName];
						logger.debug(`Close task '${closeTaskName}' executed`);
					}
				}
			}),
		);
	}
}
