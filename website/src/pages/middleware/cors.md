---
layout: ../../layouts/BaseLayout.astro
title: CORS Middleware
---

# CORS

Allow or restrict cross‑origin requests.

```ts
import { App } from '@crumbjs/core';
import { cors } from '@crumbjs/core/middlewares/cors';

const app = new App();

app.use(cors({ origin: 'https://example.com' }));

app.get('/data', () => ({ ok: true }));

app.serve();
```
