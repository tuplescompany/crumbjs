---
layout: ../layouts/BaseLayout.astro
title: Plugins
---

# Plugins

CrumbJS supports an extensible plugin system. Currently available:

## BullMQ

Job queue backed by Redis using BullMQ.

```ts
import { App } from '@crumbjs/core';
import { bullmqPlugin } from '@crumbjs/bullmq';

const app = new App();
app.use(bullmqPlugin());
app.serve();
```

See the `bullmq` folder for source and usage details.
