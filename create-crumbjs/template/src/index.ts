import { App, spec, cors } from '@crumbjs/core';
import z from 'zod';

const app = new App('/api');

app.use(
	cors({
		origin: '*',
		methods: ['DELETE', 'GET', 'HEAD', 'OPTIONS', 'PATCH', 'POST', 'PUT'],
		allowedHeaders: ['Content-Type', 'Authorization', 'X-Api-Key'],
		credentials: true,
		maxAge: 600,
	}),
);

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
