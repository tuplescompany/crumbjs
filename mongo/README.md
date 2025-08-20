# @crumbjs/mongo | Small plugin for handle Mongo connection and add some Repository Patternt like to your project

To install dependencies:

```bash
bun install @crumbjs/mongo
```

## Basic usage

### Mount plugin

```ts
import { App } from '@crumbjs/core';
import { mongoPlugin } from '@crumbjs/mongo';
// With MONGO_URI env variable set
export default new App()
	.prefix('api')
	.use(mongoPlugin())
	.get('/', () => {
		// Raw mongo client query, no repository here
		return mongo.db('mydb').collection('my_collection').find().toArray();
	})
	.serve();
```

```ts
import { App } from '@crumbjs/core';
import { mongoPlugin } from '@crumbjs/mongo';
// Manually add 1 or more connections
export default new App()
	.prefix('api')
	.use(
		// Multiple Connection
		mongoPlugin([
			{ name: 'default', uri: 'mongodb://127.0.0.1:27017/?directConnection=true' /** opts: MongoClientOptions */ },
			{ name: 'secondary', uri: 'mongodb://192.168.0.10:27017/?directConnection=true' /** opts: MongoClientOptions */ },
		]),
	)
	.get('/', () => {
		// Raw mongo client query, no repository here
		return mongo.db('mydb').collection('my_collection').find().toArray();
	})
	.serve();
```

### Define Schema (only zod, no magic!)

#### Using Included Helpers

We provide a small set of **helpers** (`document` and `field`) on top of Zod.  
They’re thinner than raw Zod’s options, but designed to enforce **standard schemas** easily, with safe handling for `optional` and `nullable`.  
⚡ Important: The helpers always return **Zod schemas** (they are just wrappers).

```ts
import { document, field, softDelete, timestamps } from '@crumbjs/mongo';

export const employeeSchema = document({
	...softDelete(), // adds deletedAt: Date | null (default: null)
	...timestamps(), // adds createdAt: Date (default: now), updatedAt: Date | null (default: null)
	uuid: field.uuid({ auto: true }), // auto-generate UUID v4 if missing, validate if provided
	name: field.string({ min: 3 }), // required string, min length 3
	email: field.string({ format: 'email' }), // email with Zod’s .email() validator
	lastName: field.string({ min: 3 }), // required string, min length 3
	birthDate: field.date({ nullable: true }), // nullable date, default null
	birthDateExample: field.dateString({ nullable: true }), // use dateString helper if you intent to receive the date from JSON.parse will be stored as Date in mongo.
	active: field.boolean(true), // boolean, default true
	gender: field.enum(['male', 'female', 'none']), // enum, required
	userId: field.objectId(), // ObjectId (hex string → transformed to ObjectId)
	companyId: field.objectId({ nullable: true }), // hex string → transformed to ObjectId or null, default null
});

// Type inferred on Repository.create() (input for inserts)
type EmployeeInput = {
	_id: ObjectId;
	name: string;
	lastName: string;
	gender: 'male' | 'female' | 'none';
	userId: ObjectId;
	uuid?: string;
	birthDate?: Date | null;
	active?: boolean;
	companyId?: string | null;
	createdAt?: Date;
	updatedAt?: Date | null;
	deletedAt?: Date | null;
};

// Type inferred on Repository queries (normalized persisted doc)
type Employee = {
	_id: ObjectId;
	uuid: string;
	name: string;
	lastName: string;
	birthDate: Date | null;
	active: boolean;
	gender: 'male' | 'female' | 'none';
	userId: ObjectId;
	companyId: ObjectId | null;
	createdAt: Date;
	updatedAt: Date | null;
	deletedAt: Date | null;
};
```

#### Using Raw Zod

The same schema, but written with pure Zod (no helpers).
⚠️ **Important**: to keep consistent schema shapes, avoid .optional() — instead use .nullable().default(null).

```ts
import { z } from 'zod';
import { ObjectId } from 'mongodb';

const uuidV4Regex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const employeeSchema = z.object({
	_id: z.instanceof(ObjectId),
	// softDelete & timestamps
	deletedAt: z.date().nullable().default(null),
	createdAt: z.date().default(() => new Date()),
	updatedAt: z.date().nullable().default(null),
	// uuid with v4 validation
	uuid: z
		.string()
		.regex(uuidV4Regex, 'Invalid UUID v4')
		.default(() => crypto.randomUUID()),
	// strings
	name: z.string().min(3),
	lastName: z.string().min(3),
	// nullable date
	birthDate: z.date().nullable().default(null),
	// boolean with default true
	active: z.boolean().default(true),
	// enum
	gender: z.enum(['male', 'female', 'none']),
	// ObjectId fields
	userId: z.string().transform((v) => new ObjectId(v)),
	companyId: z
		.string()
		.transform((v) => new ObjectId(v))
		.nullable()
		.default(null),
});
```

