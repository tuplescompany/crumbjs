---
layout: ../../layouts/BaseLayout.astro
title: Signals
---

# Signals

Log request metrics like method, path, status and duration.

```ts
import { App } from '@crumbjs/core';
import { signals } from '@crumbjs/core/middlewares/signals';

const app = new App();

app.use(signals()); // or signals(true) to always log

app.get('/', () => 'pong');

app.serve();
```
