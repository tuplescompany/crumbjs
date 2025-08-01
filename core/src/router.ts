import { App } from './app';
import { parseBody } from './body-parser';
import { HeaderBuilder } from './context/header-builder';
import { StatusBuilder } from './context/status-builder';
import { Store } from './context/store';
import type { APIConfig, BunHandler, BunRoutes, ErrorHandler, Handler, HandlerReturn, RootContext, RouteConfig } from './types';
import { Exception } from './exception';
import { OpenApi, type RegistryMethod } from './openapi/openapi';
import { swaggerUIResponse } from './openapi/openapi-ui';
import { CookieBuilder } from './context/cookie-builder';
import { buildPath } from './utils';
import z, { flattenError, ZodObject, config as ZodConfig } from 'zod';
import { BadRequest, InternalServerError } from './exception/http.exception';
import { extendZodWithOpenApi } from '@asteasolutions/zod-to-openapi';

extendZodWithOpenApi(z);

const defaultApiConfig: APIConfig = {
	port: 8080,
	withOpenapi: true,
	locale: 'en',
	openapiTitle: 'API',
	openapiVersion: '1.0.0',
	openapiDescription: 'API Documentation',
	openapiBasePath: 'openapi',
	notFoundHandler: () => {
		return new Response('NOT_FOUND', {
			status: 404,
			headers: {
				'Content-Type': 'text/plain',
			},
		});
	},
	errorHandler: (req, error) => {
		console.error(`${new Date().toISOString()} [REQUEST ERROR] ${req.method} ${req.url}:`, error);

		const parsed = error instanceof Exception ? error.toObject() : Exception.parse(error).toObject();
		return new Response(JSON.stringify(parsed), {
			status: parsed.status,
			headers: {
				'Content-Type': 'application/json',
			},
		});
	},
};

/**
 * Router build an Http server from your App routes using Bun.serve
 */
export class Router {
	private startAt: number;
	private apiConfig: APIConfig;

	constructor(
		private readonly app: App,
		config: Partial<APIConfig>,
	) {
		this.startAt = performance.now();

		this.apiConfig = {
			...defaultApiConfig,
			...this.inferConfigFromEnv(),
			...config,
		};
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
	 * - Automatically registers OpenAPI metadata unless explicitly hidden per route.
	 * - Adds default routes to serve OpenAPI spec and Swagger UI if enabled.
	 * - Logs each registered route to the console with timestamp and method.
	 *
	 * @param apiConfig - Configuration object that controls OpenAPI, error handling, and more.
	 * @returns A fully populated `BunRoutes` object ready for `Bun.serve()`.
	 */
	private compileServerRoutes() {
		const { withOpenapi, openapiTitle, openapiVersion, openapiDescription, openapiBasePath, errorHandler } = this.apiConfig;

		const openApi = withOpenapi ? new OpenApi(openapiTitle, openapiVersion, openapiDescription) : null;

		let compiled: BunRoutes = {};

		for (const route of this.app.getRoutes()) {
			const { pathParts, method, handler, config } = route;

			const fullPath = buildPath(...pathParts);

			// acumulate paths, if path is repeated will be overwritten by the last registered
			compiled[fullPath] = {
				...compiled[fullPath],
				[method]: this.createHandler(handler, config, errorHandler),
			};

			// Register openapi route if is enabled and not specifically hide on the route
			if (openApi && !config.openapi?.hide) {
				openApi.register({
					method: method.toLowerCase() as RegistryMethod,
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

			console.log(`${new Date().toISOString()} 🌐 ${method} ${fullPath} Registered`);
		}

		/**
		 * Add OpenApi routes if is enabled as raw-serve-route, no middlewares attached
		 */
		if (openApi) {
			const documentPath = buildPath(openapiBasePath, '/document.json');

			compiled[documentPath] = {
				GET: async () => openApi.getResponse(),
			};

			const swaggerUiPath = buildPath(openapiBasePath, '/swagger-ui');
			compiled[swaggerUiPath] = {
				GET: async () => swaggerUIResponse(documentPath),
			};

			console.log(`${new Date().toISOString()} 📘 GET ${documentPath} Registered`);
			console.log(`${new Date().toISOString()} 📘 GET ${swaggerUiPath} Registered`);
		}

		return compiled;
	}

	/**
	 * Infers API configuration from ENV variables.
	 * Supports:
	 * - PORT
	 * - OPENAPI
	 * - OPENAPI_TITLE
	 * - OPENAPI_DESCRIPTION
	 * - OPENAPI_PATH
	 * - VERSION
	 * - LOCALE
	 */
	private inferConfigFromEnv() {
		const schema = z
			.object({
				port: z.coerce.number(),
				locale: z.string(),
				withOpenapi: z.coerce.boolean(),
				openapiTitle: z.string(),
				openapiVersion: z.string(),
				openapiDescription: z.string(),
				openapiBasePath: z.string(),
			})
			.partial();

		const res = schema.safeParse({
			port: process.env.PORT,
			locale: process.env.LOCALE,
			withOpenapi: process.env.OPENAPI,
			openapiTitle: process.env.OPENAPI_TITLE,
			openapiVersion: process.env.VERSION,
			openapiDescription: process.env.OPENAPI_DESCRIPTION,
			openapiBasePath: process.env.OPENAPI_PATH,
		});

		if (!res.data) return {};
		return Object.fromEntries(Object.entries(res.data).filter(([_, value]) => value !== undefined));
	}

	serve() {
		if (this.apiConfig.locale != 'en') {
			const zodLocales = require('zod/locales');
			ZodConfig(zodLocales[this.apiConfig.locale]());
		}

		console.log(`${new Date().toISOString()} 🈯 Locale set to: ${this.apiConfig.locale}`);

		for (const [triggerName, trigger] of Object.entries(this.app.getStartupTriggers())) {
			console.log(`${new Date().toISOString()} 🛠️ Executing on-start '${triggerName}' trigger`);
			trigger();
		}

		const compiled = this.compileServerRoutes();

		const apiConfig = this.apiConfig;

		const server = Bun.serve({
			port: apiConfig.port,
			routes: compiled,
			// Not found handler
			fetch(req) {
				return apiConfig.notFoundHandler(req);
			},
		});

		const duration = performance.now() - this.startAt;
		console.log(`${new Date().toISOString()} ⚡ Startup time: ${duration.toFixed(2)} ms`);
		console.log(`${new Date().toISOString()} 🔌 HTTP Server listening on port ${this.apiConfig.port}`);

		return server;
	}
}
