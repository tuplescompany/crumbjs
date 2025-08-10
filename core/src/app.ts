import type { APIConfig, AppConfig, ContentType, Handler, Method, Middleware, OnStart, Route, RouteConfig, StaticRoute } from './types';
import { Router } from './router';
import { ZodObject } from 'zod';
import { defaultAppConfig } from './constants';

export class App {
	private config: AppConfig;

	private routes: Route[] = [];

	private statics: StaticRoute[] = [];

	private globalMiddlewares: Middleware[] = [];

	private onStartTriggers: Record<string, OnStart> = {};

	constructor(opts: Partial<AppConfig> = {}) {
		this.config = { ...defaultAppConfig, ...opts };
	}

	getPrefix() {
		return this.config.prefix;
	}

	getRoutes() {
		return this.routes;
	}

	getStaticRoutes() {
		return this.statics;
	}

	onStart(fn: OnStart, name = 'default') {
		this.onStartTriggers[name] = fn;
		return this;
	}

	getStartupTriggers() {
		return this.onStartTriggers;
	}

	/**
	 * Mounts a middleware function or another {@link App} instance onto the current application.
	 *
	 * - If a **Middleware** is provided:
	 *   The function is added to the list of global middlewares. These run for
	 *   every request before route-specific middlewares and handlers.
	 *
	 * - If another **App** instance is provided:
	 *   - All of its routes are merged into the current app, with this app's prefix
	 *     automatically prepended to the child app's route paths.
	 *   - All of its static routes are also merged, with prefixes applied.
	 *   - All of its global middlewares are appended to the current app's
	 *     global middleware chain.
	 *   - Its `onStart` triggers are merged into the current app's triggers
	 *     (overwriting by name to avoid duplication).
	 *
	 * This method is useful for:
	 * - Composing large applications from smaller sub-apps (modular architecture).
	 * - Sharing reusable route/middleware groups across projects.
	 * - Applying global cross-cutting middleware.
	 *
	 * @param usable - Either:
	 *   - A {@link Middleware} function to run on every request.
	 *   - Another {@link App} instance whose routes, statics, middlewares,
	 *     and startup triggers will be merged into this one.
	 *
	 * @returns The current {@link App} instance for chaining.
	 *
	 * @example
	 * // Mount a global middleware
	 * app.use(loggerMiddleware);
	 *
	 * // Mount a sub-application with its own routes
	 * app.use(apiApp);
	 */
	use(usable: Middleware | App) {
		if (usable instanceof App) {
			this.routes = this.routes.concat(
				usable.getRoutes().map((child) => ({
					pathParts: [this.getPrefix(), ...child.pathParts],
					method: child.method,
					handler: child.handler,
					config: child.config,
				})),
			);

			this.statics = this.statics.concat(
				usable.getStaticRoutes().map((child) => ({
					pathParts: [this.getPrefix(), ...child.pathParts],
					contentOrPath: child.contentOrPath,
					isFile: child.isFile,
					contentType: child.contentType,
				})),
			);

			this.globalMiddlewares = this.globalMiddlewares.concat(usable.globalMiddlewares);

			// Avoid duplication with name index
			this.onStartTriggers = {
				...this.onStartTriggers,
				...usable.getStartupTriggers(),
			};
		} else {
			this.globalMiddlewares.push(usable);
		}

		return this;
	}

	getGlobalMiddlewares() {
		return this.globalMiddlewares;
	}

	getRouteMiddlewares(routeConfig: RouteConfig): Middleware[] {
		let root = this.globalMiddlewares;

		if (routeConfig.use) {
			const routeMiddleware = Array.isArray(routeConfig.use) ? routeConfig.use : [routeConfig.use];

			return root.concat(routeMiddleware);
		}

		return root;
	}

	private add(method: Method, path: string, handler: Handler<string>, config?: RouteConfig<any, any, any, any>) {
		this.routes.push({
			pathParts: [this.getPrefix(), path],
			method,
			handler,
			config: config ?? {},
		});
	}

	/**
	 * Registers a static file to be served at a specific route path.
	 *
	 * ⚡ Performance: Bun caches static paths at server start and serves them via a
	 * zero-overhead fast path (ref {@link https://bun.com/docs/api/http#static-responses}). Middleware or route handlers are **not**
	 * invoked for these requests.
	 *
	 * @param path - The request path where the file will be served (relative to the current prefix, if any).
	 * @param filePath - The absolute or relative file system path to the file to serve.
	 * @returns The current instance (for chaining).
	 */
	file(path: string, filePath: string) {
		this.statics.push({
			pathParts: [this.getPrefix(), path],
			contentOrPath: filePath,
			isFile: true,
		});
		return this;
	}

