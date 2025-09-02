import { App } from './app';
import type { APIConfig, Route, BuildedRoute, RouteConfig } from './types';
import { buildPath, getModeLogLevel } from './helpers/utils';
import { openapi } from './openapi/openapi';
import { config } from './config';
import { Processor } from './processor/processor';
import { logger } from './helpers/logger';
import { BunRequest } from 'bun';
import { createClientSpecs } from './client-generator';
import { autoCompleteRouteConfig } from './helpers/route-config';

/**
 * Builds an Bun Http server from your main App
 */
export class Router {
	private readonly startAt: number;

	constructor(private readonly app: App) {
		this.startAt = performance.now();
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

	private async buildRoute(route: Route): Promise<BuildedRoute> {
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
						this.getGlobalMiddlewares(), // served app middlewares are global scope
						route.handler,
						config.get('errorHandler'),
					).execute();
				},
				routeConfig: autoCompleteRouteConfig(route.config),
				isStatic: false,
			};
		}

		// RouteStatic
		const content = route.content instanceof Blob ? await route.content.bytes() : route.content;
		const contentType = route.contentType ?? (route.content instanceof Blob ? route.content.type : 'application/octet-stream');
		return {
			path: fullPath,
			method: 'GET',
			// @ts-expect-error
			handler: new Response(content, {
				headers: {
					'Content-Type': contentType,
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

		let dynamics: Record<string, any> = {};
		let statics: Record<string, Response> = {};

		for (const route of this.app.getRoutes()) {
			const buildedRoute = await this.buildRoute(route);
			const { path, method, handler, routeConfig, isStatic } = buildedRoute;

			if (isStatic) {
				statics[path] = handler;
			} else {
				if (!dynamics[path]) dynamics[path] = {};
				dynamics[path][method] = handler;
			}

			// Register openapi route if is enabled and not specifically hide on the route
			if (withOpenapi && !routeConfig.hide) {
				openapi.addBuildedRoute(buildedRoute);
			}

			const diff = isStatic ? ' (static)' : '';
			logger.debug(`🌐 ${method} ${path} Registered${diff}`);
		}

		/**
		 * Add openapi routes if is enabled as raw-serve-route, no middlewares / request lifecycle attached
		 */
		if (withOpenapi) {
			const specs = this.getOpenapiSpecs();

			const documentPath = buildPath(openapiBasePath, '/doc.json');
			const openapiUiPath = buildPath(openapiBasePath);

			statics[documentPath] = Response.json(specs);
			statics[openapiUiPath] = new Response(openapi[openapiUi](documentPath));

			logger.debug(`📘 GET ${documentPath} Registered (static)`);
			logger.debug(`📘 GET ${openapiUiPath} Registered (static)`);
		}

		const openapiReadyMessage = withOpenapi ? `enabled, UI: ${openapiUi}` : 'disabled';
		logger.debug(`📘 OPENAPI: ${openapiReadyMessage}`);

		if (withOpenapi && config.get('mode') === 'development' && config.get('generateClientSchema')) {
			await createClientSpecs(openapi.getJson());
			logger.debug(`📘 CLIENT: Generated client specification`);
		}

		return { statics, dynamics };
	}

	async serve(options?: Partial<APIConfig>) {
		if (options) config.merge(options);

		// set level to the global Logger instance on server starts
		const logLevel = getModeLogLevel(config.get('mode'));
		logger.setLevel(logLevel);

		for (const [triggerName, trigger] of Object.entries(this.app.getStartupTriggers())) {
			logger.debug(`🛠️ Executing on-start '${triggerName}' trigger`);
			await trigger();
		}

		const routes = await this.buildRoutes();

		const server = Bun.serve({
			port: config.get('port'),
			routes: {
				...routes.dynamics,
				...routes.statics,
			},
			fetch: config.get('notFoundHandler'),
		});

		const duration = performance.now() - this.startAt;
		logger.debug(`⚡ Startup time: ${duration.toFixed(2)} ms`);
		logger.debug(`🔌 HTTP Server listening on port ${config.get('port')}`);

		return server;
	}
}
