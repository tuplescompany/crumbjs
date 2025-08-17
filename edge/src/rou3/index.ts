export { createRouter } from './context';

export type { RouterContext, MatchedRoute } from './types';

export { addRoute } from './operations/add';
export { findRoute } from './operations/find';
export { removeRoute } from './operations/remove';
export { findAllRoutes } from './operations/find-all';
export { routeToRegExp } from './regexp';

export { NullProtoObj } from './object';
