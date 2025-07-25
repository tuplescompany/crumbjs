import type {
	APIConfig,
	AppOptions,
	Handler,
	HandlerWithoutBody,
	Method,
	Middleware,
	OnStart,
	Route,
	RouteConfig,
	RouteConfigWithoutBody,
} from './types';
import { Compiler } from './compiler';
import { ZodObject } from 'zod';

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
					paths: [this.options.prefix, ...child.paths],
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
			paths: [this.options.prefix, path],
			method,
			handler,
			config: config ?? {},
		});
	}

	get<
		QUERY extends ZodObject | undefined = undefined,
		PARAMS extends ZodObject | undefined = undefined,
		HEADERS extends ZodObject | undefined = undefined,
	>(path: string, handler: HandlerWithoutBody<QUERY, PARAMS, HEADERS>, config?: RouteConfigWithoutBody<QUERY, PARAMS, HEADERS>) {
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
	>(path: string, handler: HandlerWithoutBody<QUERY, PARAMS, HEADERS>, config?: RouteConfigWithoutBody<QUERY, PARAMS, HEADERS>) {
		this.add('HEAD', path, handler, config);
		return this;
	}

	serve(config?: Partial<APIConfig>) {
		const compiler = new Compiler(this);
		return compiler.serve(config ?? {});
	}
}
