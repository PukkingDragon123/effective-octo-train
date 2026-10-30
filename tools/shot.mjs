#!/usr/bin/env node
// Headless screenshot harness for visual QA (Chromium + SwiftShader WebGL2).
//
//   node tools/shot.mjs --sandbox=world --out=.shots/world.png [--size=960x540]
//        [--frames=30] [--wait=1500] [--eval="__game.foo()"] [--params="hour=23&x=1"]
//        [--shots=3 --interval=2000]  (multiple captures: out-1.png, out-2.png, ...)
//        [--game] (load the full game instead of a sandbox)
//
// It starts its own Vite dev server on a free port, opens the page, waits for
// window.__ready, steps `frames` frames deterministically (window.__game.step),
// captures, and prints every console error / page error so regressions are caught.
import { createServer } from 'vite';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Playwright is pre-installed globally (resolved through NODE_PATH via require).
const require = createRequire(import.meta.url);
let chromium;
try {
  ({ chromium } = require('playwright'));
} catch (e) {
  ({ chromium } = require('/opt/node-tools/node_modules/playwright'));
}

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const m = a.match(/^--([^=]+)(?:=(.*))?$/);
    return m ? [m[1], m[2] ?? 'true'] : [a, 'true'];
  }),
);

const [w, h] = (args.size || '960x540').split('x').map(Number);
const out = path.resolve(root, args.out || `.shots/${args.sandbox || 'game'}.png`);
fs.mkdirSync(path.dirname(out), { recursive: true });
const frames = Number(args.frames ?? 20);
const wait = Number(args.wait ?? 500);
const shots = Number(args.shots ?? 1);
const interval = Number(args.interval ?? 1000);
const timeout = Number(args.timeout ?? 180000);

const server = await createServer({
  root,
  logLevel: 'error',
  server: { port: 0, host: '127.0.0.1', hmr: false },
  optimizeDeps: { force: false },
});
await server.listen();
const port = server.httpServer.address().port;

const qs = new URLSearchParams(args.params || '');
if (!args.game && args.sandbox) qs.set('sandbox', args.sandbox);
qs.set('manual', args.realtime ? '0' : '1');
qs.set('test', '1');
const url = `http://127.0.0.1:${port}/?${qs.toString()}`;

const browser = await chromium.launch({
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'],
});
const page = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
const logs = [];
page.on('console', (m) => {
  const t = m.type();
  if (t === 'error' || t === 'warning' || args.verbose) logs.push(`[${t}] ${m.text()}`);
});
page.on('pageerror', (e) => logs.push(`[pageerror] ${e.stack || e.message}`));

let exitCode = 0;
try {
  const t0 = Date.now();
  await page.goto(url, { waitUntil: 'load', timeout });
  await page.waitForFunction(() => window.__ready === true || !!window.__bootError, null, { timeout, polling: 250 });
  const bootErr = await page.evaluate(() => window.__bootError || null);
  if (bootErr) {
    logs.push('[boot] ' + bootErr);
    exitCode = 2;
  }
  const bootMs = Date.now() - t0;
  if (args.eval) {
    const r = await page.evaluate(`(async () => { ${args.eval} })()`);
    if (r !== undefined) console.log('eval result:', typeof r === 'string' ? r : JSON.stringify(r));
  }
  for (let s = 0; s < shots; s++) {
    if (frames > 0) {
      await page.evaluate(async (n) => {
        for (let i = 0; i < n; i++) {
          window.__game.step(1, 1 / 30);
          if (i % 5 === 4) await new Promise((r) => setTimeout(r, 0));
        }
      }, frames);
    }
    await page.waitForTimeout(wait);
    const file = shots > 1 ? out.replace(/\.png$/, `-${s + 1}.png`) : out;
    await page.screenshot({ path: file });
    console.log('saved', path.relative(root, file));
    if (args.evalEach) await page.evaluate(`(async () => { ${args.evalEach} })()`);
    if (s < shots - 1) await page.waitForTimeout(interval);
  }
  const stats = await page.evaluate(() => {
    const r = window.__game?.engine?.renderer;
    return r ? { calls: r.info.render.calls, triangles: r.info.render.triangles, geometries: r.info.memory.geometries, textures: r.info.memory.textures, programs: r.info.programs?.length } : null;
  });
  console.log(`boot ${bootMs}ms`, stats ? JSON.stringify(stats) : '');
  const errs = await page.evaluate(() => window.__game?.errors || []);
  for (const e of errs) logs.push('[game.errors] ' + e);
} catch (err) {
  logs.push('[harness] ' + (err.stack || err.message));
  exitCode = 1;
} finally {
  if (logs.length) {
    console.log('--- console ---');
    for (const l of logs.slice(0, 80)) console.log(l.slice(0, 1200));
    if (logs.length > 80) console.log(`... ${logs.length - 80} more`);
  } else console.log('no console errors');
  await browser.close();
  await server.close();
  process.exit(exitCode);
}
