import z, { ZodObject } from 'zod';
import { Compiler } from './compiler';
import { app } from './hot/app';
import { compile } from 'json-schema-to-typescript';
import { buildPath } from './utils';
import { Exception } from './exception';
import prettier from 'prettier';

async function generateApiContract() {
	let code = `export type Api = {`;

	const def: any = {};
	const routes = app.getRoutes();

	for (const route of routes) {
		const { pathParts, method, config } = route;

		const path = buildPath(...pathParts);

		const httpMethod = method.toLowerCase() as HttpMethod;

		def[path] ??= {};
		def[path][httpMethod] ??= {};

		const requestSchema = z.object({
			body: config.body instanceof ZodObject ? config.body : z.any().optional(),
			params: config.params instanceof ZodObject ? config.params : z.any().optional(),
			query: config.query instanceof ZodObject ? config.query : z.any().optional(),
			headers: config.headers instanceof ZodObject ? config.headers : z.any().optional(),
		});

		def[path][httpMethod].req = z.toJSONSchema(requestSchema);
		def[path][httpMethod].res = z.toJSONSchema(z.any());

		if (config.responses) {
			for (const [status, schema] of Object.entries(config.responses)) {
				def[path][httpMethod].res[status] = z.toJSONSchema(schema);
			}
		}
	}

	for (const [path, config] of Object.entries(def)) {
		code += `'${path}': {`;

		for (const [method, routeContract] of Object.entries(config as any)) {
			const route = routeContract as any;

			// route.req is JSON Schema
			const reqInterface = await compile(route.req, 'TEMP', {
				bannerComment: '',
			});
			const reqCode = reqInterface.replace('export interface TEMP', '').replace('export type TEMP', '').trim();

			const resInterface = await compile(route.res, 'TEMP', {
				bannerComment: '',
			});
			const resCode = resInterface.replace('export interface TEMP', '').replace('export type TEMP', '').trim();

			code += `${method}: {
				req: ${reqCode};
				res: ${resCode};
			},`;
		}

		code += `},`; // close path
	}

	code += `}`; // close api

	const formatted = await prettier.format(code, {
		parser: 'typescript',
		semi: true,
		singleQuote: true,
		trailingComma: 'all',
	});

	console.log(formatted);
	return def;
}

generateApiContract();

async function main() {
	const compiler = new Compiler(app);
	const api = await compiler.compileAppDefinition();

	type A = typeof api;

	console.log(JSON.stringify(api, null, 2));

	const iface = await compile(api['/api/file']['POST']['request'], 'TEMPORAL', {
		bannerComment: '',
	});

	const data = iface.replace('export interface TEMPORAL', '').trim();

	console.log(data);

	const ts = `
	/** Client Definition auto-generated with crumbjs */

	type Api {
	`;

	const routes = app.getRoutes();
	const pathsType: string[] = [];
	for (const route of routes) {
		const { pathParts, method, config } = route;

		const path = buildPath(...pathParts);

		pathsType.push(path);

		const requestDataSchema = z.object({
			body: config.body instanceof ZodObject ? config.body : z.unknown().optional(),
			params: config.params instanceof ZodObject ? config.params : z.unknown().optional(),
			query: config.query instanceof ZodObject ? config.query : z.unknown().optional(),
			headers: config.headers instanceof ZodObject ? config.headers : z.unknown().optional(),
		});

		// z.toJSONSchema(requestDataSchema);
	}

	// console.log(`type Path = '${pathsType.join("' | '")}'`);
}

type HttpMethod = 'get' | 'post' | 'put' | 'patch' | 'delete' | 'head' | 'options';

export type ApiSpecs = Record<
	string, // path
	Partial<
		Record<
			HttpMethod,
			{
				req?: {
					type?: string;
					body?: unknown;
					params?: unknown;
					query?: unknown;
					headers?: unknown;
				};
				res?: any;
			}
		>
	>
>;

