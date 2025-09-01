// jwt.ts
import { Exception } from '../exception';
import { logger } from './logger';

type JWTHeader = {
	alg: 'HS256';
	typ: 'JWT';
};

type JWTBaseClaims = {
	iss?: string; // Issuer
	sub?: string; // Subject
	aud?: string | string[]; // Audience
	exp?: number; // Expiration time (seconds since epoch)
	nbf?: number; // Not before (seconds since epoch)
	iat?: number; // Issued at (seconds since epoch)
	jti?: string; // JWT ID
};

type Encodable = string | ArrayBuffer | Uint8Array;

const enc = new TextEncoder();
const dec = new TextDecoder();

function base64UrlEncode(data: Encodable): string {
	let str: string;
	if (typeof data === 'string') {
		str = btoa(data);
	} else if (data instanceof ArrayBuffer) {
		str = btoa(String.fromCharCode(...new Uint8Array(data)));
	} else {
		str = btoa(String.fromCharCode(...data));
	}
	return str.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64UrlDecode<T extends boolean = false>(str: string, asUint8?: T): T extends true ? Uint8Array : string {
	const bin = atob(str.replace(/-/g, '+').replace(/_/g, '/'));
	const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
	return (asUint8 ? bytes : dec.decode(bytes)) as any;
}

function base64UrlToUint8Array(base64Url: string): Uint8Array<ArrayBuffer> {
	const bin = atob(base64Url.replace(/-/g, '+').replace(/_/g, '/'));
	const len = bin.length;
	const buf = new ArrayBuffer(len);
	const bytes = new Uint8Array(buf);
	for (let i = 0; i < len; i++) {
		bytes[i] = bin.charCodeAt(i);
	}
	return bytes;
}

async function importKey(secret: string) {
	return crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);
}

export class JWTInvalidFormat extends Exception {
	constructor() {
		super('JWT Error: Invalid format.', 422);
	}
}

export class JWTInvalidSignature extends Exception {
	constructor() {
		super('JWT Error: Invalid signature.', 422);
	}
}

export class JWTExpired extends Exception {
	constructor() {
		super('JWT Error: Expired.', 422);
	}
}

export class JWT {
	/**
	 * Sign a JWT
	 */
	static async sign<T extends Record<string, any>>(payload: T & JWTBaseClaims, secret: string, expiresInSeconds: number): Promise<string> {
		const now = Math.floor(Date.now() / 1000);
		const fullPayload: T & JWTBaseClaims = {
			iat: payload.iat ?? now,
			exp: payload.exp ?? now + expiresInSeconds,
			...payload,
		};

		const header: JWTHeader = { alg: 'HS256', typ: 'JWT' };

		const headerEncoded = base64UrlEncode(JSON.stringify(header));
		const payloadEncoded = base64UrlEncode(JSON.stringify(fullPayload));
		const data = `${headerEncoded}.${payloadEncoded}`;

		const key = await importKey(secret);
		const signature = await crypto.subtle.sign('HMAC', key, enc.encode(data));
		const sigEncoded = base64UrlEncode(signature);

		return `${data}.${sigEncoded}`;
	}

	/**
	 * Verify and return a typed payload if valid, otherwise null
	 */
	static async verify<T extends Record<string, any>>(token: string, secret: string): Promise<T & JWTBaseClaims> {
		const [headerB64, payloadB64, sigB64] = token.split('.');
		if (!headerB64 || !payloadB64 || !sigB64) throw new JWTInvalidFormat();

		const data = `${headerB64}.${payloadB64}`;
		const key = await importKey(secret);

		const sigBytes = base64UrlToUint8Array(sigB64);
		const valid = await crypto.subtle.verify('HMAC', key, sigBytes, enc.encode(data));
		if (!valid) throw new JWTInvalidSignature();

		const payload: T & JWTBaseClaims = JSON.parse(base64UrlDecode(payloadB64));
		const now = Math.floor(Date.now() / 1000);
		if (payload.exp && now >= payload.exp) throw new JWTExpired();

		return payload;
	}

	/**
	 * Decode without verifying signature
	 */
	static decode<T extends Record<string, any>>(token: string): T & JWTBaseClaims {
		logger.warn('Decoding JWT without signature verification');
		const parts = token.split('.');
		if (parts.length < 2) throw new JWTInvalidFormat();
		try {
			return JSON.parse(base64UrlDecode(parts[1]));
		} catch {
			throw new JWTInvalidFormat();
		}
	}
}
