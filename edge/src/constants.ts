import { Cors } from './middlewares/cors';
import type { APIConfig, ErrorHandler, NotFoundHandler } from './types';

export const defaultApiConfig: APIConfig = {
	mode: 'development',
	version: '1.0.0',
	withOpenapi: true,
	locale: 'en',
	openapiTitle: 'API',
	openapiDescription: 'API Documentation',
	openapiBasePath: 'openapi',
	openapiUi: 'scalar',
};

export const defaultErrorHandler: ErrorHandler = ({ setStatus, exception }) => {
	setStatus(exception.status);
	return exception.toObject();
};

export const defaultNotFoundHandler: NotFoundHandler = ({ setStatus, setHeader }) => {
	setStatus(404);
	setHeader('Content-Type', 'text/plain');
	return null;
};

export const defaultCorsConfig: Omit<Cors, 'origin'> = {
	methods: ['DELETE', 'GET', 'HEAD', 'OPTIONS', 'PATCH', 'POST', 'PUT'],
	allowedHeaders: ['Content-Type', 'Authorization', 'X-Api-Key'],
	credentials: true,
	exposedHeaders: [],
	maxAge: 600,
};

export const locales = ['en', 'es', 'pt'] as const;

export const modes = ['development', 'production', 'qa', 'staging'] as const;

export const pathRegex: RegExp = /^\/(?:[^\/\0]+\/)*[^\/\0]*$/; // nosonar

export const openapiUis = ['swagger', 'scalar'] as const;
