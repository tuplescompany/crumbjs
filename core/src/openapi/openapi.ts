import { OpenApiBuilder } from 'openapi3-ts/oas31';
import type { ZodType } from 'zod';
import type { Method, OARoute, BuildedRoute } from '../types';
import { swaggerPage, scalarPage } from './ui';
import { OperationBuilder } from './operation.builder';
import { convert } from './zod';

/**
 * ---------------------------------------------------------------------------
 * OpenAPI Registry – a singleton façade around `OpenApiBuilder`
 * ---------------------------------------------------------------------------
 *
 * Responsibilities
 *  - Hold a single `OpenApiBuilder` instance.
 *  - Provide convenience helpers for:
 *      - routes      (`addRoute`)
 *      – schemas     (`addSchema`)
 *      – tags        (`addTag`)
 *      – servers     (`addServer`)
 *      – spec output (`getJson`, `getYaml`, `getSpec`)
 *  - Ensure `info` fields fall back to app-level defaults from `config`.
 *
 * Environment overrides:
 *  - OPENAPI_TITLE        default title
 *  - OPENAPI_DESCRIPTION  default description
 *  - VERSION              default version
 */
export const openapi = (() => {
	/* ----------------------------------------------------------------------- */
	/*                         lazy-initialised builder                        */
	/* ----------------------------------------------------------------------- */

	let instance: OpenApiBuilder | null = null;

	/** Return (or create) the sole `OpenApiBuilder` instance. */
	const builder = (): OpenApiBuilder => {
		if (instance) return instance;

		instance = new OpenApiBuilder()
			.addOpenApiVersion('3.1.0')
			.addSecurityScheme('bearerAuth', { type: 'http', scheme: 'bearer' })
			.addSecurityScheme('basicAuth', { type: 'http', scheme: 'basic' });

		return instance;
	};

	/* ----------------------------------------------------------------------- */
	/*                                helpers                                  */
	/* ----------------------------------------------------------------------- */

	/**
	 * Upsert (add or replace) a `TagObject`.
	 * – Adds a new tag when missing.
	 * – If the tag exists and a `description` is provided, it overwrites it.
	 */
	const upsertTag = (name: string, description?: string): void => {
		const specTags = (builder().getSpec().tags ??= []);

		const tag = specTags.find((t) => t.name === name);
		if (!tag) {
			builder().addTag({ name, description });
		} else if (description) {
			tag.description = description;
		}
	};

	/** Register a Zod schema under `components.schemas`. */
	const addSchema = (name: string, schema: ZodType) => builder().addSchema(name, convert(schema));

	/** Add an application route and any new tags it introduces. */
	const addRoute = (route: OARoute): void => {
		const { path, item, tags } = new OperationBuilder(route).buildPathItem();

		tags.forEach((t) => upsertTag(t.name, t.description));
		builder().addPath(path, item);
	};

	const addBuildedRoute = (route: BuildedRoute): void => {
		const { method, path, routeConfig } = route;
		addRoute({
			method: method.toLowerCase() as Lowercase<Method>,
			path,
			mediaType: route.routeConfig.type ?? 'application/json',
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
	};

	/** Append a server entry used by code-gen tools and UIs. */
	const addServer = (url: string, description?: string) => builder().addServer({ url, description });

	const title = (title: string) => {
		builder().addTitle(title);
	};

	const description = (description: string) => {
		builder().addDescription(description);
	};

	const version = (version: string) => {
		builder().addVersion(version);
	};

	/* ----------------------------------------------------------------------- */
	/*                         spec output convenience                         */
	/* ----------------------------------------------------------------------- */
	const getSpec = () => {
		return builder().getSpec();
	};

	const getJson = () => {
		return builder().getSpecAsJson();
	};

	const getYaml = () => {
		return builder().getSpecAsYaml();
	};

	/* ----------------------------------------------------------------------- */
	/*                                    UI                                  */
	/* ----------------------------------------------------------------------- */

	const swagger = (docPath = '/openapi/doc.json') => swaggerPage(docPath);
	const scalar = (docPath = '/openapi/doc.json') => scalarPage(docPath);

	/* ----------------------------------------------------------------------- */
	/*                                  API                                   */
	/* ----------------------------------------------------------------------- */

	return {
		builder,
		addSchema,
		addBuildedRoute,
		addRoute,
		addServer,
		addTag: upsertTag,
		getSpec,
		getJson,
		getYaml,
		title,
		description,
		version,
		swagger,
		scalar,
	} as const;
})();
