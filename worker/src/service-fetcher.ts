import { IFetcher } from './cloudflare';
import { Exception, ExceptionType } from './exception';
import { buildPath } from './helpers/utils';

type HeadersKind = Headers | Record<string, string>;

type BodyKind = ReadableStream | XMLHttpRequestBodyInit | null;

type FetcherResult<T> = { error: null; data: T } | { error: ExceptionType; data: null };

/**
 * A utility class to perform typed HTTP requests to service bindings using Fetch.
 *
 * Provides simplified helper methods for standard HTTP verbs (`get`, `post`, `put`, etc.),
 * handling JSON parsing and error normalization via the `Exception` system.
 *
 * Automatically parses successful responses as JSON (when applicable),
 * and transforms non-OK responses or thrown errors into a consistent `FetcherResult<T>`.
 *
 * Usage:
 * ```ts
 * const { data, error } = await fetcher.get<User>('/users/123');
 * if (error) handleError(error);
 * else console.log(data);
 * ```
 *
 * Notes:
 * - Uses a placeholder FQDN to construct valid Request URLs internally, but is not really used by cloudflare.
 * - Headers and body payloads are passed directly to `fetch`.
 * - Also provides a `proxy` method to forward raw `Request` objects (e.g., from Hono) directly.
 */
export class ServiceFetcher {
	// FQDN "fake" placeholder to dont break Request object
	private readonly fqdn = 'https://fetcher.tupleshr.com';

	constructor(private readonly fetcher: IFetcher) {}

	get<T = any>(path: string, headers?: HeadersKind) {
		return this.execute<T>('GET', path, null, headers);
	}

	post<T = any>(path: string, body: BodyKind, headers?: HeadersKind) {
		return this.execute<T>('POST', path, body, headers);
	}

	put<T = any>(path: string, body: BodyKind, headers?: HeadersKind) {
		return this.execute<T>('PUT', path, body, headers);
	}

	patch<T = any>(path: string, body: BodyKind, headers?: HeadersKind) {
		return this.execute<T>('PATCH', path, body, headers);
	}

	delete<T = any>(path: string, body: BodyKind, headers?: HeadersKind) {
		return this.execute<T>('DELETE', path, body, headers);
	}

	head<T = any>(path: string, headers?: HeadersKind) {
		return this.execute<T>('HEAD', path, null, headers);
	}

	options<T = any>(path: string, body: BodyKind, headers?: HeadersKind) {
		return this.execute<T>('OPTIONS', path, body, headers);
	}

	/**
	 * Forwards an incoming `Request` (e.g., from a Hono handler) directly to the bound service,
	 * bypassing internal parsing, transformations, or FQDN construction.
	 *
	 * @param request - The `Request` or `HonoRequest` to forward.
	 * @returns The raw `Response` from the destination.
	 */
	proxy(request: Request) {
		return this.fetcher.fetch(request);
	}

	/**
	 * Internal method to execute an HTTP request with the given method, path, body, and headers.
	 *
	 * Builds a full URL using an internal fake FQDN to satisfy the Fetch API. Automatically includes
	 * `credentials: 'include'` in all requests to support cookie/session forwarding when applicable.
	 *
	 * - If the response body starts with `{` or `[`, it will be parsed as JSON.
	 * - On successful response (`response.ok === true`), the parsed body is returned as `data`.
	 * - On failure (`response.ok === false`), the body is parsed and wrapped in a standardized `error`
	 *   using the `Exception` class.
	 * - On thrown error (e.g. network failure, JSON parse error), the caught exception is normalized
	 *   into a `FetcherResult` with the error object.
	 *
	 * @template T The expected shape of the response data.
	 * @param method - The HTTP method to use (GET, POST, PUT, etc.).
	 * @param path - The relative path to the target endpoint (should start with `/`).
	 * @param body - Optional body payload (string, FormData, etc.).
	 * @param headers - Optional headers to include in the request.
	 * @returns A `Promise` that resolves to a `FetcherResult<T>`, containing either `data` or `error`.
	 */
	private async execute<T = any>(method: string, path: string, body: BodyKind, headers?: HeadersKind): Promise<FetcherResult<T>> {
		try {
			const fqdnPath = buildPath(this.fqdn, path);
			const init: RequestInit = {
				method,
				body,
				headers,
				credentials: 'include',
			};

			const response = await this.fetcher.fetch(fqdnPath, init);

			const raw = await response.text();
			const isJson = raw.startsWith('{') || raw.startsWith('[');

			const content = isJson ? JSON.parse(raw) : raw;

			if (!response.ok) {
				return {
					data: null,
					error: Exception.parse(content).toObject(),
				};
			}

			return {
				data: content as T,
				error: null,
			};
		} catch (error) {
			return {
				data: null,
				error: Exception.parse(error).toObject(),
			};
		}
	}
}
