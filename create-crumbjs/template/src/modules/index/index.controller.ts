import { App } from '@crumbjs/core';
import { IndexModel } from './index.model';

export const indexController = new App().get(
	'/hello/:name',
	({ params }) => ({
		hello: params.name,
	}),
	{
		params: {
			name: {
				example: 'CrumbJS',
				description: 'The name we will greet',
			},
		},
		responses: [IndexModel.indexResponseOK],
	},
);
