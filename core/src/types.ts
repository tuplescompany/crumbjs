import type { ZodObject, infer as ZodInfer } from 'zod';
import type { Store } from './context/store';
import type { BunRequest } from 'bun';

export type Method = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'OPTIONS' | 'HEAD';

export type BunHandler = (req: BunRequest) => Response | Promise<Response>;

export type BunRouteHandlers = Partial<Record<Method, BunHandler>>;

export type BunRoutes = Record<string, BunRouteHandlers>;

export type NotFoundHandler = (req: Request) => Response | Promise<Response>;

export type ErrorHandler = (req: Request, error: unknown) => Response | Promise<Response>;

export type InferOrAny<T extends ZodObject | undefined> = T extends ZodObject ? ZodInfer<T> : any;

export type HandlerReturn = Promise<string | object> | (string | object);

export type Next = () => Promise<HandlerReturn>;

export type Middleware = (input: MiddlewareContext) => Promise<HandlerReturn>;

export type MiddlewareContext = RootContext & { next: Next };

export type OnStart = () => void | Promise<void>;

export type RootContext = {
	request: Request;
	unvalidatedBody: any;
	setHeader: (key: string, value: string) => void;
	appendHeader: (key: string, value: string) => void;
	deleteHeader: (key: string) => void;
	setStatus: (code: number, text?: string) => void;
	store: Store;
};

export type Context<
	BODY extends ZodObject | undefined,
	QUERY extends ZodObject | undefined,
	PARAMS extends ZodObject | undefined,
	HEADERS extends ZodObject | undefined,
> = {
	body: InferOrAny<BODY>;
	query: InferOrAny<QUERY>;
	params: InferOrAny<PARAMS>;
	headers: InferOrAny<HEADERS>;
} & RootContext;

export type ContextWithoutBody<
	QUERY extends ZodObject | undefined,
	PARAMS extends ZodObject | undefined,
	HEADERS extends ZodObject | undefined,
> = Omit<Context<undefined, QUERY, PARAMS, HEADERS>, 'body'>;

export type Handler<
	BODY extends ZodObject | undefined,
	QUERY extends ZodObject | undefined,
	PARAMS extends ZodObject | undefined,
	HEADERS extends ZodObject | undefined,
> = (input: Context<BODY, QUERY, PARAMS, HEADERS>) => HandlerReturn;

export type HandlerWithoutBody<
	QUERY extends ZodObject | undefined,
	PARAMS extends ZodObject | undefined,
	HEADERS extends ZodObject | undefined,
> = (input: ContextWithoutBody<QUERY, PARAMS, HEADERS>) => HandlerReturn;

export type RouteConfig<
	BODY extends ZodObject | undefined = undefined,
	QUERY extends ZodObject | undefined = undefined,
	PARAMS extends ZodObject | undefined = undefined,
	HEADERS extends ZodObject | undefined = undefined,
> = {
	body?: BODY;
	query?: QUERY;
	params?: PARAMS;
	headers?: HEADERS;
	use?: Middleware | Middleware[];
	type?: string;
	responses?: Record<number, ZodObject>;
	openapi?: Partial<{
		hide: boolean;
		tags: string[];
		description: string;
		summary: string;
		authorization: 'bearer' | 'basic';
		operationId: string;
	}>;
};

export type RouteConfigWithoutBody<
	QUERY extends ZodObject | undefined,
	PARAMS extends ZodObject | undefined,
	HEADERS extends ZodObject | undefined,
> = Omit<RouteConfig<undefined, QUERY, PARAMS, HEADERS>, 'body'>;

export type APIConfig = {
	/**
	 * Http Port
	 * @default 8080
	 */
	port: number;

	/**
	 * Enable or disable openapi
	 * @default true,
	 */
	withOpenapi: boolean;

	/**
	 * Open api documentator settings
	 */
	openapi: {
		/**
		 * Openapi application title
		 * @default 'API'
		 */
		title: string;
		/**
		 * Openapi application version
		 * @default '1.0.0'
		 */
		version: string;
		/**
		 * Openapi application description
		 * @default 'API Documentation'
		 */
		description: string;
		/**
		 * Openapi base path
		 * @default 'openapi'
		 */
		basePath: string;
	};

	/**
	 * Handler for unmatched routes (404).
	 *
	 * Default:
	 * ```ts
	 * const notFoundHandler = () => {
	 *   return new Response('NOT_FOUND', {
	 *     status: 404,
	 *     headers: {
	 *       'Content-Type': 'text/plain',
	 *     },
	 *   });
	 * };
	 * ```
	 */
	notFoundHandler: NotFoundHandler;

	/**
	 * Router exception handler.
	 *
	 * Default:
	 * ```ts
	 * const errorHandler = (req, error) => {
	 *   console.error(`[Request Error] ${req.method} ${req.url}`, error);
	 *   const parsed = Exception.parse(error).toObject();
	 *   return new Response(JSON.stringify(parsed), {
	 *     status: parsed.status,
	 *     headers: {
	 *       'Content-Type': 'application/json',
	 *     },
	 *   });
	 * };
	 * ```
	 */
	errorHandler: ErrorHandler;
};

export type AppOptions = {
	/**
	 * Routes prefix for this app
	 * @default ''
	 */
	prefix: string;
};

export type Route = {
	paths: string[];
	method: Method;
	handler: Handler<any, any, any, any> | HandlerWithoutBody<any, any, any>;
	config: RouteConfig<any, any, any, any> | RouteConfigWithoutBody<any, any, any>;
};
