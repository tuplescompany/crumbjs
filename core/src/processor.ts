import { BunRequest } from 'bun';
import { RequestStore } from './context/request-store';
import { HeaderBuilder } from './context/header-builder';
import { StatusBuilder } from './context/status-builder';
import { Context, ErrorHandler, Handler, Result, Middleware, RootContext, RouteConfig } from './types';
import { getStatusText, signal } from './utils';
import { parseBody } from './body-parser';
import { flattenError, ZodObject } from 'zod';
import { BadRequest, InternalServerError } from './exception/http.exception';
import { Exception } from './exception';
import { logger } from './logger';
import { AuthorizationParser } from './context/authorization-parser';

export class Processor {
	private readonly rootContext: RootContext;

	private readonly reqStore: RequestStore;

	private readonly reqUrl: URL;

	private readonly reqHeaders: Record<string, string> = {};

	private readonly reqQuery: Record<string, string> = {};

	private readonly authorizationParser: AuthorizationParser;

	private readonly cookies: Bun.CookieMap;

	private readonly resHeaders: HeaderBuilder;

	private readonly statusBuilder: StatusBuilder;

	constructor(
		private readonly req: BunRequest,
		server: Bun.Server,
		private readonly routeConfig: RouteConfig,
		private readonly middlewares: Middleware[], // initial global middlewares array
		private readonly routeHandler: Handler,
		private readonly errorHandler: ErrorHandler,
	) {
		// instance built-in context helpers
		this.reqStore = new RequestStore();
		this.resHeaders = new HeaderBuilder({ 'Content-Type': 'application/json' });
		this.statusBuilder = new StatusBuilder(200);
		this.authorizationParser = new AuthorizationParser(req);
		this.cookies = this.req.cookies;

		this.reqUrl = new URL(this.req.url);

		this.reqQuery = Object.fromEntries(this.reqUrl.searchParams.entries());
		this.reqHeaders = req.headers.toJSON();

		this.rootContext = {
			start: performance.now(),
			request: this.req,
			server,
			url: this.reqUrl,
			ip: server.requestIP(req)?.address ?? 'unknown',
			origin: this.req.headers.get('origin') ?? '',
			bearer: this.authorizationParser.getBearer.bind(this.authorizationParser),
			basicCredentials: this.authorizationParser.getBasicCredentials.bind(this.authorizationParser),
			setHeader: this.resHeaders.set.bind(this.resHeaders),
			deleteHeader: this.resHeaders.delete.bind(this.resHeaders),
			getResponseHeaders: this.resHeaders.get.bind(this.resHeaders),
			setCookie: this.cookies.set.bind(this.cookies),
			getCookie: this.cookies.get.bind(this.cookies),
			deleteCookie: this.cookies.delete.bind(this.cookies),
			setStatus: this.statusBuilder.set.bind(this.statusBuilder),
			getResponseStatus: this.statusBuilder.get.bind(this.statusBuilder),
			set: this.reqStore.set.bind(this.reqStore),
			get: this.reqStore.get.bind(this.reqStore),
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
	 * Safe-parse body according his content-type
	 */
	private async parseBody() {
		try {
			if (this.req.method !== 'GET' && this.req.method !== 'HEAD') {
				this.rootContext.rawBody = await parseBody(this.req);
			}
		} catch (error) {
			// border, this should never happen
			logger.error('parseBody() fails', error);
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
			this.validate(this.routeConfig.query, this.reqQuery, 'query'),
			this.validate(this.routeConfig.headers, this.reqHeaders, 'headers'),
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
				headers: this.resHeaders.get(),
				...this.statusBuilder.get(),
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
			if (this.routeConfig.use) {
				const m = Array.isArray(this.routeConfig.use) ? this.routeConfig.use : [this.routeConfig.use];
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
				return this.routeHandler(ctx);
			};

			// 4- Parse and return Response
			return this.createResponse(await run());
		} catch (error) {
			console.error(error); // Log raw Error

			const ex = Exception.parse(error);

			const duration = performance.now() - this.rootContext.start;
			signal('error', this.req.method, this.reqUrl.pathname, ex.status, getStatusText(ex.status), duration, this.rootContext.ip);

			return this.createErrorResponse(ex);
		}
	}
}
