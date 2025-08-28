import z, { ZodObject } from 'zod';
import { RouteConfig } from '../types';
import { spec } from './spec';

type Part = 'body' | 'headers' | 'params' | 'query';
const PRIORITY: Part[] = ['body', 'query', 'headers', 'params'];

/**
 * Usefull helper to add missing / repetitive route configuration
 *
 * 1) Ensures that if authorization is set, add a required string to header authorization index.
 * If the user already set a header validator, this just append authorization index with extend()
 * this will not validate or transform the header.authorization only require the index as string.
 *
 * 2) Ensures a `400 Bad Request` response is registered when any validation rules exist.
 * If the user defines validation for `body`, `params`, `query`, or `headers`
 * but does not explicitly provide a `400` response, this function will automatically register one
 *
 * @param rc The route configuration object.
 * @returns The updated route configuration.
 */
export function autoCompleteRouteConfig(rc: RouteConfig) {
	if (rc.authorization) {
		const extendedHeaderSchema = rc.headers
			? (rc.headers as ZodObject).extend({
					authorization: z.string(),
				})
			: z.object({
					authorization: z.string(),
				});

		// @ts-ignore
		rc.headers = extendedHeaderSchema;
	}

	if (rc.responses?.some((r) => r.status === 400)) return rc;

	const part = PRIORITY.find((p) => rc[p] != null);
	if (!part) return rc;

	rc.responses ??= [];
	rc.responses.push(spec.invalid(rc[part]));

	return rc;
}