	/**
	 * Registers static string content to be served at a specific route path.
	 *
	 * ⚡ Performance: Bun caches static paths at server start and serves them via a
	 * zero-overhead fast path (ref {@link https://bun.com/docs/api/http#static-responses}). Middleware or route handlers are **not**
	 * invoked for these requests.
	 *
	 * @param path - The request path where the content will be served (relative to the current prefix, if any).
	 * @param content - The string content to serve.
	 * @param type - The Content-Type to send with the response.
	 * @returns The current instance (for chaining).
	 */
	static(path: string, content: string, type: ContentType) {
		this.statics.push({
			pathParts: [this.getPrefix(), path],
			contentOrPath: content,
			isFile: false,
			contentType: type,
		});
		return this;
	}

	/** Register a GET route */
	get<PATH extends string = '/', QUERY extends ZodObject | undefined = undefined, HEADERS extends ZodObject | undefined = undefined>(
		path: PATH,
		handler: Handler<PATH, undefined, QUERY, HEADERS>,
		config?: RouteConfig<PATH, undefined, QUERY, HEADERS>,
	) {
		this.add('GET', path, handler, config);
		return this;
	}

	/** Register a POST route */
	post<
		PATH extends string = '/',
		BODY extends ZodObject | undefined = undefined,
		QUERY extends ZodObject | undefined = undefined,
		HEADERS extends ZodObject | undefined = undefined,
	>(path: PATH, handler: Handler<PATH, BODY, QUERY, HEADERS>, config?: RouteConfig<PATH, BODY, QUERY, HEADERS>) {
		this.add('POST', path, handler, config);
		return this;
	}

	/** Register a PUT route */
	put<
		PATH extends string = '/',
		BODY extends ZodObject | undefined = undefined,
		QUERY extends ZodObject | undefined = undefined,
		HEADERS extends ZodObject | undefined = undefined,
	>(path: PATH, handler: Handler<PATH, BODY, QUERY, HEADERS>, config?: RouteConfig<PATH, BODY, QUERY, HEADERS>) {
		this.add('PUT', path, handler, config);
		return this;
	}

	/** Register a PATCH route */
	patch<
		PATH extends string = '/',
		BODY extends ZodObject | undefined = undefined,
		QUERY extends ZodObject | undefined = undefined,
		HEADERS extends ZodObject | undefined = undefined,
	>(path: PATH, handler: Handler<PATH, BODY, QUERY, HEADERS>, config?: RouteConfig<PATH, BODY, QUERY, HEADERS>) {
		this.add('PATCH', path, handler, config);
		return this;
	}

	/** Register a DELETE route */
	delete<
		PATH extends string = '/',
		BODY extends ZodObject | undefined = undefined,
		QUERY extends ZodObject | undefined = undefined,
		HEADERS extends ZodObject | undefined = undefined,
	>(path: string, handler: Handler<PATH, BODY, QUERY, HEADERS>, config?: RouteConfig<PATH, BODY, QUERY, HEADERS>) {
		this.add('DELETE', path, handler, config);
		return this;
	}

	/** Register a OPTIONS route */
	options<
		PATH extends string = '/',
		BODY extends ZodObject | undefined = undefined,
		QUERY extends ZodObject | undefined = undefined,
		HEADERS extends ZodObject | undefined = undefined,
	>(path: string, handler: Handler<PATH, BODY, QUERY, HEADERS>, config?: RouteConfig<PATH, BODY, QUERY, HEADERS>) {
		this.add('OPTIONS', path, handler, config);
		return this;
	}

	/** Register a HEAD route */
	head<PATH extends string = '/', QUERY extends ZodObject | undefined = undefined, HEADERS extends ZodObject | undefined = undefined>(
		path: string,
		handler: Handler<PATH, undefined, QUERY, HEADERS>,
		config?: RouteConfig<PATH, undefined, QUERY, HEADERS>,
	) {
		this.add('HEAD', path, handler, config);
		return this;
	}

	/**
	 * Builds the Bun.Server and export it
	 */
	serve(config?: Partial<APIConfig>) {
		const router = new Router(this);
		return router.serve(config ?? undefined);
	}
}
