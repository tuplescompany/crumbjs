#!/usr/bin/env node
import { createReadStream, promises as fs } from 'node:fs';
import { join, extname } from 'node:path';
import { spawnSync } from 'node:child_process';

const ARGS = process.argv.slice(2);
const getArg = (k, d = undefined) => {
	const p = ARGS.find((a) => a.startsWith(`${k}=`));
	return p ? p.split('=').slice(1).join('=') : d;
};
const has = (k) => ARGS.includes(k);

const DEFAULT_EXCLUDE_DIRS = new Set([
	'node_modules',
	'dist',
	'build',
	'.next',
	'.nuxt',
	'.git',
	'coverage',
	'out',
	'.output',
	'.turbo',
	'.vercel',
	'logo',
]);

// Extensión → lenguaje (muy simple)
const LANG_MAP = {
	'.ts': 'TypeScript',
	'.tsx': 'TypeScript JSX',
	'.js': 'JavaScript',
	'.jsx': 'JavaScript JSX',
	'.vue': 'Vue',
	'.svelte': 'Svelte',
	'.go': 'Go',
	'.php': 'PHP',
	'.py': 'Python',
	'.java': 'Java',
	'.cs': 'C#',
	'.rb': 'Ruby',
	'.css': 'CSS',
	'.scss': 'SCSS',
	'.json': 'JSON',
	'.md': 'Markdown',
	'.yaml': 'YAML',
	'.yml': 'YAML',
};

const extFilter = (getArg('--ext') ?? '')
	.split(',')
	.map((s) => s.trim().toLowerCase())
	.filter(Boolean);
const WANT_EXTS = extFilter.length ? new Set(extFilter.map((e) => (e.startsWith('.') ? e : `.${e}`))) : null;

function langOf(file) {
	const ext = extname(file).toLowerCase();
	if (WANT_EXTS && !WANT_EXTS.has(ext)) return null;
	return (LANG_MAP[ext] ?? ext) || 'unknown';
}

async function countLines(file) {
	return new Promise((resolve, reject) => {
		let lines = 0;
		let lastChunkEndedWithNL = false;
		const s = createReadStream(file);
		s.on('data', (buf) => {
			for (let i = 0; i < buf.length; i++) if (buf[i] === 10) lines++; // '\n'
			lastChunkEndedWithNL = buf.length > 0 && buf[buf.length - 1] === 10;
		});
		s.on('end', () => resolve(lines + (lastChunkEndedWithNL ? 0 : 1)));
		s.on('error', reject);
	});
}

function listGitFiles() {
	try {
		const r = spawnSync('git', ['ls-files'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
		if (r.status === 0 && r.stdout) {
			return r.stdout.split('\n').filter(Boolean);
		}
	} catch {}
	return null;
}

async function walkDir(root) {
	const out = [];
	async function walk(dir) {
		const ents = await fs.readdir(dir, { withFileTypes: true });
		for (const e of ents) {
			if (e.isDirectory()) {
				if (DEFAULT_EXCLUDE_DIRS.has(e.name)) continue;
				await walk(join(dir, e.name));
			} else if (e.isFile()) {
				out.push(join(dir, e.name));
			}
		}
	}
	await walk(root);
	return out;
}

async function main() {
	const gitFiles = listGitFiles();
	const files = gitFiles ?? (await walkDir(process.cwd()));

	const byLang = new Map(); // lang -> { files, lines }
	const byFile = []; // { file, lines, lang }

	for (const f of files) {
		const lang = langOf(f);
		if (!lang) continue;
		try {
			const lines = await countLines(f);
			const agg = byLang.get(lang) ?? { files: 0, lines: 0 };
			agg.files++;
			agg.lines += lines;
			byLang.set(lang, agg);
			if (has('--by-file')) byFile.push({ file: f, lines, lang });
		} catch {
			// ignorar archivos que no se puedan leer
		}
	}

	const rows = [...byLang.entries()].sort((a, b) => b[1].lines - a[1].lines).map(([lang, { files, lines }]) => ({ lang, files, lines }));

	const totalFiles = rows.reduce((s, r) => s + r.files, 0);
	const totalLines = rows.reduce((s, r) => s + r.lines, 0);

	if (has('--json')) {
		const out = { summary: rows, totals: { files: totalFiles, lines: totalLines } };
		if (has('--by-file')) out.byFile = byFile.sort((a, b) => b.lines - a.lines);
		console.log(JSON.stringify(out, null, 2));
	} else {
		const pad = (s, n) => String(s).padEnd(n);
		const n1 = Math.max(6, ...rows.map((r) => r.lang.length)) + 2;
		console.log(pad('Language', n1), pad('Files', 10), 'Lines');
		console.log('-'.repeat(n1 + 10 + 10));
		for (const r of rows) {
			console.log(pad(r.lang, n1), pad(r.files, 10), r.lines);
		}
		console.log('-'.repeat(n1 + 10 + 10));
		console.log(pad('TOTAL', n1), pad(totalFiles, 10), totalLines);
		if (has('--by-file')) {
			console.log('\nTop files:');
			for (const r of byFile.slice(0, 20)) {
				console.log(`${r.lines.toString().padStart(8)}  ${r.file}`);
			}
		}
	}
}

main().catch((e) => {
	console.error('loc error:', e);
	process.exit(1);
});
