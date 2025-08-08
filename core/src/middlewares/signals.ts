import { Middleware, MiddlewareContext } from '../types';
import { signal } from '../utils';

/**
 * Middleware that logs request signals such as method, path, status, duration, and IP.
 *
 * By default, logs with `info` level, meaning output may be suppressed if the current
 * logger level is higher. If `force` is `true`, it logs regardless of the level using `print`.
 *
 * This is useful for monitoring internal requests without polluting production logs
 * unless explicitly desired.
 *
 * @param force - If `true`, logs are always printed; otherwise, logged as debug.
 * @returns Middleware function to measure and log request signal data.
 *
 * @example
 * app.use(signals(true)); // Always log requests signals
 */
export const signals =
	(force: boolean = false): Middleware =>
	async (ctx: MiddlewareContext) => {
		const {
			start,
			request: { method },
			url,
			ip,
			next,
			getResponseStatus,
		} = ctx;

		const response = await next();

		const { status, statusText } = getResponseStatus();
		const fn = status >= 400 ? 'error' : force ? 'print' : 'info';

		const duration = performance.now() - start;

		signal(fn, method, url.pathname, status, statusText, duration, ip);

		return response;
	};
