#!/usr/bin/env node
// Stage dist/ for publishing as a claude.ai Artifact (multi-file page).
//  - the page becomes an Artifact page (no doctype/html/head/body: the host adds them)
//  - trims what the Artifact limits can't afford: audio variants beyond MAX_VARIANTS per id,
//    .woff fallbacks and Vietnamese / Latin-ext font subsets (woff2 + unicode-range covers us)
//  - writes batches.json: publish groups of <= 240 files and <= 60 MB each
// Usage: npx vite build && node tools/artifact/stage.mjs <stageDir>
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..', '..');
const dist = path.join(root, 'dist');
const stage = path.resolve(process.argv[2] || path.join(root, '.artifact-stage'));
const MAX_VARIANTS = 3;
const MAX_FILES = 240;
const MAX_BYTES = 60 * 1024 * 1024;

fs.rmSync(stage, { recursive: true, force: true });
fs.mkdirSync(stage, { recursive: true });

// --- audio manifest trimming --------------------------------------------------------
const dropped = new Set();
const amPath = path.join(dist, 'assets', 'audio', 'manifest.json');
let audioManifest = null;
if (fs.existsSync(amPath)) {
  audioManifest = JSON.parse(fs.readFileSync(amPath, 'utf8'));
  for (const v of Object.values(audioManifest)) {
    if (!Array.isArray(v.files) || v.files.length <= MAX_VARIANTS) continue;
    const keep = v.files.slice(0, MAX_VARIANTS);
    for (const f of v.files.slice(MAX_VARIANTS)) dropped.add(path.join('assets', 'audio', f));
    v.files = keep;
    if (Array.isArray(v.fileCredit)) v.fileCredit = v.fileCredit.slice(0, MAX_VARIANTS);
    if (Array.isArray(v.lufs)) v.lufs = v.lufs.slice(0, MAX_VARIANTS);
    if (Array.isArray(v.loopSamples)) v.loopSamples = v.loopSamples.slice(0, MAX_VARIANTS);
  }
}

const skip = (rel) => {
  if (dropped.has(rel)) return true;
  if (/\.woff$/.test(rel)) return true;
  if (/-(vietnamese|latin-ext)-\d+-normal.*\.woff2$/.test(rel)) return true;
  return false;
};

const files = [];
const walk = (dir) => {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const abs = path.join(dir, e.name);
    const rel = path.relative(dist, abs);
    if (e.isDirectory()) walk(abs);
    else if (rel !== 'index.html' && !skip(rel)) files.push(rel);
  }
};
walk(dist);

for (const rel of files) {
  const out = path.join(stage, rel);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.copyFileSync(path.join(dist, rel), out);
}
if (audioManifest) fs.writeFileSync(path.join(stage, 'assets', 'audio', 'manifest.json'), JSON.stringify(audioManifest));

// --- page ------------------------------------------------------------------------------
const html = fs.readFileSync(path.join(dist, 'index.html'), 'utf8');
const head = html.match(/<head>([\s\S]*?)<\/head>/)[1];
const body = html.match(/<body>([\s\S]*?)<\/body>/)[1];
const keepHead = head
  .split('\n')
  .filter((l) => !/<meta charset|<meta name="viewport"/.test(l))
  .join('\n');
const page = `${keepHead.trim()}\n${body.trim()}\n`;
fs.writeFileSync(path.join(stage, 'index.html'), page);

// --- batches -----------------------------------------------------------------------------
const sized = files.map((rel) => ({ rel, bytes: fs.statSync(path.join(stage, rel)).size }));
// scripts/styles/fonts/data first so the first publish already boots
const prio = (r) => (/\.(js|css|woff2)$/.test(r) ? 0 : /manifest\.json$/.test(r) ? 1 : 2);
sized.sort((a, b) => prio(a.rel) - prio(b.rel) || a.rel.localeCompare(b.rel));
const batches = [];
let cur = { files: [], bytes: 0 };
for (const f of sized) {
  if (cur.files.length >= MAX_FILES || cur.bytes + f.bytes > MAX_BYTES) {
    batches.push(cur);
    cur = { files: [], bytes: 0 };
  }
  cur.files.push(f.rel);
  cur.bytes += f.bytes;
}
if (cur.files.length) batches.push(cur);
fs.writeFileSync(path.join(stage, 'batches.json'), JSON.stringify(batches.map((b) => ({ count: b.files.length, mb: +(b.bytes / 1048576).toFixed(1), files: b.files })), null, 1));
const total = sized.reduce((s, f) => s + f.bytes, 0);
console.log(`staged ${files.length} files, ${(total / 1048576).toFixed(1)} MB, ${batches.length} batches: ${batches.map((b) => `${b.files.length} files/${(b.bytes / 1048576).toFixed(1)}MB`).join(', ')}`);
console.log(`dropped ${dropped.size} audio variants`);
