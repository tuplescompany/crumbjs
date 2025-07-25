/**
 * Format of all layer exception
 */
export type ExceptionType = {
	status: number;
	message: string;
	detail?: any;
};

export class Exception extends Error {
	constructor(
		message: string,
		public readonly status: number,
		public readonly detail?: any,
	) {
		super(message);
	}

	toObject(): ExceptionType {
		return {
			status: this.status,
			message: this.message,
			detail: this.detail,
		};
	}

	toHtml(): string {
		const title = `<b>${this.message} (${this.status})</b>`;
		const detail = this.detail ? `<pre><small>${JSON.stringify(this.detail, null, 2)}</small></pre>` : '';

		return `${title}<br/>${detail}`;
	}

	/**
	 * Convert ExceptionType object to an Exception instance
	 */
	static from(ex: ExceptionType) {
		return new Exception(ex.message, ex.status, ex.detail);
	}

	/**
	 * Convert any unknown error type to an Exception instance
	 */
	static parse(error: unknown, statusCode: number = 500): Exception {
		const defaultMessage = '¡Opps! Ocurrió un error';
		const defaultCode = statusCode;
		const defaultDetail: any = {};

		if (typeof error === 'string') {
			return new Exception(error, defaultCode, defaultDetail);
		}

		if (error && typeof error === 'object') {
			return new ExceptionObjectParser(error).parse();
		}

		return new Exception(defaultMessage, defaultCode, defaultDetail);
	}
}

class ExceptionObjectParser {
	constructor(private readonly err: object) {}

	private isValidObject(obj: unknown): obj is Record<string, unknown> {
		return typeof obj === 'object' && obj !== null && !Array.isArray(obj);
	}

	private pick<T>(field: string, type: 'string' | 'number' | 'object'): T | undefined {
		if (!this.isValidObject(this.err)) return undefined;

		const value = this.err[field];
		return typeof value === type ? (value as T) : undefined;
	}

	private resolveMessage(): string {
		return this.pick<string>('response', 'string') || this.pick<string>('message', 'string') || '¡Opps! Ocurrió un error';
	}

	private resolveCode(): number {
		return this.pick<number>('status', 'number') || this.pick<number>('code', 'number') || 500;
	}

	private resolveDetail(): any {
		if (!this.isValidObject(this.err)) return {};
		return this.pick<object>('response', 'object') ?? this.err['detail'] ?? {};
	}

	parse(): Exception {
		return new Exception(this.resolveMessage(), this.resolveCode(), this.resolveDetail());
	}
}
