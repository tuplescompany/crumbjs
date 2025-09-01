import { type ZodObject, type infer as ZodInfer, type ZodType, type ZodString, ZodOptional, ZodNullable } from 'zod';
import type { BunRequest, CookieInit } from 'bun';
import { modes, openapiUis } from './constants';
import { Exception } from './exception';

export type Method = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'OPTIONS' | 'HEAD';

export type MethodOpts = Method | Method[] | '*';

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
	| (string & {}); // nosonar

export type Result = Promise<string | object | null | Response> | (string | object | null | Response);

export type NotFoundHandler = (req: Request) => Response | Promise<Response>;

export type ErrorHandler = (ctx: ErrorContext) => Result | Promise<Result>;

type InferOrAny<T extends ZodObject | undefined> = T extends ZodObject ? ZodInfer<T> : any;

type Next = () => Promise<Result>;

export type Middleware = (ctx: MiddlewareContext) => Promise<Result>;

export type OnStart = () => void | Promise<void>;

export type ExtractPathParams<S extends string> = S extends `${string}:${infer Param}/${infer Rest}`
	? { [K in Param | keyof ExtractPathParams<`/${Rest}`>]: string }
	: S extends `${string}:${infer Param}`
		? { [K in Param]: string }
		: {};

type PathParams<S extends string> = {
	[K in keyof ExtractPathParams<S>]?: {
		example: string;
		description?: string;
	};
};

type PathParamsShape<S extends string> = {
	[K in keyof ExtractPathParams<S>]: ZodType;
};

export type PathParamsSchema<S extends string> = ZodObject<PathParamsShape<S>>;

export type AnyPathParams = {
	[key: string]: {
		example: string;
		description?: string;
	};
};

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
	 * Gets the current response status
	 */
	getResponseStatus: () => number;

	/**
	 * Sets the HTTP status code and optional status text for the response.
	 * @param code - HTTP status code (e.g., 200, 404)
	 * @param text - Optional status message (e.g., "OK", "Not Found")
	 */
	setStatus: (code: number, text?: string) => void;

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

/**
 * Context available to middlewares.
 * Extends {@link RootContext} with:
 * - `next`: callback to pass control to the next middleware in the chain
 */
export type MiddlewareContext = RootContext & { next: Next };

/**
 * Context available when an error is caught during request handling.
 * Extends {@link RootContext} with:
 * - `exception`: the thrown {@link Exception} object containing error details
 */
export type ErrorContext = RootContext & { exception: Exception };

type InferOrExtract<S extends string, P extends PathParamsSchema<S> | undefined> =
	P extends PathParamsSchema<S> ? ZodInfer<P> : ExtractPathParams<S>;

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
	PATH extends string = '/',
	BODY extends ZodObject | undefined = any,
	QUERY extends ZodObject | undefined = any,
	HEADERS extends ZodObject | undefined = any,
	PARAMS extends PathParamsSchema<PATH> | undefined = any,
> = RootContext & {
	/** Validated request body (or `any` if no schema provided) */
	body: InferOrAny<BODY>;

	/** Validated query parameters (or `any` if no schema provided) */
	query: InferOrAny<QUERY>;

	/** If z.object() was provided to route config will be the infer type else the raw string:string record */
	params: InferOrExtract<PATH, PARAMS>;

	/** Validated request headers (or `any` if no schema provided) */
	headers: InferOrAny<HEADERS>;
};

export type Handler<
	PATH extends string = '/',
	BODY extends ZodObject | undefined = any,
	QUERY extends ZodObject | undefined = any,
	HEADERS extends ZodObject | undefined = any,
	PARAMS extends PathParamsSchema<PATH> | undefined = any,
> = (ctx: Context<PATH, BODY, QUERY, HEADERS, PARAMS>) => Result;

/**
 * Route-level configuration: validation, docs, and behavior.
 *
 * Use this to declare how a single route accepts input (body, query, params, headers),
 * how it is documented (OpenAPI), and which middlewares apply only to this route.
 *
 * @template PATH    Path pattern for the route (e.g. "/users/:id").
 * @template BODY    Zod schema for the request body (or undefined if not validated).
 * @template QUERY   Zod schema for the query string (or undefined if not validated).
 * @template HEADERS Zod schema for the headers (or undefined if not validated).
 */
export type RouteConfig<
	PATH extends string = '/',
	BODY extends ZodObject | undefined = undefined,
	QUERY extends ZodObject | undefined = undefined,
	HEADERS extends ZodObject | undefined = undefined,
	PARAMS extends PathParamsSchema<PATH> | undefined = any,
