#!/usr/bin/env node
import { cpSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';

const __dir = dirname(fileURLToPath(import.meta.url));
const dest = resolve(process.argv[2] ?? '.'); // target dir

// 1 • scaffold files
if (!existsSync(dest)) mkdirSync(dest, { recursive: true });
cpSync(join(__dir, 'template'), dest, { recursive: true, dereference: true });

// 2 • choose package manager
const hasBun = (() => {
	try {
		execSync('bun -v');
		return true;
	} catch {
		return false;
	}
})();
const pm = hasBun ? 'bun' : 'npm';

if (pm !== 'bun') {
	console.warn("Bun is required for @crumbjs to run properly. We'll install it anyway, but it may not behave as expected.");
}

// 3 • run install INSIDE the new folder
process.chdir(dest);
console.log(`📦 Installing crumbjs with ${pm}…`);
execSync(`${pm} install`, { stdio: 'inherit' });

// 4 • final hint
console.log(`\n🎉 Your app is ready! execute:`);
console.log(`- cd ${dest}`);
console.log(`- bun run dev`);
