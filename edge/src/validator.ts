import { flattenError, treeifyError, infer as ZodInfer, ZodObject, ZodType } from 'zod';
import { Exception } from './exception';

type ValidationRes<T> = { data: ZodInfer<T>; error: null } | { data: null; error: Exception };

export function validate<T extends ZodType>(schema: T, data: any, invalidMessage: string = 'Invalid Data'): ZodInfer<T> {
	const { data: valid, error } = safeValidate(schema, data, invalidMessage);
	if (error) throw error;

	return valid;
}

/**
 * zod Safe-parse with monade return
 */
export function safeValidate<T extends ZodType>(schema: T, data: any, invalidMessage: string = 'Invalid Data'): ValidationRes<T> {
	const result = schema.safeParse(data);

	if (!result.success) {
		const detail = schema instanceof ZodObject ? flattenError(result.error).fieldErrors : treeifyError(result.error);

		return { data: null, error: new Exception(invalidMessage, 400, detail) };
	}

	return { data: result.data, error: null };
}

export async function validateAsync<T extends ZodType>(
	schema: T,
	data: any,
	invalidMessage: string = 'Invalid Data',
): Promise<ZodInfer<T>> {
	const { data: valid, error } = await safeValidateAsync(schema, data, invalidMessage);
	if (error) throw error;

	return valid;
}

export async function safeValidateAsync<T extends ZodType>(
	schema: T,
	data: any,
	invalidMessage: string = 'Invalid Data',
): Promise<ValidationRes<T>> {
	const result = await schema.safeParseAsync(data);

	if (!result.success) {
		const detail = schema instanceof ZodObject ? flattenError(result.error).fieldErrors : treeifyError(result.error);

		return { data: null, error: new Exception(invalidMessage, 400, detail) };
	}

	return { data: result.data, error: null };
}
