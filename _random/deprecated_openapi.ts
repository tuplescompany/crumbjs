import {
	OpenApiBuilder,
	type ContentObject,
	type MediaTypeObject,
	type ResponseObject,
	type OperationObject,
	type ParameterLocation,
	type ParameterObject,
	type RequestBodyObject,
	type ResponsesObject,
} from 'openapi3-ts/oas31';
import { ZodObject } from 'zod';
import { toSchemaObject } from '../core/src/openapi/converter';
import { STATUS_CODES } from 'node:http';
import { extractFields, getObjectMetadata } from '../core/src/openapi/utils';
import type { OARoute } from '../core/src/types';

/**
 * Container for Open Api documentation
 * It integrates automagically with RouteConfigr routes
 */
export class OpenApi {
	private builder: OpenApiBuilder;

	constructor(title: string, version: string, description: string) {
		this.builder = new OpenApiBuilder();

		this.builder.addTitle(title);

		this.builder.addVersion(version);

		this.builder.addOpenApiVersion('3.1.0');

		this.builder.addDescription(description);

		this.builder.addSecurityScheme('bearerAuth', {
			type: 'http',
			scheme: 'bearer',
		});

		this.builder.addSecurityScheme('basicAuth', {
			type: 'http',
			scheme: 'basic',
		});
	}

	private getRequestBody(route: OARoute) {
		if (route.body) {
			const mediatype = route.mediaType ?? 'application/json';
			const bodySchema = route.body;

			const metadata = getObjectMetadata(bodySchema);

			const bodySchemaObject = toSchemaObject(bodySchema);

			// if user nameit the zod object, register the schema
			if (metadata.schemaName) {
				this.builder.addSchema(metadata.schemaName, bodySchemaObject);
			}

			return {
				description: metadata.description ?? `${route.path} request body`,
				content: {
					[mediatype]: {
						schema: bodySchemaObject,
						example: metadata.example,
					} as MediaTypeObject,
				} as ContentObject,
				required: true,
			} as RequestBodyObject;
		}

		return undefined;
	}

	private getParameters(route: OARoute): ParameterObject[] {
		return [...this.getParameter(route, 'params'), ...this.getParameter(route, 'query'), ...this.getParameter(route, 'headers')];
	}

	private getParameter(route: OARoute, part: 'query' | 'params' | 'headers'): ParameterObject[] {
		const schema = route[part];
		if (!schema) return [];

		// todo standarize
		const loc: ParameterLocation = part === 'params' ? 'path' : part === 'headers' ? 'header' : 'query';

		return extractFields(schema).map((field) => {
			const jsonSchema = toSchemaObject(field.schema);

			return {
				name: field.key,
				in: loc,
				required: field.required || loc === 'path',
				schema: jsonSchema,
				...field.metadata,
			} as ParameterObject;
		});
	}

	private getResponses(route: OARoute) {
		if (route.responses) {
			const result: any = {};
			for (const [key, schema] of Object.entries(route.responses)) {
				const metadata = getObjectMetadata(schema);
				const responseSchemaObject = toSchemaObject(schema);

				const description = !metadata.description ? `${key} ${STATUS_CODES[key] ?? 'Unknown'}` : metadata.description;

				// if user nameit the zod object, register the schema
				if (metadata.schemaName) {
					this.builder.addSchema(metadata.schemaName, responseSchemaObject);
				}

				result[key] = {
					description,
					content: {
						['application/json']: { schema: responseSchemaObject },
						example: metadata.example,
					} as MediaTypeObject,
				} as ResponseObject;
			}

			return result as ResponsesObject;
		}

		return {
			'200': {
				description: 'Unknown',
			},
		} as ResponsesObject;
	}

	private inferOperationId(method: string, path: string): string {
		const segments = path
			.split('/')
			.filter(Boolean) // quita strings vacíos
			.map((segment) => {
				if (segment.startsWith(':')) {
					// :id → ById
					return 'By' + segment.slice(1).charAt(0).toUpperCase() + segment.slice(2);
				}
				// user → User
				return segment.charAt(0).toUpperCase() + segment.slice(1);
			});

		const operationId = method.toLowerCase() + segments.join('');
		return operationId;
	}

	private toOpenApiPath(path: string): string {
		return path.replace(/:([^/]+)/g, '{$1}');
	}

	register(route: OARoute) {
		// Determine security scheme
		let security;
		if (route.authorization === 'bearer') {
			security = [{ bearerAuth: [] }];
		} else if (route.authorization === 'basic') {
			security = [{ basicAuth: [] }];
		}

		const path = this.toOpenApiPath(route.path);
		const method = route.method;

		const operationObject = {
			operationId: route.operationId ?? this.inferOperationId(method, path),
			tags: route.tags ?? ['Uncategorized'],
			summary: route.summary,
			description: route.description,
			security,
			requestBody: this.getRequestBody(route),
			parameters: this.getParameters(route),
			responses: this.getResponses(route),
		} as OperationObject;

		this.builder.addPath(path, {
			[method]: operationObject,
		});
	}

	getDocument() {
		return this.builder.getSpec();
	}

	getJson() {
		return this.builder.getSpecAsJson();
	}

	getYaml() {
		return this.builder.getSpecAsYaml();
	}

	getResponse() {
		return new Response(this.getJson(), {
			headers: {
				'Content-Type': 'application/json',
			},
		});
	}
}
