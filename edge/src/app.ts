import type { Middleware, Route, Rec, ErrorHandler, NotFoundHandler, OnClose } from './types';
import { config as ZodConfig } from 'zod';
import { defaultErrorHandler, defaultNotFoundHandler } from './constants';
import { DefaultExecutionContext, type IExecutionContext } from './cloudflare/types';
import { Config } from './config';
import { logger } from './helpers/logger';
import { asArray, buildPath, getModeLogLevel } from './helpers/utils';
import { Processor } from './processor/processor';
import { addRoute, createRouter, findRoute, type RouterContext as Rou3Context } from './rou3';
import { buildAppRegistry } from './helpers/app-openapi';
import { es, en, pt } from 'zod/locales';
import { Controller } from './controller';
import { Stack } from './stack';

export class App<ENV extends Rec = any, VARS extends Rec = any> {
	readonly #routes: Route[] = [];

	readonly #globalMiddlewares: Middleware[] = [];

	#prefix = '';

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

	#onClose: OnClose | false = false;

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
	 * @default
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
	 * @default
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
	 * Register a callback to run **after** the request was fully handled by {@link Processor}
	 * and the response was sent to the client.
	 *
	 * The callback receives a {@link ResolvedContext} with:
	 * - RootContext			– app/runtime primitives
	 * - Context				– per-request data (params, headers, etc.)
	 * - `result`: Result		– raw value returned by the handler
	 * - `response`: Response	– normalized HTTP response object
	 *
	 * Typical use cases:
	 * - Gracefully close DB/queue connections after all background tasks settle
	 * - Emit metrics/traces or persist audit logs with full request/response
	 * - Fire-and-forget side effects that must not affect the user’s response
	 *
	 * Notes:
	 * - Runs in the background (via `IExecutionContext.waitUntil`).
	 * - The response is already sent; this hook **cannot** modify it.
	 * - Prefer idempotent logic and handle errors internally (don’t throw).
	 *
	 * @param action - Callback invoked on completion.
	 * @returns this (for chaining)
	 */
	onClose(action: OnClose) {
		this.#onClose = action;
		return this;
	}

	/**
	 * Mounts a middleware function or a controller {@link Controller}
	 *
	 * - If a **Middleware** is provided:
	 *   The function is added to the list of global middlewares. These run for
	 *   every request before route-specific middlewares and handlers.
	 *
	 * - If a **Controller** is provided:
	 *   - All of its #routes are merged into the current app, with this app's prefix
	 *     automatically prepended to the child app's route paths.
	 *   - All of its middlewares are appended to the Controller routes only
	 *
	 * @param usable - {@link Middleware} | {@link Controller}
	 * @example
	 * // Mount a global middleware
	 * app.use(loggerMiddleware);
	 * app.use(authController);
	 */
	use(usable: Middleware<ENV, VARS> | Controller) {
		if (usable instanceof Controller) {
			this.addController(usable);
		} else {
			this.#globalMiddlewares.push(usable);
		}

		return this;
	}

	private addController(ctrl: Controller) {
		for (const route of ctrl.getRoutes()) {
			// Add controller scoped middleware to route
			route.config.use = [...ctrl.getMiddlewares(), ...asArray(route.config.use)];
			route.path = buildPath(this.getPrefix(), route.path);
			this.#routes.push(route);
			addRoute(this.#rou3, route.method, route.path, route);

			console.log(`Route registered: ${route.method} ${route.path}`);
		}
		return this;
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
	 * this method generates openapi specification based on all controllers routes and config
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
	private async notFound(request: Request, env: ENV, stack: Stack, url: URL) {
		return new Processor(
			request,
			env,
			stack,
			url, // inherit to avoid parsing twice, only once at app.handle()
			{},
			{},
			this.#notFoundHandler,
			this.#globalMiddlewares,
			this.#errorHandler,
		).execute();
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

		const stack = new Stack(ctx, this.#onClose);

		if (!this.#configSettled) this.configure(env);
		if (!this.#openapiSettled) this.document();

		const url = new URL(request.url);

		const match = this.match(request.method.toUpperCase(), url.pathname);

		if (!match) return this.notFound(request, env, stack, url);

		const processor = new Processor(
			request,
			env,
			stack,
			url,
			match.params,
			match.route.config,
			match.route.handler,
			this.#globalMiddlewares,
			this.#errorHandler,
		);

		return processor.execute();
	}
}
