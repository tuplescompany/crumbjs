import { sql } from 'bun';
import { getType } from './schema/type.mapper';

const dbname = new URL(process.env.DATABASE_URL!).pathname.slice(1);

export type InformationSchemaColumn = {
	table_name: string;
	column_name: string;
	ordinal_position: number;
	column_default: string | null;
	is_nullable: 'YES' | 'NO';
	type_name: string; // from udt_name
	max_lenght: number | null; // character_maximum_length
	num_precision: number | null; // numeric_precision
	num_scale: number | null; // numeric_scale
	is_primary_key: boolean;
};

export type InformationSchemaEnum = {
	enum_name: string;
	enum_value: string;
	enum_order: number;
};

const columns = await sql<InformationSchemaColumn[]>`SELECT
    c.table_name,
    c.column_name,
    c.ordinal_position,
    c.column_default,
    c.is_nullable,
    c.udt_name        AS type_name,
    c.character_maximum_length AS max_length,
    c.numeric_precision        AS num_precision,
    c.numeric_scale            AS num_scale,
    CASE WHEN tc.constraint_type = 'PRIMARY KEY' THEN true ELSE false END AS is_primary_key
FROM information_schema.columns c
LEFT JOIN information_schema.key_column_usage kcu
  ON c.table_name = kcu.table_name
 AND c.column_name = kcu.column_name
 AND c.table_schema = kcu.table_schema
LEFT JOIN information_schema.table_constraints tc
  ON tc.constraint_name = kcu.constraint_name
 AND tc.table_name = c.table_name
 AND tc.table_schema = c.table_schema
 AND tc.constraint_type = 'PRIMARY KEY'
WHERE c.table_schema = 'public'
ORDER BY c.table_name, c.ordinal_position;`;

async function findEnum(dbType: string) {
	const definedEnum = await sql<InformationSchemaEnum[]>`SELECT
t.typname      AS enum_name,
e.enumlabel    AS enum_value,
e.enumsortorder AS enum_order
FROM pg_type t
JOIN pg_enum e ON t.oid = e.enumtypid
JOIN pg_catalog.pg_namespace n ON n.oid = t.typnamespace
WHERE t.typname = ${dbType}
ORDER BY enum_name, e.enumsortorder;`;

	if (!definedEnum.length) return false;

	return definedEnum.map((e) => e.enum_value);
}

columns.forEach(async (c) => {
	const parsedType = getType(c.type_name);

	console.log(`${c.table_name} ${c.column_name} ${parsedType} ${c.column_default} ${c.is_primary_key}`);

	if (parsedType === 'unknown') {
		console.log(await findEnum(c.type_name));
	}

	// console.log(await findEnum('sarasa'));
});
