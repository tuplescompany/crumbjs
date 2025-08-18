import { z, type ZodType } from 'zod';
import type { AppMode, ContentType, ResponseConfig } from '../types';
import { logger, LogLevel } from './logger';

/**
 * Normalizes and joins multiple path segments into a clean, well-formed URL path.
 *
 * - Trims each segment and removes empty fragments.
 * - Splits on slashes to support nested paths.
 * - Ensures the final path starts with a single '/' and contains no duplicate slashes.
 *
 * Useful for dynamically composing route paths in a consistent and safe way.
 */
export function buildPath(...parts: string[]): string {
	let result: string[] = [];

	// Split each part by '/' and clean each segment
	for (const part of parts) {
		const cleanedSegments = part
			.split('/')
			.map((segment) => segment.trim()) // Trim each segment
			.filter(Boolean); // Remove any empty segments
		result.push(...cleanedSegments); // Add cleaned segments to the result
	}

	// Join back with single slashes and ensure no leading/trailing slashes
	return `/${result.join('/')}`;
}

export function capitalize(str: string) {
	return str.charAt(0).toUpperCase() + str.slice(1);
}

export const spec = {
	/**
	 * Shortcut to define a file input schema within a ZodObject body.
	 * Automatically sets the correct OpenAPI `type` and `format` for file uploads.
	 *
	 * @param name - Optional name for the file (used for internal identification)
	 * @returns A Zod schema representing a binary file field
	 */
	file(name?: string) {
		return z.file(name).meta({ type: 'string', format: 'binary' });
	},

	/**
	 * Helper to define an OpenAPI-compatible response schema.
	 *
	 * This function simplifies attaching status codes, content type, and schema definitions
	 * for OpenAPI route documentation.
	 *
	 * @param status - HTTP status code (e.g., 200) or 'default'
	 * @param schema - The Zod schema representing the response body
	 * @param type - Optional content type (defaults to 'application/json')
	 * @returns A typed response config for OpenAPI documentation
	 */
	response(status: number | 'default', schema: ZodType, type: ContentType = 'application/json') {
		return {
			status,
			schema,
			type,
		} as ResponseConfig;
	},
} as const;

export function getModeLogLevel(mode: AppMode) {
	if (mode === 'production') return LogLevel.ERROR; // only errors
	if (mode === 'qa' || mode === 'staging') return LogLevel.INFO; // excludes DEBUG

	return LogLevel.DEBUG; // all levels
}

/**
 * Logs a single resolved HTTP request line with basic metadata.
 *
 * Outputs the HTTP method, path, status code with status text,
 * request duration, and IP address, using the specified log level.
 *
 * @param type - The log method to use (`info`, `print`, or `error`).
 * @param method - The HTTP method (e.g., 'GET', 'POST').
 * @param path - The URL path of the request.
 * @param status - The HTTP status code (e.g., 200, 404).
 * @param statusText - The status text (e.g., 'OK', 'Not Found').
 * @param duration - The request duration in milliseconds.
 * @param ip - The IP address of the requester.
 *
 * @example
 * signal('info', 'GET', '/api/users', 200, 'OK', 123.45, '127.0.0.1');
 * // Logs:
 * // 2025-08-08T17:22:00.000Z INFO [default] GET /api/users 200::OK 123.45 ms -- 127.0.0.1
 */
export function signal(type: 'info' | 'print' | 'error', method: string, path: string, status: number, duration: number, ip: string) {
	logger[type](method, path, `STATUS::${status}`, `${duration.toFixed(2)} ms`, `-- ${ip}`);
}

export function objectCleanUndefined<T extends Record<string, unknown>>(obj?: T): T {
	if (!obj) return {} as T;
	return Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined)) as T;
}

export function asArray<T>(value: T | T[] | null | undefined): T[] {
	if (!value) return [];
	if (Array.isArray(value)) return value;
	return [value];
}
