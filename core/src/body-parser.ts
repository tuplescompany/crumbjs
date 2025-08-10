import { BunRequest } from 'bun';

export type ParsedContentType = 'json' | 'form-urlencoded' | 'form-data' | (string & {});

export const parseBody = (req: BunRequest) => new BodyParser(req).parse();

export class BodyParser {
	private readonly request: BunRequest;

	constructor(request: BunRequest) {
		this.request = request;
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
	 * Fast URL-encoded parser: single pass, no intermediate arrays.
	 * - Supports repeated keys and array-like keys (`key[]`).
	 * - Decodes '+' to space and percent-encoded sequences.
	 * - Returns plain object with either string or string[] values.
	 */
	private parseUrlEncoded(body: string): Record<string, any> {
		const out: Record<string, any> = Object.create(null);
		if (body.length === 0) return out;

		let start = 0;
		for (let i = 0; i <= body.length; i++) {
			// '&' (charCode 38) separates pairs or marks the end of the string
			if (i === body.length || body.charCodeAt(i) === 38 /* & */) {
				const seg = body.slice(start, i);
				if (seg) {
					// No '=' present: treat as key with empty value
					const eq = seg.indexOf('=');
					let rawKey: string, rawVal: string;
					if (eq === -1) {
						rawKey = seg;
						rawVal = '';
					} else {
						rawKey = seg.slice(0, eq);
						rawVal = seg.slice(eq + 1);
					}

					// Decode '+' to space and percent sequences
					const key = this.safeDecode(rawKey);
					const val = this.safeDecode(rawVal);

					// Detect array-like key pattern (e.g., "tags[]")
					const isArrayKey = key.endsWith('[]');
					const k = isArrayKey ? key.slice(0, -2) : key;

					const prev = out[k];
					if (prev === undefined) {
						out[k] = isArrayKey ? [val] : val;
					} else if (Array.isArray(prev)) {
						prev.push(val);
					} else {
						out[k] = [prev, val];
					}
				}
				start = i + 1;
			}
		}

		return out;
	}

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
