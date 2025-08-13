import type {
	APIConfig,
	AppConfig,
	ContentType,
	Handler,
	HttpUrlString,
	Method,
	Middleware,
	MethodOpts,
	OnStart,
	Route,
	RouteConfig,
	StaticRoute,
} from './types';
import { Router } from './router';
import z, { ZodObject } from 'zod';
import { defaultAppConfig } from './constants';

export class App {
	private readonly config: AppConfig;

	private routes: Route[] = [];

	private statics: StaticRoute[] = [];

	private globalMiddlewares: Middleware[] = [];

	private onStartTriggers: Record<string, OnStart> = {};

	constructor(opts: Partial<AppConfig> = {}) {
		this.config = { ...defaultAppConfig, ...opts };
	}

	getPrefix() {
		return this.config.prefix;
	}

	getRoutes() {
		return this.routes;
	}

	getStaticRoutes() {
		return this.statics;
	}

	onStart(fn: OnStart, name = 'default') {
		this.onStartTriggers[name] = fn;
		return this;
	}

	getStartupTriggers() {
		return this.onStartTriggers;
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
	use(usable: Middleware | App) {
		if (usable instanceof App) {
			this.routes = this.routes.concat(
				usable.getRoutes().map((child) => ({
					pathParts: [this.getPrefix(), ...child.pathParts],
					method: child.method,
					handler: child.handler,
					config: child.config,
					isProxy: child.isProxy,
				})),
			);

			this.statics = this.statics.concat(
				usable.getStaticRoutes().map((child) => ({
					pathParts: [this.getPrefix(), ...child.pathParts],
					contentOrPath: child.contentOrPath,
					isFile: child.isFile,
					contentType: child.contentType,
				})),
			);

			this.globalMiddlewares = this.globalMiddlewares.concat(usable.globalMiddlewares);

			// Avoid duplication with name index
			this.onStartTriggers = {
				...this.onStartTriggers,
				...usable.getStartupTriggers(),
			};
		} else {
			this.globalMiddlewares.push(usable);
		}

		return this;
	}

	getGlobalMiddlewares() {
		return this.globalMiddlewares;
	}

	private add(
		method: MethodOpts,
		path: string,
		handler: Handler<string>,
		config?: RouteConfig<any, any, any, any>,
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
				pathParts: [this.getPrefix(), path],
				method: m,
				handler,
				config: config ?? {},
				isProxy,
			});

