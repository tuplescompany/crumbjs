---
layout: ../../layouts/BaseLayout.astro
title: Middleware
---

# Middleware

Middlewares run before your handlers. Register global middleware with `app.use()` or pass them per-route in the route config.

```ts
import { App } from '@crumbjs/core';

const app = new App();

const logger = async (ctx, next) => {
	console.log(ctx.request.method, ctx.url.pathname);
	return next();
};

app.use(logger); // global

const auth = async (ctx, next) => {
	if (!ctx.headers.authorization) return new Response('Unauthorized', { status: 401 });
	return next();
};

app.get('/secret', { use: auth }, () => '🔒');

app.serve();
```

Included middlewares:

- [CORS](./cors)
- [Secure headers](./secure-headers)
- [Signals](./signals)
