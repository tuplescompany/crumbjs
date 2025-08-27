import { App } from '@crumbjs/core';
import { IndexModel } from './index.model';

const indexController = new App();

indexController.get(
	'/hello/:name',
	({ params }) => ({
		hello: params.name,
	}),
	{
		params: IndexModel.indexParams,
		responses: [IndexModel.indexResponseOK],
	},
);

export default indexController;
