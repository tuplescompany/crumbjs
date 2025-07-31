import { App } from './app';
import { BodyParser } from './body-parser';
import { HeaderBuilder } from './context/header-builder';
import { StatusBuilder } from './context/status-builder';
import { Store } from './context/store';
import type { APIConfig, BunHandler, BunRoutes, ErrorHandler, Handler, HandlerReturn, RootContext, RouteConfig } from './types';
import { z } from './zod-ext';
import { Exception } from './exception';
import { OpenApi, type RegistryMethod } from './openapi/openapi';
import { swaggerUIResponse } from './openapi/openapi-ui';
import prettier from 'prettier';
import { ZodObject } from 'zod';

const defaultApiConfig: APIConfig = {
	port: 8080,
	withOpenapi: true,
	openapi: {
		title: 'API',
		version: '1.0.0',
		description: 'API Documentation',
		basePath: 'openapi',
	},
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
		const parsed = Exception.parse(error).toObject();
		return new Response(JSON.stringify(parsed), {
			status: parsed.status,
			headers: {
				'Content-Type': 'application/json',
			},
		});
	},
};

/**
 * Compiler build an Http server from your App routes using Bun.serve
 */
export class Compiler {
	constructor(private readonly app: App) {}

	/**
	 * Normalizes and joins multiple path segments into a clean, well-formed URL path.
	 *
	 * - Trims each segment and removes empty fragments.
	 * - Splits on slashes to support nested paths.
	 * - Ensures the final path starts with a single '/' and contains no duplicate slashes.
	 *
	 * Useful for dynamically composing route paths in a consistent and safe way.
	 */
	private buildPath(...parts: string[]): string {
		let result: string[] = [];

		// Split each part by '/' and clean each segment
		for (const part of parts) {
			const cleanedSegments = part
				.split('/')
				.map((segment) => segment.trim()) // Trim each segment
				.filter(Boolean); // Remove any empty segments
			result.push(...cleanedSegments); // Add cleaned segments to the result
		}

		// Join back with single slashes and ensure no leading/trailing slashes
		return `/${result.join('/')}`;
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
		const requestStore = new Store();
		const responseHeaders = new HeaderBuilder();
		const statusBuilder = new StatusBuilder(200, 'OK'); // default status is 200 OK

		responseHeaders.set('Content-Type', 'application/json'); // default response json content-type

		return async (req) => {
			try {
				const method = req.method.toUpperCase();
				const withBody = method !== 'GET' && method !== 'HEAD';

				// Ignore body on GET or HEAD methods
				const unvalidatedBody = withBody ? await new BodyParser(req).parse() : {};

				// Root context is avaiable on Middlewares to
				const rootContext: RootContext = {
					request: req,
					setHeader: responseHeaders.set.bind(responseHeaders),
					appendHeader: responseHeaders.append.bind(responseHeaders),
					deleteHeader: responseHeaders.delete.bind(responseHeaders),
					setStatus: statusBuilder.set.bind(statusBuilder),
					store: requestStore,
					unvalidatedBody,
				};

				const url = new URL(req.url);
				const queryParams = Object.fromEntries(url.searchParams.entries());

				// Context is specific route context
				let routeContext = {
					body: unvalidatedBody,
					headers: req.headers,
					params: req.params,
					query: queryParams,
				};

				const rules = z.object({
					body: config.body ?? z.any(),
					query: config.query ?? z.any(),
					params: config.params ?? z.any(),
					headers: config.headers ?? z.any(),
				});

				const parsedContext = await rules.parseAsync(routeContext);

				const middlewares = this.app.getRouteMiddlewares(config);

				let index = -1;
				const next = async (): Promise<HandlerReturn> => {
					index++;
					if (index < middlewares.length) {
						return await middlewares[index]({ ...rootContext, next });
					} else {
						return await handler({
							...parsedContext,
							...rootContext,
						});
					}
				};

				const res = await next();

				const responseBody = typeof res === 'string' ? res : JSON.stringify(res);

				if (!responseBody) throw new Exception(`No result after execution chain. Did you forget some 'return next()'`, 500);

				return new Response(responseBody, {
					headers: responseHeaders.toObject(),
					...statusBuilder.get(),
				});
			} catch (error) {
				return await errorHandler(req, error);
			}
		};
	}

