import type { ZodObject, infer as ZodInfer, ZodType } from 'zod';
import type { BunRequest, CookieInit } from 'bun';
import { locales, modes, openapiUis } from './constants';
import { Exception } from './exception';

export type Method = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'OPTIONS' | 'HEAD';

export type ContentType =
	| 'application/json'
	| 'application/x-www-form-urlencoded'
	| 'multipart/form-data'
	| 'text/plain'
	| 'text/html'
	| 'text/css'
	| 'application/javascript'
	| 'application/xml'
	| 'application/pdf'
	| 'image/png'
	| 'image/jpeg'
	| 'image/gif'
	| 'image/webp'
	| 'image/svg+xml'
	| 'application/octet-stream'
	| (string & {});

export type BunHandler = (req: BunRequest, server: Bun.Server) => Response | Promise<Response>;

export type BunRouteHandlers = Partial<Record<Method, BunHandler>>;

export type BunRoutes = Record<string, BunRouteHandlers>;

export type Result = Promise<string | object | null | Response> | (string | object | null | Response);

export type NotFoundHandler = (ctx: RootContext) => Result | Promise<Result>;

export type ErrorHandler = (ctx: ErrorContext) => Result | Promise<Result>;

export type InferOrAny<T extends ZodObject | undefined> = T extends ZodObject ? ZodInfer<T> : any;

export type Next = () => Promise<Result>;

export type Middleware = (ctx: MiddlewareContext) => Promise<Result>;

export type MiddlewareContext = RootContext & { next: Next };

export type OnStart = () => void | Promise<void>;

/**
 * Core context passed to all route handlers and middleware.
 * Provides access to the request, parsed body, response controls,
 * and a per-request key–value store.
 */
export type RootContext = {
	/** start time context resolution: performance.now() */
	start: DOMHighResTimeStamp;

	/** The original Fetch API Request object */
	request: Request;

	/** The bun server instance */
	server: Bun.Server;

	/** extracted request Origin */
	origin: string;

	/**
	 * parse bearer authorization returning only the token string
	 * @throws {BadRequest} on inexistent or short)
	 */
	bearer: () => string;

	/**
	 * parse the basic authorization returning user and password object
	 * @throws {BadRequest} on inexistent or invalid)
	 */
	basicCredentials: () => { user: string; password: string };

	/** extracted request client ip address */
	ip: string;

	/** request URL instance */
	url: URL;

	/**
	 * rawBody, is the unvalidated request body parsed into a plain object.
	 *
	 * Supported auto-parseables Content-Types:
	 * - `application/json`
	 * - `application/x-www-form-urlencoded`
	 * - `multipart/form-data`
	 *
	 * For unsupported types, the body is parsed as text and returned as: `{ content: string }`.
	 *
	 * Note: No schema validation is applied to this object and is available and writable in middlewares
	 */
	rawBody: Record<string, any>;

	/**
	 * Sets a response header.
	 * @param key - Header name (case-insensitive)
	 * @param value - Header value
	 */
	setHeader: (key: string, value: string) => void;

	/**
	 * Removes a response header by name.
	 * @param key - Header name to delete
	 */
	deleteHeader: (key: string) => void;

	/**
	 * Gets the current response headers
	 */
	getResponseHeaders: () => Headers;

	/**
	 * Sets the HTTP status code and optional status text for the response.
	 * @param code - HTTP status code (e.g., 200, 404)
	 * @param text - Optional status message (e.g., "OK", "Not Found")
	 */
	setStatus: (code: number, text?: string) => void;

	/**
	 * Gets the current status values
	 */
	getResponseStatus: () => { status: number; statusText: string };

	/**
	 * Adds or updates a cookie in the map.
	 *
	 * @param name - The name of the cookie
	 * @param value - The value of the cookie
	 * @param options - Optional cookie attributes
	 */
	setCookie: (name: string, value: string, options?: CookieInit) => void;

	/**
	 * Gets the value of a cookie with the specified name.
	 *
	 * @param name - The name of the cookie to retrieve
	 * @returns The cookie value as a string, or null if the cookie doesn't exist
	 */
	getCookie: (name: string) => string | null;

	/**
	 * Removes a cookie from the map.
	 *
	 * @param name - The name of the cookie to delete
	 */
	deleteCookie: (name: string) => void;

	/**
	 * RequestStores a value in the per-request context.
	 * Useful for passing data between middlewares and handlers.
	 * @param key - Unique key
	 * @param value - Any value to store
	 */
	set: (key: string, value: any) => void;

	/**
	 * Retrieves a stored value from the per-request context.
	 * @param key - Key to retrieve
	 * @returns The stored value
	 * @throws {InternalServerError} if the key not exists
	 */
	get: <T = any>(key: string) => T;
};

export type ErrorContext = RootContext & { exception: Exception };

/**
 * Extended request context that includes validated request data and core request utilities.
 *
 * All fields (`body`, `query`, `params`, `headers`) are inferred from their corresponding
 * Zod schemas. If a schema is not provided (`undefined`), the field defaults to `any`.
 *
 * This type also extends {@link RootContext}, which provides access to the raw request,
 * response utilities, and a per-request key–value store.
 *
 * @template BODY - Zod schema for the request body
 * @template QUERY - Zod schema for the query parameters
 * @template PARAMS - Zod schema for the path parameters
 * @template HEADERS - Zod schema for the request headers
 */
export type Context<
	BODY extends ZodObject | undefined,
	QUERY extends ZodObject | undefined,
	PARAMS extends ZodObject | undefined,
	HEADERS extends ZodObject | undefined,
