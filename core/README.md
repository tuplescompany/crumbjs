# @crumbjs/core

CrumbJS is a lightweight API framework for [Bun](https://bun.com/) focused on backend development. It layers configuration, validation and documentation on top of Bun's built-in router while keeping a familiar Express-like developer experience. Validation is powered by [Zod](https://github.com/colinhacks/zod) and every route can be automatically documented through OpenAPI.

## Features

- Built for Bun.serve and only targets backend APIs
- Zod-based validation for bodies, params, queries and headers
- Automatic OpenAPI 3.1 document generation and UI (Swagger or Scalar)
- Simple middleware system and optional global middlewares
- Zero lock-in: use as little or as much as you need

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

## Quick start

```ts
import { App, spec } from '@crumbjs/core';
import { z } from 'zod';

const app = new App('api').get('/hello/:name', ({ params: { name } }) => ({ name }), {
	params: z.object({ name: z.string() }),
	responses: [spec.response(200, z.object({ name: z.string() }))],
});

app.serve();
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

You can also override settings in code using the exported `config` helper:

```ts
import { config } from '@crumbjs/core';

config.merge({ port: 3000, withOpenapi: false });
```

## Philosophy

CrumbJS is inspired by modern frameworks like Hono and Elysia but has a distinct goal: a clean, Bun-only backend layer with first-class validation and automatic documentation. It does not implement an HTTP router—instead it relies on Bun's own routing and adds typed validation, middleware chaining and OpenAPI generation on top.

## License

MIT
