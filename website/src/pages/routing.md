---
layout: ../layouts/BaseLayout.astro
title: Routing
---

# Routing

Define routes with the HTTP verbs you need. Each handler receives a typed context with params, body, query and helpers.

```ts
import { App } from '@crumbjs/core';

const app = new App();

app.get('/users', () => []);
app.post('/users', ({ body }) => body);
app.put('/users/:id', ({ params, body }) => ({ id: params.id, ...body }));
app.patch('/users/:id', ({ params, body }) => ({ id: params.id, ...body }));
app.delete('/users/:id', ({ params }) => ({ id: params.id }));
app.options('/users', () => new Response(null, { headers: { Allow: 'GET,POST' } }));
app.head('/users', () => new Response(null));

app.static('/assets', './public'); // serve a directory
app.staticFile('/favicon.ico', './public/favicon.ico'); // serve a single file
app.proxy('/search/*', 'https://example.com'); // proxy matching routes
app.proxyAll('/api/*', 'https://backend.internal'); // proxy preserving path

app.serve();
```
