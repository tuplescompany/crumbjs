import type { APIConfig } from './types';
import { Exception } from './exception';

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
	notFoundHandler: () => {
		return new Response('NOT_FOUND', {
			status: 404,
			headers: {
				'Content-Type': 'text/plain',
			},
		});
	},
	errorHandler: (req, error) => {
		console.error(`${new Date().toISOString()} [REQUEST ERROR] ${req.method} ${req.url}:`, error);

		const parsed = error instanceof Exception ? error.toObject() : Exception.parse(error).toObject();
		return new Response(JSON.stringify(parsed), {
			status: parsed.status,
			headers: {
				'Content-Type': 'application/json',
			},
		});
	},
};

export const locales = ['en', 'es', 'pt'] as const;

export const modes = ['development', 'production', 'test', 'staging'] as const;

export const pathRegex: RegExp = /^\/(?:[^\/\0]+\/)*[^\/\0]*$/;
