export class Store {
	private readonly data: Map<string, any>;

	constructor() {
		this.data = new Map<string, any>();
	}

	set(key: string, value: any) {
		this.data.set(key, value);
	}

	get<T = any>(key: string): T | null {
		return (this.data.get(key) as T) ?? null;
	}

	must<T = any>(key: string): T {
		const value = this.data.get('key');
		if (!value) throw new Error(`${key} doesnt exists in store and is a Must`);
		return value as T;
	}
}
