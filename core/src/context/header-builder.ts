export class HeaderBuilder {
	private readonly headers = new Headers();

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
