/**
 * Normalizes and joins multiple path segments into a clean, well-formed URL path.
 *
 * - Trims each segment and removes empty fragments.
 * - Splits on slashes to support nested paths.
 * - Ensures the final path starts with a single '/' and contains no duplicate slashes.
 *
 * Useful for dynamically composing route paths in a consistent and safe way.
 */
export const buildPath = (...parts: string[]): string => {
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
};
