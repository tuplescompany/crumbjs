import { App } from './app';
import type { APIConfig, Route, BuildedRoute, RouteConfig } from './types';
import { buildPath, getModeLogLevel } from './helpers/utils';
import { config as ZodConfig } from 'zod';
import { openapi } from './openapi/openapi';
import { config } from './config';
import { Processor } from './processor/processor';
import { logger } from './helpers/logger';
import { BunRequest } from 'bun';

/**
 * Builds an Bun Http server from your main App
 */
export class Router {
	private readonly startAt: number;

	constructor(private readonly app: App) {
		this.startAt = performance.now();
	}

	private buildRoute(route: Route): BuildedRoute {
		const fullPath = buildPath(...route.pathParts);
		// RouteDinamic
		if ('handler' in route) {
			return {
				path: fullPath,
				method: route.method,
				handler: (request: BunRequest, server: Bun.Server) => {
					return new Processor(
						request,
						server,
						route.config,
						this.app.getMiddlewares(), // served app middlewares are global scope
						route.handler,
						config.get('errorHandler'),
					).execute();
				},
				routeConfig: route.config,
				isStatic: false,
			};
		}
		// RouteStatic
		return {
			path: fullPath,
			method: 'GET',
			handler: new Response(route.content, {
				headers: {
					'Content-Type': route.contentType,
				},
			}),
			routeConfig: { hide: true } as RouteConfig,
			isStatic: true,
		};
	}

	/** Ensure title/description/version are present (#config-backed defaults). */
	private getOpenapiSpecs() {
		const specs = openapi.getSpec();
		if (!specs.info.title) openapi.title(config.get('openapiTitle'));
		if (!specs.info.description) openapi.description(config.get('openapiDescription'));
		if (!specs.info.version) openapi.version(config.get('version'));
		return specs;
	}

	/**
	 * Takes all application routes and create Bun.serve compatible Handlers with all request life-cycle throught Processor
	 */
	private async buildRoutes() {
		const { withOpenapi, openapiBasePath, openapiUi } = config.all;

		let routes: Record<string, any> = {};

		for (const route of this.app.getRoutes()) {
			const buildedRoute = this.buildRoute(route);
			const { path, method, handler, routeConfig, isStatic } = buildedRoute;

			if (isStatic) {
				routes[path] = handler;
			} else {
				if (!routes[path]) routes[path] = {};
				routes[path][method] = handler;
			}

			// Register openapi route if is enabled and not specifically hide on the route
			if (withOpenapi && !routeConfig.hide) openapi.addBuildedRoute(buildedRoute);

			logger.debug(`🌐 ${method} ${path} Registered`);
		}

		/**
		 * Add openapi routes if is enabled as raw-serve-route, no middlewares / request lifecycle attached
		 */
		if (withOpenapi) {
			const specs = this.getOpenapiSpecs();

			const documentPath = buildPath(openapiBasePath, '/doc.json');
			const openapiUiPath = buildPath(openapiBasePath);

			routes[documentPath] = Response.json(specs);
			routes[openapiUiPath] = new Response(openapi[openapiUi](documentPath));

			logger.debug(`📘 GET ${documentPath} Registered`);
			logger.debug(`📘 GET ${openapiUiPath} Registered`);
		}

		// health (static)
		routes['/up'] = Response.json({
			up: true,
			at: new Date().toISOString(),
		});

		logger.debug(`🌡️ GET /up Registered`);

		const openapiReadyMessage = withOpenapi ? `enabled, UI: ${openapiUi}` : 'disabled';
		logger.debug(`📘 OPENAPI: ${openapiReadyMessage}`);

		return routes;
	}

	async serve(options?: Partial<APIConfig>) {
		if (options) config.merge(options);

		// set level to the global Logger instance on server starts
		const logLevel = getModeLogLevel(config.get('mode'));
		logger.setLevel(logLevel);

		if (config.get('locale') !== 'en') {
			const { es, en, pt } = await import('zod/locales');
			const langs = { es, en, pt };
			const appLocale = config.get('locale');
			ZodConfig(langs[appLocale]());
		}

		logger.debug(`🈯 Locale set to: ${config.get('locale')}`);

		for (const [triggerName, trigger] of Object.entries(this.app.getStartupTriggers())) {
			logger.debug(`🛠️ Executing on-start '${triggerName}' trigger`);
			await trigger();
		}

		const server = Bun.serve({
			port: config.get('port'),
			routes: await this.buildRoutes(),
			fetch: config.get('notFoundHandler'),
		});

		const duration = performance.now() - this.startAt;
		logger.debug(`⚡ Startup time: ${duration.toFixed(2)} ms`);
		logger.debug(`🔌 HTTP Server listening on port ${config.get('port')}`);

		return server;
	}
}
