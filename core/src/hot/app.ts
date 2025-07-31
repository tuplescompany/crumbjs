import z from 'zod';
import { App } from '../';
import { config } from 'dotenv';

config();

export const app = new App({ prefix: 'api' })
	.onStart(() => {
		console.log('root controller startup trigger');
	})
	.post(
		'/file',
		({ body }) => {
			console.log(body.file);
			return {};
		},
		{
			body: z.object({
				file: z.file().meta({ type: 'string', format: 'binary', contentMediaType: 'application/octet-stream' }),
			}),
			type: 'multipart/form-data',
		},
	)
	.get(
		'/hello/:name',
		({ params: { name } }) => ({
			name,
		}),
		{
			params: z.object({
				name: z.string(),
			}),
		},
	)
	.get(
		'/hello',
		({ query: { name }, store, setHeader, setStatus }) => {
			setStatus(201, 'Created');
			setHeader('Sarasa', '1');
			return {
				first: store.get('first'),
				second: store.get('second'),
				user: store.get('user'),
				name,
			};
		},
		{
			query: z.object({
				name: z.string(),
			}),
			responses: {
				200: z.object({
					first: z.number(),
				}),
				400: z.object({
					message: z.string(),
					status: z.literal(400),
				}),
				500: z.object({
					message: z.string(),
					status: z.literal(500),
				}),
			},
			use: [
				({ setHeader, store, next }) => {
					setHeader('middleware-1-header', 'asd');
					store.set('first', 1);
					console.log('use.1');
					return next();
				},
				({ setHeader, store, next }) => {
					setHeader('middleware-2-header', 'fgh');
					store.set('second', 2);
					console.log('use.2');
					return next();
				},
			],
		},
	)
	.post(
		'/hello',
		({ body }) => {
			console.log(body);
			return body;
		},
		{
			body: z.object({
				name: z.string().min(3),
				file: z.file().meta({ type: 'string', format: 'binary' }),
				// file: z.file().openapi({ type: "string", format: "binary" }),
			}),
			type: 'multipart/form-data',
		},
	);
