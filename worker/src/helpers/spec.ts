// Helper to create zod specifications
import z, { ZodObject, ZodType } from 'zod';
import { ContentType, ResponseConfig } from '../types';

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
	 * Generates a Invalid response spec with `validate()` structure
	 */
	invalid(schema?: ZodObject) {
		// Default fields schema, only usefull as example
		let fieldsSchema: any = z.object({
			fieldName: z.array(z.string()),
		});

		// If schema is set generates all the fields errors
		if (schema) {
			const fields = Object.keys(schema.shape);
			const fieldsShape: any = {};
			fields.forEach((f) => {
				fieldsShape[f] = z
					.array(z.string())
					.optional()
					.meta({ example: [`validation error 1`, `validation error 2`] });
			});

			fieldsSchema = z.object(fieldsShape);
		}

		return {
			status: 400,
			schema: z.object({
				status: z.number().meta({ example: 400 }),
				message: z.string().meta({ example: 'Invalid {part}' }),
				fields: fieldsSchema,
			}),
			type: 'application/json',
		} as ResponseConfig;
	},

	/**
	 * Generates simple Exception response spec
	 */
	exception(status: number) {
		return {
			status,
			schema: z.object({
				status: z.literal(status),
				message: z.string().meta({ example: 'Error message' }),
				fields: z.any(),
			}),
			type: 'application/json',
		} as ResponseConfig;
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
