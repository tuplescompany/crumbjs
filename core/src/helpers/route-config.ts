import { RouteConfig } from '../types';
import { spec } from './spec';

type Part = 'body' | 'headers' | 'params' | 'query';
const PRIORITY: Part[] = ['body', 'query', 'headers', 'params'];

/**
 * Ensures a `400 Bad Request` response is registered when validation rules exist.
 *
 * If the user defines validation for `body`, `params`, `query`, or `headers`
 * but does not explicitly provide a `400` response, this function will
 * automatically register one in the order that Processor validates them (only one can be documented)
 *
 * @param rc The route configuration object.
 * @returns The updated route configuration.
 */
export function autoRegisterInvalidResponses(rc: RouteConfig) {
	if (rc.responses?.some((r) => r.status === 400)) return rc;

	const part = PRIORITY.find((p) => rc[p] != null);
	if (!part) return rc;

	rc.responses ??= [];
	rc.responses.push(spec.invalid(rc[part]));
	return rc;
}
