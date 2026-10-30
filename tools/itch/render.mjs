#!/usr/bin/env node
// Renders the itch.io page art from the itch-* sandboxes, one PNG per frame (headless Chromium +
// SwiftShader, deterministic stepping). The sandbox exposes:
//   window.__itch = { frames, prepare(): Promise, frame(i): Promise }   (frame(i) steps + renders frame i)
//
//   node tools/itch/render.mjs --sandbox=itch-banner --size=960x360 --out=.shots/itch/banner/f.png
//        [--params="k=v&..."] [--frames=N] [--from=0] [--every=1] [--timeout=900000]
// Frame files are <out without .png>-NNN.png (a single frame keeps the plain name with --single).
// See tools/itch/make.sh for the full pipeline (frames -> GIF / cover PNGs).
import { createServer } from 'vite';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
let chromium;
try {
  ({ chromium } = require('playwright'));
} catch (e) {
  ({ chromium } = require('/opt/node-tools/node_modules/playwright'));
}

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const m = a.match(/^--([^=]+)(?:=(.*))?$/);
    return m ? [m[1], m[2] ?? 'true'] : [a, 'true'];
  }),
);
const [w, h] = (args.size || '960x360').split('x').map(Number);
const out = path.resolve(root, args.out || `.shots/itch/${args.sandbox}.png`);
fs.mkdirSync(path.dirname(out), { recursive: true });
const timeout = Number(args.timeout ?? 900000);

const cacheDir = path.join(os.tmpdir(), `dlbih-itch-${process.pid}-${Date.now()}`);
const server = await createServer({
  root,
  logLevel: 'error',
  cacheDir,
  server: { port: 0, host: '127.0.0.1', hmr: false, watch: null },
  optimizeDeps: { noDiscovery: true, include: [] },
});
await server.listen();
const port = server.httpServer.address().port;
const qs = new URLSearchParams(args.params || '');
qs.set('sandbox', args.sandbox || 'itch-banner');
qs.set('manual', '1');
qs.set('test', '1');
const url = `http://127.0.0.1:${port}/?${qs.toString()}`;

const browser = await chromium.launch({
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
const page = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
page.setDefaultTimeout(timeout);
const logs = [];
page.on('console', (m) => {
  const t = m.type();
  if (t === 'error' || t === 'warning' || args.verbose) logs.push(`[${t}] ${m.text()}`);
});
page.on('pageerror', (e) => logs.push(`[pageerror] ${e.stack || e.message}`));

let code = 0;
try {
  const t0 = Date.now();
  await page.goto(url, { waitUntil: 'load', timeout });
  await page.waitForFunction(() => window.__ready === true || !!window.__bootError, null, { timeout, polling: 500 });
  const bootErr = await page.evaluate(() => window.__bootError || null);
  if (bootErr) throw new Error('boot: ' + bootErr);
  console.log(`boot ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  const total = await page.evaluate(async () => {
    await window.__itch.prepare();
    return window.__itch.frames;
  });
  console.log(`prepared ${((Date.now() - t0) / 1000).toFixed(1)}s, ${total} frames`);
  const n = Number(args.frames ?? total);
  const from = Number(args.from ?? 0);
  const every = Number(args.every ?? 1);
  for (let i = from; i < Math.min(total, from + n); i += every) {
    const t1 = Date.now();
    await page.evaluate((k) => window.__itch.frame(k), i);
    const file = args.single ? out : out.replace(/\.png$/, `-${String(i).padStart(3, '0')}.png`);
    await page.screenshot({ path: file, timeout });
    console.log(`frame ${i} ${((Date.now() - t1) / 1000).toFixed(1)}s -> ${path.relative(root, file)}`);
  }
  const errs = await page.evaluate(() => window.__game?.errors || []);
  for (const e of errs) logs.push('[game.errors] ' + e);
} catch (err) {
  logs.push('[harness] ' + (err.stack || err.message));
  code = 1;
} finally {
  if (logs.length) {
    console.log('--- console ---');
    for (const l of logs.slice(0, 60)) console.log(l.slice(0, 800));
  } else console.log('no console errors');
  await browser.close();
  await server.close();
  try {
    fs.rmSync(cacheDir, { recursive: true, force: true });
  } catch (e) {
    /* ignore */
  }
  process.exit(code);
}
