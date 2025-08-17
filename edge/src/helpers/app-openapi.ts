// app-openapi.ts utilities to integrate an App and Config with Openapi doc builder and registry
import { App } from '../app';
import { Config } from '../config';
import { Method } from '../types';
import { OpenApiRegistry } from '../openapi/openapi';
import { Controller } from '../controller';

function createOpenApiController(prefix: string, ui: 'swagger' | 'scalar') {
	const registry = OpenApiRegistry.getInstance();
	const uiHtml = registry[ui](`${prefix}/doc.json`);

	return new Controller()
		.prefix(prefix)
		.get('/doc.json', () => Response.json(registry.getSpec()), { hide: true })
		.get(
			'/',
			() =>
				new Response(uiHtml, {
					headers: {
						'Content-Type': 'text/html',
					},
				}),
		);
}

// Internal helper to generate openapi specification based in an App & Config instance
export function buildAppRegistry(app: App, config: Config): void {
	const { withOpenapi, openapiBasePath, openapiUi } = config.all();

	if (!withOpenapi) return; // openapi disabled

	const registry = OpenApiRegistry.getInstance();
	const spec = registry.getSpec();

	/** Ensure title/description/version are present (#config-backed defaults). */
	if (!spec.info.title) registry.title(config.get('openapiTitle'));
	if (!spec.info.description) registry.description(config.get('openapiDescription'));
	if (!spec.info.version) registry.version(config.get('version'));

	// build openapi documentation and register #routes

	for (const route of app.getRoutes()) {
		const { path, method, config: routeConfig } = route;

		if (!routeConfig.hide) {
			registry.addRoute({
				method: method.toLowerCase() as Lowercase<Method>,
				path: path,
				mediaType: routeConfig.type ?? 'application/json',
				body: 'body' in routeConfig ? routeConfig.body : undefined,
				query: routeConfig.query,
				header: routeConfig.headers,
				params: routeConfig.params,
				responses: routeConfig.responses,
				tags: routeConfig.tags ?? ['Uncategorized'],
				description: routeConfig.description,
				summary: routeConfig.summary,
				authorization: routeConfig.authorization,
				operationId: routeConfig.operationId,
			});
		}
	}

	app.use(createOpenApiController(openapiBasePath, openapiUi));
}
