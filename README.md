# crumbjs | The tasty way to build fast apps.

<img src="https://raw.githubusercontent.com/tuplescompany/crumbjs/refs/heads/main/logo/crumbjs.png" alt="CrumbJS Logo" width="200"/>

- ...Documentation page in progress

CrumbJS is a lightweight API framework for [Bun](https://bun.com/) focused on backend development. It layers configuration, validation and documentation on top of Bun's built-in router while keeping a familiar Express-like developer experience. Validation is powered by [Zod](https://github.com/colinhacks/zod) and every route can be automatically documented through OpenAPI.

The core system has only about 3,700 lines of code and just two dependencies (zod and openapi3-ts).

## Features

- Built for Bun.serve and only targets backend APIs
- Zod-based validation for bodies, params, queries and headers
- Automatic OpenAPI 3.1 document generation and UI (Swagger or Scalar)
- Simple middleware system and optional global middlewares
- Simple proxy helpers to forward requests and (optionally) document them — use app.proxy() for a single route, or app.proxyAll() to forward all routes under a given path.
- Zero lock-in: use as little or as much as you need

## Included utilities

- Logger — level-based logging via the default logger utility, configurable through APP_MODE and/or the mode setting.

```ts
import { logger } from '@crumbjs/core';
logger.debug(a, b, c, d); // shows on mode:  'development'
logger.info(a, b, c, d); // shows on modes:  'development', 'test', 'staging'
logger.warn(a, b, c, d); // shows on modes: 'development', 'test', 'staging'
logger.error(a, b, c, d); // shows on modes: 'development', 'test', 'staging', 'production'
```

- OpenAPI — additional documentation support through the openapi utility, using provided helpers or by directly accessing the openapi3-ts builder instance.

```ts
import { openapi } from '@crumbjs/core';
// Use this before app.serve()
openapi.addSchema('myschema', myZodObject);
openapi.addTag('tagName', 'tagDescription');
openapi.addServer('http://prod.example.com', 'Production Server description');
openapi.builder().addExternalDocs(extDoc); // or any openapi3-ts methods
```

- JWT — minimal utility to sign, verify, and decode JSON Web Tokens.

```ts
import { JWT } from '@crumbjs/core';

const token = await JWT.sign<AuthPayload>(myPayload, 'super-secret', 60 * 15); // 15min JWT token
const payload = await JWT.verify<AuthPayload>(token, 'super-secret');
const decoded = JWT.decode<AuthPayload>(token); // decode no-verify
```

- HTTP Client — Fluent Fetch API wrapper with Zod prevalidation and unified error handling via the Exception system, for effortless HTTP integration between crumbjs services.

```ts
import { HttpClient } from '@crumbjs/core';

const httpClient = new HttpClient('http://127.0.0.1:8080');

const { data, error } = await httpClient
	.path('/v1/auth')
	.basicAuth('user', 'pass')
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
- signals (log incomming request)
- secureHeaders (ported from Hono)

## Installation

You can scaffold a new project with the official template:

```bash
bun create crumbjs myapp
```

This runs the [`create-crumbjs`](../create-crumbjs) script which copies a template, installs dependencies with Bun and prints common commands.

Alternatively, add the framework to an existing Bun project:

```bash
bun add @crumbjs/core
```

## Quick start (conceptual examples)

```ts
import { App, spec } from '@crumbjs/core';
import { z } from 'zod';

const app = new App();

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
type Context<
	PATH extends string = any,
	BODY extends ZodObject | undefined = any,
	QUERY extends ZodObject | undefined = any,
	HEADERS extends ZodObject | undefined = any,
> = {
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
bun run src/index.ts
```

OpenAPI documentation is served automatically at `http://localhost:8080/openapi` by default.

## Environment variables

Configuration can be supplied via environment variables or programmatically. The following variables are supported:

| Variable              | Description                                                       | Default             |
| --------------------- | ----------------------------------------------------------------- | ------------------- |
| `APP_MODE`/`NODE_ENV` | Application mode (`development`, `production`, `test`, `staging`) | `development`       |
| `APP_VERSION`         | API/app version                                                   | `1.0.0`             |
| `PORT`                | HTTP port                                                         | `8080`              |
| `OPENAPI`             | Enable/disable OpenAPI generation (`true`/`false`)                | `true`              |
| `LOCALE`              | Zod error locale (`en`, `es`, `pt`)                               | `en`                |
| `OPENAPI_TITLE`       | Global OpenAPI title                                              | `API`               |
| `OPENAPI_DESCRIPTION` | Global OpenAPI description                                        | `API Documentation` |
| `OPENAPI_PATH`        | Base path for OpenAPI routes                                      | `openapi`           |
| `OPENAPI_UI`          | UI for docs (`swagger` or `scalar`)                               | `scalar`            |

Example `.env`:

```env
PORT=3000
OPENAPI=false
```

## Programmatic configuration

You can also override settings in code using `serve` options:

```ts
app.serve({ port: 3000, withOpenapi: false });
```

## Philosophy

CrumbJS is inspired by modern frameworks like Hono and Elysia but has a distinct goal: a clean, Bun-only backend layer with first-class validation and automatic documentation. It does not implement an HTTP router—instead it relies on Bun's own routing and adds typed validation, middleware chaining and OpenAPI generation on top.

## License

MIT
