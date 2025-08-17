import type { Handler, Method, Middleware, MethodOpts, RouteConfig, Route, Rec, Destination } from './types';
import type { ZodObject } from 'zod';
import { buildPath, isUrl } from './helpers/utils';
import { createBindingProxyHandler, createRemoteProxyHandler } from './helpers/proxy';

export class Controller<ENV extends Rec = any, VARS extends Rec = any> {
	readonly #routes: Route[] = [];

	readonly #middlewares: Middleware[] = []; // scoped to this controller routes

	#prefix = '';

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

	use(usable: Middleware<ENV, VARS>) {
		this.#middlewares.push(usable);
		return this;
	}

	getMiddlewares() {
		return this.#middlewares;
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
		}

		return this;
	}

	private createProxyHandler(localPath: string, dest: string): Handler<ENV, VARS, string> {
		if (localPath.endsWith('/**')) localPath = localPath.replace('/**', ''); // remove wildcards after add
		return isUrl(dest) ? createRemoteProxyHandler(localPath, dest) : createBindingProxyHandler(dest);
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
}
