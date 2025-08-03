import z, {
	type ZodObject,
	type infer as ZodInfer,
	type ZodString,
	type ZodNumber,
	type ZodBoolean,
	type ZodDate,
	type ZodLiteral,
	type ZodFile,
	type ZodArray,
	type ZodCoercedNumber,
	type ZodCoercedDate,
	type ZodCoercedBigInt,
	type ZodCoercedBoolean,
	type ZodOptional,
	type ZodNullable,
	type ZodCoercedString,
	ZodPipe,
	ZodType,
} from 'zod';
import type { BunRequest } from 'bun';
import { locales, modes, openapiUis } from './constants';

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

export type BunHandler = (req: BunRequest) => Response | Promise<Response>;

export type BunRouteHandlers = Partial<Record<Method, BunHandler>>;

export type BunRoutes = Record<string, BunRouteHandlers>;

export type NotFoundHandler = (req: Request) => Response | Promise<Response>;

export type ErrorHandler = (req: Request, error: unknown) => Response | Promise<Response>;

export type InferOrAny<T extends ZodObject | undefined> = T extends ZodObject ? ZodInfer<T> : any;

export type HandlerReturn = Promise<string | object | null | Response> | (string | object | null | Response);

export type Next = () => Promise<HandlerReturn>;

export type Middleware = (input: MiddlewareContext) => Promise<HandlerReturn>;

export type MiddlewareContext = RootContext & { next: Next };

export type OnStart = () => void | Promise<void>;

/**
 * Core context passed to all route handlers and middleware.
 * Provides access to the request, parsed body, response controls,
 * and a per-request key–value store.
 */
export type RootContext = {
	/** The original Fetch API Request object */
	request: Request;

	/**
	 * Raw, unvalidated request body parsed into a plain object.
	 *
	 * Supported Content-Types:
	 * - `application/json`
	 * - `application/x-www-form-urlencoded`
	 * - `multipart/form-data`
	 *
	 * For unsupported types, the body is parsed as text and returned as: `{ text: string }`.
	 *
	 * Note: No schema validation is applied to this object.
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
	 * @param text - Optional status message (e.g., "OK", "Not Found")
	 */
	setStatus: (code: number, text?: string) => void;

	/**
	 * Sets the `Set-Cookie` header.
	 * @param value - Raw cookie string (e.g., "session=abc123; Path=/; HttpOnly")
	 */
	setCookie: (value: string) => void;

	/**
	 * Stores a value in the per-request context.
	 * Useful for passing data between middlewares and handlers.
	 * @param key - Unique key
	 * @param value - Any value to store
	 */
	set: (key: string, value: any) => void;

	/**
	 * Retrieves a stored value from the per-request context.
	 * @param key - Key to retrieve
	 * @returns The stored value, or `undefined` if not set
	 */
	get: <T = any>(key: string) => T;
};

export type ZodPrimitive =
	| ZodString
	| ZodOptional<ZodString>
	| ZodNullable<ZodString>
	| ZodNullable<ZodOptional<ZodString>>
	| ZodOptional<ZodNullable<ZodString>>
	| ZodNumber
	| ZodOptional<ZodNumber>
	| ZodNullable<ZodNumber>
	| ZodNullable<ZodOptional<ZodNumber>>
	| ZodOptional<ZodNullable<ZodNumber>>
	| ZodBoolean
	| ZodOptional<ZodBoolean>
	| ZodNullable<ZodBoolean>
	| ZodNullable<ZodOptional<ZodBoolean>>
	| ZodOptional<ZodNullable<ZodBoolean>>
	| ZodDate
	| ZodOptional<ZodDate>
	| ZodNullable<ZodDate>
	| ZodNullable<ZodOptional<ZodDate>>
	| ZodOptional<ZodNullable<ZodDate>>;

type ZodPrimitiveArray = ZodArray<ZodPrimitive>;

type ZodOptionalPrimitiveArray =
	| ZodPrimitiveArray
	| ZodOptional<ZodPrimitiveArray>
	| ZodNullable<ZodPrimitiveArray>
	| ZodNullable<ZodOptional<ZodPrimitiveArray>>
	| ZodOptional<ZodNullable<ZodPrimitiveArray>>;

export type ZodPrimitiveOrArray = ZodPrimitive | ZodOptionalPrimitiveArray;

export type ZodPrimitiveOrFile = ZodPrimitive | ZodFile | ZodOptional<ZodFile> | ZodNullable<ZodFile>;

type ZodParamsValue = ZodString | ZodCoercedNumber | ZodCoercedDate | ZodCoercedBigInt | ZodCoercedString | ZodCoercedBoolean;

export type ZodParams = ZodObject<Record<string, ZodParamsValue>>;

export type ZodHeaders = ZodObject<Record<string, ZodString>>;

export type ZodQuery = ZodObject<Record<string, ZodPrimitiveOrArray>>;

export type ZodForm = ZodObject<Record<string, ZodPrimitiveOrFile>>;

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
	QUERY extends ZodQuery | undefined,
	PARAMS extends ZodParams | undefined,
	HEADERS extends ZodHeaders | undefined,
> = {
	/** Validated request body (or `any` if no schema provided) */
	body: InferOrAny<BODY>;

	/** Validated query parameters (or `any` if no schema provided) */
	query: InferOrAny<QUERY>;

	/** Validated route/path parameters (or `any` if no schema provided) */
	params: InferOrAny<PARAMS>;

	/** Validated request headers (or `any` if no schema provided) */
	headers: InferOrAny<HEADERS>;
} & RootContext;

export type Handler<
	BODY extends ZodObject | undefined,
	QUERY extends ZodQuery | undefined,
	PARAMS extends ZodParams | undefined,
	HEADERS extends ZodHeaders | undefined,
> = (input: Context<BODY, QUERY, PARAMS, HEADERS>) => HandlerReturn;

export type RouteConfig<
	BODY extends ZodObject | undefined = undefined,
	QUERY extends ZodQuery | undefined = undefined,
	PARAMS extends ZodParams | undefined = undefined,
	HEADERS extends ZodHeaders | undefined = undefined,
> = {
	body?: BODY;
	/**
	 * Shape allows string, number, date, boolean and his optional / nullable variables
	 */
	query?: QUERY;
	/**
	 * Shape allows string or corsed number, date, boolean
	 */
	params?: PARAMS;
	/**
	 * Shape allows only strings schemas
	 */
	headers?: HEADERS;
	use?: Middleware | Middleware[];
	type?: ContentType;
	responses?: ResponseConfig[];
	openapi?: Partial<{
		hide: boolean;
		tags: string[];
		description: string;
		summary: string;
		authorization: 'bearer' | 'basic';
		operationId: string;
	}>;
};

export type ResponseConfig = {
	status: number;
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
	 *   console.error(`[REQUEST ERROR] ${req.method} ${req.url}`, error);
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
