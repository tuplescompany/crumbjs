import { App } from './app';
import type { APIConfig, BunHandler, BunRoutes, ErrorHandler, Handler, HandlerResult, OAMethod, RootContext, RouteConfig } from './types';
import { buildPath } from './utils';
import { config as ZodConfig } from 'zod';
import { openapi } from './openapi/openapi';
import { config } from './config';
import { ContextResolver } from './context/resolver';

/**
 * Router build an Http server from your App routes using Bun.serve
 */
export class Router {
	private startAt: number;

	constructor(private readonly app: App) {
		this.startAt = performance.now();
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
		return (req, server) => {
			const rc = new ContextResolver(req, server, config, this.app.getGlobalMiddlewares(), handler, errorHandler);
			return rc.execute();
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
	private async buildRoutes() {
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

	private log(info: string) {
		console.log(`${new Date().toISOString()} ${info}`);
	}

	async serve(options?: Partial<APIConfig>) {
		if (options) config.merge(options);

		if (config.get('locale') != 'en') {
			const { es, en, pt } = await import('zod/locales');
			const langs = { es, en, pt };
			const appLocale = config.get('locale');
			ZodConfig(langs[appLocale]());
		}

		this.log(`🈯 Locale set to: ${config.get('locale')}`);

		for (const [triggerName, trigger] of Object.entries(this.app.getStartupTriggers())) {
			this.log(`🛠️ Executing on-start '${triggerName}' trigger`);
			trigger();
		}

		const routes = await this.buildRoutes();

		const server = Bun.serve({
			port: config.get('port'),
			routes: {
				...routes.routes,
				...routes.statics,
				'/up': new Response(`OK, started at: ${new Date().toISOString()}`), // static
			},

			// Not found handler
			fetch(req) {
				console.error(`${new Date().toISOString()} ${req.method} ${new URL(req.url).pathname}: 404-Not Found`);
				return config.get('notFoundHandler')(req);
			},
		});

		const duration = performance.now() - this.startAt;
		this.log(`⚡ Startup time: ${duration.toFixed(2)} ms`);
		this.log(`🔌 HTTP Server listening on port ${config.get('port')}`);

		return server;
	}
}
