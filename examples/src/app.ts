import { App } from '@crumbjs/core';
import { authController } from './routes/auth';
import { z } from 'zod';

export const app = new App('api')
	.onStart(() => {
		console.log('root controller startup trigger');
	})
	.use(authController)
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
	.form(
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
		},
	)
	.get('/error', () => {
		throw 'sarasa';
	});
