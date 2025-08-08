import { App, cors, signals } from '@crumbjs/core';
import { indexController } from './controllers/index.controller';

const app = new App({ prefix: 'api' })
	.use(cors({ origin: '*' }))
	.use(signals(true))
	.use(indexController);

app.serve();
