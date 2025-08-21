import { ObjectId } from 'mongodb';
import z from 'zod';
import { util } from 'zod/v4/core/index.cjs';

/** Document with _id */
export const document = z.object({ _id: _id() }).extend;

/**-------------------------------------
| OBJECT ID
|-------------------------------------*/

function _id() {
	return _instance(ObjectId);
}

function _objectId(): z.ZodPipe<z.ZodString, z.ZodTransform<ObjectId, string>>;
function _objectId(opts: { nullable: true }): z.ZodDefault<z.ZodNullable<z.ZodPipe<z.ZodString, z.ZodTransform<ObjectId, string>>>>;
function _objectId(opts: { nullable?: boolean } = {}) {
	let field: any = z.string().transform((value) => new ObjectId(value));

	if (opts.nullable) {
		field = field.nullable().default(null);
	}

	return field;
}

/**-------------------------------------
| STRING
|-------------------------------------*/

type StrFormat =
	| 'string'
	| 'email'
	| 'url'
	| 'hostname'
	| 'base64'
	| 'base64url'
	| 'jwt'
	| 'nanoid'
	| 'cuid'
	| 'cuid2'
	| 'ulid'
	| 'ipv4'
	| 'ipv6'
	| 'cidrv4'
	| 'cidrv6';

type StrFormatMap = {
	string: z.ZodString;
	email: z.ZodEmail;
	url: z.ZodURL;
	hostname: z.ZodCustomStringFormat<'hostname'>;
	base64: z.ZodBase64;
	base64url: z.ZodBase64URL;
	jwt: z.ZodJWT;
	nanoid: z.ZodNanoID;
	cuid: z.ZodCUID;
	cuid2: z.ZodCUID2;
	ulid: z.ZodULID;
	ipv4: z.ZodIPv4;
	ipv6: z.ZodIPv6;
	cidrv4: z.ZodCIDRv4;
	cidrv6: z.ZodCIDRv6;
};

type StringOptions<F extends StrFormat = StrFormat> = {
	format?: F;
	min?: number;
	max?: number;
	lower?: boolean;
	upper?: boolean;
	trim?: boolean;
	nullable?: boolean;
};

function _string<F extends StrFormat>(opts: StringOptions<F> & { nullable: true }): z.ZodDefault<z.ZodNullable<StrFormatMap[F]>>;
function _string<F extends StrFormat>(opts?: StringOptions<F>): StrFormatMap[F];
function _string(opts: any = {}): any {
	const format = opts.format ?? 'string';
	let field: any = (z as any)[format]();

	if (opts.min) field = field.min(opts.min);
	if (opts.max) field = field.max(opts.max);
	if (opts.lower) field = field.toLowerCase();
	if (opts.upper) field = field.toUpperCase();
	if (opts.trim) field = field.trim();

	if (opts.nullable) {
		field = field.nullable().default(null);
	}

	field = field.meta({ example: `<${format} format>` });

	return field;
}

/**-------------------------------------
| UUID V4
|-------------------------------------*/

type UUIDOptions = {
	auto?: boolean;
	nullable?: boolean;
};

/** Helper to set field as uuid, only v4 for now */
function _uuid(): z.ZodString;
function _uuid(opts: UUIDOptions & { auto: true }): z.ZodDefault<z.ZodString>;
function _uuid(opts: UUIDOptions & { nullable: true }): z.ZodDefault<z.ZodNullable<z.ZodString>>;
function _uuid(opts: any = {}): any {
	let field: any = z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i, 'Invalid UUID v4');

	if (opts.auto) {
		// Auto-generate UUID if missing, but still validate if provided
		field = field.default(() => crypto.randomUUID());
	} else if (opts.nullable) {
		// Not auto → allow null, default to null if missing
		field = field.nullable().default(null);
	}

	const example = crypto.randomUUID();
	field = field.meta({ example });

	return field;
}

/**-------------------------------------
| DATE
|-------------------------------------*/

type DateOptions = {
	min?: Date;
	max?: Date;
	defaultNow?: boolean;
	nullable?: boolean;
};

function _date(): z.ZodDate;
function _date(opts: DateOptions & { defaultNow: true }): z.ZodDefault<z.ZodDate>;
function _date(opts: DateOptions & { nullable: true }): z.ZodDefault<z.ZodNullable<z.ZodDate>>;
function _date(opts: any = {}): any {
	let field: any = z.date();
	if (opts.min) field = field.min(opts.min);
	if (opts.max) field = field.max(opts.max);

	if (opts.defaultNow) {
		field = field.default(() => new Date());
	} else if (opts.nullable) {
		field = field.nullable().default(null);
	}

	return field;
}

function nowFormatted(): string {
	const d = new Date();
	const pad = (n: number) => n.toString().padStart(2, '0');
	const year = d.getFullYear();
	const month = pad(d.getMonth() + 1);
	const day = pad(d.getDate());
	const hours = pad(d.getHours());
	const minutes = pad(d.getMinutes());
	const seconds = pad(d.getSeconds());
	return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
}