class Example<T extends ApiSpecs> {}

const a = new Example<Api>();

type Api = {
	'/api/file': {
		post: {
			req: {
				type: 'application/json';
				body: {
					file: File;
				};
				params?: any;
				query?: any;
				headers?: {
					a: string;
				};
			};
			res: {
				message: string;
			};
		};
	};
	'/api/hello/:name': {
		get: {
			req: {
				body: never;
				params: {
					name: string;
				};
			};
			res: string;
		};
	};
	// ... other paths
};

export type TPath<A extends ApiSpecs> = Extract<keyof A, string>;

export type Path = Extract<keyof Api, string>;

export type ExtractMethodPaths<M extends HttpMethod> = {
	[P in Path]: M extends keyof Api[P] ? P : never;
}[Path];

/**
 * Extract any part of request definition: body, params, query, headers
 */
export type ExtractRequestContent<P extends keyof Api, M extends keyof Api[P], D extends string> = 'req' extends keyof Api[P][M]
	? D extends keyof Api[P][M]['req']
		? Api[P][M]['req'][D]
		: never
	: never;

export type ExtractResponse<P extends keyof Api, M extends keyof Api[P]> = 'res' extends keyof Api[P][M] ? Api[P][M]['res'] : any;

export type ExtractSuccessResponse<P extends keyof Api, M extends keyof Api[P]> = 'res' extends keyof Api[P][M]
	? 'success' extends keyof Api[P][M]['res']
		? Api[P][M]['res']['success']
		: unknown
	: unknown;

export type ExtractFailureResponse<P extends keyof Api, M extends keyof Api[P]> = 'res' extends keyof Api[P][M]
	? 'failure' extends keyof Api[P][M]['res']
		? Api[P][M]['res']['failure']
		: unknown
	: unknown;

export type ExtractRequest<P extends keyof Api, M extends keyof Api[P]> = (ExtractRequestContent<P, M, 'body'> extends never
	? {}
	: { body: ExtractRequestContent<P, M, 'body'> }) &
	(ExtractRequestContent<P, M, 'query'> extends never ? {} : { query: ExtractRequestContent<P, M, 'query'> }) &
	(ExtractRequestContent<P, M, 'params'> extends never ? {} : { params: ExtractRequestContent<P, M, 'params'> }) &
	(ExtractRequestContent<P, M, 'headers'> extends never ? {} : { headers: ExtractRequestContent<P, M, 'headers'> });

export type Method<P extends Path> = Extract<keyof Api[P], string>;

export type FetchResultRaw = {
	success: boolean;
	content: string;
};

export class Client {
	constructor(private readonly baseUrl: string) {}

	async get<P extends ExtractMethodPaths<'get'>>(path: P, req: ExtractRequest<P, Method<P>>) {
		return this.execute<P, Method<P>>(path, 'get' as Method<P>, req);
	}

	async post<P extends ExtractMethodPaths<'post'>>(path: P, req: ExtractRequest<P, Method<P>>) {
		return this.execute<P, Method<P>>(path, 'post' as Method<P>, req);
	}

	async put<P extends ExtractMethodPaths<'put'>>(path: P, req: ExtractRequest<P, Method<P>>) {
		return this.execute<P, Method<P>>(path, 'put' as Method<P>, req);
	}

	async patch<P extends ExtractMethodPaths<'patch'>>(path: P, req: ExtractRequest<P, Method<P>>) {
		return this.execute<P, Method<P>>(path, 'patch' as Method<P>, req);
	}

	async delete<P extends ExtractMethodPaths<'delete'>>(path: P, req: ExtractRequest<P, Method<P>>) {
		return this.execute<P, Method<P>>(path, 'delete' as Method<P>, req);
	}

	async head<P extends ExtractMethodPaths<'head'>>(path: P, req: ExtractRequest<P, Method<P>>) {
		return this.execute<P, Method<P>>(path, 'head' as Method<P>, req);
	}

