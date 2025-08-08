import { spec } from '@crumbjs/core';
import z from 'zod';

export namespace IndexModel {
	export const indexRequestDto = z.object({
		name: z.string().meta({ example: 'Crumb' }),
	});

	export const indexResponseOK = spec.response(
		200,
		z.object({
			name: z.string().meta({ example: 'Crumb' }),
		}),
	);
}
