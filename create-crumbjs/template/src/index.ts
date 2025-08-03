import { App } from '@crumbjs/core';
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
	},
);

export default app.serve();