> = RootContext & {
	/** Validated request body (or `any` if no schema provided) */
	body: InferOrAny<BODY>;

	/** Validated query parameters (or `any` if no schema provided) */
	query: InferOrAny<QUERY>;

	/** Validated route/path parameters (or `any` if no schema provided) */
	params: InferOrAny<PARAMS>;

	/** Validated request headers (or `any` if no schema provided) */
	headers: InferOrAny<HEADERS>;
};

export type Handler<
	BODY extends ZodObject | undefined,
	QUERY extends ZodObject | undefined,
	PARAMS extends ZodObject | undefined,
	HEADERS extends ZodObject | undefined,
> = (ctx: Context<BODY, QUERY, PARAMS, HEADERS>) => Result;

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
	type?: ContentType;
	/**
	 * Response documentation (openapi)
	 * you may use the 'spec' helper
	 * @example spec.response(200, schema, 'text/plain')
	 */
	responses?: ResponseConfig[];
	openapi?: Partial<{
		/**
		 * Exclude from openapi doc if true
		 * @default false
		 */
		hide: boolean;
		/**
		 * Will create the tag/s on openapi spec and asign to the route
		 * you may want to add some tag description use 'openapi' helper (wich avoids duplication)
		 * @example ['your-tag']
		 * @example
		 * // outside the route definition
		 * import { openapi } from '@crumbjs/core';
		 * openapi.addTag('your-tag', 'your-description')
		 * @default 'Uncategorized'
		 */
		tags: string[];
		/** openapi endpoint description */
		description: string;
		/** openapi endpoint summary */
		summary: string;
		/** openapi endpoint security component */
		authorization: 'bearer' | 'basic';
		/** if is not set will be inferred based on final path */
		operationId: string;
	}>;
};

export type ResponseConfig = {
	status: number | 'default';
	schema: ZodType;
	type: ContentType;
};

export type AppLocale = (typeof locales)[number];

export type AppMode = (typeof modes)[number];

export type OpenApiUi = (typeof openapiUis)[number];

export type APIConfig = {
	/**
	 * Application mode: 'development', 'production', 'test', 'staging'
	 * @env inferance: 'NODE_ENV' or 'APP_MODE' (if both detected app will use 'APP_MODE')
	 */
	mode: AppMode;

	/**
	 * Openapi application version & version tag for your app
	 * @env inferance: 'APP_VERSION'
	 * @default '1.0.0'
	 */
	version: string;

	/**
	 * Http Port
	 * @env inferance: 'PORT'
	 * @default 8080
	 */
	port: number;

	/**
	 * Enable or disable openapi
	 * @env inferance: 'OPENAPI'
	 * @default true
	 */
	withOpenapi: boolean;

	/**
	 * Set locale
	 * @warn v 0.x.x only set zod locale at boot time the internal app errors are in english
	 * @env inferance: 'LOCALE'
	 * @default 'en'
	 */
	locale: AppLocale;

	/**
	 * Openapi application title
	 * @env inferance: 'OPENAPI_TITLE'
	 * @default 'API'
	 */
	openapiTitle: string;

	/**
	 * Openapi application description
	 * @env inferance: 'OPENAPI_DESCRIPTION'
	 * @default 'API Documentation'
	 */
	openapiDescription: string;

	/**
	 * Openapi base path
	 * @env inferance: 'OPENAPI_PATH'
	 * @default '/openapi'
	 */
	openapiBasePath: string;

	/**
	 * Openapi web UI
	 * @env inferance: 'OPENAPI_UI'
	 * @default 'scalar'
	 */
	openapiUi: OpenApiUi;

	/**
	 * Handler for unmatched routes (404).
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
	notFoundHandler: NotFoundHandler;

	/**
	 * Router exception handler.
	 *
	 * Default:
	 * ```ts
	 * ({ setStatus, exception }) => {
	 *  setStatus(exception.status);
	 *  return exception.toObject();
	 * },
	 * ```
	 */
	errorHandler: ErrorHandler;
};

export type Route = {
	pathParts: string[];
	method: Method;
	handler: Handler<any, any, any, any>;
	config: RouteConfig<any, any, any, any>;
};

export type StaticRoute = {
	pathParts: string[];
	contentOrPath: string;
	isFile: boolean;
	contentType?: ContentType;
};

export type OAMethod = 'get' | 'post' | 'put' | 'delete' | 'patch' | 'head' | 'options' | 'trace';

export type OARoute = {
	method: OAMethod;
	path: string;
	mediaType?: string;
	body?: ZodObject;
	query?: ZodObject;
	params?: ZodObject;
	headers?: ZodObject;
	responses?: ResponseConfig[];
	tags?: string[];
	description?: string;
	summary?: string;
	authorization?: 'bearer' | 'basic';
	operationId?: string;
};

/**
 * Application-level configuration object.
 */
export type AppConfig = {
	/**
	 * Global prefix for all routes (e.g., `/api`, `/v1`).
	 * This is typically used to namespace endpoints.
	 * @default ''
	 */
	prefix: string;
};

export type ExtractPathParams<S extends string> = S extends `${string}:${infer Param}/${infer Rest}`
	? { [K in Param | keyof ExtractPathParams<`/${Rest}`>]: string }
	: S extends `${string}:${infer Param}`
		? { [K in Param]: string }
		: {};

function a<P extends string>(params: ExtractPathParams<P>) {
	return params;
}
