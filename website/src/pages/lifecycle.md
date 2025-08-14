---
layout: ../layouts/BaseLayout.astro
title: Life Cycle
---

# Life Cycle

Each request is processed by the `Processor`, which builds the context and runs middlewares before executing your handler.

## Context helpers

- `body`, `query`, `params` – validated data
- `setStatus(code, text?)` – set response status
- `setHeader(key, value)` – add response header
- `getResponseHeaders()` – read final headers
- `bearer()` and `basicCredentials()` – parse auth headers
- `set()` and `get()` – per-request storage

```ts
import { App, spec } from '@crumbjs/core';
import { z } from 'zod';

const app = new App();

app.post(
	'/posts',
	({ body, setStatus }) => {
		setStatus(201);
		return { id: 1, ...body };
	},
	{
		body: z.object({ title: z.string() }),
	},
);

app.serve();
```
