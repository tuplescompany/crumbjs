export const parseBody = (req: Request) => new BodyParser(req).parse();

export class BodyParser {
	private readonly request: Request;

	constructor(request: Request) {
		this.request = request;
	}

	/**
	 * Parses FormData and converts it into a plain JavaScript object.
	 * Handles multiple values for the same key by creating an array.
	 */
	private async parseFormData(formData: FormData): Promise<Record<string, any>> {
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
	private async parseUrlEncoded(body: string): Promise<Record<string, any>> {
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

	/**
	 * Parses plain text body and returns it as an object with a 'text' property.
	 */
	private async parsePlain(body: string): Promise<Record<string, any>> {
		return { text: body };
	}

	/**
	 * Parses the request body based on its Content-Type header.
	 * @returns A promise that resolves to the parsed body data.
	 */
	public async parse(): Promise<Record<string, any>> {
		const contentType = this.request.headers.get('content-type') ?? '';

		if (contentType.includes('application/json')) {
			const json = await this.request.text();
			return json ? (JSON.parse(json) as Record<string, any>) : {};
		} else if (contentType.includes('multipart/form-data')) {
			const formData = await this.request.formData(); // NOSONAR
			return await this.parseFormData(formData);
		} else if (contentType.includes('application/x-www-form-urlencoded')) {
			const text = await this.request.text();
			return await this.parseUrlEncoded(text);
		} else {
			// Default to plain text parsing if content type is not recognized
			const text = await this.request.text();
			return await this.parsePlain(text);
		}
	}
}
