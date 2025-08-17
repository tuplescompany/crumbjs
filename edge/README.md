# crumbjs | The tasty way to build fast apps.

<img src="https://raw.githubusercontent.com/tuplescompany/crumbjs/refs/heads/main/logo/crumbjs.png" alt="CrumbJS Logo" width="200"/>

- ...Documentation page in progress

CrumbJS is a lightweight API framework for Cloudflare Workers focused on backend development. It layers configuration, validation and documentation on top of Bun's built-in router while keeping a familiar Express-like developer experience. Validation is powered by [Zod](https://github.com/colinhacks/zod) and every route can be automatically documented through OpenAPI.

The core system has only about 3,700 lines of code and just two dependencies (zod and openapi3-ts).

## Features

- Build on top of battle tested and fast H3/Nitro radix trie baed router: rue3
- Zod-based validation for bodies, params, queries and headers
- Automatic OpenAPI 3.1 document generation and UI (Swagger or Scalar)
- Simple middleware system and optional global middlewares
- Simple proxy helpers to forward requests and (optionally) document them — use app.proxy() for a single route, or app.proxyAll() to forward all routes under a given path.
- Zero lock-in: use as little or as much as you need

## Included utilities

- Logger — level-based logging via the default logger utility, configurable through APP_MODE and/or the mode setting.

```ts
import { logger } from '@crumbjs/edge';
logger.debug(a, b, c, d); // shows on mode:  'development'
logger.info(a, b, c, d); // shows on modes:  'development', 'test', 'staging'
logger.warn(a, b, c, d); // shows on modes: 'development', 'test', 'staging'
logger.error(a, b, c, d); // shows on modes: 'development', 'test', 'staging', 'production'
```

- OpenAPI — additional documentation support through the openapi utility, using provided helpers or by directly accessing the openapi3-ts builder instance.

```ts
import { openapi } from '@crumbjs/edge';
// Use this before app.serve()
openapi.addSchema('myschema', myZodObject);
openapi.addTag('tagName', 'tagDescription');
openapi.addServer('http://prod.example.com', 'Production Server description');
openapi.builder().addExternalDocs(extDoc); // or any openapi3-ts methods
```

- JWT — minimal utility to sign, verify, and decode JSON Web Tokens.

```ts
import { JWT } from '@crumbjs/edge';

const token = await JWT.sign<AuthPayload>(myPayload, 'super-secret', 60 * 15); // 15min JWT token
const payload = await JWT.verify<AuthPayload>(token, 'super-secret');
const decoded = JWT.decode<AuthPayload>(token); // decode no-verify
```

- HTTP Client — Fluent Fetch API wrapper with Zod prevalidation and unified error handling via the Exception system, for effortless HTTP integration between crumbjs services.

```ts
import { HttpClient } from '@crumbjs/edge';

const httpClient = new HttpClient('http://127.0.0.1:8080');

const { data, error } = await httpClient
	.path('/v1/auth')
	.prevalidate(loginRequestSchema) // prevalidate with zod before execute request
	.data({
		domain: 'grave-brief',
		email: 'adela17@gmail.com',
		password: 'MyPassword2025!',
	})
	.post<{ refreshToken: string }>();

console.log('login result:', data);

const refresh = await httpClient.path('/v1/auth').bearer(res.refreshToken).patch();

console.log('refresh result:', refresh);
```

## Included middlewares

- cors
- secureHeaders (ported from Hono)

## Installation

You can scaffold a new project with the official template:

```bash
bun create crumbjs-worker myapp
```

Alternatively, add the framework to an existing Bun project:

```bash
bun add @crumbjs/edge
```

## Quick start (conceptual examples)

