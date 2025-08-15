import { Cors } from './middlewares/cors';
import type { APIConfig, AppConfig } from './types';

/**
 * Some options can be casted from ENV
 *
 * Supports:
 * - PORT: number for the http port (inferred through Router)
 * - OPENAPI: boolean to enable/disable openapi (inferred through Router)
 * - LOCALE: string for ex 'en' to define zod locale (inferred through Router)
 * - OPENAPI_TITLE: openapi scpec global title (inferred through openapi util)
 * - OPENAPI_DESCRIPTION: openapi scpec global description (inferred through openapi util)
 * - OPENAPI_PATH: openapi scpec global path (inferred through openapi util)
 * - APP_VERSION: openapi scpec global version and app release version (inferred through openapi util)
 */
export const defaultApiConfig: APIConfig = {
	mode: 'development',
	version: '1.0.0',
	port: 8080,
	withOpenapi: true,
	locale: 'en',
	openapiTitle: 'API',
	openapiDescription: 'API Documentation',
	openapiBasePath: 'openapi',
	openapiUi: 'scalar',
	notFoundHandler: ({ setStatus, setHeader }) => {
		setStatus(404);
		setHeader('Content-Type', 'text/plain');
		return '';
	},
	errorHandler: ({ setStatus, exception }) => {
		setStatus(exception.status);
		return exception.toObject();
	},
};

export const defaultAppConfig: AppConfig = {
	prefix: '',
};

export const defaultCorsConfig: Omit<Cors, 'origin'> = {
	methods: ['DELETE', 'GET', 'HEAD', 'OPTIONS', 'PATCH', 'POST', 'PUT'],
	allowedHeaders: ['Content-Type', 'Authorization', 'X-Api-Key'],
	credentials: true,
	exposedHeaders: [],
	maxAge: 600,
};

export const locales = ['en', 'es', 'pt'] as const;

export const modes = ['development', 'production', 'test', 'staging'] as const;

export const pathRegex: RegExp = /^\/(?:[^\/\0]+\/)*[^\/\0]*$/; // nosonar

export const openapiUis = ['swagger', 'scalar'] as const;
