export class BodyParser {
	private readonly request: Request;
	private parsedData: Record<string, unknown> | null = null;

	constructor(request: Request) {
		this.request = request;
	}

	/**
	 * Parses FormData and converts it into a plain JavaScript object.
	 * Handles multiple values for the same key by creating an array.
	 */
	private async parseFormData(formData: FormData): Promise<Record<string, unknown>> {
		const data: Record<string, unknown> = {};

		for (const [key, value] of formData.entries()) {
			if ((value as any) instanceof File) {
				// You can extend this to handle files specifically, e.g., save them or store their metadata
				data[key] = value;
			} else if (data[key] !== undefined) {
				// If the key already exists, convert to array or add to existing array
				data[key] = Array.isArray(data[key]) ? [...(data[key] as unknown[]), value] : [data[key], value];
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
	private async parseUrlEncoded(body: string): Promise<Record<string, unknown>> {
		const params = new URLSearchParams(body);
		const data: Record<string, unknown> = {};

		for (const [key, value] of params.entries()) {
			if (data[key] !== undefined) {
				// If the key already exists, convert to array or add to existing array
				data[key] = Array.isArray(data[key]) ? [...(data[key] as unknown[]), value] : [data[key], value];
			} else {
				data[key] = value;
			}
		}
		return data;
	}

	/**
	 * Parses plain text body and returns it as an object with a 'text' property.
	 */
	private async parsePlain(body: string): Promise<Record<string, unknown>> {
		return { text: body };
	}

	/**
	 * Parses the request body based on its Content-Type header.
	 * Caches the parsed data to avoid redundant parsing.
	 * @returns A promise that resolves to the parsed body data.
	 */
	public async parse(): Promise<Record<string, unknown>> {
		// If data is already parsed, return it immediately
		if (this.parsedData !== null) {
			return this.parsedData;
		}

		const contentType = this.request.headers.get('content-type') ?? '';

		if (contentType.includes('application/json')) {
			const json = await this.request.text();
			this.parsedData = json ? (JSON.parse(json) as Record<string, unknown>) : {};
		} else if (contentType.includes('multipart/form-data')) {
			const formData = await this.request.formData(); // NOSONAR
			this.parsedData = await this.parseFormData(formData);
		} else if (contentType.includes('application/x-www-form-urlencoded')) {
			const text = await this.request.text();
			this.parsedData = await this.parseUrlEncoded(text);
		} else {
			// Default to plain text parsing if content type is not recognized
			const text = await this.request.text();
			this.parsedData = await this.parsePlain(text);
		}

		return this.parsedData;
	}

	/**
	 * Returns the parsed body data. Throws an error if `parse()` has not been called yet.
	 * Use this getter after ensuring `await parse()` has been executed.
	 */
	public get data(): Record<string, unknown> {
		if (this.parsedData === null) {
			throw new Error('Body has not been parsed yet. Call `await parse()` first.');
		}
		return this.parsedData;
	}
}
