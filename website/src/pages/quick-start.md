---
layout: ../layouts/BaseLayout.astro
title: Quick Start
---

# Quick Start

## Create a new project

```bash
bun create crumbjs my-app
cd my-app
bun install
```

## Add core to an existing project

```bash
bun add @crumbjs/core
```

## Minimal server

```ts
import { App } from '@crumbjs/core';

const app = new App();

app.get('/hello', () => ({ hello: 'world' }));

app.serve();
```

Run with `bun run src/index.ts`.
