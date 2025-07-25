import { OpenApiGeneratorV3, OpenAPIRegistry } from '@asteasolutions/zod-to-openapi';
import { ZodObject } from 'zod';

export type RegistryMethod = 'get' | 'post' | 'put' | 'delete' | 'patch' | 'head' | 'options' | 'trace';

export type OpenApiRoute = {
	method: RegistryMethod;
	path: string;
	mediaType?: string;
	body?: ZodObject;
	query?: ZodObject;
	params?: ZodObject;
	headers?: ZodObject;
	responses?: Record<number, ZodObject>;
	tags?: string[];
	description?: string;
	summary?: string;
	authorization?: 'bearer' | 'basic';
	operationId?: string;
};

/**
 * Container for Open Api documentation
 * It integrates automagically with RouteConfigr routes
 */
export class OpenApi {
	registry: OpenAPIRegistry = new OpenAPIRegistry();

	constructor(
		private readonly title: string,
		private readonly version: string,
		private readonly description: string,
	) {
		this.registry.registerComponent('securitySchemes', 'bearerAuth', {
			type: 'http',
			scheme: 'bearer',
		});

		this.registry.registerComponent('securitySchemes', 'basicAuth', {
			type: 'http',
			scheme: 'basic',
		});
	}

	private getBody(route?: OpenApiRoute) {
		if (route?.body) {
			const mediatype = route.mediaType ?? 'application/json';
			const bodySchema = route.body;
			return {
				body: {
					content: {
						[mediatype]: {
							schema: bodySchema,
						},
					},
				},
			};
		}
		return {};
	}

	private getParameter(route: OpenApiRoute, part: 'query' | 'params' | 'headers') {
		if (route[part]) {
			const schema = route[part];

			return {
				[part]: schema,
			};
		}

		return {};
	}

	private getResponses(route: OpenApiRoute) {
		if (route.responses) {
			const result: any = {};
			for (const [key, schema] of Object.entries(route.responses)) {
				result[key] = {
					content: {
						['application/json']: { schema },
					},
				};
			}

			return result;
		}
		return {};
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

	register(route: OpenApiRoute) {
		// Determine security scheme
		let security;
		if (route.authorization === 'bearer') {
			security = [{ bearerAuth: [] }];
		} else if (route.authorization === 'basic') {
			security = [{ basicAuth: [] }];
		}

		this.registry.registerPath({
			operationId: route.operationId ?? this.inferOperationId(route.method, route.path),
			tags: route.tags ?? ['Uncategorized'],
			// if not set takes operationId (redocs) or stay empty (swagger)
			summary: route.summary,
			description: route.description,
			method: route.method,
			path: route.path,
			request: {
				...this.getBody(route),
				...this.getParameter(route, 'params'),
				...this.getParameter(route, 'headers'),
				...this.getParameter(route, 'query'),
			},
			responses: {
				...this.getResponses(route),
			},
			security,
		});
	}

	getDocument() {
		const generator = new OpenApiGeneratorV3(this.registry.definitions);

		return generator.generateDocument({
			openapi: '3.1.0',
			info: {
				version: this.version,
				title: this.title,
				description: this.description,
			},
		});
	}

	getResponse() {
		return new Response(JSON.stringify(this.getDocument()), {
			headers: {
				'Content-Type': 'application/json',
			},
		});
	}
}
