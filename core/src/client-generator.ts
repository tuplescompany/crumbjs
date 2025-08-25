import openapiTS, { astToString } from 'openapi-typescript';
import ts from 'typescript';

const DATE = ts.factory.createTypeReferenceNode(ts.factory.createIdentifier('Date')); // `Date`
const NULL = ts.factory.createLiteralTypeNode(ts.factory.createNull()); // `null`
const BLOB = ts.factory.createTypeReferenceNode('Blob');

const union = (...types: ts.TypeNode[]) => ts.factory.createUnionTypeNode(types);
const arr = (t: ts.TypeNode) => ts.factory.createArrayTypeNode(t);

export async function createClientSpecs(jsonSpec: string) {
	const ast = await openapiTS(jsonSpec, {
		transform(schemaObject, metadata) {
			if (schemaObject.format === 'date-time') {
				return schemaObject.nullable ? union(DATE, NULL) : DATE;
			}
			// string(binary) -> FileLike (| null)
			if ((schemaObject.type === 'string' && schemaObject.format === 'binary') || schemaObject.format === 'byte') {
				return schemaObject.nullable ? union(BLOB, NULL) : BLOB;
			}

			// array of binaries -> FileLike[] (| null)
			if (schemaObject.type === 'array' && schemaObject.items && (schemaObject.items as any).format === 'binary') {
				const t = arr(BLOB);
				return schemaObject.nullable ? union(t, NULL) : t;
			}
		},
	});
	const contents = astToString(ast);
	await Bun.write('./client.d.ts', contents);
}
