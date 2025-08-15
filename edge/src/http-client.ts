import { Exception } from './exception';
import { flattenError, ZodType } from 'zod';
import { logger } from './logger';
import { BadRequest } from './exception/http.exception';

type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'OPTIONS' | 'HEAD' | 'TRACE' | 'CONNECT';
type ContentType = 'application/json' | 'application/x-www-form-urlencoded' | 'multipart/form-data';
type QueryValue = string | string[] | number | number[];

/**
 * Fluent fetch-api wrapper
 *
 * Example usage:
 * ```ts
 * const httpClient = new HttpClient("http://127.0.0.1:8080");
 * 
 * const { data, error } = await httpClient
 *		.path('/v1/auth')
 *		.basicAuth('user', 'pass')
 *      .prevalidate(loginRequestSchema) // prevalidate with zod before execute request
 *		.data({
 *			domain: 'grave-brief',
 *			email: 'adela17@gmail.com',
 *			password: 'MyPassword2025!',
 *		})
 *		.post<{ refreshToken: string }>();

 * console.log('login result:', data);
 *
 * const refresh = await httpClient.path('/v1/auth').bearer(res.refreshToken).patch();
 * 
 * console.log('refresh result:', refresh);
 * ```
 */
export class HttpClient {
	#url: string = '';
	#path: string = '';
	#method: HttpMethod = 'GET';
	#body: Record<string, any> | string = '';
	#headers: Record<string, string> = {}; // Record<string, string> on setters
	#query: Record<string, string> = {}; // Record<string, string> on setters
	#isForm: boolean = false;
	#credentials: RequestCredentials = 'include';
	#contentType: ContentType = 'application/json'; // content types who have a auto-parse logic in getBody()
	#dataSchema: ZodType | null = null;

	constructor(baseUrl?: string) {
		if (baseUrl) this.url(baseUrl);
	}

	public url(url: string) {
		this.#url = url;

		return this;
	}

	public path(path: string) {
		this.#path = path;
		return this;
	}

	/**
	 * Set the request to send FormData
	 */
	public form() {
		delete this.#headers['content-type'];
		this.#isForm = true;
		return this;
	}

	public rawBody(body: string, type: string) {
		this.#body = body;
		this.#headers['content-type'] = type;
	}

	public queryParams(params: Record<string, QueryValue>) {
		for (const [key, value] of Object.entries(params)) {
			this.query(key, value);
		}

		return this;
	}

	public query(key: string, value: QueryValue) {
		this.#query[key] = this.toStringValue(value);
		return this;
	}

	public setContentType(type: ContentType) {
		this.#contentType = type;
		if (this.#contentType === 'multipart/form-data') {
			this.#isForm = true;
		}
	}

	public data(data: Record<string, any>, type: ContentType = 'application/json') {
		this.#body = data;
		this.setContentType(type);

		return this;
	}

	public bearer(token: string) {
		this.#headers['authorization'] = `Bearer ${token}`;
		return this;
	}

	public basicAuth(username: string, password: string) {
		const basicAuth = btoa(`${username}:${password}`);
		this.#headers['authorization'] = `Basic ${basicAuth}`;
		return this;
	}

	private toStringValue(value: QueryValue): string {
		if (Array.isArray(value)) return value.join(','); // o JSON.stringify(value)
		return String(value);
	}

	public headers(headers: Record<string, string | any[] | number>) {
		for (const [key, value] of Object.entries(headers)) {
			this.header(key, value);
		}

		return this;
	}

	public header(name: string, value: string | any[] | number) {
		this.#headers[name.toLowerCase()] = this.toStringValue(value);
		return this;
	}

	public credentials(opt: RequestCredentials) {
		this.#credentials = opt;
		return this;
	}

	public method(method: HttpMethod) {
		this.#method = method;
		return this;
	}

	public get<T = any>() {
		return this.method('GET').do<T>();
	}

	public post<T = any>() {
		return this.method('POST').do<T>();
	}

	public put<T = any>() {
		return this.method('PUT').do<T>();
	}

	public patch<T = any>() {
		return this.method('PATCH').do<T>();
	}

