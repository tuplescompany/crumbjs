import { getStatusText } from '../utils';

export class StatusBuilder {
	public text: string;

	constructor(
		public code: number,
		text?: string,
	) {
		this.text = text ?? getStatusText(code);
	}

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
