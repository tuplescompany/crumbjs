# @crumbjs/mongo | Connects your Crumbjs with mongo and auto-generate crud resources

To install dependencies:

```bash
bun install @crumbjs/mongo
```

## Basic usage

### Mount plugin

- With only setting env variable (for single connection use cases)

```bash
MONGO_URI=mongodb://127.0.0.1:27017/?directConnection=true
```

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

- Defining connections with mongoPlugin initializator

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

We provide a small set of **helpers** (`document` and `field`) on top of Zod.  
They’re thinner than raw Zod’s options, but designed to enforce **standard schemas** easily, with safe handling for `optional` and `nullable`.  
⚡ Important: The helpers always return **Zod schemas** (they are just wrappers).

The same schema, could be written with pure Zod (no helpers) or a mix between the helpers and Zod
⚠️ **Important**: to keep consistent schema shapes, avoid .optional() — instead use .nullable().default(null).

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

### Create a repository

- Basic repository, no-custom methods
  For extra details, check [More about Repositories](#more-about-repositories).

```ts
import { useRespository } from '@crumbjs/mongo';
import { employeeSchema } from './schemas/employee';

const employeeRepository = useRespository(
	'mydb', // Database name
	'users', // Collection name
	employeeSchema, // The zod schema who defines the collection objects
	'deletedAt', // The field who determines that soft deletes are enabled. false to disable soft deletes.
	'default', // Connection name
);
```

## Auto-crud resources with CrumbJS+Mongo (create, replace, update, delete and paginate)

When you define a resource using `createResource`, the following REST endpoints are created automatically (prefix defaults to the collection name):

## AUTOCRUD (automatic generation of a REST resource based on your collection)

### `GET /{prefix}`

Retrieve a **paginated list** of documents.

- Supports simple query filters (`field=value`).
- Supports pagination (`page`, `pageSize`).
- Can include soft-deleted documents with `withTrash=yes`.

---

### `GET /{prefix}/:id`

Retrieve a **single document** by its ObjectId.

- Returns `404` if not found.

---

### `POST /{prefix}`

Create a **new document**.

- Validates the request body against the resource schema.
- Requires `authorizeCreate` if defined.
- Returns the created document.

---

### `PUT /{prefix}/:id`

Replace an **entire document** by its ObjectId.

- The request body must contain a full valid document (except `_id`).
- Returns the updated document or `404` if not found.

---

### `PATCH /{prefix}/:id`

Partially update a document by its ObjectId.

- The request body may include one or more fields.
- Returns the updated document or `404` if not found.
- Fails with `422` if the body is empty.

---

### `DELETE /{prefix}/:id`

Delete a document by its ObjectId.

- Soft deletes are enabled by default in resources, so this method updates `deletedAt` instead of physical removal.
- Returns `{ success: true | false }`.

---

### Define the rosource on your CrumbJS instance

Autovalidated and openapi documented by crumbjs core **Important** the schemas for autocrud must have \_id, createAt, updateAt, deleteAt (softdeletes) included in schema example

```ts
export default new App()
	.use(mongoPlugin())
	.use(
		// The resource App instance
		createResourse({
			/**
			 * Zod schema representing the structure and validation rules
			 * of documents stored in this collection.
			 *
			 * Used for:
			 * - Validating request payloads
			 * - Typing responses and filters
			 */
			schema: employeeSchema,
			/**
			 * (optional)
			 * Name of the MongoDB collection where this resource lives.
			 * @default 'default'
			 */
			connection: '<mongomanager connection name>';
			/**
			 * Name of the MongoDB database where this resource lives.
			 */
			db: 'tuples_hr',
			/**
			 * Name of the MongoDB collection where this resource lives.
			 */
			collection: 'employees',
			/**
			 * (optional)
			 * URL path prefix for all routes generated for this resource.
			 *
			 * Example:
			 * - prefix = "employee" → `/employee`, `/employee/:id`, etc.
			 *
			 * @default Collection name
			 */
			prefix: 'employee', // all resource endpoints prefix
			/**
			 * (optional)
			 * OpenAPI tags applied to all routes of this resource.
			 * You can add additional tags later.
			 *
			 * @default Collection name
			 */
			tag: 'Employees', // the tags to append to openapi
			/**
			 * (optional)
			 * CrumbJS Middleware functions applied to all routes of this resource.
			 *
			 * Useful for:
			 * - Authentication/authorization checks
			 * - Request/response transformations
			 * - Logging or tracing
			 */
			use: [authMiddleware], // the middlewares to apply to ALL routes (optional, default = [])
			/**
			 * (optional) **Recomended**
			 * Builds a MongoDB filter that will be automatically applied to this resource
			 * depending on the type of operation being performed.
			 *
			 * Operations supported:
			 * - `"get"`     → Collection query (list resources)
			 * - `"getById"` → Single resource lookup by ID
			 * - `"put"`     → Full resource replacement
			 * - `"patch"`   → Partial update
			 * - `"delete"`  → Resource deletion
			 *
			 * Typical use cases:
			 * - Restrict data access to the authenticated user
			 * - Enforce tenant-based filtering (multi-tenancy)
			 * - Apply soft-delete or visibility constraints
			 * - Allow different filters depending on the operation
			 *
			 * ⚠️ Note: For POST requests use {@link authorizeCreate} instead.
			 *
			 * @param c The request context.
			 * @param triggeredBy The operation triggering the filter (`get`, `getById`, `put`, `patch`, `delete`).
			 * @returns A MongoDB filter object to be merged into the query.
			 */
			prefilter: async (c, triggeredBy) => {
				// BASIC EXAMPLE
				const user = c.get<User>('user'); // previously loaded user to context in middlewares
				// will filtrate documents when userId field equals user.id
				// for more granular you can use triggeredBy, roles, etc. Its like a middleware who builds a mandatory filter to mongo
				return {
					userId: user.id,
				};
			},
			/**
			 * (optional) **Recomended**
			 * Determines if the current request/user is allowed to create a new resource.
			 *
			 * Typical use cases:
			 * - Validate permissions/roles before allowing creation
			 * - Validate request body or headers beyond schema validation
			 * - Enforce business rules (e.g., max items per user)
			 *
			 * @param c The request context, including the raw request body.
			 * @returns
			 *  - `true` → Creation is allowed.
			 *  - `string` → Creation is denied, and the returned string will be used as the error message.
			 */
			authorizeCreate: async (c) => {
				// BASIC EXAMPLE
				const user = c.get<User>('user'); // previously loaded user to context in middlewares

				if (!user.roles.includes('create:employees')) {
					return 'You dont have access to create employees'; // <-- the unathorized exception will be thrown with this message
				}

				return true;
			},
		}),
	)
	.serve();
```

## More about Repositories

### Advanced

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
const user = await userRepository.findOne({ email: 'test@example.com' }); // get user where some key is...
const user = await userRepository.findById('64f7a8d...123'); // get user where object id is...

// Creates a Document
// The data will be validated with zod
const newUser = await userRepository.create({ email: 'alice@example.com' });

// Update Document
// The data will be validated with a **partial** zod schema representation of defined schema
const updated = await userRepository.updateOne({ email: 'alice@example.com' }, { ban: true });
const updated2 = await userRepository.updateById('64f7a8d...123', { name: 'Alice Updated' });

// Delete Document (if softDeletes enabled will execute an update otherwise will delete the document for good)
const success = await userRepo.deleteOne({ email: 'alice@example.com' });
const success = await userRepo.deleteById('64f7a8d...123');
```

## The Mongo connection Manager

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