	async options<P extends ExtractMethodPaths<'options'>>(path: P, req: ExtractRequest<P, Method<P>>) {
		return this.execute<P, Method<P>>(path, 'options' as Method<P>, req);
	}

	private async execute<P extends Path, M extends Method<P>>(path: P, method: M, req: any) {
		try {
			const { success, content } = await this.fetch(path, method, req);

			// parse if response is a json, else raw string
			const isJson = content.startsWith('{') || content.startsWith('[');
			const parsedContent = isJson ? JSON.parse(content) : content;

			if (!success) {
				return {
					data: null,
					error: this.parseError(parsedContent),
				};
			}

			return {
				data: parsedContent as ExtractResponse<P, M>,
				error: null,
			};
		} catch (error) {
			console.error('Client execution error:', error);
			return {
				data: null,
				error: this.parseError(error),
			};
		}
	}

	private parseError(error: unknown) {
		return Exception.parse(error).toObject();
	}

	private async fetch(path: string, method: string, req: any): Promise<FetchResultRaw> {
		const contentType = 'type' in req ? req.type : 'application/json';
		const headers = 'headers' in req ? req.headers : {};
		const params = 'params' in req ? req.params : false;
		const query = 'query' in req ? req.query : false;

		const url = this.getUrl(path, params, query);
		const body = this.getBody(req);

		const response = await fetch(url, {
			method: method.toUpperCase(),
			body,
			headers: {
				'Content-Type': contentType,
				...headers,
			},
		});

		const content = await response.text();

		return {
			success: response.ok,
			content,
		};
	}

	private getBody(req: any): BodyInit {
		const body = 'body' in req ? req.body : false;

		if (!body) return '';

		const mediaType = 'type' in req ? req.type : 'application/json';

		switch (mediaType) {
			case 'multipart/form-data': {
				const form = new FormData();
				Object.entries(body).forEach(([key, value]) => {
					form.append(key, value instanceof Blob ? value : String(value));
				});
				return form;
			}
			case 'application/x-www-form-urlencoded': {
				const params = new URLSearchParams();
				Object.entries(body).forEach(([key, value]) => {
					if (value !== undefined && value !== null) {
						params.append(key, String(value)); // NOSONAR
					}
				});
				return params.toString();
			}
			case 'text/plain':
				return String(body);
			default:
				return JSON.stringify(body);
		}
	}

	private getUrl<P extends string>(
		path: P,
		params: Record<string, string | number | boolean> | false,
		query: Record<string, string | number | boolean> | false,
	): string {
		const replaced = !params
			? path
			: path.replace(/:(\w+)/g, (_, key: string) => {
					const value = params[key];

					if (!value) {
						throw new Error(`Missing param: ${key}`);
					}

					if (typeof value !== 'string' && typeof value !== 'number' && typeof value !== 'boolean') {
						throw new Error(`Invalid param type for "${key}". Must be string or number.`);
					}

					return encodeURIComponent(String(value));
				});

		const url = this.buildPath(this.baseUrl, replaced);

		if (!query || Object.keys(query).length === 0) {
			return url;
		}

		const queryString = Object.entries(query)
			.map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`)
			.join('&');

		return `${url}?${queryString}`;
	}

	private buildPath(...parts: string[]): string {
		let result: string[] = [];

		// Split each part by '/' and clean each segment
		for (const part of parts) {
			const cleanedSegments = part
				.split('/')
				.map((segment) => segment.trim()) // Trim each segment
				.filter(Boolean); // Remove any empty segments
			result.push(...cleanedSegments); // Add cleaned segments to the result
		}

		// Join back with single slashes and ensure no leading/trailing slashes
		return `/${result.join('/')}`;
	}
}

const client = new Client('');

const { data, error } = await client.get('/api/hello/:name', {
	params: {
		name: 'Elias',
	},
});

// client.post('/api/file', {
// 	body: {
// 		file:
// 	}
// })

// main();
