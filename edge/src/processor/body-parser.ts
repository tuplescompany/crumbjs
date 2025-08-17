export type ParsedContentType = 'json' | 'form-urlencoded' | 'form-data' | (string & {}); // nosonar

export class BodyParser {
	private readonly request: Request;

	constructor(request: Request) {
		// use a cloned request, to keep a free instance of request for the dev
		this.request = request.clone();
	}

	/**
	 * Parses FormData and converts it into a plain JavaScript object.
	 * Handles multiple values for the same key by creating an array.
	 */
	private parseFormData(formData: FormData): Record<string, any> {
		const data: Record<string, any> = Object.create(null);

		formData.forEach((value, key) => {
			data[key] = value;
		});

		return data;
	}

	/**
	 * - Supports repeated keys and array-like keys (`key[]`).
	 * - Decodes '+' to space and percent-encoded sequences.
	 * - Returns plain object with either string or string[] values.
	 */
	private parseUrlEncoded(body: string): Record<string, any> {
		const out: Record<string, any> = Object.create(null);
		if (!body) return out;

		let start = 0;
		for (let i = 0, n = body.length; i <= n; i++) {
			// '&' (charCode 38) separates pairs or marks the end of the string
			if (i === n || body.charCodeAt(i) === 38 /* & */) {
				if (i > start) this.processSegment(body, start, i, out);
				start = i + 1;
			}
		}
		return out;
	}

	// parseUrlEncoded segment helper
	private processSegment(src: string, start: number, end: number, out: Record<string, any>) {
		const seg = src.slice(start, end);
		const eq = seg.indexOf('=');

		const rawKey = eq === -1 ? seg : seg.slice(0, eq);
		const rawVal = eq === -1 ? '' : seg.slice(eq + 1);

		const key = this.safeDecode(rawKey);
		const val = this.safeDecode(rawVal);

		this.assignParam(out, key, val);
	}

	// parseUrlEncoded segment helper
	private assignParam(out: Record<string, any>, key: string, val: string) {
		const isArrayKey = key.endsWith('[]');
		const k = isArrayKey ? key.slice(0, -2) : key;

		const prev = out[k];
		if (prev === undefined) {
			out[k] = isArrayKey ? [val] : val;
			return;
		}
		if (Array.isArray(prev)) {
			prev.push(val);
			return;
		}
		out[k] = [prev, val];
	}

	// parseUrlEncoded segment helper
	private safeDecode(s: string): string {
		if (s.indexOf('%') === -1 && s.indexOf('+') === -1) return s;
		try {
			// reemplaza '+' por espacio antes de decodeURIComponent
			return decodeURIComponent(s.replace(/\+/g, ' '));
		} catch {
			// si viene roto, devolvemos crudo
			return s.replace(/\+/g, ' ');
		}
	}

	private parseContentType(): ParsedContentType {
		const raw = this.request.headers.get('content-type') ?? '';
		const mime = raw.split(';', 1)[0].trim().toLowerCase(); // e.g., "application/json"

		if (mime === 'application/json' || mime.endsWith('+json')) return 'json';
		if (mime === 'multipart/form-data') return 'form-data';
		if (mime === 'application/x-www-form-urlencoded') return 'form-urlencoded';

		return raw;
	}

	private isContentEmpty(): boolean {
		const lenHeader = this.request.headers.get('content-length');
		if (lenHeader === null) return false; // unknown (chunked or not provided)

		const len = parseInt(lenHeader, 10);
		if (Number.isNaN(len)) return false; // invalid header, treat as unknown

		return len === 0;
	}

	/**
	 * Parses the request body based on its Content-Type header.
	 * @returns A promise that resolves to the parsed body data.
	 */
	public async parse(): Promise<Record<string, any>> {
		if (['GET', 'HEAD', 'OPTIONS'].includes(this.request.method)) return {};

		const contentType = this.parseContentType();

		// Check if empty content to avoid parsing
		if (this.isContentEmpty()) {
			switch (contentType) {
				case 'json':
				case 'form-data':
				case 'form-urlencoded':
					return {};
				default:
					return { content: '' };
			}
		}

		switch (contentType) {
			case 'json':
				return await this.request.json();
			case 'form-data':
				return this.parseFormData(await this.request.formData());
			case 'form-urlencoded':
				return this.parseUrlEncoded(await this.request.text());
			default:
				return { content: await this.request.text() };
		}
	}
}
