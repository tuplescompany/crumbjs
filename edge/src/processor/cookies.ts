/**
 * Cookie utilities that works with Cloudflare Workers.
 *
 * Goals:
 * - Parse request cookies safely (RFC 6265-ish).
 * - Set/Delete response cookies with secure defaults:
 *   HttpOnly + Secure + SameSite=Lax + Path=/.
 * - Keep multiple Set-Cookie headers until you build your Response.
 *
 * Usage:
 *   const jar = new CookieJar(request);
 *   const session = jar.get('session');
 *   jar.set('session', 'abc123', { httpOnly: true, sameSite: 'Lax' });
 *   jar.delete('legacy');
 *
 *   const headers = new Headers();
 *   jar.apply(headers); // appends all Set-Cookie headers
 *   return new Response(body, { status: 200, headers });
 */

export type SameSite = 'Strict' | 'Lax' | 'None';

export type CookieInit = {
	/** Cookie path (defaults to "/") */
	path?: string;
	/** Cookie domain (omit unless you know you need it) */
	domain?: string;
	/** Cookie expiration as Date, ISO string, or epoch ms */
	expires?: Date | string | number;
	/** Max-Age in seconds */
	maxAge?: number;
	/** Mark cookie as HttpOnly (default: true) */
	httpOnly?: boolean;
	/** Mark cookie as Secure (default: true) */
	secure?: boolean;
	/** SameSite policy (default: "Lax") */
	sameSite?: SameSite;
	/** Priority hint (supported by some browsers) */
	priority?: 'Low' | 'Medium' | 'High';
	/** Partitioned cookie (Chromium/Edge feature) */
	partitioned?: boolean;
};

export class CookieJar {
	/** Request cookies (parsed once at construction) */
	private readonly requestCookies: Map<string, string>;
	/** Accumulated Set-Cookie headers for the outgoing response */
	private readonly pendingSetCookieHeaders: string[] = [];

	/** RFC6265 "token" for cookie names */
	private static readonly validNamePattern = /^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$/;

	constructor(request: Request) {
		this.requestCookies = this.parseRequestCookiesHeader(request.headers.get('cookie'));
	}

	/**
	 * Read a cookie from the incoming request.
	 * @param name Cookie name
	 * @returns The cookie value or null if it does not exist
	 */
	public get(name: string): string | null {
		return this.requestCookies.get(name) ?? null;
	}

	/**
	 * Set a cookie on the outgoing response.
	 * Secure defaults are applied unless explicitly overridden:
	 *   HttpOnly=true, Secure=true, SameSite='Lax', Path='/'
	 *
	 * If a cookie with the same name was already set during this request,
	 * the previous header is replaced to avoid duplicates.
	 *
	 * @param name Cookie name
	 * @param value Cookie value
	 * @param options Cookie attributes
	 */
	public set(name: string, value: string, options?: CookieInit): void {
		const headerValue = this.serializeCookie(name, value, {
			httpOnly: true,
			secure: true,
			sameSite: 'Lax',
			path: '/',
			...options,
		});

		const cookiePrefix = `${name}=`;
		const existingIndex = this.pendingSetCookieHeaders.findIndex((h) => h.startsWith(cookiePrefix));
		if (existingIndex >= 0) {
			this.pendingSetCookieHeaders[existingIndex] = headerValue;
		} else {
			this.pendingSetCookieHeaders.push(headerValue);
		}
	}

	/**
	 * Delete a cookie on the outgoing response by setting:
	 *   Max-Age=0 and Expires=Thu, 01 Jan 1970 00:00:00 GMT
	 *
	 * @param name Cookie name
	 * @param options Optional attributes (path/domain should match the original cookie)
	 */
	public delete(name: string, options?: CookieInit): void {
		const headerValue = this.serializeCookie(name, '', {
			...options,
			maxAge: 0,
			expires: new Date(0),
		});

		const cookiePrefix = `${name}=`;
		const existingIndex = this.pendingSetCookieHeaders.findIndex((h) => h.startsWith(cookiePrefix));
		if (existingIndex >= 0) {
			this.pendingSetCookieHeaders[existingIndex] = headerValue;
		} else {
			this.pendingSetCookieHeaders.push(headerValue);
		}
	}

