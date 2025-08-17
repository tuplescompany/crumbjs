import type { ZodObject, infer as ZodInfer, ZodType } from 'zod';
import { locales, modes, openapiUis } from './constants';
import { Exception, ExceptionType } from './exception';
import { IFetcher } from './cloudflare/types';
import { CookieInit } from './processor/cookies';

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

export type OnClose<ENV extends Rec = any, VARS extends Rec = any> = (ctx: ResolvedContext<ENV, VARS>) => Promise<any>;

export type NotFoundHandler<ENV extends Rec = any, VARS extends Rec = any> = (ctx: RootContext<ENV, VARS>) => Result | Promise<Result>;

export type ErrorHandler<ENV extends Rec = any, VARS extends Rec = any> = (ctx: ErrorContext<ENV, VARS>) => Result | Promise<Result>;

export type InferOrAny<T extends ZodObject | undefined> = T extends ZodObject ? ZodInfer<T> : any;

export type Next = () => Promise<Result>;

export type Middleware<ENV extends Rec = any, VARS extends Rec = any> = (ctx: MiddlewareContext<ENV, VARS>) => Promise<Result>;

export type MiddlewareContext<ENV extends Rec = any, VARS extends Rec = any> = RootContext<ENV, VARS> & { next: Next };

export type Rec = Record<string, any>;

// 1. Extract the keys where the value type is Fetcher or IFetcher
type FetcherKeys<T> = Extract<
	{
		[K in keyof T]-?: NonNullable<T[K]> extends IFetcher ? K : never;
	}[keyof T],
	string
>;

// 2. Union those with `string` to allow arbitrary strings
export type Destination<T> = FetcherKeys<T> | (string & {}); /** nosonar */

type KeyOf<T> = Extract<keyof T, string>;

/**
 * Core context passed to all route handlers and middleware.
 * Provides access to the request, parsed body, response controls,
 * and a per-request key–value store.
 */
export type RootContext<ENV extends Rec = any, VARS extends Rec = any> = {
	/** The original Fetch API Request object */
	request: Request;

	/** Environment object */
	env: ENV;

	/** Stacked Promises to execute after response is sent */
	stack: (name: string, promise: Promise<any>) => void;

	/** extracted request Origin */
	origin: string;

	/**
	 * parse bearer authorization returning only the token string
	 * @throws {BadRequest} on inexistent or short)
	 */
	bearer: () => string;

	/**
	 * Extracted request client ip address
	 */
	ip: string;

	/** request URL instance */
	url: URL;

	/**
	 * Get from context the builded response headers at the moment of the call
	 * usefull for some middlewares that on certain cases return Responses
	 */
	getResponseHeaders: () => Headers;

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
	 * Sets the HTTP status code and optional status text for the response.
	 * @param code - HTTP status code (e.g., 200, 404)
	 */
	setStatus: (code: number) => void;

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
	 * Stores a value in the per-request context.
	 * Useful for passing data between middlewares and handlers.
	 */
	set: <K extends KeyOf<VARS>>(key: K, value: VARS[K]) => void;

	/**
	 * Retrieves a stored value from the per-request context.
	 */
	get: <K extends KeyOf<VARS>>(key: K) => VARS[K] | null;

	/**
	 * Retrieves a stored value from the per-request context.
	 * If the key doesnt exists in store (or empty) wil return the fallback value
	 * If the fallback value is an Exception instance, will throw it
	 */
	getOr: <K extends KeyOf<VARS>>(key: K, fallback: VARS[K] | Exception) => VARS[K];
};

/**
 * Extended request context that includes validated request data and core request utilities.
 *
 * All fields (`body`, `query`, `headers`) are inferred from their corresponding
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
	ENV extends Rec = any,
	VARS extends Rec = any,
	PATH extends string = any,
	BODY extends ZodObject | undefined = any,
	QUERY extends ZodObject | undefined = any,
	HEADERS extends ZodObject | undefined = any,
> = RootContext<ENV, VARS> & {
	/** Validated request body (or `any` if no schema provided) */
	body: InferOrAny<BODY>;

	/** Validated query parameters (or `any` if no schema provided) */
	query: InferOrAny<QUERY>;

	/** Validated route/path parameters (or `any` if no schema provided) */
	params: ExtractPathParams<PATH>;

	/** Validated request headers (or `any` if no schema provided) */
	headers: InferOrAny<HEADERS>;
};

export type ErrorContext<ENV extends Rec = any, VARS extends Rec = any> = RootContext<ENV, VARS> & { exception: Exception };

export type ResolvedContext<ENV extends Rec = any, VARS extends Rec = any> = RootContext<ENV, VARS> &
	Context<ENV, VARS> & {
		result: Result | ExceptionType;
		response: Response;
	};

export type ExtractPathParams<S extends string> = S extends `${string}:${infer Param}/${infer Rest}`
	? { [K in Param | keyof ExtractPathParams<`/${Rest}`>]: string }
	: S extends `${string}:${infer Param}`
		? { [K in Param]: string }
		: {};

export type PathParams<S extends string> = {
	[K in keyof ExtractPathParams<S>]?: {
		example: string;
		description?: string;
	};
};

export type AnyPathParams = {
	[key: string]: {
		example: string;
		description?: string;
	};
};

export type Handler<
	ENV extends Rec = any,
	VARS extends Rec = any,
	PATH extends string = '/',
	BODY extends ZodObject | undefined = any,
	QUERY extends ZodObject | undefined = any,
	HEADERS extends ZodObject | undefined = any,
> = (ctx: Context<ENV, VARS, PATH, BODY, QUERY, HEADERS>) => Result;

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
	ENV extends Rec = any,
	VARS extends Rec = any,
	PATH extends string = '/',
	BODY extends ZodObject | undefined = undefined,
	QUERY extends ZodObject | undefined = undefined,
	HEADERS extends ZodObject | undefined = undefined,
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
	params?: PathParams<PATH>;

	/**
	 * Request headers validation & typing (Zod).
	 * If omitted, headers are not validated.
	 * Tip: use lowercase header names to align with the Fetch `Headers` behavior.
	 *
	 * @example z.object({ 'x-request-id': z.string().uuid().optional() })
	 */
	headers?: HEADERS;

	/**
	 * Route-specific middleware(s). Runs before the handler.
	 * Accepts a single middleware or an array.
	 */
	use?: Middleware<ENV, VARS> | Middleware<ENV, VARS>[];

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
};

export type Route = {
	path: string;
	method: Method;
	handler: Handler;
	config: RouteConfig;
};

export type Routes = Partial<Record<Method, Record<string, Route>>>;

export type OARoute = {
	method: Lowercase<Method>;
	path: string;
	mediaType?: string;
	body?: ZodObject;
	query?: ZodObject;
	params?: AnyPathParams;
	header?: ZodObject;
	responses?: ResponseConfig[];
	tags?: string[];
	description?: string;
	summary?: string;
	authorization?: 'bearer' | 'basic';
	operationId?: string;
};
