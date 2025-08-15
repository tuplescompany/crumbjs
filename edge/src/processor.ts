import type { Context, ErrorHandler, Result, Middleware, RootContext, Handler, RouteConfig } from './types';
import { BodyParser } from './body-parser';
import { flattenError, ZodObject } from 'zod';
import { BadRequest, InternalServerError } from './exception/http.exception';
import { Exception } from './exception';
import { logger } from './logger';
import { IExecutionContext } from './cloudflare';

export class Processor {
	private readonly rootContext: RootContext;

	private readonly reqStore: Record<string, any> = {};

	private readonly reqHeaders: Record<string, string> = {};

	private readonly reqQuery: Record<string, string> = {};

	private readonly cookies = {
		set: (name: string, value: string, options?: CookieInit) => {},
		get: (name: string) => null,
		delete: (name: string) => {},
	};

	private resStatus: number = 200;

	private readonly resHeaders: Record<string, string> = {
		'Content-Type': 'application/json',
	};

	constructor(
		private readonly req: Request,
		private readonly env: any,
		private readonly executionContext: IExecutionContext,
		private readonly url: URL, // inherit to avoid parsing twice, only once at app.handle()
		private readonly params: Record<string, string>,
		private readonly config: RouteConfig,
		private readonly handler: Handler,
		private readonly middlewares: Middleware[], // initial global middlewares array
		private readonly errorHandler: ErrorHandler,
	) {
		this.reqQuery = this.queryToObject(this.url.searchParams);
		this.reqHeaders = this.headersToObject(this.req.headers);

		this.rootContext = {
			request: this.req,
			env: this.env,
			executionContext: this.executionContext,
			url: this.url,
			ip: this.req.headers.get('cf-connecting-ip') ?? 'unknown-ip',
			origin: this.req.headers.get('origin') ?? '',
			bearer: () => {
				const authorization = this.req.headers.get('Authorization');
				if (!authorization?.startsWith('Bearer ')) throw new BadRequest({ authorization: ['Bearer empty or inexistent'] });
				if (authorization.length < 10) throw new BadRequest({ authorization: ['Bearer too short'] });
				return authorization.slice(7);
			},
			setHeader: (key: string, value: string) => {
				this.resHeaders[key] = value;
			},
			deleteHeader: (key: string) => {
				delete this.resHeaders[key];
			},
			setCookie: this.cookies.set.bind(this.cookies),
			getCookie: this.cookies.get.bind(this.cookies),
			deleteCookie: this.cookies.delete.bind(this.cookies),
			setStatus: (status: number) => {
				this.resStatus = status;
			},
			set: (key: any, value: any) => {
				this.reqStore[key] = value;
			},
			get: (key: any): any => {
				return this.reqStore[key];
			},
			rawBody: {}, // unparsed yet
		};
	}

	// Headers -> Record<string, string> (último valor gana; keys en lowercase)
	private headersToObject(headers: Headers): Record<string, string> {
		const out: Record<string, string> = {};
		headers.forEach((value, key) => {
			out[key.toLowerCase()] = value;
		});
		return out;
	}

	// URLSearchParams -> Record<string, string> (último valor gana)
	private queryToObject(params: URLSearchParams): Record<string, string> {
		const out: Record<string, string> = {};
		params.forEach((v, k) => {
			out[k] = v;
		});
		return out;
	}

	private async validate(schema: any, data: any, part: 'body' | 'query' | 'headers') {
		// disable validation for non ZodObject schemas
		if (!schema || !(schema instanceof ZodObject)) {
			return data;
		}

		const res = schema.safeParse(data);
		if (!res.success) {
			throw new BadRequest({
				part,
				errors: flattenError(res.error).fieldErrors,
			});
		}
		return res.data;
	}

