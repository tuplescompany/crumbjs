import { App } from './app';
import type { APIConfig, BunRoutes, OAMethod } from './types';
import { buildPath, getModeLogLevel, toBunRequest } from './utils';
import { config as ZodConfig } from 'zod';
import { openapi } from './openapi/openapi';
import { config } from './config';
import { createHandler } from './processor';
import { logger } from './logger';

/**
 * Router build an Http server from your App routes using Bun.serve
 */
export class Router {
	private startAt: number;

	constructor(private readonly app: App) {
		this.startAt = performance.now();
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
	private async buildRoutes() {
		const { withOpenapi, openapiBasePath, openapiUi, errorHandler } = config.all();

		let routes: BunRoutes = {};
		let statics: Record<string, Response> = {};

		const globalMiddlewares = this.app.getGlobalMiddlewares();

		for (const route of this.app.getRoutes()) {
			const { pathParts, method, handler, config } = route;

			const fullPath = buildPath(...pathParts);

			/**
			 * Builds and acumulate `Bun.serve`-compatible handlers with full request lifecycle support
			 * @see {Processor}
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
			routes[fullPath] = {
				...routes[fullPath],
				[method]: createHandler(config, globalMiddlewares, handler, errorHandler),
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

			const typeStr = config.type ? ` (${config.type})` : '';

			logger.debug(`🌐 ${method} ${fullPath}${typeStr} Registered`);
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
			logger.debug(`🌐 GET ${fullPath} Registered (static)`);
		}

		/**
		 * Add openapi routes if is enabled as raw-serve-route, no middlewares / request lifecycle attached
		 */
		if (withOpenapi) {
			const documentPath = buildPath(openapiBasePath, '/doc.json');
			const openapiUiPath = buildPath(openapiBasePath);

			statics[documentPath] = Response.json(openapi.getSpec());
			statics[openapiUiPath] = new Response(openapi[openapiUi](documentPath));

			logger.debug(`📘 GET ${documentPath} Registered (static)`);
			logger.debug(`📘 GET ${openapiUiPath} Registered (static)`);
		}

		// health
		statics['/up'] = Response.json({
			up: true,
			at: new Date().toISOString(),
		});

		logger.debug(`🌡️ GET /up Registered (static)`);

		logger.debug(`✅ OPENAPI: ${withOpenapi ? `enabled, UI: ${openapiUi}` : 'disabled'}`);

		return { routes, statics };
	}

	/**
	 * 404 Not Found handler using the application's global middlewares.
	 *
	 * This handler behaves like any other application route handler, ensuring that all
	 * global middlewares are applied before executing the fallback logic.
	 *
	 * Logs the 404 error via `signal()` and delegates the response to the
	 * `notFoundHandler` defined in the config.
	 */
	private async notFound(req: Request, server: Bun.Server) {
		const applicationHandler = createHandler(
			{},
			this.app.getGlobalMiddlewares(),
			(ctx) => {
				return config.get('notFoundHandler')(ctx);
			},
			config.get('errorHandler'),
		);

		return applicationHandler(toBunRequest(req), server);
	}

	async serve(options?: Partial<APIConfig>) {
		if (options) config.merge(options);

		// set level to the global Logger instance on server starts
		logger.setLevel(getModeLogLevel(config.get('mode')));

		if (config.get('locale') != 'en') {
			const { es, en, pt } = await import('zod/locales');
			const langs = { es, en, pt };
			const appLocale = config.get('locale');
			ZodConfig(langs[appLocale]());
		}

		logger.debug(`🈯 Locale set to: ${config.get('locale')}`);

		for (const [triggerName, trigger] of Object.entries(this.app.getStartupTriggers())) {
			logger.debug(`🛠️ Executing on-start '${triggerName}' trigger`);
			trigger();
		}

		const routes = await this.buildRoutes();

		const server = Bun.serve({
			port: config.get('port'),
			routes: {
				...routes.routes,
				...routes.statics,
			},
			fetch: (req, server) => this.notFound(req, server),
		});

		const duration = performance.now() - this.startAt;
		logger.debug(`⚡ Startup time: ${duration.toFixed(2)} ms`);
		logger.debug(`🔌 HTTP Server listening on port ${config.get('port')}`);

		return server;
	}
}
