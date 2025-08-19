# @crumbjs/mongo | Small plugin for handle Mongo connection and add some Repository Patternt like to your project

To install dependencies:

```bash
bun install @crumbjs/mongo
```

## Basic usage

### Mount plugin

```ts
import { App } from '@crumbjs/core';

export default new App()
	.prefix('api')
	.mongoPlugin('mongodb://127.0.0.1:27017/?directConnection=true') // or set env MONGO_URI with the value
	.use(cors({ origin: '*' }))
	.use(signals(true))
	.use(secureHeaders())
	// your routes/controllers
	.serve();
```

### Define Schema (only zod, no magic!)

```ts
import { ObjectId } from 'mongodb';

export const userSchema = z.object({
	_id: z.instanceof(ObjectId),
	email: z.email(),
	passwordHash: z.string().nullable().default(null),
	emailVerified: z.boolean().optional().default(false),
	ban: z.boolean().optional().default(false),
	banReason: z.string().optional(),
	failAttempts: z.number().optional().default(0),
	ssoData: z.instanceof(OauthUser).optional(),
	createdBy: z.instanceof(ObjectId).optional(),
	lastLoginAt: z.date().optional(),
	createdAt: z
		.date()
		.optional()
		.default(() => new Date()),
	updatedAt: z.date().optional(),
	deletedAt: z.date().optional(),
});
```

### Create a repository

- Basic repository, no-custom methods

```ts
import { useRespository } from '@crumbjs/mongo';
import { userSchema } from './schemas/user';

const userRepository = useRespository(
	'mydb', // Database name
	'users', // Collection name
	userSchema, // The zod schema who defines the collection objects
	'deletedAt', // The field who determines that soft deletes are enabled. false to disable soft deletes.
);
```

- Advanced Repository, extending the repository class

```ts
import { Repository, db } from '@crumbjs/mongo';
import { userSchema } from './schemas/user';

export class UserRepository extends Repository<typeof userSchmea> {
	construct() {
		super(db('mydb'), users, userSchema); // with softdeletes by default with delete timestamp at 'deletedAt'
	}

	async complexThings() {
		/** this.collection is a mongo Collection<Entity> without modifications */
		this.collection.aggregate(/** your code */);
	}
}

const userRepository = new UserRepository();
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
const updated = await userRepository.update({ email: 'alice@example.com' }, { ban: true });
const updated2 = await userRepository.updateById('64f7a8d...123', { name: 'Alice Updated' });

// Delete Document (if softDeletes enabled will execute an update otherwise will delete the document for good)
const success = await userRepo.deleteById('64f7a8d...123');
```

### Use client or db

```ts
import { connect, getClient, db } from '@crumbjs/mongo';

await connect(uri, opts); // optionally force connect outside crumbjs app.

const client = getClient(); // Connected client instance. Throws if connection isnt ready
const tenantDb = db('my_tenant'); // Get DB from currenct connection. Throws if connection isnt ready
```
