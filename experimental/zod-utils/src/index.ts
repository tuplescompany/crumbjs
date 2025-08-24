import z, { ZodTransform, type ZodType } from 'zod';

function isWrapped(schema: ZodType) {
	if (schema instanceof z.ZodDefault || schema instanceof z.ZodNullable || schema instanceof z.ZodPipe) return true;
	return false;
}

/**
 * Recursive schema unwrap
 * @param schema
 * @returns
 */
function unwrap<T extends ZodType>(schema: T) {
	if ('unwrap' in schema) {
		// @ts-ignore
		return unwrap(schema.unwrap());
	}

	return schema;
}

const b = unwrap(
	z
		.string()
		.transform((v) => Number(v))
		.optional(),
);
const c = unwrap(
	z
		.string()
		.transform((v) => new Date(v))
		.optional(),
);

const test1 = z
	.string()
	.transform((v) => new Date(v))
	.optional();

const j = unwrap(test1) as unknown as z.ZodPipe<z.ZodString, z.ZodTransform<Date, string>>;
console.log(j.in.type);
console.log(j.out.type);

const out = j.out as z.ZodTransform<Date, string>;

console.log(out._zod);

process.exit(1);
