import type { Handler, Method, Middleware, MethodOpts, RouteConfig, Route, Rec, ErrorHandler, NotFoundHandler, Destination } from './types';
import { config as ZodConfig, type ZodObject } from 'zod';
import { defaultErrorHandler, defaultNotFoundHandler } from './constants';
import { DefaultExecutionContext, IFetcher, type IExecutionContext } from './cloudflare/types';
import { Config } from './config';
import { logger } from './helpers/logger';
import { buildPath, getModeLogLevel, isUrl } from './helpers/utils';
import { Processor } from './processor/processor';
import { addRoute, createRouter, findRoute, type RouterContext as Rou3Context } from './rou3';
import { InternalServerError } from './exception/http.exception';
import { buildAppRegistry } from './helpers/app-openapi';
import { es, en, pt } from 'zod/locales';

export class App<ENV extends Rec = any, VARS extends Rec = any> {
	readonly #routes: Route[] = [];

	readonly #globalMiddlewares: Middleware[] = [];

	#prefix = '';

	// Holder for 1 time-per-isolate #notFoundHandler Processor creation
	#notFoundProcessor: Processor | null = null;

	// stablish if Api configuration was already handled in the current isolate
	#configSettled = false;

	// stablish if Openapi was already builded in the current isolate
	#openapiSettled = false;

	/** The H3/Nitro radix trie router */
	readonly #rou3: Rou3Context<Route>;

	readonly #config: Config;

	/** The global application error handler */
	#errorHandler: ErrorHandler<ENV, VARS>;

	/** The global application not found handler */
	#notFoundHandler: NotFoundHandler<ENV, VARS>;

	fetch: (request: Request, env: ENV, ctx?: IExecutionContext) => Response | Promise<Response>;

	constructor() {
		this.#config = new Config();
		this.#rou3 = createRouter();
		this.#errorHandler = defaultErrorHandler;
		this.#notFoundHandler = defaultNotFoundHandler;
		this.fetch = this.request.bind(this);
	}

	prefix(prefix: string) {
		this.#prefix = prefix;
		return this;
	}

	getPrefix() {
		return this.#prefix;
	}

	getRoutes() {
		return this.#routes;
	}

	/**
	 * Set the handler for errors in the chain
	 *
	 * Default:
	 * ```ts
	 * ({ setStatus, exception }) => {
	 *  setStatus(exception.status);
	 *  return exception.toObject();
	 * },
	 * ```
	 */
	onError(handler: ErrorHandler<ENV, VARS>) {
		this.#errorHandler = handler;
	}

	/**
	 * Set the handler for unmatched #routes (404).
	 *
	 * Default:
	 * ```ts
	 * ({ setStatus, setHeader }) => {
	 *		setStatus(404);
	 *		setHeader('Content-Type', 'text/plain');
	 *		return '';
	 * }
	 * ```
	 */
	onNotFound(handler: NotFoundHandler<ENV, VARS>) {
		this.#notFoundHandler = handler;
	}

	/**
	 * Mounts a middleware function or another {@link App} instance onto the current application.
	 *
	 * - If a **Middleware** is provided:
	 *   The function is added to the list of global middlewares. These run for
	 *   every request before route-specific middlewares and handlers.
	 *
	 * - If another **App** instance is provided:
	 *   - All of its #routes are merged into the current app, with this app's prefix
	 *     automatically prepended to the child app's route paths.
	 *   - All of its static #routes are also merged, with prefixes applied.
	 *   - All of its global middlewares are appended to the current app's
	 *     global middleware chain.
	 *   - Its `onStart` triggers are merged into the current app's triggers
	 *     (overwriting by name to avoid duplication).
	 *
	 * This method is useful for:
	 * - Composing large applications from smaller sub-apps (modular architecture).
	 * - Sharing reusable route/middleware groups across projects.
	 * - Applying global cross-cutting middleware.
	 *
	 * @param usable - Either:
	 *   - A {@link Middleware} function to run on every request.
	 *   - Another {@link App} instance whose #routes, statics, middlewares,
	 *     and startup triggers will be merged into this one.
	 *
	 * @returns The current {@link App} instance for chaining.
	 *
	 * @example
	 * // Mount a global middleware
	 * app.use(loggerMiddleware);
	 *
	 * // Mount a sub-application with its own #routes
	 * app.use(apiApp);
	 */
	use(usable: Middleware<ENV, VARS> | App) {
		if (usable instanceof App) {
			for (const child of usable.getRoutes()) {
				this.add(child.method, child.path, child.handler, child.config);
			}

			this.#globalMiddlewares.push(...usable.getGlobalMiddlewares());
		} else {
			this.#globalMiddlewares.push(usable);
		}

		return this;
	}

