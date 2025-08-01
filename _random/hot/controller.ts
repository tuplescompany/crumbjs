import { Controller } from '../app';

export const controller = new Controller({ prefix: '/auth' }).get('/sarasa', () => null);
