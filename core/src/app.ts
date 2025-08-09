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

	private add(method: Method, path: string, handler: Handler<any, any, any, any>, config?: RouteConfig<any, any, any, any>) {
		this.routes.push({
			pathParts: [this.getPrefix(), path],
			method,
			handler,
			config: config ?? {},
		});
	}

	staticFile(path: string, filePath: string) {
		this.statics.push({
			pathParts: [this.getPrefix(), path],
			contentOrPath: filePath,
			isFile: true,
		});

		return this;
	}

	static(path: string, content: string, type: ContentType) {
		this.statics.push({
			pathParts: [this.getPrefix(), path],
			contentOrPath: content,
			isFile: false,
			contentType: type,
		});

		return this;
	}

	get<
		QUERY extends ZodObject | undefined = undefined,
		PARAMS extends ZodObject | undefined = undefined,
		HEADERS extends ZodObject | undefined = undefined,
		PATH extends string = '/',
	>(path: PATH, handler: Handler<undefined, QUERY, PARAMS, HEADERS>, config?: RouteConfig<undefined, QUERY, PARAMS, HEADERS>) {
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
		return router.serve(config ?? undefined);
	}
}
