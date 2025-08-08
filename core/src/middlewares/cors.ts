import { Method, Middleware, MiddlewareContext } from '../types';

export type OriginFn = (ctx: MiddlewareContext) => string;

export type Origin = string | string[] | OriginFn;

const stringOriginFn = (origin: string): OriginFn => {
	return (ctx: MiddlewareContext) => {
		if (origin === '*') return '*';
		return ctx.origin.length && ctx.origin === origin ? origin : '';
	};
};

const arrayOriginFn = (origin: string[]): OriginFn => {
	return (ctx: MiddlewareContext) => {
		for (const o of origin) {
			if (o === ctx.origin) return o;
		}

		return '';
	};
};

const getOriginFn = (origin: string | string[] | OriginFn): OriginFn => {
	if (typeof origin === 'function') return origin;
	if (Array.isArray(origin)) {
		// Soporta comodín si viene incluido en el array
		if (origin.includes('*')) {
			return () => '*';
		}
		return arrayOriginFn(origin);
	}
	// string
	return stringOriginFn(origin);
};

/**
 * Cross-Origin Resource Sharing (CORS) configuration object.
 *
 * This type allows flexible control over allowed origins, headers, and methods.
 *
 * Defaults (if a field is omitted):
 * - `methods`: `['DELETE', 'GET', 'HEAD', 'OPTIONS', 'PATCH', 'POST', 'PUT']`
 * - `allowedHeaders`: `['Content-Type', 'Authorization']`
 * - `credentials`: not sent unless explicitly set to `true`
 * - `exposedHeaders`: not set unless provided
 * - `maxAge`: not set unless provided
 */
export type Cors = {
	/**
	 * Allowed origin(s). Can be:
	 * - a string (exact match)
	 * - a function that receives the request context and returns a boolean
	 */
	origin: Origin;

	/**
	 * Allowed HTTP methods for CORS requests.
	 * @default
	 * [`DELETE`, `GET`, `HEAD`, `OPTIONS`, `PATCH`, `POST`, `PUT`]
	 */
	methods?: Method[];

	/**
	 * Allowed headers for incoming requests.
	 * @default
	 * ['Content-Type', 'Authorization']
	 */
	allowedHeaders?: string[];

	/**
	 * Headers that can be exposed to the browser.
	 * Default: none
	 * @default undefined
	 */
	exposedHeaders?: string[];

	/**
	 * How long the results of a preflight request can be cached (in seconds).
	 * Default: not set
	 * @default undefined
	 */
	maxAge?: number;

	/**
	 * Whether to include `Access-Control-Allow-Credentials: true`.
	 * Default: not set (credentials will not be sent)
	 */
	credentials?: boolean;

	/**
	 * Return and empty response on OPTIONS preflight request with the configured cors headers
	 * @default true
	 */
	handleOptionsRequest?: boolean;
};

/**
 * CORS Middleware options.
 * - `Origin`: a string or function that receives the request context and returns true on valid origin. @see {Origin}
 * - `Cors`: a full configuration object defining allowed origins, methods, headers, etc. @see {Cors}
 * @default false
 */
export const cors = (opts: Cors | string | ((ctx: MiddlewareContext) => string)): Middleware => {
	const corsOpts: Cors = typeof opts === 'object' && opts !== null && 'origin' in opts ? opts : { origin: opts };

	return async function (ctx: MiddlewareContext) {
		const { credentials, methods, allowedHeaders, exposedHeaders, maxAge, handleOptionsRequest } = corsOpts;

		// Convert allways to a functional origin validator and execute it passing MiddlewareContext
		const validOrigin = getOriginFn(corsOpts.origin)(ctx);

		const mustDisableOrigin = validOrigin === '*' && credentials === true;

		if (!mustDisableOrigin && validOrigin) ctx.setHeader('Access-Control-Allow-Origin', validOrigin);

		if (credentials) ctx.setHeader('Access-Control-Allow-Credentials', credentials ? 'true' : 'false');

		if (methods) ctx.setHeader('Access-Control-Allow-Methods', methods.join(','));
		else ctx.setHeader('Access-Control-Allow-Methods', ['DELETE', 'GET', 'HEAD', 'OPTIONS', 'PATCH', 'POST', 'PUT'].join(',')); // Default all methods

		if (allowedHeaders) ctx.setHeader('Access-Control-Allow-Headers', allowedHeaders.join(','));
		else ctx.setHeader('Access-Control-Allow-Headers', ['Content-Type', 'Authorization'].join(',')); // Default basic headers allowed

		if (exposedHeaders && exposedHeaders.length) ctx.setHeader('Access-Control-Expose-Headers', exposedHeaders.join(','));

		if (maxAge) ctx.setHeader('Access-Control-Max-Age', String(maxAge));

		// If the incomming request is OPTIONS and handleOptionsRequest is not false, return an empty response with cors headers
		if (handleOptionsRequest !== false && ctx.request.method === 'OPTIONS') {
			return new Response(null, {
				headers: ctx.getResponseHeaders(),
				status: 204,
			});
		}

		return await ctx.next();
	};
};