function _dateString(): z.ZodPipe<z.ZodString, z.ZodTransform<Date, string>>;
function _dateString(opts: DateOptions & { defaultNow: true }): z.ZodDefault<z.ZodPipe<z.ZodString, z.ZodTransform<Date, string>>>;
function _dateString(
	opts: DateOptions & { nullable: true },
): z.ZodDefault<z.ZodNullable<z.ZodPipe<z.ZodString, z.ZodTransform<Date, string>>>>;
function _dateString(opts: any = {}): any {
	// base string → Date
	let field: any = z
		.string()
		.transform((val) => new Date(val))
		.refine((d) => !isNaN(d.getTime()), { message: 'Invalid date string' });

	if (opts.min) {
		field = field.refine((d: Date) => d >= opts.min, {
			message: `Date must be >= ${opts.min.toISOString()}`,
		});
	}

	if (opts.max) {
		field = field.refine((d: Date) => d <= opts.max, {
			message: `Date must be <= ${opts.max.toISOString()}`,
		});
	}

	if (opts.defaultNow) {
		field = field.default(() => new Date());
	} else if (opts.nullable) {
		field = field.nullable().default(null);
	}

	field = field.meta({ example: nowFormatted(), type: 'string', format: 'date-time' });

	return field;
}
/**-------------------------------------
| BOOLEAN
|-------------------------------------*/

function _boolean(def: boolean) {
	return z.boolean().default(def);
}

/**-------------------------------------
| NUMBER
|-------------------------------------*/

type NumberOptions = {
	nullable?: boolean;
	min?: number;
	max?: number;
	int?: boolean;
	positive?: boolean;
	negative?: boolean;
};

function _number(): z.ZodNumber;
function _number(opts: NumberOptions & { nullable: true }): z.ZodDefault<z.ZodNullable<z.ZodNumber>>;
function _number(opts: NumberOptions = {}): any {
	let field: any = z.number();

	if (opts.int) field = field.int();
	if (opts.min !== undefined) field = field.min(opts.min);
	if (opts.max !== undefined) field = field.max(opts.max);
	if (opts.positive) field = field.positive();
	if (opts.negative) field = field.negative();

	if (opts.nullable) {
		field = field.nullable().default(null);
	}

	if (opts.int) {
		field = field.meta({ example: 10 });
	} else {
		field = field.meta({ example: 10.5 });
	}

	return field;
}

/**-------------------------------------
| ENUM
|-------------------------------------*/

type TupleToObject<T extends readonly string[]> = {
	[K in T[number]]: K;
};

type TupleToUnion<T extends readonly string[]> = T[number];

type EnumOptions<T extends readonly string[]> = {
	nullable?: boolean;
	default?: TupleToUnion<T>;
};

function _enum<const T extends readonly string[]>(values: T): z.ZodEnum<TupleToObject<T>>;
function _enum<const T extends readonly string[]>(
	values: T,
	opts: EnumOptions<T> & { nullable: true },
): z.ZodDefault<z.ZodNullable<z.ZodEnum<TupleToObject<T>>>>;
function _enum<const T extends readonly string[]>(
	values: T,
	opts: EnumOptions<T> & { default: TupleToUnion<T> },
): z.ZodDefault<z.ZodEnum<TupleToObject<T>>>;
function _enum(values: any, opts: any = {}): any {
	let field: any = z.enum(values);

	if (opts.default) field = field.default(opts.default);
	if (opts.nullable) field = field.nullable().default(null);

	field = field.meta({ example: values[0] });

	return field;
}

/**-------------------------------------
| INSTANCE / CLASS
|-------------------------------------*/

type InstanceOptions = {
	nullable?: boolean;
};

function _instance<T extends typeof util.Class>(ctor: T): z.ZodCustom<InstanceType<T>, InstanceType<T>>;
function _instance<T extends typeof util.Class>(
	ctor: T,
	opts: { nullable: true },
): z.ZodDefault<z.ZodNullable<z.ZodCustom<InstanceType<T>, InstanceType<T>>>>;
function _instance<T extends typeof util.Class>(ctor: T, opts?: InstanceOptions): any {
	let field: any = z.instanceof(ctor);

	if (opts?.nullable) {
		field = field.nullable().default(null);
	}

	return field;
}

// Helpers

export function timestamps() {
	return {
		createdAt: _date({ defaultNow: true }),
		updatedAt: _date({ nullable: true }),
	};
}

export function softDelete() {
	return {
		deletedAt: _date({ nullable: true }),
	};
}

export const field = {
	id: _id,
	objectId: _objectId,
	uuid: _uuid,
	boolean: _boolean,
	string: _string,
	number: _number,
	date: _date,
	dateString: _dateString,
	enum: _enum,
	instance: _instance,
	object: z.object, // only alias
};
