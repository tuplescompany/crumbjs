import { ObjectId } from 'mongodb';
import { ZodCustom, ZodDefault, type ZodObject } from 'zod';
import { mongoLogger } from '../manager';

export function verifySchema(schema: ZodObject, collection: string) {
	try {
		const requiredKeys = ['_id', 'createdAt', 'updatedAt', 'deletedAt'] as const;

		const hasAll = requiredKeys.every((key) => key in schema.shape);

		if (!hasAll) {
			throw new Error("Schema is missing one or more required system fields for resources: '_id', 'createdAt', 'updatedAt', 'deletedAt'.");
		}

		// system fields
		const _id = schema.shape._id;
		const createdAt = schema.shape.createdAt;
		const updatedAt = schema.shape.updatedAt;
		const deletedAt = schema.shape.deletedAt;

		if (!(_id instanceof ZodCustom)) {
			throw Error(`Invalid "_id" field: expected a ZodCustom for Mongo ObjectId. Use 'field.objectId()' or 'z.instanceof(ObjectId)'.`);
		}

		if (!_id.safeParse(new ObjectId('68a60797d5affd4e5a88b4ad')).success) {
			throw Error(`"_id" must correctly parse a MongoDB ObjectId. Use 'field.objectId()' or 'z.instanceof(ObjectId)'.`);
		}

		if (!(createdAt instanceof ZodDefault) && createdAt.def?.innerType?.def?.type !== 'date') {
			throw Error(
				`Invalid "createdAt": this field must be a Date with a default value. Use 'field.date({ defaultNow:true })' or 'z.date().default(() => new Date())'.`,
			);
		}

		if (
			!(updatedAt instanceof ZodDefault) &&
			(updatedAt.def as any)?.innerType?.def?.type !== 'nullable' &&
			(updatedAt.def as any)?.innerType?.def?.innerType?.def?.type !== 'date'
		) {
			throw Error(
				`Invalid "updatedAt": this field must be a nullable Date with a default null. Use 'field.date({ nullable:true })' or 'z.date().nullable().default(null)'.`,
			);
		}

		if (
			!(deletedAt instanceof ZodDefault) &&
			(deletedAt.def as any)?.innerType?.def?.type !== 'nullable' &&
			(deletedAt.def as any)?.innerType?.def?.innerType?.def?.type !== 'date'
		) {
			throw Error(
				`Invalid "deletedAt": this field must be a nullable Date with a default null. Use 'field.date({ nullable:true })' or 'z.date().nullable().default(null)'.`,
			);
		}

		mongoLogger.debug(`Checking schema compatibility for '${collection}' auto-crud resource: ✅`);
	} catch (error) {
		mongoLogger.error(`Checking schema compatibility for '${collection}' auto-crud resource: ❌`);
		throw error;
	}
}
