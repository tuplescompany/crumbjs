import { spec } from '@crumbjs/worker';
import z from 'zod';

export namespace IndexModel {
	export const indexParams = z.object({
		name: z.string().min(3),
	});

	export const indexResponseOK = spec.response(
		200,
		z.object({
			name: z.string().meta({ example: 'Crumb' }),
		}),
	);
}