> = {
	/**
	 * Request body validation & typing (Zod).
	 * If omitted, the body is not validated and is treated as `any`.
	 *
	 * @example z.object({ name: z.string(), age: z.number().int().optional() })
	 */
	body?: BODY;

	/**
	 * Query string validation & typing (Zod).
	 * If omitted, the query is not validated and is treated as `any`.
	 *
	 * @example z.object({ page: z.coerce.number().min(1).default(1) })
	 */
	query?: QUERY;

	/**
	 * Path params documentation.
	 * If omitted, params are inferred from `PATH` (e.g. "/users/:id") and documented automatically.
	 *
	 * @example { id: { description: "User identifier", example: "123" } }
	 */
	params?: PARAMS;

	/**
	 * Request headers validation & typing (Zod).
	 * If omitted, headers are not validated.
	 * Tip: use lowercase header names to align with the Fetch `Headers` behavior.
	 *
	 * @example z.object({ 'x-request-id': z.string().uuid().optional() })
	 */
	headers?: HEADERS;

	/**
	 * **Use it with caution** the types and documentation will be infered any way, but the data will not be validated
	 */
	disableValidation?: boolean;

	/**
	 * Route-specific middleware(s). Runs before the handler.
	 * Accepts a single middleware or an array.
	 */
	use?: Middleware | Middleware[];

	/**
	 * Required request Content-Type. If set, non-matching requests may be rejected.
	 * Typical values: "application/json", "application/x-www-form-urlencoded", "multipart/form-data".
	 */
	type?: ContentType;

	/**
	 * OpenAPI responses for this route.
	 * Use the `spec.response` helper to keep definitions DRY.
	 *
	 * @example spec.response(200, UserSchema, 'application/json')
	 */
	responses?: ResponseConfig[];

	/**
	 * Exclude this route from the generated OpenAPI spec.
	 * @default false
	 */
	hide?: boolean;

	/**
	 * OpenAPI tags for grouping.
	 * You can pre-declare tags with descriptions via the `openapi` helper to avoid duplication.
	 *
	 * @example ['Users']
	 * @example
	 *   import { openapi } from '@crumbjs/core';
	 *   openapi.addTag('Users', 'Operations related to user management');
	 * @default ['Uncategorized']
	 */
	tags?: string[];

	/** OpenAPI: route description (supports Markdown). */
	description?: string;

	/** OpenAPI: short summary shown in UIs. */
	summary?: string;

	/**
	 * OpenAPI security requirement for this route.
	 * Make sure the corresponding security scheme exists in your OpenAPI components.
	 */
	authorization?: 'bearer' | 'basic';

	/**
	 * Explicit operationId for OpenAPI.
	 * If omitted, it is inferred from the final resolved path (and method).
	 */
	operationId?: string;

	/**
	 * Whether to parse the response using Zod (applies only to successful responses).
	 *
	 * If a default or `2xx` response schema is defined, the Processor will validate
	 * and transform the result with Zod before returning it.
	 *
	 * Example use case: hide or transform fields before sending data back to the client.
	 *
	 * The result will not be parsed even on true if your handler return a Response instance or raw string or null. Only object kind
	 *
	 * @default false
	 */
	parseResult?: boolean;
};

export type ResponseConfig = {
	status: number | 'default';
	schema: ZodType;
	type: ContentType;
};

export type AppMode = (typeof modes)[number];

type OpenApiUi = (typeof openapiUis)[number];

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
	 * @default '/reference'
	 */
	openapiBasePath: string;

	/**
	 * Openapi web UI
	 * @env inferance: 'OPENAPI_UI'
	 * @default 'scalar'
	 */
	openapiUi: OpenApiUi;

	/**
	 * Generates client.schema.ts on server boot (when withOpenapi=true and mode='development')
	 * @default 'true'
	 */
	generateClientSchema: boolean;

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

export type Route = RouteDynamic | RouteStatic;

type RouteDynamic = {
	pathParts: string[];
	method: Method;
	handler: Handler;
	config: RouteConfig;
};

type RouteStatic = {
	pathParts: string[];
	content: string | Blob;
	contentType: ContentType;
};

export type BuildedRoute =
	| {
			path: string;
			method: string;
			handler: (req: BunRequest, server: Bun.Server) => Response | Promise<Response>;
			routeConfig: RouteConfig;
			isStatic: false;
	  }
	| {
			path: string;
			method: string;
			handler: Response;
			routeConfig: RouteConfig;
			isStatic: true;
	  };

export type OARoute = {
	method: Lowercase<Method>;
	path: string;
	mediaType?: string;
	body?: ZodObject;
	query?: ZodObject;
	params?: ZodObject | AnyPathParams;
	header?: ZodObject;
	responses?: ResponseConfig[];
	tags?: string[];
	description?: string;
	summary?: string;
	authorization?: 'bearer' | 'basic';
	operationId?: string;
};

export type HttpUrlString = `${'http' | 'https'}://${string}`;

export type FieldMeta = {
	description?: string;
	example?: unknown;
};

export type FieldInfo = {
	key: string;
	schema: ZodType;
	required: boolean;
	metadata: FieldMeta;
};
