import { z, type ZodType } from 'zod';
import type { ContentType, ResponseConfig } from './types';
import { STATUS_CODES } from 'node:http';

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

export function getStatusText(status: number | string, def: string = 'Unknown') {
	if (STATUS_CODES[status]) return STATUS_CODES[status];
	return def;
}

export function capitalize(str: string) {
	return str.charAt(0).toUpperCase() + str.slice(1);
}

export const spec = {
	file(name?: string) {
		return z.file(name).meta({ type: 'string', format: 'binary' });
	},
	response(status: number | 'default', schema: ZodType, type: ContentType = 'application/json') {
		return {
			status,
			schema,
			type,
		} as ResponseConfig;
	},
} as const;

export function headersToRecord(headers: Headers) {
	const record: Record<string, string> = {};

	headers.forEach((value, key) => {
		record[key] = value;
	});

	return record;
}
