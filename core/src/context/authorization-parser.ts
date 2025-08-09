import { BunRequest } from 'bun';
import { BadRequest } from '../exception/http.exception';

/**
 * Utility class for parsing HTTP `Authorization` headers from
 * {@link Request} or {@link BunRequest} objects.
 *
 * Supported authentication schemes:
 * - **Bearer**: via {@link getBearer()} — returns the token without the "Bearer " prefix.
 * - **Basic**: via {@link getCredentials()} — decodes Base64 credentials into `{ user, password }`.
 *
 * Throws {@link BadRequest} when the header is missing, malformed, or fails validation.
 */
export class AuthorizationParser {
	private authorization: string;

	/**
	 * Creates a new parser instance for the provided request.
	 *
	 * @param req - The HTTP request object.
	 */
	constructor(req: Request | BunRequest) {
		this.authorization = req.headers.get('authorization') ?? '';
	}

	/**
	 * Extracts the Bearer token from the `Authorization` header.
	 *
	 * @returns The raw Bearer token string (without the "Bearer " prefix).
	 * @throws {BadRequest} If the header is missing, not using Bearer scheme, or too short.
	 */
	getBearer(): string {
		if (!this.authorization?.startsWith('Bearer ')) {
			throw new BadRequest({ authorization: ['Bearer empty or inexistent'] });
		}

		if (this.authorization.length < 10) {
			throw new BadRequest({ authorization: ['Bearer too short'] });
		}

		return this.authorization.slice(7);
	}

	/**
	 * Extracts Basic Authentication credentials from the `Authorization` header.
	 *
	 * @returns An object containing `{ user, password }`.
	 * @throws {BadRequest} If the header is missing, not using Basic scheme, or malformed.
	 */
	getBasicCredentials(): { user: string; password: string } {
		if (!this.authorization?.startsWith('Basic ')) {
			throw new BadRequest({ authorization: ['Basic auth empty or inexistent'] });
		}

		const base64Credentials = this.authorization.slice(6).trim();
		let decoded: string;

		try {
			decoded = Buffer.from(base64Credentials, 'base64').toString('utf8');
		} catch {
			throw new BadRequest({ authorization: ['Invalid Base64 credentials'] });
		}

		const separatorIndex = decoded.indexOf(':');
		if (separatorIndex === -1) {
			throw new BadRequest({ authorization: ['Invalid Basic auth format'] });
		}

		const user = decoded.slice(0, separatorIndex);
		const password = decoded.slice(separatorIndex + 1);

		if (!user) {
			throw new BadRequest({ authorization: ['Username cannot be empty'] });
		}

		return { user, password };
	}
}
