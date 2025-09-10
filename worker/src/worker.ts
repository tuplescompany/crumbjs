import { App } from './app';
import type { APIConfig, Method, RouteData } from './types';
import { buildPath, getModeLogLevel, objectCleanUndefined } from './helpers/utils';
import { openapi } from './openapi/openapi';
import { Processor } from './processor/processor';
import { logger } from './helpers/logger';
import { addRoute, createRouter, findRoute, type RouterContext } from './rou3';
import { defaultErrorHandler, defaultNotFoundHandler, modes } from './constants';
import { MockExecutionContext, IExecutionContext } from './cloudflare';
import { Stack } from './stack';

export class Worker {
	private rou3: RouterContext<RouteData>;
	private config: APIConfig;

	constructor(
		private readonly app: App,
		options?: Partial<APIConfig>,
	) {
		this.rou3 = createRouter<RouteData>();

		this.config = {
			...{
				mode: 'development',
				withOpenapi: true,
				version: '1.0.0',
				openapiTitle: 'Api',
				openapiDescription: 'API Documentation',
				openapiBasePath: '/reference',
				openapiUi: 'scalar',
				errorHandler: defaultErrorHandler,
				notFoundHandler: defaultNotFoundHandler,
			},
			...objectCleanUndefined(options),
		};

		// set level to the global Logger instance on server starts
		const logLevel = getModeLogLevel(this.config.mode);
		logger.setLevel(logLevel);

		this.app.get('/health/check', () => ({
			up: true,
			at: new Date(),
		}));

		this.buildRoutes();
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
				openapi.addRoute({
					method: route.method.toLowerCase() as Lowercase<Method>,
					path: fullPath,
					mediaType: route.config.type ?? 'application/json',
					body: 'body' in route.config ? route.config.body : undefined,
					query: route.config.query,
					header: route.config.headers,
					params: route.config.params,
					responses: route.config.responses,
					tags: route.config.tags ?? ['Uncategorized'],
					description: route.config.description,
					summary: route.config.summary,
					authorization: route.config.authorization,
					operationId: route.config.operationId,
				});
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

	fetch(request: Request, env?: any, ctx?: IExecutionContext): Response | Promise<Response> {
		const environment = env ?? {};
		const executionContext = ctx ?? new MockExecutionContext();

		// Worker ENV overrides
		if (environment.APP_MODE && modes.includes(environment.APP_MODE)) {
			const logLevel = getModeLogLevel(environment.APP_MODE);
			logger.setLevel(logLevel);
		}

		const url = new URL(request.url);
		const match = findRoute<RouteData>(this.rou3, request.method, url.pathname);

		if (!match) {
			return this.config.notFoundHandler(request);
		}

		const stack = new Stack(executionContext, this.app.getOnCloseTriggers());

		const processor = new Processor(
			url,
			request,
			environment,
			stack,
			match.params ?? {},
			match.data.config,
			this.getGlobalMiddlewares(),
			match.data.handler,
			this.config.errorHandler,
		);

		return processor.execute();
	}
}
