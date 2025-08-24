export type SimpleType = 'string' | 'number' | 'boolean' | 'date' | 'time' | 'buffer' | 'range' | 'unknown';

export function getType(dbType: string): SimpleType {
	switch (dbType) {
		case 'bool':
			return 'boolean';

		// Integers
		case 'int2':
		case 'int4':
		case 'int8':
		case 'oid':
		case 'cid':
		case 'xid':
		case 'xid8':
			return 'number';

		// Floating point / numeric
		case 'float4':
		case 'float8':
		case 'money':
		case 'numeric':
			return 'number';

		// Strings
		case 'text':
		case 'varchar':
		case 'bpchar':
		case 'char':
		case 'name':
		case 'cstring':
		case 'xml':
		case 'uuid':
		case 'json':
		case 'jsonb':
		case 'jsonpath':
		case 'inet':
		case 'cidr':
		case 'macaddr':
		case 'macaddr8':
		case 'bit':
		case 'varbit':
		case 'tsvector':
		case 'tsquery':
			return 'string';

		// Binary
		case 'bytea':
			return 'buffer';

		// Date & time
		case 'time':
		case 'timetz':
			return 'time';
		case 'date':
		case 'timestamp':
		case 'timestamptz':
			return 'date';
		case 'interval':
			return 'string';

		// Geometric (como string plano por defecto)
		case 'point':
		case 'line':
		case 'lseg':
		case 'box':
		case 'path':
		case 'polygon':
		case 'circle':
			return 'string';

		// Range / multirange
		case 'int4range':
		case 'int8range':
		case 'numrange':
		case 'tsrange':
		case 'tstzrange':
		case 'daterange':
		case 'int4multirange':
		case 'int8multirange':
		case 'nummultirange':
		case 'tsmultirange':
		case 'tstzmultirange':
		case 'datemultirange':
			return 'range';

		// Internals / system
		default:
			return 'unknown';
	}
}
