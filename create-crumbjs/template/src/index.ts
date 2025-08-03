import { App, spec } from '@crumbjs/core';
import z from 'zod';

const app = new App('/api');

app.get('/hello', () => 'world');

app.post(
	'/hello',
	({ body }) => ({
		name: body.name,
	}),
	{
		body: z.object({
			name: z.string().meta({ example: 'Crumb' }),
		}),
		responses: [
			spec.response(
				200,
				z.object({
					name: z.string().meta({ example: 'Crumb' }),
				}),
			),
		],
	},
);

app.serve();
