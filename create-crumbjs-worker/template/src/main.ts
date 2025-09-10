import { App, cors, secureHeaders } from '@crumbjs/worker';
import indexController from './modules/index/index.controller';

export type Vars = {};

export const app = new App<Env, Vars>()
	.prefix('api')
	.use(cors({ origin: '*' }))
	.use(secureHeaders())
	.use(indexController);