	public delete<T = null>() {
		return this.method('DELETE').do<T>();
	}

	public options<T = any>() {
		return this.method('OPTIONS').do<T>();
	}

	public head<T = null>() {
		return this.method('HEAD').do<T>();
	}

	public trace<T = null>() {
		return this.method('TRACE').do<T>();
	}

	public connect<T = any>() {
		return this.method('CONNECT').do<T>();
	}

	private toFormData(): FormData {
		if (typeof this.#body === 'string' || !this.#body) {
			throw Error('Invalid body, trying to send FormData with emprty or text body.');
		}

		const formData = new FormData();

		for (const key in this.#body) {
			const value = this.#body[key];

			if (value instanceof File || value instanceof Blob) {
				formData.append(key, value);
			} else if (Array.isArray(value)) {
				for (const item of value) {
					formData.append(`${key}[]`, item);
				}
			} else if (value !== undefined && value !== null) {
				formData.append(key, String(value));
			}
		}

		return formData;
	}

	private getBody(): BodyInit | null {
		if (!this.#body || this.#method === 'GET' || this.#method === 'HEAD') return null;

		// prevalidate and parse body if dataSchema is set
		if (this.#dataSchema) {
			const res = this.#dataSchema.safeParse(this.#body);

			if (!res.success) {
				logger.debug({ message: `fails on 'preflight' validation schema` });
				throw new BadRequest({
					part: 'body',
					errors: flattenError(res.error).fieldErrors,
				});
			}

			this.#body = res.data as Record<string, any> | string;
		}

		// Raw Body
		if (typeof this.#body === 'string') {
			return this.#body;
		}

		// Form Data
		if (this.#isForm) {
			return this.toFormData();
		}

		// Parse by contentType (included form-data if user set content type without .isForm()?)
		switch (this.#contentType) {
			case 'application/json':
				return JSON.stringify(this.#body);
			case 'application/x-www-form-urlencoded':
				return new URLSearchParams(this.#body as Record<string, string>).toString();
			case 'multipart/form-data': // PLD
				return this.toFormData();
			default:
				throw new Error(`Unsupported content type: ${this.#contentType} use for example: client.rawBody('...', 'application/xml').get()`);
		}
	}

	/**
	 * Set the schema to validate data (of body) before sending the request at 'do'
	 */
	public prevalidate(schema: ZodType) {
		this.#dataSchema = schema;
		return this;
	}

	private reset() {
		this.#path = '';
		this.#method = 'GET';
		this.#body = '';
		this.#headers = {};
		this.#query = {};
		this.#isForm = false;
		this.#contentType = 'application/json';
		this.#dataSchema = null;
	}

	private async execute<T = any>() {
		try {
			const requestInit = {
				method: this.#method,
				headers: this.#headers,
				body: this.getBody(),
				keepalive: true,
				credentials: this.#credentials,
			};

			const queryString = new URLSearchParams(this.#query).toString();

			const urlWithPath = this.#url + this.#path;
			const urlWithQuery = queryString ? `${urlWithPath}?${queryString}` : urlWithPath;

			logger.debug({
				message: 'Executing HTTP Request',
				url: urlWithQuery,
				requestInit,
			});

			const response = await fetch(urlWithQuery, requestInit);

			const raw = await response.text();
			const isJson = raw.startsWith('{') || raw.startsWith('[');

			const responseBody = isJson ? JSON.parse(raw) : raw;

			logger.debug({
				message: 'Request finish',
				responseBody,
			});

			if (!response.ok) {
				return {
					data: null,
					error: Exception.parse(responseBody).toObject(),
				};
			}

			return {
				data: responseBody as T,
				error: null,
			};
		} catch (error) {
			return {
				data: null,
				error: Exception.parse(error).toObject(),
			};
		}
	}

	/**
	 * Execute request and return data/error monade
	 */
	private async do<T = any>() {
		const result = await this.execute<T>();
		// After execution the HttpClient will be reset to defaults only keeping #url (the base url) and #credentials config
		this.reset();
		return result;
	}
}