	async compileAppDefinition() {
		const def: any = {};
		const routes = this.app.getRoutes();
		for (const route of routes) {
			const { pathParts, method, config } = route;

			const path = this.buildPath(...pathParts);

			if (!def[path]) def[path] = {};
			if (!def[path][method]) def[path][method] = {};

			const requestSchema = z.object({
				body: config.body instanceof ZodObject ? config.body : z.unknown().optional(),
				params: config.params instanceof ZodObject ? config.params : z.unknown().optional(),
				query: config.query instanceof ZodObject ? config.query : z.unknown().optional(),
				headers: config.headers instanceof ZodObject ? config.headers : z.unknown().optional(),
			});

			def[path][method].req = z.toJSONSchema(requestSchema);
			def[path][method].res = {};

			if (config.responses) {
				for (const [status, schema] of Object.entries(config.responses)) {
					def[path][method].res[status] = z.toJSONSchema(schema);
				}
			}
		}

		const definitionFile = `export const api = ${JSON.stringify(def)} as const;\n`;
		const formatted = await prettier.format(definitionFile, {
			parser: 'typescript',
			semi: true,
			singleQuote: true,
			trailingComma: 'all',
		});
		await Bun.write('api.definition.ts', formatted);

		return def;
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
	compileServerRoutes(apiConfig: APIConfig) {
		const openApi = apiConfig.withOpenapi
			? new OpenApi(apiConfig.openapi.title, apiConfig.openapi.version, apiConfig.openapi.description)
			: null;

		let compiled: BunRoutes = {};

		const routes = this.app.getRoutes();
		for (const route of routes) {
			const { pathParts, method, handler, config } = route;

			const fullPath = this.buildPath(...pathParts);
			compiled[fullPath] = {
				...compiled[fullPath], // conserva otros métodos (POST, PUT, etc)
				[method]: this.createHandler(handler, config, apiConfig.errorHandler),
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

			console.log(`${new Date().toISOString()} [${method}] ${fullPath} route registered`);
		}

		/**
		 * Add OpenApi routes if is enabled as raw-serve-route, no middlewares attached
		 */
		if (openApi) {
			const documentPath = this.buildPath(apiConfig.openapi.basePath, '/document.json');

			const openApiDocument = openApi.getDocument();

			const writeOpenapi = async () => {
				const openApiFile = `export const apiDocs = ${JSON.stringify(openApiDocument)} as const;\n`;
				const formatted = await prettier.format(openApiFile, {
					parser: 'typescript',
					semi: true,
					singleQuote: true,
					trailingComma: 'all',
				});

				await Bun.write('openapi-spec.ts', formatted);
			};

			writeOpenapi();

			compiled[documentPath] = {
				GET: async () => openApi.getResponse(),
			};

			const swaggerUiPath = this.buildPath(apiConfig.openapi.basePath, '/swagger-ui');
			compiled[swaggerUiPath] = {
				GET: async () => swaggerUIResponse(documentPath),
			};

			console.log(`${new Date().toISOString()} [GET] ${documentPath} route registered`);
			console.log(`${new Date().toISOString()} [GET] ${swaggerUiPath} route registered`);
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
	 */
	private inferConfigFromEnv() {
		const env = process.env;
		const infer: any = {};

		if (env.PORT) infer.port = Number(env.PORT);
		if (env.OPENAPI) infer.withOpenapi = env.OPENAPI === 'true';

		if (env.VERSION || env.OPENAPI_TITLE || env.OPENAPI_DESCRIPTION || env.OPENAPI_PATH) {
			infer.openapi = {};
		}

		if (env.OPENAPI_TITLE) infer.openapi.title = env.OPENAPI_TITLE;
		if (env.VERSION) infer.openapi.version = env.VERSION;
		if (env.OPENAPI_DESCRIPTION) infer.openapi.description = env.OPENAPI_DESCRIPTION;
		if (env.OPENAPI_PATH) infer.openapi.basePath = env.OPENAPI_PATH;

		return infer;
	}

	serve(config: Partial<APIConfig>) {
		const apiConfig = {
			...defaultApiConfig,
			...this.inferConfigFromEnv(),
			...config,
		};

		console.log(`${new Date().toISOString()} [HTTP] Listen on ${apiConfig.port}`);

		for (const [triggerName, trigger] of Object.entries(this.app.getStartupTriggers())) {
			console.log(`${new Date().toISOString()} [OnStart] Running '${triggerName}' trigger`);
			trigger();
		}

		const compiled = this.compileServerRoutes(apiConfig);

		return Bun.serve({
			port: apiConfig.port,
			routes: compiled,
			// Not found handler
			fetch(req) {
				return apiConfig.notFoundHandler(req);
			},
		});
	}
}
