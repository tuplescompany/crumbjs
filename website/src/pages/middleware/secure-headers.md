---
layout: ../../layouts/BaseLayout.astro
title: Secure Headers
---

# Secure Headers

Sets common security‑related headers like `Content-Security-Policy` or `X-Frame-Options`.

```ts
import { App } from '@crumbjs/core';
import { secureHeaders } from '@crumbjs/core/middlewares/secure-headers';

const app = new App();

app.use(secureHeaders());

app.get('/', () => 'ok');

app.serve();
```
