#!/usr/bin/env node
import { cpSync, rmSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';

const __dir = dirname(fileURLToPath(import.meta.url));
const dest = resolve(process.argv[2] ?? null); // target dir throw if not set

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
cpSync('env.example', '.env');
rmSync('env.example');

// 4 • final hints
console.log(`\n🎉 Your app is ready!`);

console.log(`\n🚀 Run local server`);
console.log(`> cd ${dest}`);
console.log(`> bun run dev`);

console.log('\n🛠️ Build binary');
console.log(`- bun run build`);

console.log('\n🧪 Run tests');
console.log(`- bun test`);

console.log(`\n🐳 Build & Run with Docker`);
console.log(`# Building Image
docker build -t crumb-app .
# Remove existing container if exists...
docker rm -f crumb-app-container 2>$null
# "Running container..."
docker run --name crumb-app-container --env-file .env -p 8080:8080 crumb-app
`);
