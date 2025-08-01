import { HeaderBuilder } from './header-builder';

export class CookieBuilder {
	constructor(private readonly headerBuilder: HeaderBuilder) {}

	set(value: string) {
		this.headerBuilder.append('Set-Cookie', value);
	}
}
