import { App } from './app';
import type { APIConfig, RouteData } from './types';
import { buildPath, getModeLogLevel, objectCleanUndefined } from './helpers/utils';
import { openapi } from './openapi/openapi';
import { Processor } from './processor/processor';
import { logger } from './helpers/logger';
import { addRoute, createRouter, findRoute, RouterContext } from './rou3';
import { defaultErrorHandler, defaultNotFoundHandler, modes } from './constants';
import { MockExecutionContext, IExecutionContext } from './cloudflare';
import { Stack } from './stack';

/**
 * Builds a fetcher workers from App and childs
 */
export class Router {
	private readonly rou3: RouterContext<RouteData>;
	private config: APIConfig;

	constructor(private readonly app: App) {
		this.rou3 = createRouter<RouteData>();
		this.config = {
			mode: 'development',
			withOpenapi: true,
			version: '1.0.0',
			openapiTitle: 'Api',
			openapiDescription: 'API Documentation',
			openapiBasePath: '/reference',
			openapiUi: 'scalar',
			errorHandler: defaultErrorHandler,
			notFoundHandler: defaultNotFoundHandler,
		};

		// set level to the global Logger instance on server starts
		const logLevel = getModeLogLevel(this.config.mode);
		logger.setLevel(logLevel);

		this.app.get('/health/check', () => ({
			up: true,
			at: new Date(),
		}));
	}

	/**
	 * Merge global specific defined middlewares and the root App instance middlewares
	 * Both applies to all api routes
	 */
	private getGlobalMiddlewares() {
		const globals = Object.values(this.app.getGlobalMiddlewares());
		const rootapp = this.app.getMiddlewares();
		globals.push(...rootapp);

		return globals;
	}

	/** Ensure title/description/version are present (#config-backed defaults). */
	private getOpenapiSpecs() {
		const specs = openapi.getSpec();
		if (!specs.info.title) openapi.title(this.config.openapiTitle);
		if (!specs.info.description) openapi.description(this.config.openapiDescription);
		if (!specs.info.version) openapi.version(this.config.version);
		return specs;
	}

	/**
	 * Takes all application routes and create Bun.serve compatible Handlers with all request life-cycle throught Processor
	 */
	private buildRoutes() {
		const { withOpenapi, openapiBasePath, openapiUi } = this.config;

		for (const route of this.app.getRoutes()) {
			const fullPath = buildPath(...route.pathParts);

			addRoute(this.rou3, route.method, fullPath, {
				handler: route.handler,
				config: route.config,
			});

			// Register openapi route if is enabled and not specifically hide on the route
			if (withOpenapi && !route.config.hide) {
				openapi.addBuildedRoute(route.method, fullPath, route.config);
			}
		}

		/**
		 * Add openapi routes if is enabled as raw-serve-route, no middlewares / request lifecycle attached
		 */
		if (withOpenapi) {
			const specs = this.getOpenapiSpecs();

			const documentPath = buildPath(openapiBasePath, '/doc.json');
			const openapiUiPath = buildPath(openapiBasePath);

			addRoute(this.rou3, 'GET', documentPath, {
				handler: () => Response.json(specs),
				config: {},
			});

			addRoute(this.rou3, 'GET', openapiUiPath, {
				handler: () => new Response(openapi[openapiUi](documentPath), { headers: { 'Content-Type': 'text/html' } }),
				config: {},
			});
		}
	}

	worker(options?: Partial<APIConfig>) {
		this.config = {
			...this.config,
			...objectCleanUndefined(options),
		};

		this.buildRoutes();

		return {
			app: this.app,
			fetch: async (request: Request, env?: any, ctx?: IExecutionContext) => {
				// Worker ENV overrides
				if (env.APP_MODE && modes.includes(env.APP_MODE)) {
					const logLevel = getModeLogLevel(env.APP_MODE);
					logger.setLevel(logLevel);
				}

				const url = new URL(request.url);
				const match = findRoute<RouteData>(this.rou3, request.method, url.pathname);

				if (!match) {
					return this.config.notFoundHandler(request);
				}

				const execContext = ctx ?? new MockExecutionContext();
				const stack = new Stack(execContext, this.app.getOnCloseTriggers());

				const processor = new Processor(
					request,
					env ?? {},
					stack,
					match.params ?? {},
					match.data.config,
					this.getGlobalMiddlewares(),
					match.data.handler,
					this.config.errorHandler,
				);

				return processor.execute();
			},
		};
	}
}
