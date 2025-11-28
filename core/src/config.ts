import z, { type ZodType, type infer as ZodInfer } from 'zod';
import { defaultErrorHandler, defaultNotFoundHandler, modes, openapiUis } from './constants';
import { logger } from './helpers/logger';
import { APIConfig } from './types';
import { objectCleanUndefined } from './helpers/utils';
import { codecs } from './helpers/codecs';

const parse = <S extends ZodType>(index: string, rule: S, def: ZodInfer<S>): ZodInfer<S> => {
	const value = process.env[index];
	if (!value) return def;

	const res = rule.safeParse(value);
	if (res.success) return res.data;

	// Bad value, print a warn
	logger.warn(`'${index}' contains an invalid value (${value}). Falling back to the configured fallback value.`);
	return def;
};

/**
 * Build **ServerConfig** from environment variables.
 * Environment keys and defaults:
 * - `APP_MODE`            		→ one of `modes`			(default: `"development"`)
 * - `APP_VERSION`         		→ string					(default: `"1.0.0"`)
 * - `PORT`                		→ number					(default: `8080`)
 * - `OPENAPI`             		→ boolean					(default: `true`)
 * - `OPENAPI_TITLE`       		→ string					(default: `"Api"`)
 * - `OPENAPI_DESCRIPTION` 		→ string					(default: `"API Documentation"`)
 * - `OPENAPI_PATH`        		→ absolute path `/seg/seg`	(default: `"/reference"`)
 * - `OPENAPI_UI`          		→ one of `openapiUis`		(default: `"scalar"`)
 * - `GENERATE_CLIENT_SCHEMA` 	→ boolean					(default: `false`)
 *
 * @returns {ServerConfig} A fully validated configuration object.
 * @see parse
 */
const extract = (): APIConfig => ({
	mode: parse('APP_MODE', z.enum(modes), 'development'),
	version: parse('APP_VERSION', z.string(), '1.0.0'),
	port: parse('PORT', z.coerce.number(), 8080),
	withOpenapi: parse('OPENAPI', codecs.stringBoolean, true),
	openapiTitle: parse('OPENAPI_TITLE', z.string(), 'Api'),
	openapiDescription: parse('OPENAPI_DESCRIPTION', z.string(), 'API Documentation'),
	openapiBasePath: parse('OPENAPI_PATH', z.string().regex(/^\/(?:[A-Za-z0-9._-]+(?:\/[A-Za-z0-9._-]+)*)$/), '/reference'),
	openapiUi: parse('OPENAPI_UI', z.enum(openapiUis), 'scalar'),
	generateClientSchema: parse('GENERATE_CLIENT_SCHEMA', codecs.stringBoolean, false),
	clientSchemaPath: parse('CLIENT_SCHEMA_PATH', z.string(), './client-schema.ts'),
	errorHandler: defaultErrorHandler,
	notFoundHandler: defaultNotFoundHandler,
});

const configData = extract();

const get = <K extends keyof APIConfig>(key: K): APIConfig[K] => configData[key];

const set = <K extends keyof APIConfig>(key: K, value: APIConfig[K]) => {
	configData[key] = value;
};

const merge = (data: Partial<APIConfig>) => {
	Object.assign(configData, objectCleanUndefined(data));
};

export const config = {
	all: configData,
	get,
	set,
	merge,
};
