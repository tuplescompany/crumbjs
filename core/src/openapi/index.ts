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
} from 'openapi3-ts/oas31';
import { STATUS_CODES } from 'node:http';
import type { OARoute } from '../types';
import { extractFields, getObjectMetadata } from './utils';
import { toSchemaObject } from './converter';
import { swagger } from './ui';
import { config } from '../config';

/**
 * Singleton OpenApiBuilder holder
 * and helpers utils to register App routes
 */
export const openapi = (() => {
	let instance: OpenApiBuilder | null = null;

	/**
	 * Get the singleton instance of openapi3-ts OpenApiBuilder.
	 * Automatic env variables avaiable:
	 * - OPENAPI_TITLE: documentation general title
	 * - OPENAPI_DESCRIPTION: documentation general description
	 * - VERSION: app version
	 */
	const registry = () => {
		if (!instance) {
			instance = new OpenApiBuilder();
			instance.addOpenApiVersion('3.1.0');

			instance.addSecurityScheme('bearerAuth', {
				type: 'http',
				scheme: 'bearer',
			});

			instance.addSecurityScheme('basicAuth', {
				type: 'http',
				scheme: 'basic',
			});

			instance.addOpenApiVersion('3.1.0');
		}
		return instance;
	};

	/**
	 * Obtain RequestBodyObject type from a OARoute with or without body ZodType
	 */
	const getRequestBody = (route: OARoute) => {
		if (route.body) {
			const mediatype = route.mediaType ?? 'application/json';
			const bodySchema = route.body;

			const metadata = getObjectMetadata(bodySchema);

			const bodySchemaObject = toSchemaObject(bodySchema);

			// if user nameit the zod object, register the schema
			if (metadata.schemaName) {
				registry().addSchema(metadata.schemaName, bodySchemaObject);
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
	};

	const getResponses = (route: OARoute) => {
		if (route.responses) {
			const result: any = {};
			for (const [key, schema] of Object.entries(route.responses)) {
				const metadata = getObjectMetadata(schema);
				const responseSchemaObject = toSchemaObject(schema);

				const description = !metadata.description ? `${key} ${STATUS_CODES[key] ?? 'Unknown'}` : metadata.description;

				// if user nameit the zod object, register the schema
				if (metadata.schemaName) {
					registry().addSchema(metadata.schemaName, responseSchemaObject);
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

		registry().addPath(path, {
			[method]: operationObject,
		});
	};

	/**
	 * Ensures the OpenAPI spec has `title`, `description`, and `version`.
	 * If any of these fields are missing in the registry, fallback values
	 * are taken from the application config.
	 */
	const setSpecInfoFromConfig = () => {
		const specs = registry().getSpec();

		if (!specs.info.title) registry().addTitle(config.get('openapiTitle'));
		if (!specs.info.description) registry().addDescription(config.get('openapiDescription'));
		if (!specs.info.version) registry().addVersion(config.get('version'));
	};

	const getSpec = () => {
		setSpecInfoFromConfig();
		return registry().getSpec();
	};

	const getJson = () => {
		setSpecInfoFromConfig();
		return registry().getSpecAsJson();
	};

	const getYaml = () => {
		setSpecInfoFromConfig();
		return registry().getSpecAsYaml();
	};

	const swaggerUi = (documentPath: string = '/openapi/document.json') => swagger(documentPath);

	return {
		registry,
		addRoute,
		getJson,
		getYaml,
		getSpec,
		swaggerUi,
	};
})();
