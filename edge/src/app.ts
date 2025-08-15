import type { APIConfig, AppConfig, Handler, HttpUrlString, Method, Middleware, MethodOpts, RouteConfig, Route, Rec } from './types';
import z, { config as ZodConfig, type ZodObject } from 'zod';
import { defaultAppConfig } from './constants';
import { IExecutionContext } from './cloudflare';
import { config } from './config';
import { logger } from './logger';
import { getModeLogLevel } from './utils';
import { TrieRouter } from './tie-router';
import { Processor } from './processor';
import { es, en, pt } from 'zod/locales';
import { openapi } from './openapi/openapi';

export class App<ENV extends Rec = any, VARS extends Rec = any> {
	private readonly config: AppConfig;

	private readonly routes: Route[] = [];

	private readonly globalMiddlewares: Middleware[] = [];

	// Holder for 1 time-per-isolate TrieRouter creation
	private router: TrieRouter | null = null;

	// Holder for 1 time-per-isolate notFoundHandler Processor creation
	private notFoundProcessor: Processor | null = null;

	// stablish if Api configuration was already handled in this isolate
	private configSealed = false;

	// stablish if Openapi was already builded in this isolate
	private openapiSealed = false;

	fetch: (request: Request, env: ENV, ctx: IExecutionContext) => Response | Promise<Response>;

	constructor(opts: Partial<AppConfig> = {}) {
		this.config = { ...defaultAppConfig, ...opts };
		this.fetch = this.handle.bind(this);
	}

	getPrefix() {
		return this.config.prefix;
	}

	getRoutes() {
		return this.routes;
	}

	/**
	 * Mounts a middleware function or another {@link App} instance onto the current application.
	 *
	 * - If a **Middleware** is provided:
	 *   The function is added to the list of global middlewares. These run for
	 *   every request before route-specific middlewares and handlers.
	 *
	 * - If another **App** instance is provided:
	 *   - All of its routes are merged into the current app, with this app's prefix
	 *     automatically prepended to the child app's route paths.
	 *   - All of its static routes are also merged, with prefixes applied.
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
	 *   - Another {@link App} instance whose routes, statics, middlewares,
	 *     and startup triggers will be merged into this one.
	 *
	 * @returns The current {@link App} instance for chaining.
	 *
	 * @example
	 * // Mount a global middleware
	 * app.use(loggerMiddleware);
	 *
	 * // Mount a sub-application with its own routes
	 * app.use(apiApp);
	 */
	use(usable: Middleware<ENV, VARS> | App) {
		if (usable instanceof App) {
			for (const child of usable.getRoutes()) {
				this.add(child.method, child.path, child.handler, child.config, child.isProxy);
			}

			this.globalMiddlewares.push(...usable.getGlobalMiddlewares());
		} else {
			this.globalMiddlewares.push(usable);
		}

		return this;
	}

	getGlobalMiddlewares() {
		return this.globalMiddlewares;
	}

	/**
	 * Normalizes and joins multiple path segments into a clean, well-formed URL path.
	 *
	 * - Trims each segment and removes empty fragments.
	 * - Splits on slashes to support nested paths.
	 * - Ensures the final path starts with a single '/' and contains no duplicate slashes.
	 *
	 * Useful for dynamically composing route paths in a consistent and safe way.
	 */
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

	private add(
		method: MethodOpts,
		path: string,
		handler: Handler<ENV, VARS, string>,
		config?: RouteConfig<ENV, VARS, string, any, any, any>,
		isProxy: boolean = false,
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
			this.routes.push({
				path: this.buildPath(this.getPrefix(), path),
				method: m,
				handler,
				config: config ?? {},
				isProxy,
			});
		}

