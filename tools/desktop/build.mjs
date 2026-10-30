#!/usr/bin/env node
// Downloadable desktop builds (Electron) of หลอนยันปลายทาง.
//   npm run desktop                          vite build, then all platform zips in release/
//   npm run desktop -- --from=dist           package an existing build instead of running vite
//   npm run desktop -- --platforms=win,linux (win, linux, mac = mac-arm64 + mac-x64)
// Needs curl, unzip and zip on PATH. Electron zips are fetched from the official GitHub
// releases, checked against SHASUMS256.txt and cached in release/.cache/.
import { execFileSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { png, ico, icns } from './icon.mjs';

const ELECTRON = '44.7.2'; // pinned exactly: stable 44.x line, released 2026-10-14
const RESEDIT = 'resedit@3.1.0'; // pure-JS PE resource editor (Windows icon + metadata, no wine)
const NAME = 'LonYanPlaiThang';
const TITLE = 'หลอนยันปลายทาง';
const KEEP_LOCALES = new Set(['en-US.pak', 'th.pak']);

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../..');
const release = path.join(root, 'release');
const cache = path.join(release, '.cache');
const staging = path.join(release, '.desktop');
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const args = Object.fromEntries(process.argv.slice(2).map((a) => a.replace(/^--/, '').split('=')));

const PLATFORMS = {
  win: { electron: 'win32-x64', zip: 'lon-yan-plaithang-windows-x64.zip' },
  linux: { electron: 'linux-x64', zip: 'lon-yan-plaithang-linux-x64.zip' },
  'mac-arm64': { electron: 'darwin-arm64', zip: 'lon-yan-plaithang-macos-arm64.zip' },
  'mac-x64': { electron: 'darwin-x64', zip: 'lon-yan-plaithang-macos-x64.zip' },
};
const wanted = (args.platforms || 'win,linux,mac').split(',').flatMap((p) => (p === 'mac' ? ['mac-arm64', 'mac-x64'] : [p]));
for (const p of wanted) if (!PLATFORMS[p]) throw new Error(`unknown platform "${p}" (use ${Object.keys(PLATFORMS).join(', ')}, mac)`);

const run = (cmd, argv, cwd = root) => execFileSync(cmd, argv, { cwd, stdio: 'inherit' });
const mb = (n) => `${(n / 1e6).toFixed(1)} MB`;
const dirSize = (d) =>
  fs.readdirSync(d, { withFileTypes: true }).reduce((n, e) => {
    const p = path.join(d, e.name);
    return n + (e.isDirectory() ? dirSize(p) : e.isFile() ? fs.statSync(p).size : 0);
  }, 0);

// 1. the game
fs.mkdirSync(staging, { recursive: true });
let game = path.join(staging, 'game');
if (args.from) {
  game = path.resolve(root, args.from);
} else {
  run('npx', ['vite', 'build', '--outDir', game, '--emptyOutDir']);
}
const html = fs.readFileSync(path.join(game, 'index.html'), 'utf8');
if (/(src|href)="\/(?!\/)/.test(html)) throw new Error('index.html has absolute paths; the build needs base "./"');

// 2. Electron downloads (cached, checksum-verified)
function electronZip(target) {
  const dir = path.join(cache, 'electron');
  fs.mkdirSync(dir, { recursive: true });
  const base = `https://github.com/electron/electron/releases/download/v${ELECTRON}/`;
  const get = (name, as = name) => {
    const file = path.join(dir, as);
    if (!fs.existsSync(file)) {
      console.log(`downloading ${name}`);
      run('curl', ['-fL', '--retry', '3', '-sS', '-o', file + '.part', base + name]);
      fs.renameSync(file + '.part', file);
    }
    return file;
  };
  const sums = fs.readFileSync(get('SHASUMS256.txt', `SHASUMS256-v${ELECTRON}.txt`), 'utf8');
  const name = `electron-v${ELECTRON}-${target}.zip`;
  const file = get(name);
  const want = sums.split('\n').find((l) => l.endsWith(`*${name}`))?.split(' ')[0];
  const have = crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
  if (want !== have) {
    fs.rmSync(file);
    throw new Error(`${name}: checksum mismatch (deleted, run again)`);
  }
  return file;
}

// 3. shared app files
const icons = path.join(staging, 'icons');
fs.mkdirSync(icons, { recursive: true });
fs.writeFileSync(path.join(icons, 'icon.png'), png(256));
fs.writeFileSync(path.join(icons, 'icon.ico'), ico());
fs.writeFileSync(path.join(icons, 'icon.icns'), icns());
const appPkg = {
  name: 'lon-yan-plaithang',
  productName: NAME, // userData folder: %APPDATA%/LonYanPlaiThang, ~/.config/LonYanPlaiThang, ...
  version: pkg.version,
  description: pkg.description,
  author: 'Pukking Dragon',
  private: true,
  main: 'main.cjs',
};

function installApp(appDir) {
  fs.mkdirSync(appDir, { recursive: true });
  fs.writeFileSync(path.join(appDir, 'package.json'), JSON.stringify(appPkg, null, 2) + '\n');
  for (const f of ['main.cjs', 'preload.cjs']) fs.copyFileSync(path.join(here, f), path.join(appDir, f));
  fs.copyFileSync(path.join(icons, 'icon.png'), path.join(appDir, 'icon.png'));
  fs.cpSync(game, path.join(appDir, 'game'), { recursive: true });
}

function pruneLocales(dir) {
  for (const f of fs.readdirSync(dir)) if (!KEEP_LOCALES.has(f)) fs.rmSync(path.join(dir, f));
}

/** Windows exe icon + version strings, edited in pure JS (drops Electron's Authenticode signature). */
async function brandExe(exe) {
  const mods = path.join(cache, 'node');
  const entry = path.join(mods, 'node_modules/resedit/dist/index.js');
  if (!fs.existsSync(entry)) run('npm', ['install', '--prefix', mods, '--no-save', '--no-package-lock', '--no-audit', '--no-fund', RESEDIT]);
  const { NtExecutable, NtExecutableResource, Data, Resource } = await import(pathToFileURL(entry).href);
  const bin = NtExecutable.from(fs.readFileSync(exe), { ignoreCert: true });
  const res = NtExecutableResource.from(bin);
  const group = Resource.IconGroupEntry.fromEntries(res.entries)[0];
  const iconData = Data.IconFile.from(fs.readFileSync(path.join(icons, 'icon.ico'))).icons.map((i) => i.data);
  Resource.IconGroupEntry.replaceIconsForResource(res.entries, group?.id ?? 1, group?.lang ?? 1033, iconData);
  const vi = Resource.VersionInfo.fromEntries(res.entries)[0];
  const [major, minor, micro] = pkg.version.split('.').map(Number);
  for (const lang of vi.getAllLanguagesForStringValues()) {
    vi.setStringValues(lang, {
      CompanyName: 'Pukking Dragon',
      FileDescription: TITLE,
      ProductName: TITLE,
      InternalName: NAME,
      OriginalFilename: `${NAME}.exe`,
      LegalCopyright: '© Pukking Dragon',
    });
    vi.setFileVersion(major, minor, micro, 0, lang.lang);
    vi.setProductVersion(major, minor, micro, 0, lang.lang);
  }
  vi.outputToResourceEntries(res.entries);
  res.outputResource(bin);
  fs.writeFileSync(exe, Buffer.from(bin.generate()));
}

const README = {
  win: [
    `${TITLE} (Windows x64)`,
    '',
    `Run ${NAME}.exe. If SmartScreen warns about an unrecognised app, click "More info", then "Run anyway".`,
    'F11 or Alt+Enter toggles fullscreen. Saves are kept in %APPDATA%\\LonYanPlaiThang.',
    '',
    `เปิดไฟล์ ${NAME}.exe ถ้า SmartScreen เตือนว่าไม่รู้จักแอปนี้ ให้กด More info แล้วกด Run anyway`,
    'กด F11 หรือ Alt+Enter เพื่อสลับโหมดเต็มจอ เซฟเกมเก็บอยู่ที่ %APPDATA%\\LonYanPlaiThang',
  ],
  linux: [
    `${TITLE} (Linux x64)`,
    '',
    'Run ./lon-yan-plaithang. If it stops with a sandbox error (common on Ubuntu 24.04 and later),',
    'run ./lon-yan-plaithang --no-sandbox instead.',
    'F11 or Alt+Enter toggles fullscreen. Saves are kept in ~/.config/LonYanPlaiThang.',
    '',
    'รัน ./lon-yan-plaithang ถ้าเกมปิดไปพร้อมข้อความเรื่อง sandbox (เจอบ่อยใน Ubuntu 24.04 ขึ้นไป)',
    'ให้รัน ./lon-yan-plaithang --no-sandbox แทน',
    'กด F11 หรือ Alt+Enter เพื่อสลับโหมดเต็มจอ เซฟเกมเก็บอยู่ที่ ~/.config/LonYanPlaiThang',
  ],
  mac: [
    `${TITLE} (macOS)`,
    '',
    `This build is not signed by Apple. After unzipping, open Terminal and run once:`,
    `  xattr -cr ${NAME}.app`,
    `(type "xattr -cr ", drag ${NAME}.app into the window, press Return), then open the game.`,
    'F11 toggles fullscreen. Saves are kept in ~/Library/Application Support/LonYanPlaiThang.',
    '',
    'เกมเวอร์ชันนี้ยังไม่ได้รับการรับรองจาก Apple หลังแตกไฟล์ zip ให้เปิด Terminal แล้วรันคำสั่งนี้ครั้งเดียว',
    `  xattr -cr ${NAME}.app`,
    `(พิมพ์ "xattr -cr " แล้วลาก ${NAME}.app มาวางในหน้าต่าง กด Return) จากนั้นเปิดเกมได้ตามปกติ`,
    'กด F11 เพื่อสลับโหมดเต็มจอ เซฟเกมเก็บอยู่ที่ ~/Library/Application Support/LonYanPlaiThang',
  ],
};

// 4. per-platform folders and zips
const results = [];
for (const key of wanted) {
  const { electron, zip } = PLATFORMS[key];
  const src = electronZip(electron);
  const out = path.join(staging, key);
  fs.rmSync(out, { recursive: true, force: true });
  fs.mkdirSync(out, { recursive: true });
  console.log(`assembling ${key}`);
  let entries;
  if (key.startsWith('mac')) {
    run('unzip', ['-q', src, '-d', out]);
    const contents = path.join(out, 'Electron.app/Contents');
    fs.rmSync(path.join(contents, 'Resources/default_app.asar'));
    installApp(path.join(contents, 'Resources/app'));
    fs.copyFileSync(path.join(icons, 'icon.icns'), path.join(contents, 'Resources/electron.icns'));
    const plist = path.join(contents, 'Info.plist');
    fs.writeFileSync(
      plist,
      fs
        .readFileSync(plist, 'utf8')
        .replace(/(<key>CFBundle(?:Display)?Name<\/key>\s*<string>)Electron(<\/string>)/g, `$1${NAME}$2`)
        .replace('public.app-category.developer-tools', 'public.app-category.games'),
    );
    fs.renameSync(path.join(out, 'Electron.app'), path.join(out, `${NAME}.app`));
    fs.writeFileSync(path.join(out, 'README.txt'), README.mac.join('\n') + '\n');
    entries = [`${NAME}.app`, 'README.txt'];
  } else {
    const dir = path.join(out, NAME);
    run('unzip', ['-q', src, '-d', dir]);
    fs.rmSync(path.join(dir, 'resources/default_app.asar'));
    pruneLocales(path.join(dir, 'locales'));
    installApp(path.join(dir, 'resources/app'));
    if (key === 'win') {
      fs.renameSync(path.join(dir, 'electron.exe'), path.join(dir, `${NAME}.exe`));
      try {
        await brandExe(path.join(dir, `${NAME}.exe`));
      } catch (e) {
        console.warn(`warning: could not set the exe icon/metadata (${e.message}); keeping Electron's`);
      }
    } else {
      fs.renameSync(path.join(dir, 'electron'), path.join(dir, 'lon-yan-plaithang'));
    }
    fs.writeFileSync(path.join(dir, 'README.txt'), README[key].join('\n') + '\n');
    entries = [NAME];
  }
  const zipPath = path.join(release, zip);
  fs.rmSync(zipPath, { force: true });
  console.log(`zipping ${zip}`);
  run('zip', ['-q', '-r', '-y', '-9', '-X', zipPath, ...entries], out);
  results.push([path.relative(root, zipPath), fs.statSync(zipPath).size, dirSize(out)]);
}

console.log(`\nElectron ${ELECTRON}, game ${mb(dirSize(game))}`);
for (const [z, size, unpacked] of results) console.log(`${z}  ${mb(size)} zipped, ${mb(unpacked)} unpacked`);
