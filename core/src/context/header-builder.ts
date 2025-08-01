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
		this.headers.set(key, value);
	}

	append(key: string, value: string) {
		this.headers.append(key, value);
	}

	delete(key: string) {
		this.headers.delete(key);
	}

	toObject(): Headers {
		return this.headers;
	}
}
