// Package the web build for itch.io (HTML5 "play in browser").
//   npm run itch            -> builds, then writes release/lon-yan-plaithang-itch.zip
// itch wants index.html at the root of the zip, relative paths only (vite base './'),
// at most 1000 files and 500 MB unpacked. This script checks those limits and skips the
// .woff fallbacks and unused font subsets that every browser itch supports never fetches.
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');
const dist = path.join(root, 'dist');
const outDir = path.join(root, 'release');
const zipPath = path.join(outDir, 'lon-yan-plaithang-itch.zip');

if (!process.argv.includes('--no-build')) execSync('npx vite build', { cwd: root, stdio: 'inherit' });

const skip = (f) => /\.woff$/.test(f) || /-(vietnamese|latin-ext)-[\w-]+\.woff2$/.test(f);
const files = [];
(function walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p);
    else if (!skip(e.name)) files.push(path.relative(dist, p));
  }
})(dist);
const bytes = files.reduce((n, f) => n + fs.statSync(path.join(dist, f)).size, 0);
if (!files.includes('index.html')) throw new Error('dist/index.html missing');
if (files.length > 1000) throw new Error(`itch allows 1000 files, build has ${files.length}`);
if (bytes > 500e6) throw new Error(`itch allows 500 MB, build is ${(bytes / 1e6).toFixed(1)} MB`);
const html = fs.readFileSync(path.join(dist, 'index.html'), 'utf8');
if (/(src|href)="\/(?!\/)/.test(html)) throw new Error('index.html has absolute paths; itch needs relative ones');

fs.mkdirSync(outDir, { recursive: true });
fs.rmSync(zipPath, { force: true });
const list = path.join(outDir, '.zip-list.txt');
fs.writeFileSync(list, files.join('\n') + '\n');
execSync(`zip -q -9 -X "${zipPath}" -@ < "${list}"`, { cwd: dist, stdio: 'inherit', shell: '/bin/bash' });
fs.rmSync(list);
console.log(`itch zip: ${path.relative(root, zipPath)}  (${files.length} files, ${(bytes / 1e6).toFixed(1)} MB unpacked, ${(fs.statSync(zipPath).size / 1e6).toFixed(1)} MB zipped)`);
