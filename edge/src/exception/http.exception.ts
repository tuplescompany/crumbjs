import { Exception } from '.';

export class BadRequest extends Exception {
	constructor(data: any) {
		super('Bad Request', 400, data);
	}
}

export class Unauthorized extends Exception {
	constructor(message?: string) {
		super(message ?? 'Unauthorized', 401);
	}
}

export class Forbidden extends Exception {
	constructor(message?: string) {
		super(message ?? 'Forbidden', 403);
	}
}

export class NotFound extends Exception {
	constructor(message?: string) {
		super(message ?? 'Not Found', 404);
	}
}

export class Conflict extends Exception {
	constructor(message?: string) {
		super(message ?? 'Conflict', 409);
	}
}

export class UnprocessableEntity extends Exception {
	constructor(fields: any) {
		super('Unprocessable Entity', 422, fields);
	}
}

export class InternalServerError extends Exception {
	constructor(message?: string) {
		super(message ?? 'Internal Server Error', 500);
	}
}
