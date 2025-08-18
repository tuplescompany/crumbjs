import { App, cors, secureHeaders, signals } from '@crumbjs/core';
import { indexController } from './modules/index/index.controller';

export default new App()
	.prefix('api')
	.use(cors({ origin: '*' }))
	.use(signals(true))
	.use(secureHeaders())
	.use(indexController)
	.serve();
