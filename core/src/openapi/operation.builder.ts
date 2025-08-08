import {
	ContentObject,
	MediaTypeObject,
	OperationObject,
	ParameterLocation,
	ParameterObject,
	PathItemObject,
	RequestBodyObject,
	ResponseObject,
	ResponsesObject,
	SchemaObject,
	TagObject,
} from 'openapi3-ts/oas31';
import { OARoute } from '../types';
import { capitalize, getStatusText } from '../utils';
import { ZodInspector } from './zod-inspector';

/**
 * Transforms an **OARoute** (your internal DSL) into the
 * OpenAPI 3.1 structures required by `openapi3-ts`.
 *
 * Usage:
 * ```ts
 * const adapter = new OpenApiOperationBuilder(route);
 * const { path, item } = adapter.buildPathItem();
 * ```
 */
export class OpenApiOperationBuilder {
	constructor(private readonly route: OARoute) {}

	/** Convert `:id` style params to `{id}` style – OpenAPI friendly. */
	private get openApiPath(): string {
		return this.route.path.replace(/:([^/]+)/g, '{$1}');
	}

	/** Public entry point – returns the PathItem ready for builder.addPath(). */
	buildPathItem(): { path: string; item: PathItemObject; tags: TagObject[] } {
		const tags: TagObject[] =
			// ensure uniqueness and avoid the extra push() dance
			Array.from(new Set(this.route.tags ?? [])).map((name) => ({
				name,
				description: `${name} endpoints`,
			}));

		return {
			path: this.openApiPath,
			item: { [this.route.method]: this.buildOperation() },
			tags,
		};
	}

	/** Build the `OperationObject` for the current route. */
	private buildOperation(): OperationObject {
		return {
			operationId: this.route.operationId ?? this.generateOperationId(),
			tags: this.route.tags ?? ['Uncategorized'],
			summary: this.route.summary,
			description: this.route.description,
			security: this.buildSecurity(),
			requestBody: this.buildRequestBody(),
			parameters: this.buildParameters(),
			responses: this.buildResponses(),
		};
	}

	/** Translate our auth flags to the proper OpenAPI `security` array. */
	private buildSecurity(): OperationObject['security'] {
		switch (this.route.authorization) {
			case 'bearer':
				return [{ bearerAuth: [] }];
			case 'basic':
				return [{ basicAuth: [] }];
			default:
				return undefined;
		}
	}

	/** Map body Zod schema (if any) to OpenAPI RequestBodyObject. */
	private buildRequestBody(): RequestBodyObject | undefined {
		if (!this.route.body) return;

		const mime = this.route.mediaType ?? 'application/json';
		const meta = ZodInspector.metadata(this.route.body);

		return {
			description: meta.description ?? `${this.route.method.toUpperCase()} ${this.route.path} Body`,
			required: true,
			content: {
				[mime]: {
					schema: ZodInspector.convert(this.route.body),
					example: meta.example,
				} as MediaTypeObject,
			} as ContentObject,
		};
	}

	/** Combine params, query and headers into one flat array. */
	private buildParameters(): ParameterObject[] {
		return [...this.buildParameterList('params'), ...this.buildParameterList('query'), ...this.buildParameterList('headers')];
	}

	/** Convert a ZodObject into an array of ParameterObjects. */
	private buildParameterList(part: 'params' | 'query' | 'headers'): ParameterObject[] {
		const schema = this.route[part];
		if (!schema) return [];

		const locationMap: Record<typeof part, ParameterLocation> = {
			params: 'path',
			query: 'query',
			headers: 'header',
		};

		const loc = locationMap[part];

		return ZodInspector.fields(schema).map(({ key, schema, required, metadata }) => ({
			name: key,
			in: loc,
			required: required || loc === 'path',
			schema: ZodInspector.convert(schema),
			...metadata,
		})) as ParameterObject[];
	}

	/** Build the `responses` section, falling back to a “default”. */
	private buildResponses(): ResponsesObject {
		if (!this.route.responses?.length) {
			return { default: { description: 'Unknown' } };
		}

		return Object.fromEntries(
			this.route.responses.map(({ status, type, schema }) => {
				const meta = ZodInspector.metadata(schema);
				const code = String(status);
				const description = meta.description ?? `${code} ${getStatusText(code) ?? 'Unknown'}`;

				return [
					code,
					{
						description,
						content: {
							[type]: {
								schema: ZodInspector.convert(schema),
								example: meta.example,
							} as SchemaObject,
						},
					} as ResponseObject,
				];
			}),
		);
	}

	/** Auto-generate a predictable operationId: `getUserById` etc. */
	private generateOperationId(): string {
		const segments = this.route.path
			.split('/')
			.filter(Boolean)
			.map((s) => (s.startsWith(':') ? `By${capitalize(s.slice(1))}` : capitalize(s)));

		return this.route.method.toLowerCase() + segments.join('');
	}
}
