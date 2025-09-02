import z from 'zod';

const stringNumber = z.codec(z.string().regex(z.regexes.number), z.number(), {
	decode: (str) => Number.parseFloat(str),
	encode: (num) => num.toString(),
});

const stringDatetime = z.codec(z.iso.datetime(), z.date(), {
	decode: (isoString) => new Date(isoString),
	encode: (date) => date.toISOString(),
});

const stringDate = z.codec(z.iso.date(), z.date(), {
	decode: (isoString) => new Date(isoString),
	encode: (date) => date.toISOString(),
});

const stringBoolean = z.codec(z.string(), z.boolean(), {
	decode: (strBool) => strBool === 'true' || strBool === '1' || strBool === 'yes' || strBool === 'on',
	encode: (bool) => (bool ? 'true' : 'false'),
});

const stringInt = z.codec(z.string().regex(z.regexes.integer), z.int(), {
	decode: (str) => Number.parseInt(str, 10),
	encode: (num) => num.toString(),
});

const stringBigInt = z.codec(z.string(), z.bigint(), {
	decode: (str) => BigInt(str),
	encode: (bigint) => bigint.toString(),
});

const epochSecondsDate = z.codec(z.int().min(0), z.date(), {
	decode: (seconds) => new Date(seconds * 1000),
	encode: (date) => Math.floor(date.getTime() / 1000),
});

const epochMillisDate = z.codec(z.int().min(0), z.date(), {
	decode: (millis) => new Date(millis),
	encode: (date) => date.getTime(),
});

const stringURL = z.codec(z.url(), z.instanceof(URL), {
	decode: (urlString) => new URL(urlString),
	encode: (url) => url.href,
});

export const codecs = {
	stringNumber,
	stringDatetime,
	stringBoolean,
	stringDate,
	stringInt,
	stringBigInt,
	epochSecondsDate,
	epochMillisDate,
	stringURL,
};
