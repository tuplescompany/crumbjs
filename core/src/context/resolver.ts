import { BunRequest } from 'bun';
import { RequestStore } from './request-store';
import { HeaderBuilder } from './header-builder';
import { StatusBuilder } from './status-builder';
import { Context, ErrorHandler, Handler, HandlerResult, Middleware, RequestJournal, RootContext, RouteConfig } from '../types';
import { getStatusText, headersToRecord } from '../utils';
import { parseBody } from '../body-parser';
import { flattenError, ZodObject } from 'zod';
import { BadRequest, InternalServerError } from '../exception/http.exception';
import { Exception } from '../exception';
import { config } from '../config';
import { emptyRequestJournal } from '../constants';

export class ContextResolver {
	private startAt: number;
	private readonly reqStore: RequestStore;
	private readonly resHeaders: HeaderBuilder;
	private readonly cookies: Bun.CookieMap;
	private readonly statusBuilder: StatusBuilder;
	private readonly rootContext: RootContext;

	// Request unmutable data
	private readonly requestUrl: URL;
	private readonly requestHeaders: Record<string, string> = {};
	private readonly requestQuery: Record<string, string> = {};

	/** Black‑box recorder used for structured logs. */
	public journal: RequestJournal = emptyRequestJournal;

	constructor(
		private readonly req: BunRequest,
		server: Bun.Server,
		private readonly routeConfig: RouteConfig<any, any, any, any>,
		private readonly middlewares: Middleware[], // initial global middlewares array
		private readonly routeHandler: Handler<any, any, any, any>,
		private readonly errorHandler: ErrorHandler,
	) {
		this.startAt = performance.now();

		// instance built-in context helpers
		this.reqStore = new RequestStore();
		this.resHeaders = new HeaderBuilder({ 'Content-Type': 'application/json' });
		this.cookies = this.req.cookies;
		this.statusBuilder = new StatusBuilder(200);

		this.rootContext = {
			request: this.req,
			ip: server.requestIP(req)?.address ?? 'unknown',
			origin: this.req.headers.get('origin') ?? '',
			setHeader: this.resHeaders.set.bind(this.resHeaders),
			deleteHeader: this.resHeaders.delete.bind(this.resHeaders),
			setCookie: this.cookies.set.bind(this.cookies),
			getCookie: this.cookies.get.bind(this.cookies),
			deleteCookie: this.cookies.delete.bind(this.cookies),
			setStatus: this.statusBuilder.set.bind(this.statusBuilder),
			set: this.reqStore.set.bind(this.reqStore),
			get: this.reqStore.get.bind(this.reqStore),
			rawBody: {}, // unparsed yet
		};

		this.requestUrl = new URL(this.req.url);
		this.requestQuery = Object.fromEntries(this.requestUrl.searchParams.entries());
		this.requestHeaders = headersToRecord(req.headers);

		this.journal.method = this.req.method.toUpperCase();
		this.journal.path = this.requestUrl.pathname;
		this.journal.ip = this.rootContext.ip;
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
		return this.resHeaders.toObject();
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
				this.journal.request.body = this.rootContext.request.body;
			}
		} catch (error) {
			console.error(`${new Date().toISOString()} parseBody() error:`, error);
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
			this.validate(this.routeConfig.query, this.requestQuery, 'query'),
			this.validate(this.routeConfig.params, this.req.params, 'params'),
			this.validate(this.routeConfig.headers, this.requestHeaders, 'headers'),
		]);

		Object.assign(this.journal.request, { body, query, params, headers, validated: true });

		return {
			...this.rootContext,
			body,
			query,
			params,
			headers,
		};
	}

	private parseResponse(result: HandlerResult) {
		if (result instanceof Response) {
			this.journal.response = {
				status: result.status,
				statusText: result.statusText,
				body: '<raw-response-instance>',
				headers: headersToRecord(result.headers),
			};

			return result;
		}

		const responseBody = typeof result === 'string' || result === null ? result : JSON.stringify(result);

		if (typeof responseBody === 'string' || responseBody === null) {
			const status = this.getBuildedStatus();
			const buildedHeaders = this.getBuildedHeaders();

			this.journal.response = {
				status: status.status,
				statusText: status.statusText ?? getStatusText(status.status),
				body: responseBody,
				headers: headersToRecord(buildedHeaders),
			};

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

			// 3- Define Route Chain
			let index = -1;
			const next = async (): Promise<HandlerResult> => {
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

			// 4- Execute Route Chain
			const res = await next();

			// 5- Parse and return Response
			return this.parseResponse(res);
		} catch (error) {
			const ex = Exception.parse(error);

			this.journal.response = {
				body: ex.toObject(),
				headers: this.getBuildedHeaders(),
				status: ex.status,
				statusText: getStatusText(ex.status),
			};

			this.journal.ex = ex;

			return await this.errorHandler(this.req, ex);
		} finally {
			this.log();
		}
	}

	private log() {
		const duration = performance.now() - this.startAt;
		const now = new Date().toISOString();
		const { method, path, ip, response, ex } = this.journal;
		const logfn = ex ? 'error' : 'log';

		const message = `${now} ${method} ${path}: ${response.status}-${response.statusText} from '${ip}' - ${duration.toFixed(2)} ms`;

		console[logfn](message);

		// Request + Response log on Development mode
		if (config.get('mode') === 'development') {
			console[logfn](`----development:mode printing journal request/response----`);
			console[logfn](`${now} Request ${JSON.stringify(this.journal.request, null, 2)}`);
			console[logfn](`${now} Response ${JSON.stringify(this.journal.response, null, 2)}`);
		}
	}
}
