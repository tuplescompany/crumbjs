export class StatusBuilder {
	constructor(
		private status: number,
		private statusText?: string,
	) {}

	set(code: number, text?: string) {
		this.status = code;
		this.statusText = text ?? String(code);
	}

	get() {
		return {
			code: this.status,
			text: this.statusText,
		};
	}
}
