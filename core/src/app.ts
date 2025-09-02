import type {
	APIConfig,
	ContentType,
	Handler,
	HttpUrlString,
	Method,
	Middleware,
	MethodOpts,
	OnStart,
	Route,
	RouteConfig,
	PathParamsSchema,
} from './types';
import { Router } from './router';
import type { ZodObject } from 'zod';
import { createProxyHandler } from './helpers/proxy';
import { asArray } from './helpers/utils';

export class App {
	#prefix: string = '';
	readonly #tags: string[] = [];
	#hide: boolean = false;

	private readonly routes: Route[] = [];

	private readonly middlewares: Middleware[] = [];

	// global middleware holds all the App instance (bubble up) global middlewares and apply it to all routes on router build
	private globalMiddlewares: Record<string, Middleware> = {};

	private onStartTriggers: Record<string, OnStart> = {};

	prefix(prefix: string) {
		this.#prefix = prefix;
		return this;
	}

	/**
	 * Asign tag(s) to all App routes, to add more dan one:
	 * @example
	 * ```ts
	 * app.tag('tag1').tag('tag2').tag('tag3'); // the 3 tags will be assigned to all the app routes
	 * ```
	 * */
	tag(tag: string) {
		this.#tags.push(tag);
		return this;
	}

	/** Hides all App routes from Openapi */
	hide() {
		this.#hide = true;
		return this;
	}

	getPrefix() {
		return this.#prefix;
	}

	getRoutes() {
		return this.routes;
	}

	onStart(fn: OnStart, name = 'default') {
		this.onStartTriggers[name] = fn;
		return this;
	}

	getStartupTriggers() {
		return this.onStartTriggers;
	}

	getGlobalMiddlewares() {
		return this.globalMiddlewares;
	}

	/**
	 * useGlobal force to apply the middleware in all routes even if is within a child App instance.
	 *
	 * Usefull for create App instance plugin-like solution that includes middlewares and routes, and maybe onStartupTriggers
	 *
	 * **Important** No need to set global middleware at root app, all middlewares in root App instance are global by default.
	 */
	useGlobal(middleware: Middleware, name: string) {
		this.globalMiddlewares[name] = middleware;
		return this;
	}

	/**
	 * Mounts a middleware function or another {@link App} instance onto the current application.
	 *
	 * - If a **Middleware** is provided:
	 *   The function is added to the list of app middlewares. These run for
	 *   every request before route-specific middlewares and handlers.
	 *
	 * - If another **App** instance is provided:
	 *   - All of its routes are merged into the current app, with this app's prefix
	 *     automatically prepended to the child app's route paths.
	 *   - All of its static routes are also merged, with prefixes applied.
	 *   - All of its middlewares are appended to the each child app routes
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
	use(usable: Middleware | App) {
		if (usable instanceof App) {
			for (const child of usable.getRoutes()) {
				// Add child App scoped middleware to route
				if ('config' in child) {
					child.config.use = [...usable.getMiddlewares(), ...asArray(child.config.use)];
				}

				child.pathParts = [this.getPrefix(), ...child.pathParts];
				this.routes.push(child);
			}

			// bubble up global middlewares
			this.globalMiddlewares = {
				...this.globalMiddlewares,
				...usable.getGlobalMiddlewares(),
			};

			// Avoid duplication with name index
			this.onStartTriggers = {
				...usable.getStartupTriggers(),
				...this.onStartTriggers, // father wins
			};
		} else {
			this.middlewares.push(usable);
		}

		return this;
	}

	getMiddlewares() {
		return this.middlewares;
	}

	private add(
		method: MethodOpts,
		path: string,
		handler: Handler<string, any, any, any, any>,
		config?: RouteConfig<any, any, any, any, any>,
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
			// shallow-clone config to avoid repeating middlewares on app mounting on multi method cases
			const cfg: RouteConfig<string, any, any, any> = config ? { ...config, use: asArray(config.use) } : {};

			// App instance openapi settings inheritance
			// Only here in the scoped add() - never in use()
			// Routes inherit tags from App instance
			if (this.#tags.length) cfg.tags = [...this.#tags, ...asArray(cfg.tags)];
			if (this.#hide) cfg.hide = true;

			this.routes.push({
				pathParts: [this.getPrefix(), path],
				method: m,
				handler,
				config: cfg,
			});
		}

		return this;
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
		const ensureWildcard = !localPath.endsWith('/*') ? localPath.concat('/*') : localPath;

		return this.add('*', ensureWildcard, createProxyHandler(localPath, dest), { use, hide: true });
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

		return this.add(method, localPath, createProxyHandler(localPath, dest), config);
	}

	/**
	 * Registers static string or blob (Bun.file) content to be served at a specific route path.
	 *
	 * ⚡ Performance: Bun caches static paths at server start and serves them via a
	 * zero-overhead fast path (ref {@link https://bun.com/docs/api/http#static-responses}). Middlewares are **not**
	 * invoked for these requests.
	 *
	 * @param path - The request path where the content will be served (relative to the current prefix, if any).
	 * @param content - The string content to serve.
	 * @param type - The Content-Type to send with the response
	 * @returns The current instance (for chaining).
	 */
	static(path: string, content: string | Blob, type?: ContentType) {
		// Allways GET
		this.routes.push({
			pathParts: [this.getPrefix(), path],
			content,
			contentType: type,
		});
		return this;
	}

