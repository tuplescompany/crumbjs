// proxy-ts utilities for proxy routes
import z from 'zod';
import { Handler } from '../types';
import { InternalServerError } from '../exception/http.exception';

export function createProxyHandler(localPath: string, dest: string): Handler {
	// If is a raw URL string, proceed to http standard foward
	if (z.url().safeParse(dest)) {
		return async ({ request, url }) => {
			// Remove local path from fowardPath
			const fowardPath = url.pathname.replace(localPath, '');
			const targetUrl = new URL(fowardPath + url.search, dest);

			const fowardHeaders = buildFowardHeaders(request);

			const hasBody = !['GET', 'HEAD', 'OPTIONS'].includes(request.method);
			const fowardBody = hasBody ? request.body : undefined;

			// Forward request to target
			const upstream = await fetch(targetUrl, { method: request.method, headers: fowardHeaders, body: fowardBody });

			return new Response(upstream.body, {
				status: upstream.status,
				statusText: upstream.statusText,
				headers: buildResponseHeaders(upstream),
			});
		};
	}

	// may be an Fetcher instance
	return async ({ env, request }) => {
		const fetcher = env[dest];
		if (typeof fetcher === 'function' && 'fetch' in fetcher) {
			return fetcher.fetch(request);
		}

		throw new InternalServerError(`'${dest}' is not a valid Fetcher binding`);
	};
}

function buildResponseHeaders(response: Response): Headers {
	const headers = new Headers(response.headers);
	// let the runtime to re detect this headers
	for (const h of ['content-encoding', 'content-length', 'transfer-encoding']) headers.delete(h);
	return headers;
}

function buildFowardHeaders(request: Request): Headers {
	const headers = new Headers(request.headers);
	// clean hop-by-hop headers
	for (const h of [
		'host',
		'connection',
		'keep-alive',
		'proxy-connection',
		'transfer-encoding',
		'upgrade',
		'te',
		'trailers',
		'proxy-authenticate',
		'proxy-authorization',
		'content-length',
		'accept-encoding',
	]) {
		headers.delete(h);
	}
	// remove auto-encoding
	headers.set('accept-encoding', 'identity');

	return headers;
}
