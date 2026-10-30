// Packs every downloaded Poly Haven glTF into one quantized, simplified .glb with
// embedded textures (gltfpack, KHR_mesh_quantization is supported by three's GLTFLoader
// without extra decoders). Heavy photogrammetry scans get stronger simplification.
// Usage: node tools/assets/pack_polyhaven.mjs
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const DIR = path.resolve('public/assets/props/polyhaven');
const manifest = JSON.parse(fs.readFileSync(path.join(DIR, 'manifest.json'), 'utf8'));
const HEAVY = new Set(['root_cluster_01', 'root_cluster_02', 'boulder_01', 'bark_debris_01', 'pachira_aquatica_01', 'dead_tree_trunk_02', 'tree_stump_01', 'tree_stump_02', 'anthurium_botany_01', 'rock_moss_set_01', 'rock_moss_set_02', 'wooden_candlestick']);
let total = 0;
for (const [id, m] of Object.entries(manifest)) {
  const dir = path.join(DIR, id);
  const src = path.join(dir, `${id}.gltf`);
  const out = path.join(DIR, `${id}.glb`);
  if (fs.existsSync(src)) {
    const si = HEAVY.has(id) ? '0.12' : m.group === 'forest' ? '0.35' : '0.7';
    try {
      execFileSync('npx', ['--yes', 'gltfpack@0.21.0', '-i', src, '-o', out, '-si', si, '-kn', '-km'], { stdio: 'pipe' });
    } catch (e) {
      console.log('gltfpack failed', id, String(e.stderr || e).slice(0, 300));
      continue;
    }
    fs.rmSync(dir, { recursive: true, force: true });
  }
  if (!fs.existsSync(out)) continue;
  const bytes = fs.statSync(out).size;
  total += bytes;
  m.gltf = `assets/props/polyhaven/${id}.glb`;
  m.bytes = bytes;
  console.log(id.padEnd(30), (bytes / 1e6).toFixed(2), 'MB');
}
fs.writeFileSync(path.join(DIR, 'manifest.json'), JSON.stringify(manifest, null, 1));
console.log('total', (total / 1e6).toFixed(1), 'MB');
