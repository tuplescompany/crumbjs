import { App } from './app';
import type { APIConfig, BunHandler, BunRoutes, ErrorHandler, Handler, Method, Middleware, RouteConfig } from './types';
import { buildPath, getModeLogLevel } from './utils';
import { config as ZodConfig } from 'zod';
import { openapi } from './openapi/openapi';
import { config } from './config';
import { Processor } from './processor';
import { logger } from './logger';
import { BunRequest, CookieMap } from 'bun';

/**
 * Router build an Http server from your App routes using Bun.serve
 */
export class Router {
	private startAt: number;

	constructor(private readonly app: App) {
		this.startAt = performance.now();
	}

	/**
	 * Takes all application routes and create Bun.serve compatible Handlers with all request life-cycle throught Processor
	 */
	private async buildRoutes() {
		const { withOpenapi, openapiBasePath, openapiUi, errorHandler } = config.all();

		let routes: BunRoutes = {};
		let statics: Record<string, Response> = {};

		const globalMiddlewares = this.app.getGlobalMiddlewares();

		for (const route of this.app.getRoutes()) {
			const { pathParts, method, handler, config } = route;

			const fullPath = buildPath(...pathParts);

			routes[fullPath] = {
				...routes[fullPath],
				[method]: this.createHandler(config, globalMiddlewares, handler, errorHandler),
			};

			// Register openapi route if is enabled and not specifically hide on the route
			if (withOpenapi && !config.hide) {
				openapi.addRoute({
					method: method.toLowerCase() as Lowercase<Method>,
					path: fullPath,
					mediaType: config.type ?? 'application/json',
					body: 'body' in config ? config.body : undefined,
					query: config.query,
					header: config.headers,
					params: config.params,
					responses: config.responses,
					tags: config.tags ?? ['Uncategorized'],
					description: config.description,
					summary: config.summary,
					authorization: config.authorization,
					operationId: config.operationId,
				});
			}

			const isProxyStr = route.isProxy ? ` ::proxy::` : '';

			logger.debug(`🌐 ${method} ${fullPath}${isProxyStr} Registered`);
		}

		for (const staticRoute of this.app.getStaticRoutes()) {
			const { pathParts, contentOrPath, isFile, contentType } = staticRoute;
			const fullPath = buildPath(...pathParts);
			if (isFile) {
				const file = Bun.file(contentOrPath);
				const exists = await file.exists();
				if (!exists) throw new Error(`Invalid static path: ${contentOrPath} doesnt exists`);
				statics[fullPath] = new Response(file);
			} else {
				statics[fullPath] = new Response(contentOrPath, { headers: { 'Content-Type': contentType ?? 'text/plain' } });
			}
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
	 * Processing steps:
	 * - Initializes per-request context: path params, store, headers, status, unvalidated body and other tools @see {Context}
	 * - Parses request body (skipped for GET/HEAD).
	 * - Validates `body`, `query` and `headers` using Zod schemas from the route config (if provided)
	 * - Executes middleware chain (app-level + route-specific) via a responsibility chain.
	 * - Executes the final route handler with merged context.
	 * - Catches and delegates errors to the provided `errorHandler`.
	 *
	 * The returned handler ensures type-safe validation, composable middleware, and structured error handling.
	 * @see {Processor}
	 */
	private createHandler(
		routeConfig: RouteConfig,
		middlewares: Middleware[], // initial global middlewares array
		routeHandler: Handler,
		errorHandler: ErrorHandler,
	): BunHandler {
		return (req: BunRequest, server: Bun.Server) => {
			return new Processor(req, server, routeConfig, middlewares, routeHandler, errorHandler).execute();
		};
	}

	/** Convert standard Request to BunRequest */
	private toBunRequest(req: Request): BunRequest {
		return Object.assign(req, {
			params: {},
			cookies: new CookieMap(),
			clone: () => this.toBunRequest(req.clone()),
		}) as BunRequest;
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
		const notFoundHandler = this.createHandler(
			{},
			this.app.getGlobalMiddlewares(),
			(ctx) => {
				return config.get('notFoundHandler')(ctx);
			},
			config.get('errorHandler'),
		);

		return notFoundHandler(this.toBunRequest(req), server);
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
