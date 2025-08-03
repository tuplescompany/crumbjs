import { OpenApiBuilder } from 'openapi3-ts/oas31';
import type { ZodType } from 'zod';
import type { OARoute } from '../types';

import { config } from '../config';
import { swaggerPage, scalarPage } from './ui';
import { OpenApiOperationBuilder } from './operation.builder';
import { ZodSchemaInspector } from './zod-schema.inspector';

/**
 * ---------------------------------------------------------------------------
 * OpenAPI Registry – a singleton façade around `OpenApiBuilder`
 * ---------------------------------------------------------------------------
 *
 * Responsibilities
 *  • Hold a single `OpenApiBuilder` instance.
 *  • Provide convenience helpers for:
 *      – routes      (`addRoute`)
 *      – schemas     (`addSchema`)
 *      – tags        (`addTag`)
 *      – servers     (`addServer`)
 *      – spec output (`getJson`, `getYaml`, `getSpec`)
 *  • Ensure `info` fields fall back to app-level defaults from `config`.
 *
 * Environment overrides:
 *  OPENAPI_TITLE        → default title
 *  OPENAPI_DESCRIPTION  → default description
 *  VERSION              → default version
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
	const addSchema = (name: string, schema: ZodType) => builder().addSchema(name, ZodSchemaInspector.convert(schema));

	/** Add an application route and any new tags it introduces. */
	const addRoute = (route: OARoute): void => {
		const { path, item, tags } = new OpenApiOperationBuilder(route).buildPathItem();

		tags.forEach((t) => upsertTag(t.name, t.description));
		builder().addPath(path, item);
	};

	/** Append a server entry used by code-gen tools and UIs. */
	const addServer = (url: string, description?: string) => builder().addServer({ url, description });

	/* ----------------------------------------------------------------------- */
	/*                         spec output convenience                         */
	/* ----------------------------------------------------------------------- */

	/** Ensure title, description and version are present (env → config → provided). */
	const ensureInfo = (): void => {
		const b = builder();
		const info = b.getSpec().info;

		if (!info.title) b.addTitle(config.get('openapiTitle'));
		if (!info.description) b.addDescription(config.get('openapiDescription'));
		if (!info.version) b.addVersion(config.get('version'));
	};

	const getSpec = () => (ensureInfo(), builder().getSpec());
	const getJson = () => (ensureInfo(), builder().getSpecAsJson());
	const getYaml = () => (ensureInfo(), builder().getSpecAsYaml());

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
		addRoute,
		addServer,
		addTag: upsertTag,
		getSpec,
		getJson,
		getYaml,
		swagger,
		scalar,
	} as const;
})();
