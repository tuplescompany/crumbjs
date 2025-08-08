import { App } from '@crumbjs/core';
import { IndexModel } from './index.model';

export const indexController = new App().post(
	'/hello',
	({ body }) => ({
		hello: body.name,
	}),
	{
		body: IndexModel.indexRequestDto,
		responses: [IndexModel.indexResponseOK],
	},
);
