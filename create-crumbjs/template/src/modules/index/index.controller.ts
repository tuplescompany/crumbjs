import { App } from '@crumbjs/core';
import { IndexModel } from './index.model';

const indexController = new App();

indexController.get(
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

export default indexController;
