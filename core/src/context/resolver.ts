import { BunRequest } from 'bun';
import { RequestStore } from './request-store';
import { HeaderBuilder } from './header-builder';
import { StatusBuilder } from './status-builder';
import { Context, ErrorContext, ErrorHandler, Handler, Result, Middleware, RootContext, RouteConfig } from '../types';
import { getStatusText, headersToRecord, signal } from '../utils';
import { parseBody } from '../body-parser';
import { flattenError, ZodObject } from 'zod';
import { BadRequest, InternalServerError } from '../exception/http.exception';
import { Exception } from '../exception';
import { logger } from '../logger';

/** Handy method to create a BunHandler for the specified application route parameters */
export const createHandler =
	(
		routeConfig: RouteConfig<any, any, any, any>,
		middlewares: Middleware[], // initial global middlewares array
		routeHandler: Handler<any, any, any, any>,
		errorHandler: ErrorHandler,
	) =>
	(req: BunRequest, server: Bun.Server) => {
		return new ContextResolver(req, server, routeConfig, middlewares, routeHandler, errorHandler).execute();
	};

export class ContextResolver {
	private readonly rootContext: RootContext;

	private readonly reqStore: RequestStore;

	private readonly reqUrl: URL;

	private readonly reqHeaders: Record<string, string> = {};

	private readonly reqQuery: Record<string, string> = {};

	private readonly cookies: Bun.CookieMap;

	private readonly resHeaders: HeaderBuilder;

	private readonly statusBuilder: StatusBuilder;

	constructor(
		private readonly req: BunRequest,
		server: Bun.Server,
		private readonly routeConfig: RouteConfig<any, any, any, any>,
		private readonly middlewares: Middleware[], // initial global middlewares array
		private readonly routeHandler: Handler<any, any, any, any>,
		private readonly errorHandler: ErrorHandler,
	) {
		// instance built-in context helpers
		this.reqStore = new RequestStore();
		this.resHeaders = new HeaderBuilder({ 'Content-Type': 'application/json' });
		this.cookies = this.req.cookies;
		this.statusBuilder = new StatusBuilder(200);

		this.reqUrl = new URL(this.req.url);
		this.reqQuery = Object.fromEntries(this.reqUrl.searchParams.entries());
		this.reqHeaders = headersToRecord(req.headers);

		this.rootContext = {
			start: performance.now(),
			request: this.req,
			server,
			url: this.reqUrl,
			ip: server.requestIP(req)?.address ?? 'unknown',
			origin: this.req.headers.get('origin') ?? '',
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

	private async validate(schema: any, data: any, part: 'body' | 'query' | 'params' | 'headers') {
		// disable validation for non ZodObject schemas
		if (!(schema instanceof ZodObject)) {
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
	 * Get response headers from Context HeaderBuilder helper
	 */
	private getBuildedHeaders() {
		return this.resHeaders.get();
	}

	/**
	 * Get response status from Context StatusBuilder helper
	 */
	private getBuildedStatus() {
		return this.statusBuilder.get();
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

	private getRootContext() {
		return this.rootContext;
	}

	private async getHandlerContext(): Promise<Context<any, any, any, any>> {
		const [body, query, params, headers] = await Promise.all([
			this.validate(this.routeConfig.body, this.rootContext.rawBody, 'body'),
			this.validate(this.routeConfig.query, this.reqQuery, 'query'),
			this.validate(this.routeConfig.params, this.req.params, 'params'),
			this.validate(this.routeConfig.headers, this.reqHeaders, 'headers'),
		]);

		return {
			...this.rootContext,
			body,
			query,
			params,
			headers,
		};
	}

	private parseResponse(result: Result) {
		if (result instanceof Response) return result;

		const responseBody = typeof result === 'string' || result === null ? result : JSON.stringify(result);

		if (typeof responseBody === 'string' || responseBody === null) {
			const status = this.getBuildedStatus();
			const buildedHeaders = this.getBuildedHeaders();

			return new Response(responseBody, {
				headers: buildedHeaders,
				...status,
			});
		}

		throw new InternalServerError(
			`No result (string, null, object or Response) after execution chain. Did you forget some 'return next()' on middlewares?`,
		);
	}

	async execute() {
		try {
			// 1- safe body parse, on fail will log and set rawBody = {}
			await this.parseBody();
			// 2- add route specific middlewares
			if (this.routeConfig.use) {
				const routeMiddleware = Array.isArray(this.routeConfig.use) ? this.routeConfig.use : [this.routeConfig.use];
				this.middlewares.concat(routeMiddleware);
			}

			// 3- Create functional route chain
			let index = -1;
			const next = async (): Promise<Result> => {
				index++;
				if (index < this.middlewares.length) {
					// a- Execute middleware function
					return await this.middlewares[index]({ ...this.getRootContext(), next });
				} else {
					// b- Validate request content type with configured route type
					this.validateContentType();
					// c- Validate body, headers, params and query and obtain the full handler context
					const handlerContext = await this.getHandlerContext();
					return await this.routeHandler(handlerContext);
				}
			};

			// 4- Parse and return Response
			return this.parseResponse(await next());
		} catch (error) {
			console.error(error); // RAW Error LOG
			const ex = Exception.parse(error);

			const duration = performance.now() - this.rootContext.start;
			signal('error', this.req.method, this.reqUrl.pathname, ex.status, getStatusText(ex.status), duration, this.rootContext.ip);

			const errorContext: ErrorContext = { ...this.rootContext, exception: ex };

			return this.parseResponse(await this.errorHandler(errorContext));
		}
	}
}
