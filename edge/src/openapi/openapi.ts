import { OpenApiBuilder } from 'openapi3-ts/oas31';
import type { ZodType } from 'zod';
import type { OARoute } from '../types';

import { swaggerPage, scalarPage } from './ui';
import { OpenapiOperationBuilder } from './operation.builder';
import { ZodInspector } from './zod-inspector';

/**
 * ----------------------------------------------------------------------------
 * OpenApiRegistry – Singleton wrapper around `OpenApiBuilder`
 * ----------------------------------------------------------------------------
 *
 * Responsibilities
 *  - Expose a single OpenApiBuilder instance (lazy-initialized).
 *  - Provide convenience helpers:
 *      addRoute, addSchema, addTag (upsert), addServer
 *  - Provide spec outputs:
 *      getSpec, getJson, getYaml
 *  - Provide UI helpers:
 *      swagger(docPath), scalar(docPath)
 *  - Ensure `info` fields (title/description/version) fall back to `config`.
 *
 * Notes
 *  - Cloudflare Workers run in isolates; module scope is cached per isolate.
 *    This class is safe to use as a singleton.
 *  - `reset()` is provided for test environments to clear state between runs.
 */
export class OpenApiRegistry {
	/** The single global instance. */
	private static instance: OpenApiRegistry | undefined;

	/** Underlying OpenAPI builder (created lazily). */
	private builderInstance: OpenApiBuilder | undefined;

	/** Private constructor: use `getInstance()` */
	private constructor() {}

	/** Access the singleton instance. */
	static getInstance(): OpenApiRegistry {
		this.instance ??= new OpenApiRegistry();
		return this.instance;
	}

	static getBuilder(): OpenApiBuilder {
		return OpenApiRegistry.getInstance().builder();
	}

	/**
	 * Lazily create or return the single OpenApiBuilder.
	 * Also seeds common security schemes.
	 */
	private builder(): OpenApiBuilder {
		if (this.builderInstance) return this.builderInstance;

		this.builderInstance = new OpenApiBuilder()
			.addOpenApiVersion('3.1.0')
			.addSecurityScheme('bearerAuth', { type: 'http', scheme: 'bearer' })
			.addSecurityScheme('basicAuth', { type: 'http', scheme: 'basic' });

		return this.builderInstance;
	}

	/**
	 * Upsert (add or replace) a TagObject.
	 * - Adds a new tag if missing.
	 * - If exists and `description` is provided, overwrites it.
	 */
	addTag(name: string, description?: string): void {
		const spec = this.builder().getSpec();
		const tags = (spec.tags ??= []);

		const existing = tags.find((t) => t.name === name);
		if (!existing) {
			this.builder().addTag({ name, description });
		} else if (description) {
			existing.description = description;
		}
	}

	/** Register a Zod schema under `components.schemas`. */
	addSchema(name: string, schema: ZodType): void {
		this.builder().addSchema(name, ZodInspector.convert(schema));
	}

	/**
	 * Add a route (operation) and upsert any new tags it introduces.
	 * Uses your `OpenapiOperationBuilder` to materialize the PathItem.
	 */
	addRoute(route: OARoute): void {
		const { path, item, tags } = new OpenapiOperationBuilder(route).buildPathItem();
		for (const t of tags) this.addTag(t.name, t.description);
		this.builder().addPath(path, item);
	}

	title(title: string) {
		this.builder().addTitle(title);
	}

	description(description: string) {
		this.builder().addDescription(description);
	}

	version(version: string) {
		this.builder().addVersion(version);
	}

	/** Append a server entry (useful for tooling and UIs). */
	addServer(url: string, description?: string): void {
		this.builder().addServer({ url, description });
	}

	/** Return the full OpenAPI document object. */
	getSpec() {
		return this.builder().getSpec();
	}

	/** Return the spec as JSON (string). */
	getJson() {
		return this.builder().getSpecAsJson();
	}

	/** Return the spec as YAML (string). */
	getYaml() {
		return this.builder().getSpecAsYaml();
	}

	/** Serve Swagger UI HTML pointing to `docPath` (defaults to `/openapi/doc.json`). */
	swagger(docPath = '/openapi/doc.json') {
		return swaggerPage(docPath);
	}

	/** Serve Scalar UI HTML pointing to `docPath` (defaults to `/openapi/doc.json`). */
	scalar(docPath = '/openapi/doc.json') {
		return scalarPage(docPath);
	}

	/**
	 * TEST-ONLY: reset internal state (clears builder and tags/paths).
	 * Useful for unit tests to avoid cross-test pollution.
	 */
	reset(): void {
		this.builderInstance = undefined;
	}
}