	getGlobalMiddlewares() {
		return this.#globalMiddlewares;
	}

	private add(
		method: MethodOpts,
		path: string,
		handler: Handler<ENV, VARS, string>,
		config?: RouteConfig<ENV, VARS, string, any, any, any>,
	) {
		let methods: Method[];

		if (Array.isArray(method)) {
			methods = method;
		} else if (method === '*') {
			methods = ['POST', 'GET', 'DELETE', 'PATCH', 'PUT', 'OPTIONS', 'HEAD'] as Method[];
		} else {
			methods = [method];
		}

		for (const m of methods) {
			const joinPath = buildPath(this.getPrefix(), path);

			const route = {
				path: joinPath,
				method: m,
				handler,
				config: config ?? {},
			};

			this.#routes.push(route);

			// add route to the #rou3 instance
			addRoute(this.#rou3, m, joinPath, route);
		}

		return this;
	}

	private createProxyHandler(localPath: string, dest: string): Handler<ENV, VARS, string> {
		if (localPath.endsWith('/**'))
			// clean local path wildacards
			localPath = localPath.replace('/**', '');

		if (isUrl(dest)) {
			return async ({ request, url }) => {
				// Remove local path from fowardPath
				const fowardPath = url.pathname.replace(localPath, '');
				const targetUrl = new URL(fowardPath + url.search, dest);

				// Remove hop-by-hop problematic (to foward) headers
				const fowardHeaders = new Headers(request.headers);
				for (const h of [
					'host',
					'connection',
					'keep-alive',
					'proxy-connection',
					'transfer-encoding',
					'upgrade',
					'te',
					'trailers',
					'proxy-authenticate',
					'proxy-authorization',
					'content-length',
					'accept-encoding',
				]) {
					fowardHeaders.delete(h);
				}
				// dont auto-encode
				fowardHeaders.set('accept-encoding', 'identity');

				const hasBody = !['GET', 'HEAD', 'OPTIONS'].includes(request.method);
				const fowardBody = hasBody ? request.body : undefined;

				// Forward request to target
				const upstream = await fetch(targetUrl, { method: request.method, headers: fowardHeaders, body: fowardBody });

				const respHeaders = new Headers(upstream.headers);
				for (const h of ['content-encoding', 'content-length', 'transfer-encoding']) respHeaders.delete(h);

				return new Response(upstream.body, {
					status: upstream.status,
					statusText: upstream.statusText,
					headers: respHeaders,
				});
			};
		} else {
			return ({ request, env }) => {
				// Check if dest index is a Fetcher instance in env
				if ('fetch' in env.dest) {
					const fetcher = env.dest as IFetcher;
					return fetcher.fetch(request);
				}

				throw new InternalServerError(`'${dest}' is not an available Fetcher instance in env`);
			};
		}
	}

	/**
	 * Fowards all the trafic from the localPath to dest url.
	 * OpenAPI + validation are **disabled** for these #routes. But you still can use middleware(s)
	 *
	 * Behavior:
	 * - Same forwarding rules as `proxy` (prefix handling, headers/body streaming).
	 * - Registers the route as openapi-hidden (`{ hide: true }`).
	 *
	 * @param methods   HTTP method(s) or `'*'` for all.
	 * @param localPath Local mount point with all subtrees.
	 * @param dest      Upstream base URL or Fetcher index in env (cloudflare service binding)
	 *
	 * @example
	 * proxyAll('/v1', 'https://api.example.com', loggerMiddleware); // eg. '/v1/auth' will be also fowarded
	 * proxyAll('/v2', 'https://new-api.example.com'); // eg. '/v2/orders' will be also fowarded
	 * proxyAll('/v3', 'AUTH_SERVICE'); // AUTH_SERVICE is an Fetcher instance binded at env
	 */
	proxyAll(localPath: string, dest: Destination<ENV>, use?: Middleware | Middleware[]) {
		// ensure wildcard path for rou3, at handler level will be removed
		if (!localPath.endsWith('/**')) localPath = localPath.concat('/**');

		return this.add('*', localPath, this.createProxyHandler(localPath, dest), { use, hide: true });
	}

	/**
	 * Mount a transparent route-2-route proxy, keeping route #config (with optional validation + OpenAPI) intact.
	 *
	 * Behavior:
	 * - If `localPath` ends with `/*`, will thrown an error (route-2-route cannot use /* wildcard)
	 * - Forwards method, path, query, headers, and body.
	 * - Strips hop-by-hop headers; forces `Accept-Encoding: identity`.
	 * - Streams request/response; recalculates length/encoding headers.
	 *
	 * @param method    One HTTP method (e.g. 'GET').
	 * @param localPath Local mount point (`/*` proxies a subtree).
	 * @param dest      Upstream base URL or Fetcher index in env (cloudflare service binding) autodect indexes if ENV is set
	 * @param config    Route config (middlewares, validation, OpenAPI).
	 *
	 * @example
	 * proxy('POST', '/auth', 'https://auth-ms.example.com/v1/auth', { body: authSchema });
	 * proxy('POST', '/auth', 'AUTH_SERVICE', { body: authSchema }); // AUTH_SERVICE is an Fetcher instance binded at env
	 */
	proxy(method: Method, localPath: string, dest: Destination<ENV>, config?: RouteConfig<any, any, any, any>) {
		if (localPath.endsWith('/**')) {
			const suggestPath = localPath.replace('/**', '');
			const proxyAllExample = `app.proxyAll('${suggestPath}', dest, middlewares)`;
			throw new Error(
				`Invalid path '${localPath}': single-method proxy cannot use '/**'. Use '${suggestPath}' for exact match, or use '${proxyAllExample}' for prefix forwarding.`,
			);
		}
		return this.add(method, localPath, this.createProxyHandler(localPath, dest), config);
	}

	/** Register route on multiple or all methods (with *) */
	on<
		PATH extends string = '/',
		BODY extends ZodObject | undefined = undefined,
		QUERY extends ZodObject | undefined = undefined,
		HEADERS extends ZodObject | undefined = undefined,
	>(
		methods: MethodOpts,
		path: PATH,
		handler: Handler<ENV, VARS, PATH, BODY, QUERY, HEADERS>,
		config?: RouteConfig<ENV, VARS, PATH, BODY, QUERY, HEADERS>,
	) {
		return this.add(methods, path, handler, config);
	}

	/** Register a GET route */
	get<PATH extends string = '/', QUERY extends ZodObject | undefined = undefined, HEADERS extends ZodObject | undefined = undefined>(
		path: PATH,
		handler: Handler<ENV, VARS, PATH, undefined, QUERY, HEADERS>,
		config?: RouteConfig<ENV, VARS, PATH, undefined, QUERY, HEADERS>,
	) {
		return this.add('GET', path, handler, config);
	}

	/** Register a POST route */
	post<
		PATH extends string = '/',
		BODY extends ZodObject | undefined = undefined,
		QUERY extends ZodObject | undefined = undefined,
		HEADERS extends ZodObject | undefined = undefined,
	>(path: PATH, handler: Handler<ENV, VARS, PATH, BODY, QUERY, HEADERS>, config?: RouteConfig<ENV, VARS, PATH, BODY, QUERY, HEADERS>) {
		return this.add('POST', path, handler, config);
	}

	/** Register a PUT route */
	put<
		PATH extends string = '/',
		BODY extends ZodObject | undefined = undefined,
		QUERY extends ZodObject | undefined = undefined,
		HEADERS extends ZodObject | undefined = undefined,
	>(path: PATH, handler: Handler<ENV, VARS, PATH, BODY, QUERY, HEADERS>, config?: RouteConfig<ENV, VARS, PATH, BODY, QUERY, HEADERS>) {
		return this.add('PUT', path, handler, config);
	}

	/** Register a PATCH route */
	patch<
		PATH extends string = '/',
		BODY extends ZodObject | undefined = undefined,
		QUERY extends ZodObject | undefined = undefined,
		HEADERS extends ZodObject | undefined = undefined,
	>(path: PATH, handler: Handler<ENV, VARS, PATH, BODY, QUERY, HEADERS>, config?: RouteConfig<ENV, VARS, PATH, BODY, QUERY, HEADERS>) {
		return this.add('PATCH', path, handler, config);
	}

	/** Register a DELETE route */
	delete<
		PATH extends string = '/',
		BODY extends ZodObject | undefined = undefined,
		QUERY extends ZodObject | undefined = undefined,
		HEADERS extends ZodObject | undefined = undefined,
	>(path: string, handler: Handler<ENV, VARS, PATH, BODY, QUERY, HEADERS>, config?: RouteConfig<ENV, VARS, PATH, BODY, QUERY, HEADERS>) {
		return this.add('DELETE', path, handler, config);
	}

	/** Register a OPTIONS route */
	options<PATH extends string = '/', QUERY extends ZodObject | undefined = undefined, HEADERS extends ZodObject | undefined = undefined>(
		path: string,
		handler: Handler<ENV, VARS, PATH, undefined, QUERY, HEADERS>,
		config?: RouteConfig<ENV, VARS, PATH, undefined, QUERY, HEADERS>,
	) {
		return this.add('OPTIONS', path, handler, config);
	}

	/** Register a HEAD route */
	head<PATH extends string = '/', QUERY extends ZodObject | undefined = undefined, HEADERS extends ZodObject | undefined = undefined>(
		path: string,
		handler: Handler<ENV, VARS, PATH, undefined, QUERY, HEADERS>,
		config?: RouteConfig<ENV, VARS, PATH, undefined, QUERY, HEADERS>,
	) {
		return this.add('HEAD', path, handler, config);
	}

	/**
	 * Merge env to config instance, set locale and debug level
	 * @param env
	 */
	private configure(env: ENV) {
		this.#config.mergeEnv(env); // Initialice #config by env
		logger.setLevel(getModeLogLevel(this.#config.get('mode')));

		if (this.#config.get('locale') !== 'en') {
			const langs = { es, en, pt };
			const appLocale = this.#config.get('locale');
			ZodConfig(langs[appLocale]());
		}

		logger.debug(`🈯 Locale set to: ${this.#config.get('locale')}`);
		this.#configSettled = true;
	}

	/**
	 * If config withOpenapi = true
	 * this method generates openapi specification based on this app routes and config
	 * adds two routes for the json document and the swagger/scallar UI
	 */
	private document() {
		buildAppRegistry(this, this.#config);
		this.#openapiSettled = true;
	}

	/**
	 * Creates a #notFoundProcessor once-per-isolate,
	 * This works like any other application route handlers with middlewares
	 * Logs the 404 error via `signal()` and delegates the response to the `#notFoundHandler` defined in the #config.
	 */
	private async notFound(request: Request, env: ENV, ctx: IExecutionContext, url: URL) {
		this.#notFoundProcessor ??= new Processor(
			request,
			env,
			ctx,
			url, // inherit to avoid parsing twice, only once at app.handle()
			{},
			{},
			this.#notFoundHandler,
			this.getGlobalMiddlewares(),
			this.#errorHandler,
		);

		return this.#notFoundProcessor.execute();
	}

	private match(method: string, path: string) {
		const matched = findRoute(this.#rou3, method, path);

		if (!matched) return false;

		return {
			route: matched.data,
			params: matched.params ?? {},
		};
	}

	async request(request: Request, env: ENV, ctx?: IExecutionContext): Promise<Response> {
		ctx = ctx ?? new DefaultExecutionContext();

		if (!this.#configSettled) this.configure(env);
		if (!this.#openapiSettled) this.document();

		const url = new URL(request.url);

		const match = this.match(request.method.toUpperCase(), url.pathname);

		if (!match) return this.notFound(request, env, ctx, url);

		const processor = new Processor(
			request,
			env,
			ctx,
			url,
			match.params,
			match.route.config,
			match.route.handler,
			this.getGlobalMiddlewares(),
			this.#errorHandler,
		);

		return processor.execute();
	}
}
