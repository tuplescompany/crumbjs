import type { AppMode } from '../types';
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

export function getModeLogLevel(mode: AppMode) {
	if (mode === 'production') return LogLevel.ERROR; // only errors
	if (mode === 'qa' || mode === 'staging') return LogLevel.INFO; // excludes DEBUG

	return LogLevel.DEBUG; // all levels
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
