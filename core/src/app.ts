import type { APIConfig, AppOptions, Handler, Method, Middleware, OnStart, Route, RouteConfig } from './types';
import { Router } from './router';
import { ZodObject } from 'zod';
import { Exception } from './exception';

export class App {
	public options: AppOptions;

	private routes: Route[] = [];

	private globalMiddlewares: Middleware[] = [];

	private onStartTriggers: Record<string, OnStart> = {};

	constructor(options: Partial<AppOptions>) {
		this.options = {
			...{ prefix: '' },
			...options,
		};
	}

	getRoutes() {
		return this.routes;
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
					pathParts: [this.options.prefix, ...child.pathParts],
					method: child.method,
					handler: child.handler,
					config: child.config,
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
			pathParts: [this.options.prefix, path],
			method,
			handler,
			config: config ?? {},
		});
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

	head<
		QUERY extends ZodObject | undefined = undefined,
		PARAMS extends ZodObject | undefined = undefined,
		HEADERS extends ZodObject | undefined = undefined,
	>(path: string, handler: Handler<undefined, QUERY, PARAMS, HEADERS>, config?: RouteConfig<undefined, QUERY, PARAMS, HEADERS>) {
		this.add('HEAD', path, handler, config);
		return this;
	}

	serve(config?: Partial<APIConfig>) {
		const router = new Router(this, config ?? {});
		return router.serve();
	}
}

export class Controller extends App {
	constructor(options: Partial<AppOptions>) {
		super(options);
	}

	override serve(config?: Partial<APIConfig>): Bun.Server {
		throw new Exception('Controllers dont serve(). User app.serve() on the main router file', 500);
	}
}
