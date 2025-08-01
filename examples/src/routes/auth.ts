import { App } from '@crumbjs/core';

export const authController = new App({ prefix: 'auth' })
	.onStart(() => {
		console.log('auth controller startup trigger');
	}, 'auth.trigger')
	.use(({ setHeader, next, set }) => {
		setHeader('added-at-auth', '1');
		set('user', 'Elias');
		return next();
	})
	.get('/', () => 'get.auth')
	.post('/', () => 'post.auth');
