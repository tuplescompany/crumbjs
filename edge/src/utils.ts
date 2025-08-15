import { z, type ZodType } from 'zod';
import type { AppMode, ContentType, ResponseConfig } from './types';
import { logger, LogLevel } from './logger';

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
	if (mode === 'test' || mode === 'staging') return LogLevel.INFO; // excludes DEBUG

	return LogLevel.DEBUG; // all levels
}

export function objectCleanUndefined<T extends Record<string, unknown>>(obj?: T): T {
	if (!obj) return {} as T;
	return Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined)) as T;
}
