import {
	OpenApiBuilder,
	type ContentObject,
	type MediaTypeObject,
	type ResponseObject,
	type ParameterLocation,
	type ParameterObject,
	type RequestBodyObject,
	type ResponsesObject,
	OperationObject,
	SchemaObject,
} from 'openapi3-ts/oas31';
import { STATUS_CODES } from 'node:http';
import type { OARoute } from '../types';
import { extractFields, getMetadata } from './utils';
import { toSchemaObject } from './converter';
import { scalarPage, swaggerPage } from './ui';
import { config } from '../config';

/**
 * Singleton OpenApiBuilder holder
 * and helpers utils to register App routes
 */
export const openapi = (() => {
	let builderInstance: OpenApiBuilder | null = null;

	/**
	 * Get the singleton instance of openapi3-ts OpenApiBuilder.
	 * Automatic env variables avaiable:
	 * - OPENAPI_TITLE: documentation general title
	 * - OPENAPI_DESCRIPTION: documentation general description
	 * - VERSION: app version
	 */
	const builder = () => {
		if (!builderInstance) {
			builderInstance = new OpenApiBuilder();
			builderInstance.addOpenApiVersion('3.1.0');

			builderInstance.addSecurityScheme('bearerAuth', {
				type: 'http',
				scheme: 'bearer',
			});

			builderInstance.addSecurityScheme('basicAuth', {
				type: 'http',
				scheme: 'basic',
			});

			builderInstance.addOpenApiVersion('3.1.0');
		}
		return builderInstance;
	};

	/**
	 * Obtain RequestBodyObject type from a OARoute with or without body ZodType
	 */
	const getRequestBody = (route: OARoute) => {
		if (route.body) {
			const mediatype = route.mediaType ?? 'application/json';
			const bodySchema = route.body;

			const metadata = getMetadata(bodySchema);

			const bodySchemaObject = toSchemaObject(bodySchema);

			// if user nameit the zod object, register the schema
			if (metadata.schemaName) {
				builder().addSchema(metadata.schemaName, bodySchemaObject);
			}

			return {
				description: metadata.description ?? `${route.method.toUpperCase()} ${route.path} Body`,
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
	};

	const getResponses = (route: OARoute) => {
		if (route.responses && route.responses.length) {
			const result: any = {};

			for (const res of route.responses) {
				const metadata = getMetadata(res.schema);

				const responseSchemaObject = toSchemaObject(res.schema);

				const stringStatus = String(res.status);

				const description = !metadata.description ? `${stringStatus} ${STATUS_CODES[stringStatus] ?? 'Unknown'}` : metadata.description;

				// if user nameit the zod object, register the schema
				if (metadata.schemaName) {
					builder().addSchema(metadata.schemaName, responseSchemaObject);
				}

				result[stringStatus] = {
					description,
					content: {
						[res.type]: {
							schema: responseSchemaObject,
							example: metadata.example,
						} as SchemaObject,
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
	};

	const getParameter = (route: OARoute, part: 'query' | 'params' | 'headers'): ParameterObject[] => {
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
	};

	const getParameters = (route: OARoute): ParameterObject[] => {
		return [...getParameter(route, 'params'), ...getParameter(route, 'query'), ...getParameter(route, 'headers')];
	};

	const generateOperationId = (route: OARoute): string => {
		const segments = route.path
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

		const operationId = route.method.toLowerCase() + segments.join('');
		return operationId;
	};

	const adaptPath = (route: OARoute) => {
		return route.path.replace(/:([^/]+)/g, '{$1}');
	};

	const addRoute = (route: OARoute) => {
		// Determine security scheme
		let security;
		if (route.authorization === 'bearer') {
			security = [{ bearerAuth: [] }];
		} else if (route.authorization === 'basic') {
			security = [{ basicAuth: [] }];
		}

		const path = adaptPath(route);
		const method = route.method;

		const operationObject = {
			operationId: route.operationId ?? generateOperationId(route),
			tags: route.tags ?? ['Uncategorized'],
			summary: route.summary,
			description: route.description,
			security,
			requestBody: getRequestBody(route),
			parameters: getParameters(route),
			responses: getResponses(route),
		} as OperationObject;

		builder().addPath(path, {
			[method]: operationObject,
		});
	};

	const addServer = (url: string, description?: string) => {
		builder().addServer({
			description,
			url,
		});
	};

	/**
	 * Ensures the OpenAPI spec has `title`, `description`, and `version`.
	 * If any of these fields are missing in the builder, fallback values
	 * are taken from the application config.
	 */
	const setSpecInfoFromConfig = () => {
		const specs = builder().getSpec();

		if (!specs.info.title) builder().addTitle(config.get('openapiTitle'));
		if (!specs.info.description) builder().addDescription(config.get('openapiDescription'));
		if (!specs.info.version) builder().addVersion(config.get('version'));
	};

	const getSpec = () => {
		setSpecInfoFromConfig();
		return builder().getSpec();
	};

	const getJson = () => {
		setSpecInfoFromConfig();
		return builder().getSpecAsJson();
	};

	const getYaml = () => {
		setSpecInfoFromConfig();
		return builder().getSpecAsYaml();
	};

	const swagger = (documentPath: string = '/openapi/doc.json') => swaggerPage(documentPath);

	const scalar = (documentPath: string = '/openapi/doc.json') => scalarPage(documentPath);

	return {
		builder,
		addRoute,
		addServer,
		getJson,
		getYaml,
		getSpec,
		swagger,
		scalar,
	};
})();
