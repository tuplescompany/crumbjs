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
		const data: Record<string, any> = {};

		for (const [key, value] of formData.entries()) {
			if ((value as any) instanceof File) {
				// You can extend this to handle files specifically, e.g., save them or store their metadata
				data[key] = value;
			} else if (data[key] !== undefined) {
				// If the key already exists, convert to array or add to existing array
				data[key] = Array.isArray(data[key]) ? [...(data[key] as any[]), value] : [data[key], value];
			} else {
				data[key] = value;
			}
		}
		return data;
	}

	/**
	 * Parses URL-encoded string and converts it into a plain JavaScript object.
	 * Handles multiple values for the same key by creating an array.
	 */
	private parseUrlEncoded(body: string): Record<string, any> {
		const params = new URLSearchParams(body);
		const data: Record<string, any> = {};

		for (const [key, value] of params.entries()) {
			if (data[key] !== undefined) {
				// If the key already exists, convert to array or add to existing array
				data[key] = Array.isArray(data[key]) ? [...(data[key] as any[]), value] : [data[key], value];
			} else {
				data[key] = value;
			}
		}
		return data;
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