			// if the path includes Bun.serve routes wildcard, add withouth the slash to
			const withWildcard = path.endsWith('/*');
			if (withWildcard) {
				const pathWithouthWildcard = path.replace('/*', '');
				this.routes.push({
					pathParts: [this.getPrefix(), pathWithouthWildcard],
					method: m,
					handler,
					config: config ?? {},
					isProxy,
				});
			}
		}

		return this;
	}

	private createProxyHandler(localPath: string, dest: HttpUrlString): Handler<string> {
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

	/**
	 * Registers a static file to be served at a specific route path.
	 *
	 * ⚡ Performance: Bun caches static paths at server start and serves them via a
	 * zero-overhead fast path (ref {@link https://bun.com/docs/api/http#static-responses}). Middlewares are **not**
	 * invoked for these requests.
	 *
	 * @param path - The request path where the file will be served (relative to the current prefix, if any).
	 * @param filePath - The absolute or relative file system path to the file to serve.
	 * @returns The current instance (for chaining).
	 */
	file(path: string, filePath: string) {
		this.statics.push({
			pathParts: [this.getPrefix(), path],
			contentOrPath: filePath,
			isFile: true,
		});
		return this;
	}

	/**
	 * Registers static string content to be served at a specific route path.
	 *
	 * ⚡ Performance: Bun caches static paths at server start and serves them via a
	 * zero-overhead fast path (ref {@link https://bun.com/docs/api/http#static-responses}). Middlewares are **not**
	 * invoked for these requests.
	 *
	 * @param path - The request path where the content will be served (relative to the current prefix, if any).
	 * @param content - The string content to serve.
	 * @param type - The Content-Type to send with the response.
	 * @returns The current instance (for chaining).
	 */
	static(path: string, content: string, type: ContentType) {
		this.statics.push({
			pathParts: [this.getPrefix(), path],
			contentOrPath: content,
			isFile: false,
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
	>(methods: MethodOpts, path: PATH, handler: Handler<PATH, BODY, QUERY, HEADERS>, config?: RouteConfig<PATH, BODY, QUERY, HEADERS>) {
		return this.add(methods, path, handler, config);
	}

	/** Register a GET route */
	get<PATH extends string = '/', QUERY extends ZodObject | undefined = undefined, HEADERS extends ZodObject | undefined = undefined>(
		path: PATH,
		handler: Handler<PATH, undefined, QUERY, HEADERS>,
		config?: RouteConfig<PATH, undefined, QUERY, HEADERS>,
	) {
		return this.add('GET', path, handler, config);
	}

	/** Register a POST route */
	post<
		PATH extends string = '/',
		BODY extends ZodObject | undefined = undefined,
		QUERY extends ZodObject | undefined = undefined,
		HEADERS extends ZodObject | undefined = undefined,
	>(path: PATH, handler: Handler<PATH, BODY, QUERY, HEADERS>, config?: RouteConfig<PATH, BODY, QUERY, HEADERS>) {
		return this.add('POST', path, handler, config);
	}

	/** Register a PUT route */
	put<
		PATH extends string = '/',
		BODY extends ZodObject | undefined = undefined,
		QUERY extends ZodObject | undefined = undefined,
		HEADERS extends ZodObject | undefined = undefined,
	>(path: PATH, handler: Handler<PATH, BODY, QUERY, HEADERS>, config?: RouteConfig<PATH, BODY, QUERY, HEADERS>) {
		return this.add('PUT', path, handler, config);
	}

	/** Register a PATCH route */
	patch<
		PATH extends string = '/',
		BODY extends ZodObject | undefined = undefined,
		QUERY extends ZodObject | undefined = undefined,
		HEADERS extends ZodObject | undefined = undefined,
	>(path: PATH, handler: Handler<PATH, BODY, QUERY, HEADERS>, config?: RouteConfig<PATH, BODY, QUERY, HEADERS>) {
		return this.add('PATCH', path, handler, config);
	}

	/** Register a DELETE route */
	delete<
		PATH extends string = '/',
		BODY extends ZodObject | undefined = undefined,
		QUERY extends ZodObject | undefined = undefined,
		HEADERS extends ZodObject | undefined = undefined,
	>(path: string, handler: Handler<PATH, BODY, QUERY, HEADERS>, config?: RouteConfig<PATH, BODY, QUERY, HEADERS>) {
		return this.add('DELETE', path, handler, config);
	}

	/** Register a OPTIONS route */
	options<PATH extends string = '/', QUERY extends ZodObject | undefined = undefined, HEADERS extends ZodObject | undefined = undefined>(
		path: string,
		handler: Handler<PATH, undefined, QUERY, HEADERS>,
		config?: RouteConfig<PATH, undefined, QUERY, HEADERS>,
	) {
		return this.add('OPTIONS', path, handler, config);
	}

	/** Register a HEAD route */
	head<PATH extends string = '/', QUERY extends ZodObject | undefined = undefined, HEADERS extends ZodObject | undefined = undefined>(
		path: string,
		handler: Handler<PATH, undefined, QUERY, HEADERS>,
		config?: RouteConfig<PATH, undefined, QUERY, HEADERS>,
	) {
		return this.add('HEAD', path, handler, config);
	}

	/**
	 * Builds the Bun.Server and export it
	 */
	serve(config?: Partial<APIConfig>) {
		const router = new Router(this);
		return router.serve(config ?? undefined);
	}
}
