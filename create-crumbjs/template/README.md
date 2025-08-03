# Backend CrumbJS application

## Run local server

```bash
bun run dev
```

## Run test

```bash
bun test
```

## Build

```bash
bun test
```

## Docker

```bash
# Building Image
docker build -t crumb-app .

# Removing existing container if exists...
docker rm -f crumb-app-container 2>$null

# "Running container..."
docker run --name crumb-app-container --env-file .env -p 8080:8080 crumb-app
```

## Example environment

```sh
# 'development' | 'production' | 'test' | 'staging'
APP_MODE=development
APP_VERSION=1.0.0
PORT=8080
# 'en' | 'es' | 'pt'
LOCALE=en
# any non-"false" is true
OPENAPI=true
OPENAPI_TITLE=API
OPENAPI_DESCRIPTION=API Documentation
OPENAPI_PATH=/openapi
# scalar|swagger|redoc
OPENAPI_UI=scalar
```
