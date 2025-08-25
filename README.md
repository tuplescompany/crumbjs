# @crumbjs/core | Build, Validate & Document APIs. Fast.

<img src="https://raw.githubusercontent.com/tuplescompany/crumbjs/refs/heads/main/logo/crumbjs.png" alt="CrumbJS Logo" width="200"/>
- The tasty way to build fast apis.

[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Bun](https://img.shields.io/badge/Bun-1.2.20-black?logo=bun)](https://bun.sh)

[Full Documentation Page](https://crumbjs.com)

CrumbJS is a lightweight API framework for [Bun](https://bun.com/) focused on backend development. It layers configuration, validation and documentation on top of Bun's built-in router while keeping a familiar Express-like developer experience. Validation is powered by [Zod](https://github.com/colinhacks/zod) and every route can be automatically documented through OpenAPI.

The core system has only about 3,700 lines of code and just two dependencies (zod and openapi3-ts).

## Features

- Built for Bun.serve and only targets backend APIs
- Zod-based validation for bodies, queries and headers
- Automatic OpenAPI 3.1 document generation and UI (Swagger or Scalar)
- Auto-generate type-safe clients (eg. for frontend), with zero allocations.
- Simple middleware system and optional global middlewares
- Simple proxy helpers to forward requests and (optionally) document them — use app.proxy() for a single route, or app.proxyAll() to forward all routes under a given path.

## Included middlewares

- cors
- signals (log incomming request)
- secureHeaders

## Official Plugins

- [@crumbjs/bullmq](https://www.npmjs.com/package/@crumbjs/bullmq) -> Bullmq worker aside CrumbJS server. For simple redis queue system
- [@crumbjs/mongo](https://www.npmjs.com/package/@crumbjs/mongo) -> Mongo connection handler, **AUTO-CRUD!** and simple repository provider based on zod

## Documentation

[Full Documentation Page](https://crumbjs.com/docs/plugins/mongo/)