```ts
import { App, spec } from '@crumbjs/edge';
import { z } from 'zod';

type Vars = {
	user: {
		id: string;
		email: string;
	};
};

const app = new App<Env, Vars>();

app.get(
	'/hello/:name',
	({ params }) => ({
		hello: params.name, // <-- typed params
	}),
	{
		// Optional way to document path params
		params: {
			name: {
				example: 'CrumbJS',
				description: 'The name we will greet',
			},
		},
		responses: [spec.response(200, z.object({ hello: z.string().meta({ example: 'CrumbJS' }) }))],
	},
);

// POST /posts — create a blog post
app.post(
	'/posts',
	// Pick the values and tools you need from Context
	async ({ body, setStatus }) => {
		// Auto-slug if missing
		const slug = body.slug ?? slugify(body.title);

		const [created] = await db
			.insert(posts)
			.values({ ...body, slug })
			.returning();

		// Set 201 Status code
		setStatus(201);

		return created; // your framework will JSON-serialize it
	},
	// Route Config (all the parameters are optionals)
	{
		// Content-Type definition throws if is not the same from the request (also document openapi media type)
		type: 'application/json',
		// Validate + document the body (Zod drives both)
		body: z.object({
			title: z.string().min(10).max(50).meta({ example: 'My new post' }),
			slug: z
				.string()
				.regex(/^[a-z0-9-]+$/i, 'Use letters, numbers, and dashes only')
				.optional()
				.meta({ example: 'my-new-post' }),
			content: z.string().min(150).meta({ example: 'Write at least 150 chars of useful content...' }),
		}),
		// headers: z.object(...) // Same as body: Validate + Document
		// query: z.object(...) // Same as body: Validate + Document
		// extra OpenAPI metadata
		summary: 'Create a post',
		description: 'Creates a blog post. If `slug` is omitted, it is generated from `title`.',
		tags: ['Posts'],
		operationId: 'createPost',
		// hide: true, // to dont show the route in openapi
	},
);

app.serve();
```

## The Handler Context

```ts
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

	/** Cloudflare ExecutionContext */
	executionContext: IExecutionContext;

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
```

Run your server with Bun:

```bash
npx wranger dev
```

OpenAPI documentation is served automatically at `http://localhost:8787/openapi` by default.

## Environment variables

Configuration can be supplied via environment variables or programmatically. The following variables are supported:

| Variable              | Description                                                       | Default             |
| --------------------- | ----------------------------------------------------------------- | ------------------- |
| `APP_MODE`/`NODE_ENV` | Application mode (`development`, `production`, `test`, `staging`) | `development`       |
| `APP_VERSION`         | API/app version                                                   | `1.0.0`             |
| `OPENAPI`             | Enable/disable OpenAPI generation (`true`/`false`)                | `true`              |
| `LOCALE`              | Zod error locale (`en`, `es`, `pt`)                               | `en`                |
| `OPENAPI_TITLE`       | Global OpenAPI title                                              | `API`               |
| `OPENAPI_DESCRIPTION` | Global OpenAPI description                                        | `API Documentation` |
| `OPENAPI_PATH`        | Base path for OpenAPI routes                                      | `openapi`           |
| `OPENAPI_UI`          | UI for docs (`swagger` or `scalar`)                               | `scalar`            |

Check the included example wrangler.jsonc

## Programmatic configuration

You can also override settings in code using `serve` options:

```ts
app.overrideConfig({ withOpenapi: false, mode: 'staging' });
```

## Framework Philosophy

While inspired by the simplicity and performance of Hono and Elysia, this framework takes a very different approach:
it is built 100% for backends that operate as part of a multi-service ecosystem, where data validation and automatic documentation are first-class citizens.

Rather than being just a minimal library to “spin up endpoints,” it’s an integrated package that:
Validates inputs and outputs declaratively at the route level, reducing errors and increasing trust between services.
Documents your API automatically (OpenAPI/Swagger) from the same validation definitions, avoiding code duplication and drift.
Facilitates integration across microservices, internal APIs, and external clients with clear, consistent contracts.
Keeps it lightweight and fast, without sacrificing production-grade robustness.

The goal is not to compete with general-purpose web frameworks, but to be the best tool for distributed backend architectures where validation + documentation are part of the natural development flow.

## License

MIT
