import { App } from '@crumbjs/worker';
import { IndexModel } from './index.model';
import { Vars } from '../../main';

const indexController = new App<Env, Vars>();

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