	/**
	 * Safely parse the request body based on its Content-Type.
	 *
	 * - Skips parsing for `GET`, `HEAD`, and `OPTIONS` (these methods don’t carry a body).
	 * - If `Content-Length` is present and `0`, parsing is skipped.
	 * - `application/json`, `multipart/form-data`, and `application/x-www-form-urlencoded`
	 *   are parsed accordingly by `BodyParser`.
	 * - Any other supported type is parsed as text and wrapped as `{ content: string }`.
	 *
	 * The raw (unparsed) body is stored in `rootContext.rawBody` when available.
	 *
	 * Parsing is performed on a cloned (`clone()`) instance of the request,
	 * so the original request stream remains readable and can be used afterward.
	 *
	 * @see BodyParser
	 * @remarks This method is defensive: unexpected parser errors are logged and swallowed.
	 */
	private async parseBody() {
		try {
			this.rootContext.rawBody = await new BodyParser(this.req).parse();
		} catch (error) {
			logger.error('parseBody() fails', error); // border, this should never happen
		}
	}

	private validateContentType() {
		const configType = this.config.type;

		const contentType = this.req.headers.get('content-type') ?? '';
		if (configType && !contentType.includes(configType)) {
			throw new BadRequest({
				part: 'headers',
				errors: [`Invalid Content-Type: expected “${configType}”, got “${contentType ?? 'none'}”.`],
			});
		}
	}

	private async getHandlerContext(): Promise<Context> {
		const [body, query, headers] = await Promise.all([
			this.validate(this.config.body, this.rootContext.rawBody, 'body'),
			this.validate(this.config.query, this.reqQuery, 'query'),
			this.validate(this.config.headers, this.reqHeaders, 'headers'),
		]);

		return {
			...this.rootContext,
			body,
			query,
			params: this.params,
			headers,
		};
	}

	/**
	 * Normalizes an awaited `Result` value into a `Response` instance.
	 *
	 * Accepted types:
	 * - `Response` → returned as-is.
	 * - `null` → empty body
	 * - `string` → plain text
	 * - `object` → serializes JSON body
	 *
	 * Error handling:
	 * - Throws `InternalServerError` if Result is not null - string - object or Response
	 *
	 * @param result - The handler or middleware return value to normalize.
	 * @returns A `Response` object ready to be returned to the client.
	 */
	private createResponse(result: Awaited<Result>) {
		if (result instanceof Response) return result;

		const responseBody = typeof result === 'string' || result === null ? result : JSON.stringify(result);

		if (typeof responseBody === 'string' || responseBody === null) {
			return new Response(responseBody, {
				headers: this.resHeaders,
				status: this.resStatus,
			});
		}

		throw new InternalServerError(`Unable to parse response. Did you forget some 'return next()' on middlewares?`);
	}

	/**
	 * Exception to Response with Error handler
	 * its parsed within another try-catch, because if at error fails "we will never know what happen"
	 * @param ex
	 */
	private async createErrorResponse(ex: Exception) {
		try {
			return this.createResponse(await this.errorHandler({ ...this.rootContext, exception: ex }));
		} catch (error) {
			// Border case, bad coded ExceptionHandler
			const safeError = error instanceof Error ? error.message : String(error);

			const messages = [
				'Failed to serialize the exception response',
				`Error: ${safeError}`,
				'The exception handler itself threw an error, review and fix its logic',
			];

			return new Response(messages.join('\n'), {
				headers: { 'Content-Type': 'text/plain' },
				status: 500,
			});
		}
	}

	async execute() {
		try {
			// 1- safe body parse, on fail will log and rawBody will still "{}"
			await this.parseBody();
			// 2- add route specific middlewares
			if (this.config.use) {
				const m = Array.isArray(this.config.use) ? this.config.use : [this.config.use];
				this.middlewares.push(...m);
			}

			// 3- Create functional route chain
			let i = 0;
			const run = async (): Promise<Result> => {
				// global and route middlewares
				const mw = this.middlewares[i++];
				if (mw) return mw({ ...this.rootContext, next: run });
				// route handler
				this.validateContentType(); // if route config includes content-type and is different from request, throws
				const ctx = await this.getHandlerContext(); // validates data and construct the final context
				return this.handler(ctx);
			};

			// 4- Parse and return Response
			return this.createResponse(await run());
		} catch (error) {
			const ex = Exception.parse(error);

			console.error(error); // Log raw Error

			return this.createErrorResponse(ex);
		}
	}
}
