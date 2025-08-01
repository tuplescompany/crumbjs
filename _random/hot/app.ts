import { z } from 'zod';
import { App } from '..';
import { controller } from './controller';

export const app = new App({ prefix: 'api' })
	.onStart(() => {
		console.log('root controller startup trigger');
	})
	.use(controller)
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
		({ query: { name }, get, setHeader, setStatus }) => {
			setStatus(201, 'Created');
			setHeader('Sarasa', '1');
			return {
				first: get('first'),
				second: get('second'),
				user: get('user'),
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
				({ setHeader, set, next }) => {
					setHeader('middleware-1-header', 'asd');
					set('first', 1);
					console.log('use.1');
					return next();
				},
				({ setHeader, set, next }) => {
					setHeader('middleware-2-header', 'fgh');
					set('second', 2);
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
			headers: z.object({
				name: z.string(),
			}),
			type: 'multipart/form-data',
		},
	)
	.post('/text-body', ({ body }) => body, {
		body: z.object({
			text: z.string().min(10),
		}),
		type: 'text/plain',
	});
