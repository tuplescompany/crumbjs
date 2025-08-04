import { Method, Middleware, MiddlewareContext, RootContext } from '../types';

const stringOriginFn = (origin: string) => {
	return (ctx: RootContext) => {
		if (origin === '*') return true;
		return ctx.origin.length && ctx.origin === origin;
	};
};

type Origin = string | ((ctx: RootContext) => boolean);

export type Cors = {
	origin: Origin;
	methods: Method[];
	allowedHeaders: string[];
	exposedHeaders: string[];
	maxAge?: number;
	credentials?: boolean;
};

export const cors = (opts: Cors): Middleware => {
	return async function (ctx: MiddlewareContext) {
		const { credentials, methods, allowedHeaders, exposedHeaders, maxAge } = opts;

		// Convert allways to a functional origin validator
		const validateOrigin = typeof opts.origin === 'string' ? stringOriginFn(opts.origin) : opts.origin;

		const validOrigin = validateOrigin(ctx);

		if (validOrigin) ctx.setHeader('Access-Control-Allow-Origin', ctx.origin);

		if (credentials) ctx.setHeader('Access-Control-Allow-Credentials', credentials ? 'true' : 'false');

		if (methods.length) ctx.setHeader('Access-Control-Allow-Methods', methods.join(','));

		if (allowedHeaders.length) ctx.setHeader('Access-Control-Allow-Headers', allowedHeaders.join(','));

		if (exposedHeaders.length) ctx.setHeader('Access-Control-Expose-Headers', exposedHeaders.join(','));

		if (maxAge) ctx.setHeader('Access-Control-Max-Age', String(maxAge));

		return await ctx.next();
	};
};
