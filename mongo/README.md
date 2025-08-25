# @crumbjs/mongo | Connects your crumbjs api with mongodb and auto-generate crud resources

<img src="https://raw.githubusercontent.com/tuplescompany/crumbjs/refs/heads/main/logo/crumbjs.png" alt="CrumbJS Logo" width="200"/>
- The tasty way to build fast apis.

[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Bun](https://img.shields.io/badge/Bun-1.2.20-black?logo=bun)](https://bun.sh)

The **CrumbJS Mongo Plugin** brings first-class MongoDB support into your CrumbJS applications.  
It provides everything you need to go from a plain collection to a fully validated REST API in minutes:

- 🔌 **Connection Manager** – simple `MONGO_URI` setup or multiple named connections with full `MongoClientOptions` support.
- 📄 **Schema helpers** – thin wrappers around Zod (`document`, `field`, `timestamps`, `softDelete`) that enforce consistent schema shapes without hiding Zod’s flexibility.
- 🛠️ **Repository Layer** – type-safe repository abstraction with helpers for pagination, filtering, soft deletes, and raw access to the underlying MongoDB collection when you need full control.
- ⚡ **Auto-CRUD Resources** – generate REST endpoints (`GET`, `POST`, `PUT`, `PATCH`, `DELETE`) automatically from a Zod schema, complete with validation, soft deletes, hooks, and OpenAPI docs.

In short: **define a schema once, and instantly get a secure, documented, production-ready API on top of MongoDB**, while still having the flexibility to drop down into raw repositories whenever you need custom logic.

## Install

Install the plugin in your API project:

```bash
bun install @crumbjs/mongo
```

## Documentation

[Full Documentation Page](https://crumbjs.com/docs/plugins/mongo/)
