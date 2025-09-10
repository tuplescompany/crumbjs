import { Worker } from '@crumbjs/worker';
import { app } from './main';

export default new Worker(app);
