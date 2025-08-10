/**
 * Format of all layer exception
 */
export type ExceptionType = {
	status: number;
	message: string;
	fields?: any;
	debug?: any;
};

export class Exception extends Error {
	constructor(
		message: string,
		public status: number,
		public fields?: any,
		public raw?: unknown,
	) {
		super(message);
	}

	getDebug(): any {
		return process.env.NODE_ENV !== 'production'
			? {
					debug: {
						name: this.name,
						stack: this.stack,
						cause: this.cause,
					},
				}
			: null;
	}

	toObject(): ExceptionType {
		return {
			status: this.status,
			message: this.message,
			fields: this.fields,
			...this.getDebug(),
		};
	}

	toHtml(): string {
		const title = `<b>${this.message} (${this.status})</b>`;

		const withDebug = this.getDebug();
		const detail = withDebug ? `<pre><small>${JSON.stringify(withDebug, null, 2)}</small></pre>` : '';

		return `${title}<br/>${detail}`;
	}

	/**
	 * Convert ExceptionType object to an Exception instance
	 */
	static from(ex: ExceptionType) {
		return new Exception(ex.message, ex.status, ex.fields);
	}

	/**
	 * Convert any unknown error type to an Exception instance
	 */
	static parse(error: unknown, statusCode: number = 500): Exception {
		if (error instanceof Exception) return error;

		const defaultMessage = '¡Opps! Ocurrió un error';
		const defaultCode = statusCode;

		if (typeof error === 'string') {
			return new Exception(error, defaultCode, undefined, error);
		}

		if (error && typeof error === 'object') {
			return new ExceptionObjectParser(error).parse();
		}

		return new Exception(defaultMessage, defaultCode);
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

	private resolveStatus(): number {
		return this.pick<number>('status', 'number') || this.pick<number>('code', 'number') || 500;
	}

	private resolveInvalidFields(): any {
		return this.pick<object>('fields', 'object') ?? {};
	}

	parse(): Exception {
		let status = this.resolveStatus();
		if (status <= 100 || status > 599) status = 500;

		return new Exception(this.resolveMessage(), status, this.resolveInvalidFields(), this.err);
	}
}
