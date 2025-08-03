import type { APIConfig, Handler, Method, Middleware, OnStart, Route, RouteConfig, StaticRoute } from './types';
import { Router } from './router';
import { ZodObject } from 'zod';

export class App {
	private routes: Route[] = [];

	private statics: StaticRoute[] = [];

	private globalMiddlewares: Middleware[] = [];

	private onStartTriggers: Record<string, OnStart> = {};

	constructor(private readonly prefix: string = '') {}

	getPrefix() {
		return this.prefix;
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

	private add(method: Method, path: string, handler: Handler<any, any, any, any>, config?: RouteConfig<any, any, any, any>) {
		this.routes.push({
			pathParts: [this.getPrefix(), path],
			method,
			handler,
			config: config ?? {},
		});
	}

	/**
	 * Registers a static route that serves unchanging content (GET)
	 *
	 * The content can be a raw string or a file path. If it's a file path,
	 * you must set `isFile = true` to read and serve the file contents at startup.
	 *
	 * All static routes are loaded once during server boot.
	 *
	 * @param path - URL path to serve from running process (usually: "./src/assets/logo.png")
	 * @param content - Raw string content or path to a file
	 * @param isFile - Whether `content` is a file path (default: false)
	 * @returns The current instance (for chaining)
	 */
	static(path: string, contentOrPath: string, isFile: boolean) {
		this.statics.push({
			pathParts: [this.getPrefix(), path],
			contentOrPath,
			isFile,
		});

		return this;
	}

	get<
		QUERY extends ZodObject | undefined = undefined,
		PARAMS extends ZodObject | undefined = undefined,
		HEADERS extends ZodObject | undefined = undefined,
	>(path: string, handler: Handler<undefined, QUERY, PARAMS, HEADERS>, config?: RouteConfig<undefined, QUERY, PARAMS, HEADERS>) {
		this.add('GET', path, handler, config);
		return this;
	}

	post<
		BODY extends ZodObject | undefined = undefined,
		QUERY extends ZodObject | undefined = undefined,
		PARAMS extends ZodObject | undefined = undefined,
		HEADERS extends ZodObject | undefined = undefined,
	>(path: string, handler: Handler<BODY, QUERY, PARAMS, HEADERS>, config?: RouteConfig<BODY, QUERY, PARAMS, HEADERS>) {
		this.add('POST', path, handler, config);
		return this;
	}

	put<
		BODY extends ZodObject | undefined = undefined,
		QUERY extends ZodObject | undefined = undefined,
		PARAMS extends ZodObject | undefined = undefined,
		HEADERS extends ZodObject | undefined = undefined,
	>(path: string, handler: Handler<BODY, QUERY, PARAMS, HEADERS>, config?: RouteConfig<BODY, QUERY, PARAMS, HEADERS>) {
		this.add('PUT', path, handler, config);
		return this;
	}

	patch<
		BODY extends ZodObject | undefined = undefined,
		QUERY extends ZodObject | undefined = undefined,
		PARAMS extends ZodObject | undefined = undefined,
		HEADERS extends ZodObject | undefined = undefined,
	>(path: string, handler: Handler<BODY, QUERY, PARAMS, HEADERS>, config?: RouteConfig<BODY, QUERY, PARAMS, HEADERS>) {
		this.add('PATCH', path, handler, config);
		return this;
	}

	delete<
		BODY extends ZodObject | undefined = undefined,
		QUERY extends ZodObject | undefined = undefined,
		PARAMS extends ZodObject | undefined = undefined,
		HEADERS extends ZodObject | undefined = undefined,
	>(path: string, handler: Handler<BODY, QUERY, PARAMS, HEADERS>, config?: RouteConfig<BODY, QUERY, PARAMS, HEADERS>) {
		this.add('DELETE', path, handler, config);
		return this;
	}

	options<
		BODY extends ZodObject | undefined = undefined,
		QUERY extends ZodObject | undefined = undefined,
		PARAMS extends ZodObject | undefined = undefined,
		HEADERS extends ZodObject | undefined = undefined,
	>(path: string, handler: Handler<BODY, QUERY, PARAMS, HEADERS>, config?: RouteConfig<BODY, QUERY, PARAMS, HEADERS>) {
		this.add('OPTIONS', path, handler, config);
		return this;
	}

	head<
		QUERY extends ZodObject | undefined = undefined,
		PARAMS extends ZodObject | undefined = undefined,
		HEADERS extends ZodObject | undefined = undefined,
	>(path: string, handler: Handler<undefined, QUERY, PARAMS, HEADERS>, config?: RouteConfig<undefined, QUERY, PARAMS, HEADERS>) {
		this.add('HEAD', path, handler, config);
		return this;
	}

	serve(config?: Partial<APIConfig>) {
		const router = new Router(this);
		return router.serve(config ?? {});
	}
}
