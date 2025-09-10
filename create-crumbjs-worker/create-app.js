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

// 3 • run install INSIDE the new folder
process.chdir(dest);
console.log(`📦 Installing crumbjs-worker with npm…`);
execSync(`npm install`, { stdio: 'inherit' });
cpSync('env.example', '.dev.vars');
rmSync('env.example');
execSync(`npm run types`, { stdio: 'inherit' });

// 4 • final hints
console.log(`\n🎉 Your app is ready!`);

console.log(`\n🚀 Run local server`);
console.log(`> cd ${dest}`);
console.log(`> npm run dev`);

console.log('\n🛠️ Deploy to CF');
console.log(`- npm run deploy`);