	/** Register route on multiple or all methods (with *) */
	on<
		PATH extends string = '/',
		BODY extends ZodObject | undefined = undefined,
		QUERY extends ZodObject | undefined = undefined,
		HEADERS extends ZodObject | undefined = undefined,
		PARAMS extends PathParamsSchema<PATH> | undefined = undefined,
	>(
		methods: MethodOpts,
		path: PATH,
		handler: Handler<PATH, BODY, QUERY, HEADERS, PARAMS>,
		config?: RouteConfig<PATH, BODY, QUERY, HEADERS, PARAMS>,
	) {
		return this.add(methods, path, handler, config);
	}

	/** Register a GET route */
	get<
		PATH extends string = '/',
		QUERY extends ZodObject | undefined = undefined,
		HEADERS extends ZodObject | undefined = undefined,
		PARAMS extends PathParamsSchema<PATH> | undefined = undefined,
	>(path: PATH, handler: Handler<PATH, undefined, QUERY, HEADERS, PARAMS>, config?: RouteConfig<PATH, undefined, QUERY, HEADERS, PARAMS>) {
		return this.add('GET', path, handler, config);
	}

	/** Register a POST route */
	post<
		PATH extends string = '/',
		BODY extends ZodObject | undefined = undefined,
		QUERY extends ZodObject | undefined = undefined,
		HEADERS extends ZodObject | undefined = undefined,
		PARAMS extends PathParamsSchema<PATH> | undefined = undefined,
	>(path: PATH, handler: Handler<PATH, BODY, QUERY, HEADERS, PARAMS>, config?: RouteConfig<PATH, BODY, QUERY, HEADERS, PARAMS>) {
		return this.add('POST', path, handler, config);
	}

	/** Register a PUT route */
	put<
		PATH extends string = '/',
		BODY extends ZodObject | undefined = undefined,
		QUERY extends ZodObject | undefined = undefined,
		HEADERS extends ZodObject | undefined = undefined,
		PARAMS extends PathParamsSchema<PATH> | undefined = undefined,
	>(path: PATH, handler: Handler<PATH, BODY, QUERY, HEADERS, PARAMS>, config?: RouteConfig<PATH, BODY, QUERY, HEADERS, PARAMS>) {
		return this.add('PUT', path, handler, config);
	}

	/** Register a PATCH route */
	patch<
		PATH extends string = '/',
		BODY extends ZodObject | undefined = undefined,
		QUERY extends ZodObject | undefined = undefined,
		HEADERS extends ZodObject | undefined = undefined,
		PARAMS extends PathParamsSchema<PATH> | undefined = undefined,
	>(path: PATH, handler: Handler<PATH, BODY, QUERY, HEADERS, PARAMS>, config?: RouteConfig<PATH, BODY, QUERY, HEADERS, PARAMS>) {
		return this.add('PATCH', path, handler, config);
	}

	/** Register a DELETE route */
	delete<
		PATH extends string = '/',
		BODY extends ZodObject | undefined = undefined,
		QUERY extends ZodObject | undefined = undefined,
		HEADERS extends ZodObject | undefined = undefined,
		PARAMS extends PathParamsSchema<PATH> | undefined = undefined,
	>(path: PATH, handler: Handler<PATH, BODY, QUERY, HEADERS, PARAMS>, config?: RouteConfig<PATH, BODY, QUERY, HEADERS, PARAMS>) {
		return this.add('DELETE', path, handler, config);
	}

	/** Register a OPTIONS route */
	options<
		PATH extends string = '/',
		QUERY extends ZodObject | undefined = undefined,
		HEADERS extends ZodObject | undefined = undefined,
		PARAMS extends PathParamsSchema<PATH> | undefined = undefined,
	>(path: PATH, handler: Handler<PATH, undefined, QUERY, HEADERS, PARAMS>, config?: RouteConfig<PATH, undefined, QUERY, HEADERS, PARAMS>) {
		return this.add('OPTIONS', path, handler, config);
	}

	/** Register a HEAD route */
	head<
		PATH extends string = '/',
		QUERY extends ZodObject | undefined = undefined,
		HEADERS extends ZodObject | undefined = undefined,
		PARAMS extends PathParamsSchema<PATH> | undefined = undefined,
	>(path: PATH, handler: Handler<PATH, undefined, QUERY, HEADERS, PARAMS>, config?: RouteConfig<PATH, undefined, QUERY, HEADERS, PARAMS>) {
		return this.add('HEAD', path, handler, config);
	}

	/**
	 * Builds the Bun.Server
	 */
	serve(config?: Partial<APIConfig>) {
		const router = new Router(this);
		return router.serve(config ?? undefined);
	}
}
