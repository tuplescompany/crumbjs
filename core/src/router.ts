import { App } from './app';
import { parseBody } from './body-parser';
import { HeaderBuilder } from './context/header-builder';
import { StatusBuilder } from './context/status-builder';
import { Store } from './context/store';
import type { APIConfig, BunHandler, BunRoutes, ErrorHandler, Handler, HandlerReturn, OAMethod, RootContext, RouteConfig } from './types';
import { CookieBuilder } from './context/cookie-builder';
import { buildPath } from './utils';
import { flattenError, ZodObject, config as ZodConfig } from 'zod';
import { BadRequest, InternalServerError } from './exception/http.exception';
import { openapi } from './openapi/openapi';
import { config } from './config';

/**
 * Router build an Http server from your App routes using Bun.serve
 */
export class Router {
	private startAt: number;

	constructor(private readonly app: App) {
		this.startAt = performance.now();
	}

	private async validate(schema: any, data: any, part: 'body' | 'query' | 'params' | 'headers') {
		// disable validation for non ZodObject schemas
		if (!(schema instanceof ZodObject)) {
			return data;
		}

		const res = schema.safeParse(data);

		if (!res.success) {
			throw new BadRequest({
				part,
				errors: flattenError(res.error).fieldErrors,
			});
		}

		return res.data;
	}

	/**
	 * Builds a `Bun.serve`-compatible handler with full request lifecycle support.
	 *
	 * Processing steps:
	 * - Initializes per-request context: store, headers, status, and unvalidated body.
	 * - Parses request body (skipped for GET/HEAD).
	 * - Validates `body`, `query`, `params`, and `headers` using Zod schemas from the route config.
	 * - Executes middleware chain (app-level + route-specific) via a responsibility chain.
	 * - Executes the final route handler with merged context.
	 * - Catches and delegates errors to the provided `errorHandler`.
	 *
	 * The returned handler ensures type-safe validation, composable middleware, and structured error handling.
	 */
	private createHandler(
		handler: Handler<any, any, any, any>,
		config: RouteConfig<any, any, any, any>,
		errorHandler: ErrorHandler,
	): BunHandler {
		return async (req) => {
			try {
				// Request context helpers
				const reqStore = new Store();

				// Response context helpers
				const resHeaders = new HeaderBuilder({
					'Content-Type': 'application/json',
				});
				const resCookie = new CookieBuilder(resHeaders);
				const statusBuilder = new StatusBuilder(200, 'OK'); // default status is 200 OK

				const method = req.method.toUpperCase();
				const withBody = method !== 'GET' && method !== 'HEAD';

				if (config.type && !req.headers.get('content-type')?.includes(config.type)) {
					throw new BadRequest({
						part: 'headers',
						errors: [`Invalid Content-Type: expected “${config.type}”, got “${req.headers.get('content-type') ?? 'none'}”.`],
					});
				}

				// Ignore body on GET or HEAD methods
				const rawBody = withBody ? await parseBody(req) : {};

				// Root context is avaiable on Middlewares to
				const rootContext: RootContext = {
					request: req,
					setHeader: resHeaders.set.bind(resHeaders),
					deleteHeader: resHeaders.delete.bind(resHeaders),
					setCookie: resCookie.set.bind(resCookie),
					setStatus: statusBuilder.set.bind(statusBuilder),
					set: reqStore.set.bind(reqStore),
					get: reqStore.get.bind(reqStore),
					rawBody,
				};

				const url = new URL(req.url);
				const queryParams = Object.fromEntries(url.searchParams.entries());

				const headersRecord: Record<string, string> = {};
				req.headers.forEach((value, key) => {
					headersRecord[key] = value;
				});

				const parsedContext = {
					body: await this.validate(config.body, rawBody, 'body'),
					query: await this.validate(config.query, queryParams, 'query'),
					params: await this.validate(config.params, req.params, 'params'),
					headers: await this.validate(config.headers, headersRecord, 'headers'),
				};

				const handlerContext = {
					...parsedContext,
					...rootContext,
				};

				const middlewares = this.app.getRouteMiddlewares(config);

				let index = -1;
				const next = async (): Promise<HandlerReturn> => {
					index++;
					if (index < middlewares.length) {
						return await middlewares[index]({ ...rootContext, next });
					} else {
						return await handler(handlerContext);
					}
				};

				const res = await next();

				if (res instanceof Response) return res;

				// string, object or null are allowed returns
				const responseBody = typeof res === 'string' || res === null ? res : JSON.stringify(res);

				if (typeof responseBody === 'string' || responseBody === null) {
					return new Response(responseBody, {
						headers: resHeaders.toObject(),
						...statusBuilder.get(),
					});
				}

				throw new InternalServerError(
					`No result (string, null, object or Response) after execution chain. Did you forget some 'return next()' on middlewares?`,
				);
			} catch (error) {
				return await errorHandler(req, error);
			}
		};
	}

