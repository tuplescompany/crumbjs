import { getStatusText } from '../utils';

export class StatusBuilder {
	constructor(
		public code: number,
		public text?: string,
	) {}

	set(code: number, customText?: string) {
		this.code = code;
		this.text = customText || getStatusText(code);
	}

	get() {
		return {
			status: this.code,
			statusText: this.text,
		};
	}
}
