import { extendZodWithOpenApi } from '@asteasolutions/zod-to-openapi';
import { config as dotEnvConfig } from 'dotenv';
import z from 'zod';

export { Exception } from './exception';

export {
	BadRequest,
	Forbidden,
	Unauthorized,
	UnprocessableEntity,
	InternalServerError,
	NotFound,
	Conflict,
} from './exception/http.exception';

export { App } from './app';

export type { Middleware, NotFoundHandler, ErrorHandler } from './types';

/**
 * Helper to extend Zod with .openapi
 * required at entrypoint...
 * @param zod
 */
export const extend = (zod: typeof z) => {
	extendZodWithOpenApi(zod);
};