	/**
	 * Compiles the application's route definitions into a Bun-compatible route map.
	 *
	 * - Instantiates the OpenAPI generator (if enabled).
	 * - Iterates over all registered routes, builds full paths, and creates handler wrappers.
	 * - Iterates over all registered static routes, builds full paths, and set content or filecontent static at boot time
	 * - Automatically registers OpenAPI metadata unless explicitly hidden per route.
	 * - Adds default routes to serve OpenAPI spec and Swagger UI if enabled.
	 * - Logs each registered route to the console with timestamp and method.
	 *
	 * @param apiConfig - Configuration object that controls OpenAPI, error handling, and more.
	 * @returns A fully populated `BunRoutes` object ready for `Bun.serve()`.
	 */
	private async compileServerRoutes() {
		const { withOpenapi, openapiBasePath, openapiUi, errorHandler } = config.all();

		let routes: BunRoutes = {};
		let statics: Record<string, Response> = {};

		for (const route of this.app.getRoutes()) {
			const { pathParts, method, handler, config } = route;

			const fullPath = buildPath(...pathParts);

			// acumulate paths, if path is repeated will be overwritten by the last registered
			routes[fullPath] = {
				...routes[fullPath],
				[method]: this.createHandler(handler, config, errorHandler),
			};

			// Register openapi route if is enabled and not specifically hide on the route
			if (withOpenapi && !config.openapi?.hide) {
				openapi.addRoute({
					method: method.toLowerCase() as OAMethod,
					path: fullPath,
					mediaType: config.type ?? 'application/json',
					body: 'body' in config ? config.body : undefined,
					query: config.query,
					params: config.params,
					headers: config.headers,
					responses: config.responses,
					tags: config.openapi?.tags ?? ['Uncategorized'],
					description: config.openapi?.description,
					summary: config.openapi?.summary,
					authorization: config.openapi?.authorization,
					operationId: config.openapi?.operationId,
				});
			}

			this.log(`🌐 ${method} ${fullPath} Registered`);
		}

		for (const staticRoute of this.app.getStaticRoutes()) {
			const { pathParts, contentOrPath, isFile, contentType } = staticRoute;
			const fullPath = buildPath(...pathParts);
			let body: string;
			let bodyType: string;
			if (isFile) {
				const file = Bun.file(contentOrPath);
				const exists = await file.exists();
				if (!exists) throw new Error(`Invalid static path: ${contentOrPath} doesnt exists`);
				body = await file.text();
				bodyType = file.type;
			} else {
				body = contentOrPath;
				bodyType = contentType ?? 'text/plain';
			}
			statics[fullPath] = new Response(body, { headers: { 'Content-Type': bodyType } });
			this.log(`🌐 GET ${fullPath} Registered (static)`);
		}

		/**
		 * Add openapi routes if is enabled as raw-serve-route, no middlewares / request lifecycle attached
		 */
		if (withOpenapi) {
			const documentPath = buildPath(openapiBasePath, '/doc.json');
			const openapiUiPath = buildPath(openapiBasePath);

			statics[documentPath] = Response.json(openapi.getSpec());
			statics[openapiUiPath] = new Response(openapi[openapiUi](documentPath));

			this.log(`📘 GET ${documentPath} Registered (static)`);
			this.log(`📘 GET ${openapiUiPath} Registered (static)`);
			this.log(`✅ OPENAPI: enabled, UI: ${openapiUi}`);
		}

		return { routes, statics };
	}

	log(info: string) {
		console.log(`${new Date().toISOString()} ${info}`);
	}

	async serve(options?: Partial<APIConfig>) {
		if (options) config.merge(options);

		if (config.get('locale') != 'en') {
			const zodLocales = await import('zod/locales');
			const appLocale = config.get('locale');
			ZodConfig(zodLocales[appLocale]());
		}

		this.log(`🈯 Locale set to: ${config.get('locale')}`);

		for (const [triggerName, trigger] of Object.entries(this.app.getStartupTriggers())) {
			this.log(`🛠️ Executing on-start '${triggerName}' trigger`);
			trigger();
		}

		const routes = await this.compileServerRoutes();

		const server = Bun.serve({
			port: config.get('port'),
			routes: {
				...routes.routes,
				...routes.statics,
				'/up': new Response(`OK, started at: ${new Date().toISOString()}`),
			},

			// Not found handler
			fetch(req) {
				return config.get('notFoundHandler')(req);
			},
		});

		const duration = performance.now() - this.startAt;
		this.log(`⚡ Startup time: ${duration.toFixed(2)} ms`);
		this.log(`🔌 HTTP Server listening on port ${config.get('port')}`);

		return server;
	}
}
