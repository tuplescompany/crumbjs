# @crumbjs/bullmq - Background Jobs for snappy APIs

<img src="https://raw.githubusercontent.com/tuplescompany/crumbjs/refs/heads/main/logo/crumbjs.png" alt="CrumbJS Logo" width="200"/>
- The tasty way to build fast apis.

[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Bun](https://img.shields.io/badge/Bun-1.2.20-black?logo=bun)](https://bun.sh)

Make your API breathe. Offload slow or bursty work (emails, webhooks, reports, 3rd-party calls) to background jobs—without ceremony.

**What this plugin gives you**

- **BullMQ power, CrumbJS DX**: queues & workers wired in minutes.
- **Jobs as classes**: extend `Queueable<T>` and decorate with `@IsQueueable()`.
- **Auto-discovery**: handlers are registered on startup—no manual wiring.
- **Retries, backoff & delays**: resilient by default.
- **Concurrency control**: tune throughput per worker.
- **Type-safe payloads**: generics keep your job data honest.

**Great for**

- Transactional emails, webhook fan-out, data exports, cache warming, long-running tasks, and cron-like scheduling.
  > Heads-up: you’ll need a reachable Redis server (host/port or auth).

## Install

Let's install the plugin, on your api directory run:

```bash
bun install @crumbjs/bullmq
```

## Documentation

[Full Documentation Page](https://crumbjs-site.pages.dev/docs/plugins/queues)