		return this;
	}

	private createProxyHandler(localPath: string, dest: HttpUrlString): Handler<ENV, VARS, string> {
		if (!z.url().safeParse(dest).success) throw Error(`Invalid proxy foward URL: '${dest}'`);

		return async ({ request, url }) => {
			// Remove local path from fowardPath
			if (localPath.endsWith('/*')) {
				localPath = localPath.replace('/*', '');
			}

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
	}

	/**
	 * Fowards all the trafic from the localPath to dest url.
	 * OpenAPI + validation are **disabled** for these routes. But you still can use middleware(s)
	 *
	 * Behavior:
	 * - Same forwarding rules as `proxy` (prefix handling, headers/body streaming).
	 * - Registers the route as openapi-hidden (`{ hide: true }`).
	 *
	 * @param methods   HTTP method(s) or `'*'` for all.
	 * @param localPath Local mount point with all subtrees.
	 * @param dest      Upstream base URL.
	 *
	 * @example
	 * proxyAll('/v1', 'https://api.example.com'); // eg. '/v1/auth' will be fowarded to
	 * proxyAll('/v2', 'https://new-api.example.com'); // eg. '/v2/orders' will be fowarded to
	 */
	proxyAll(localPath: string, dest: HttpUrlString, use?: Middleware | Middleware[]) {
		// ensure wildcard path
		if (!localPath.endsWith('/*')) localPath = localPath.concat('/*');

		return this.add('*', localPath, this.createProxyHandler(localPath, dest), { use, hide: true }, true);
	}

	/**
	 * Mount a transparent route-2-route proxy, keeping route config (with optional validation + OpenAPI) intact.
	 *
	 * Behavior:
	 * - If `localPath` ends with `/*`, will thrown an error (route-2-route cannot use /* wildcard)
	 * - Forwards method, path, query, headers, and body.
	 * - Strips hop-by-hop headers; forces `Accept-Encoding: identity`.
	 * - Streams request/response; recalculates length/encoding headers.
	 *
	 * @param method    One HTTP method (e.g. 'GET').
	 * @param localPath Local mount point (`/*` proxies a subtree).
	 * @param dest      Upstream base URL (e.g. https://api.example.com).
	 * @param config    Route config (middlewares, validation, OpenAPI).
	 *
	 * @example
	 * proxy('POST', '/auth', 'https://auth-ms.example.com/v1/auth', { body: authSchema });
	 */
	proxy(method: Method, localPath: string, dest: HttpUrlString, config?: RouteConfig<any, any, any, any>) {
		if (localPath.endsWith('/*')) {
			const suggestPath = localPath.replace('/*', '');
			const proxyAllExample = `app.proxyAll('${suggestPath}', '${dest}', middlewares)`;
			throw new Error(
				`Invalid path '${localPath}': single-method proxy cannot use '/*'. Use '${suggestPath}' for exact match, or use '${proxyAllExample}' for prefix forwarding.`,
			);
		}
		return this.add(method, localPath, this.createProxyHandler(localPath, dest), config, true);
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

	overrideApiConfig(opts?: Partial<APIConfig>) {
		if (opts) config.merge(opts);
	}

	/**
	 * build trie router if still null (as when app is created)
	 */
	private getRouter() {
		this.router ??= new TrieRouter(this.getRoutes());
		return this.router;
	}

	/**
	 * Cloudflare case: the config merge and set will run only once per isolate
	 * @param env
	 */
	private sealConfig(env: ENV) {
		if (!this.configSealed) {
			config.mergeEnv(env); // Initialice config by env
			logger.setLevel(getModeLogLevel(config.get('mode')));

			if (config.get('locale') !== 'en') {
				const langs = { es, en, pt };
				const appLocale = config.get('locale');
				ZodConfig(langs[appLocale]());
			}

			logger.debug(`🈯 Locale set to: ${config.get('locale')}`);
			this.configSealed = true;
		}
	}

	private sealOpenapi() {
		if (!this.openapiSealed) {
			// build openapi documentation and register routes
			const { withOpenapi, openapiBasePath, openapiUi } = config.all();

			if (withOpenapi) {
				for (const route of this.getRoutes()) {
					const { path, method, config: routeConfig } = route;

					if (!routeConfig.hide) {
						openapi.addRoute({
							method: method.toLowerCase() as Lowercase<Method>,
							path: path,
							mediaType: routeConfig.type ?? 'application/json',
							body: 'body' in routeConfig ? routeConfig.body : undefined,
							query: routeConfig.query,
							header: routeConfig.headers,
							params: routeConfig.params,
							responses: routeConfig.responses,
							tags: routeConfig.tags ?? ['Uncategorized'],
							description: routeConfig.description,
							summary: routeConfig.summary,
							authorization: routeConfig.authorization,
							operationId: routeConfig.operationId,
						});
					}
				}

				const documentPath = this.buildPath(openapiBasePath, '/doc.json');
				const openapiUiPath = this.buildPath(openapiBasePath);

				this.add('GET', documentPath, () => Response.json(openapi.getSpec()), { hide: true });
				this.add(
					'GET',
					openapiUiPath,
					() =>
						new Response(openapi[openapiUi](documentPath), {
							headers: {
								'Content-Type': 'text/html',
							},
						}),
					{ hide: true },
				);

				logger.debug(`📘 GET ${documentPath} Registered (static)`);
				logger.debug(`📘 GET ${openapiUiPath} Registered (static)`);
			}

			this.openapiSealed = true;
		}
	}

	/**
	 * Creates a notFoundProcessor once-per-isolate,
	 * This works like any other application route handlers with middlewares
	 * Logs the 404 error via `signal()` and delegates the response to the `notFoundHandler` defined in the config.
	 */
	private async notFound(request: Request, env: ENV, ctx: IExecutionContext, url: URL) {
		this.notFoundProcessor ??= new Processor(
			request,
			env,
			ctx,
			url, // inherit to avoid parsing twice, only once at app.handle()
			{},
			{},
			(c) => {
				return config.get('notFoundHandler')(c);
			},
			this.getGlobalMiddlewares(),
			config.get('notFoundHandler'),
		);

		return this.notFoundProcessor.execute();
	}

	private async handle(request: Request, env: ENV, ctx: IExecutionContext): Promise<Response> {
		this.sealConfig(env);
		this.sealOpenapi();

		const url = new URL(request.url);

		const router = this.getRouter();
		const result = router.match(request.method.toUpperCase() as Method, url.pathname);

		if (!result) return this.notFound(request, env, ctx, url);

		const processor = new Processor(
			request,
			env,
			ctx,
			url,
			result.params,
			result.config,
			result.handler,
			this.getGlobalMiddlewares(),
			config.get('errorHandler'),
		);

		return processor.execute();
	}
}
