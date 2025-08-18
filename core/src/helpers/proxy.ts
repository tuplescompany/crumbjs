// proxy-ts utilities for proxy routes
import { Handler } from '../types';

export function createProxyHandler(localPath: string, dest: string): Handler {
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
