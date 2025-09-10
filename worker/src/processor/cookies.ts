// cookies.ts
import { type CookieSerializeOptions, parse, serialize } from 'cookie-es';

export class Cookies {
	#cookies: Record<string, string>;
	#sets: string[] = [];

	constructor(private readonly request: Request) {
		this.#cookies = parse(this.request.headers.get('cookie') || '');
	}

	get(name: string): string | null {
		return this.#cookies[name] ?? null;
	}

	set(name: string, value: string, options: CookieSerializeOptions = {}) {
		options.path ??= '/';
		if (options.sameSite === 'none' && options.secure !== true) {
			options.secure = true; // modern browsers require Secure when SameSite=None
		}
		this.#sets.push(serialize(name, value, options));
	}

	del(name: string, options: CookieSerializeOptions = {}) {
		options.path ??= '/';
		options.maxAge = 0;
		options.expires = new Date(0);
		this.#sets.push(serialize(name, '', options));
	}

	apply(headers: Headers) {
		for (const sc of this.#sets) headers.append('Set-Cookie', sc);
	}
}