	/**
	 * Append all pending Set-Cookie headers into the provided Headers object.
	 * Call this right before creating your Response.
	 *
	 * @param headers Headers to append into
	 */
	public apply(headers: Headers): void {
		for (const setCookie of this.pendingSetCookieHeaders) {
			headers.append('Set-Cookie', setCookie);
		}
	}

	/**
	 * Return a shallow copy of the pending Set-Cookie header strings.
	 * Useful for testing or advanced logging.
	 */
	public pending(): string[] {
		return [...this.pendingSetCookieHeaders];
	}

	// --------------------------
	// Private helper methods
	// --------------------------

	/**
	 * Parse the Cookie request header into a Map.
	 * Follows a forgiving approach: ignores malformed pairs, preserves last value on duplicates.
	 */
	private parseRequestCookiesHeader(cookieHeader: string | null): Map<string, string> {
		const result = new Map<string, string>();
		if (!cookieHeader) return result;

		const pairs = cookieHeader.split(';');
		for (const pair of pairs) {
			const equalIndex = pair.indexOf('=');
			if (equalIndex < 0) continue;

			const rawName = pair.slice(0, equalIndex).trim();
			const rawValue = pair.slice(equalIndex + 1).trim();
			if (!rawName) continue;

			try {
				// decodeURIComponent is generally safe for cookie values;
				// if it fails, fall back to the raw value.
				result.set(rawName, decodeURIComponent(rawValue));
			} catch {
				result.set(rawName, rawValue);
			}
		}
		return result;
	}

	/**
	 * Serialize a cookie (name + value + attributes) into a Set-Cookie header string.
	 * Applies security rules such as "SameSite=None requires Secure".
	 */
	private serializeCookie(name: string, value: string, options: CookieInit): string {
		this.assertValidCookieName(name);

		let header = `${name}=${this.encodeCookieValue(value)}`;

		if (options.maxAge != null) {
			const maxAgeSeconds = Math.floor(options.maxAge);
			header += `; Max-Age=${maxAgeSeconds}`;
		}

		if (options.expires != null) {
			header += `; Expires=${this.formatExpires(options.expires)}`;
		}

		// Path default
		header += `; Path=${options.path ?? '/'}`;

		if (options.domain) {
			header += `; Domain=${options.domain}`;
		}

		const sameSite = options.sameSite ?? 'Lax';
		if (sameSite) {
			header += `; SameSite=${sameSite}`;
		}

		const secure = options.secure ?? true;
		if (secure) {
			header += `; Secure`;
		}

		if (options.httpOnly ?? true) {
			header += `; HttpOnly`;
		}

		if (options.priority) {
			header += `; Priority=${options.priority}`;
		}

		if (options.partitioned) {
			header += `; Partitioned`;
		}

		// Browser rule: SameSite=None must be paired with Secure
		if (sameSite === 'None' && !secure) {
			throw new TypeError('SameSite=None requires the cookie to be Secure.');
		}

		return header;
	}

	/**
	 * Very small validation for cookie names: RFC6265 "token".
	 * Rejects control characters and separators that would break the header.
	 */
	private assertValidCookieName(name: string): void {
		if (!CookieJar.validNamePattern.test(name)) {
			throw new TypeError(`Invalid cookie name: ${name}`);
		}
	}

	/**
	 * Encode cookie value to avoid control chars and CRLF injection.
	 * encodeURIComponent preserves UTF-8 while keeping the header safe.
	 */
	private encodeCookieValue(value: string): string {
		const encoded = encodeURIComponent(value);
		// As an extra guard, reject any non-ASCII printable characters post-encoding
		if (/[^\x20-\x7E]/.test(encoded)) {
			throw new TypeError('Invalid cookie value.');
		}
		return encoded;
	}

	/**
	 * Normalize an expires value to a valid HTTP-date string (GMT).
	 */
	private formatExpires(expires: Date | string | number): string {
		const date = expires instanceof Date ? expires : new Date(expires);
		// If the date is invalid, it will stringify to "Invalid Date"
		if (isNaN(date.getTime())) {
			throw new TypeError('Invalid "expires" date for cookie.');
		}
		return date.toUTCString();
	}
}
