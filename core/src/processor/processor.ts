import { BunRequest } from 'bun';
import { HeaderBuilder } from './header-builder';
import { Context, ErrorHandler, Handler, Result, Middleware, RootContext, RouteConfig } from '../types';
import { asArray, signal } from '../helpers/utils';
import { BodyParser } from './body-parser';
import { flattenError, ZodObject } from 'zod';
import { BadRequest, InternalServerError } from '../exception/http.exception';
import { Exception } from '../exception';
import { logger } from '../helpers/logger';
import { AuthorizationParser } from './authorization-parser';

export class Processor {
	private readonly rootContext: RootContext;

	private store: Record<string, any> = {};

	private readonly requestUrl: URL;

	private readonly requestHeaders: Record<string, string> = {};

	private readonly requestQuery: Record<string, string> = {};

	private readonly authorizationParser: AuthorizationParser;

	private readonly cookies: Bun.CookieMap;

	private readonly responseHeaders: HeaderBuilder;

	private responseStatus: number = 200;

	constructor(
		private readonly req: BunRequest,
		server: Bun.Server,
		private readonly routeConfig: RouteConfig,
		private readonly middlewares: Middleware[], // initial global middlewares array
		private readonly routeHandler: Handler,
		private readonly errorHandler: ErrorHandler,
	) {
		// instance built-in context helpers
		this.responseHeaders = new HeaderBuilder({ 'Content-Type': 'application/json' });
		this.authorizationParser = new AuthorizationParser(req);
		this.cookies = this.req.cookies;

		this.requestUrl = new URL(this.req.url);

		this.requestQuery = Object.fromEntries(this.requestUrl.searchParams.entries());
		this.requestHeaders = req.headers.toJSON();

		this.rootContext = {
			start: performance.now(),
			request: this.req,
			server,
			url: this.requestUrl,
			ip: server.requestIP(req)?.address ?? 'unknown',
			origin: this.req.headers.get('origin') ?? '',
			bearer: this.authorizationParser.getBearer.bind(this.authorizationParser),
			basicCredentials: this.authorizationParser.getBasicCredentials.bind(this.authorizationParser),
			setHeader: this.responseHeaders.set.bind(this.responseHeaders),
			deleteHeader: this.responseHeaders.delete.bind(this.responseHeaders),
			getResponseHeaders: this.responseHeaders.get.bind(this.responseHeaders),
			getResponseStatus: () => this.responseStatus,
			setCookie: this.cookies.set.bind(this.cookies),
			getCookie: this.cookies.get.bind(this.cookies),
			deleteCookie: this.cookies.delete.bind(this.cookies),
			setStatus: (status: number) => {
				this.responseStatus = status;
			},
			set: (key: string, value: any) => {
				this.store[key] = value;
			},
			get: <T = any>(key: string): T => {
				if (!this.store[key]) throw new InternalServerError(`${key} doesnt exists in store`);
				return this.store[key] as T;
			},
			rawBody: {}, // unparsed yet
		};
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
		const configType = this.routeConfig.type;

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
			this.validate(this.routeConfig.body, this.rootContext.rawBody, 'body'),
			this.validate(this.routeConfig.query, this.requestQuery, 'query'),
			this.validate(this.routeConfig.headers, this.requestHeaders, 'headers'),
		]);

		return {
			...this.rootContext,
			body,
			query,
			params: this.req.params,
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
				headers: this.responseHeaders.get(),
				status: this.responseStatus,
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
			this.middlewares.push(...asArray(this.routeConfig.use));

			// 3- Create functional route chain
			let i = 0;
			const run = async (): Promise<Result> => {
				// global and route middlewares
				const mw = this.middlewares[i++];
				if (mw) return mw({ ...this.rootContext, next: run });
				// route handler
				this.validateContentType(); // if route config includes content-type and is different from request, throws
				const ctx = await this.getHandlerContext(); // validates data and construct the final context
				return this.routeHandler(ctx);
			};

			// 4- Parse and return Response
			return this.createResponse(await run());
		} catch (error) {
			const ex = Exception.parse(error);

			const duration = performance.now() - this.rootContext.start;

			console.error(error); // Log raw Error
			signal('error', this.req.method, this.requestUrl.pathname, ex.status, duration, this.rootContext.ip);

			return this.createErrorResponse(ex);
		}
	}
}
