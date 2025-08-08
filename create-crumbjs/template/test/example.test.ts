// example.test.ts
import { describe, it, expect } from 'bun:test';
import '../src/index'; // start local app
import { config } from '@crumbjs/core';

const httpPort = config.get('port');

describe('🧪 /hello endpoints', () => {
	it("POST /hello → 'world'", async () => {
		const res = await fetch(`http://localhost:${httpPort}/api/hello`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				hello: 'world',
			}),
		});
		expect(res.status).toBe(200);
		expect(await res.text()).toBe('world');
	});
});
