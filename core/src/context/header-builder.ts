export class HeaderBuilder {
	private readonly headers = new Headers();

	constructor(defaults?: Record<string, string>) {
		if (defaults) {
			for (const [key, value] of Object.entries(defaults)) {
				this.set(key, value);
			}
		}
	}

	set(key: string, value: string) {
		this.headers.set(key.toLowerCase(), value);
	}

	append(key: string, value: string) {
		this.headers.append(key.toLowerCase(), value);
	}

	delete(key: string) {
		this.headers.delete(key.toLowerCase());
	}

	toObject(): Headers {
		return this.headers;
	}
}