#### Mixed Example

You can also mix helpers with raw Zod — since at the end everything is just a Zod schema:

```ts
import { document, field, softDelete, timestamps } from '@crumbjs/mongo';
import { z } from 'zod';

export const employeeSchema = document({
	...softDelete(),
	...timestamps(),
	uuid: field.uuid({ auto: true }),
	name: field.string({ min: 3 }),
	email: field.string({ format: 'email' }),
	lastName: field.string({ min: 3 }),
	birthDate: field.date({ nullable: true }),
	active: field.boolean(true),
	gender: field.enum(['male', 'female', 'none']),
	userId: field.objectId(),
	companyId: field.objectId({ nullable: true }),
	// Mixing raw Zod directly
	zodV7: z.uuid({ version: 'v7' }), // e.g., enforce UUID v7
});
```

### Create a repository

- Basic repository, no-custom methods

```ts
import { useRespository } from '@crumbjs/mongo';
import { employeeSchema } from './schemas/employee';

const employeeRepository = useRespository(
	'mydb', // Database name
	'users', // Collection name
	employeeSchema, // The zod schema who defines the collection objects
	'deletedAt', // The field who determines that soft deletes are enabled. false to disable soft deletes.
);
```

- Advanced Repository, extending the repository class

```ts
import { Repository, db } from '@crumbjs/mongo';
import { employeeSchema } from './schemas/employee';

export class EmployeeRepository extends Repository<typeof employeeSchema> {
	construct() {
		super(db('mydb'), users, employeeSchema); // with softdeletes by default with delete timestamp at 'deletedAt'
	}

	async complexThings() {
		/** this.collection is a mongo Collection<Entity> without modifications */
		this.collection.aggregate(/** your code */);
	}
}

const employeeRepository = new EmployeeRepository();
userRepository.complexThings();
```

### The Repository methods

```ts
// Count Documents
const totalUsers = await userRepository.count(); // get document count of repository collection

// Search Documents
const all = await userRepository.get(); // get all records, not deleted (if softdeletes is enabled)
const all2 = await userRepository.get({}, true); // get all records, softdeleted included.
const all3 = await userRepository.get({ tenant: 'acme' }); // get all records where tenant is 'acme'
const all4 = await userRepository.get({ tenant: 'acme' }, true); // get all records where tenant is 'acme' included deleted

const page = await userRepository.getPaginated({}, 1, 10); // get the first 10 records of users collection
const page = await userRepository.getPaginated(); // get the first 10 records too. No filters, page 1 and page size 10 by default.
const page2 = await userRepository.getPaginated({ ban: true }, 3, 20); // get the page 3 of 20 records per-page users collection where ban is true

// Advanced Search -- not full type support
userRepository.find().project(/** ... */); // get default collection FindCursor from MongoClient

// Second boolean method is allways withTrash like in get() method.
// true => includes soft deleted and false => exclude soft deleted
// default: false
const user = await userRepository.findById('64f7a8d...123'); // get user where object id is...
const user = await userRepository.findOneBy({ email: 'test@example.com' }); // get user where some key is...

// Creates a Document
// The data will be validated with zod
const newUser = await userRepository.create({ email: 'alice@example.com' });

// Update Document
// The data will be validated with a **partial** zod schema representation of defined schema
const updated = await userRepository.updateOne({ email: 'alice@example.com' }, { ban: true });
const updated2 = await userRepository.updateById('64f7a8d...123', { name: 'Alice Updated' });

// Delete Document (if softDeletes enabled will execute an update otherwise will delete the document for good)
const success = await userRepo.deleteById('64f7a8d...123');
```

### Use Mongo Manager to handle connections

It can be used outside CrumbJS, common use case: seeders and scripting

```ts
import { mongo } from '@crumbjs/mongo';

mongo.add({
	uri: '...',
	name: 'example',
	opts: {
		/** optional MongoClientOpts */
	},
});
await mongo.connect(); // Warm-up all registed connection. If no registered connection found, will try to create 'default' from MONGO_URI env
mongo.get('example'); // Returns MongoClient registered with that name
mongo.db('users', 'example'); // Return 'users' Db instance for connection 'example'

// .....
myRepo.get();
```
