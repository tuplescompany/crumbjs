import type { ErrorContext } from './types';

export const defaultNotFoundHandler = () =>
	new Response(null, {
		headers: { 'Content-Type': 'text/plain' },
		status: 404,
	});

export const defaultErrorHandler = ({ setStatus, exception }: ErrorContext) => {
	setStatus(exception.status);
	return exception.toObject();
};

export const locales = ['en', 'es', 'pt'] as const;

export const modes = ['development', 'production', 'qa', 'staging'] as const;

export const openapiUis = ['swagger', 'scalar'] as const;
