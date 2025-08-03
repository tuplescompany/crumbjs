'use strict';
Object.defineProperty(exports, '__esModule', { value: true });
exports.OpenApi = void 0;
const oas31_1 = require('openapi3-ts/oas31');
const converter_1 = require('../core/src/openapi/converter');
const node_http_1 = require('node:http');
const utils_1 = require('../core/src/openapi/utils');
/**
 * Container for Open Api documentation
 * It integrates automagically with RouteConfigr routes
 */
class OpenApi {
	builder;
	constructor(title, version, description) {
		this.builder = new oas31_1.OpenApiBuilder();
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
	getRequestBody(route) {
		if (route.body) {
			const mediatype = route.mediaType ?? 'application/json';
			const bodySchema = route.body;
			const metadata = (0, utils_1.getObjectMetadata)(bodySchema);
			const bodySchemaObject = (0, converter_1.toSchemaObject)(bodySchema);
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
					},
				},
				required: true,
			};
		}
		return undefined;
	}
	getParameters(route) {
		return [...this.getParameter(route, 'params'), ...this.getParameter(route, 'query'), ...this.getParameter(route, 'headers')];
	}
	getParameter(route, part) {
		const schema = route[part];
		if (!schema) return [];
		// todo standarize
		const loc = part === 'params' ? 'path' : part === 'headers' ? 'header' : 'query';
		return (0, utils_1.extractFields)(schema).map((field) => {
			const jsonSchema = (0, converter_1.toSchemaObject)(field.schema);
			return {
				name: field.key,
				in: loc,
				required: field.required || loc === 'path',
				schema: jsonSchema,
				...field.metadata,
			};
		});
	}
	getResponses(route) {
		if (route.responses) {
			const result = {};
			for (const [key, schema] of Object.entries(route.responses)) {
				const metadata = (0, utils_1.getObjectMetadata)(schema);
				const responseSchemaObject = (0, converter_1.toSchemaObject)(schema);
				const description = !metadata.description ? `${key} ${node_http_1.STATUS_CODES[key] ?? 'Unknown'}` : metadata.description;
				// if user nameit the zod object, register the schema
				if (metadata.schemaName) {
					this.builder.addSchema(metadata.schemaName, responseSchemaObject);
				}
				result[key] = {
					description,
					content: {
						['application/json']: { schema: responseSchemaObject },
						example: metadata.example,
					},
				};
			}
			return result;
		}
		return {
			200: {
				description: 'Unknown',
			},
		};
	}
	inferOperationId(method, path) {
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
	toOpenApiPath(path) {
		return path.replace(/:([^/]+)/g, '{$1}');
	}
	register(route) {
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
		};
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
exports.OpenApi = OpenApi;
