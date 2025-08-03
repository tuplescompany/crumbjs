// example.test.ts
import { describe, it, expect } from 'bun:test';
import '../src/index'; // start local app
import { config } from '@crumbjs/core';

const httpPort = config.get('port');

describe('🧪 /hello endpoints', () => {
	it("GET /hello → 'world'", async () => {
		const res = await fetch(`http://localhost:${httpPort}/api/hello`);
		expect(res.status).toBe(200);
		expect(await res.text()).toBe('world');
	});

	it('POST /hello echoes name', async () => {
		const res = await fetch(`http://localhost:${httpPort}/api/hello`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ name: 'Crumb' }),
		});

		expect(res.status).toBe(200);
		expect(await res.json()).toEqual({ name: 'Crumb' });
	});
});
