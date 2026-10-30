#!/usr/bin/env python3
"""Download a curated set of CC0 Poly Haven models (glTF, 1k textures) for the game.

Output: public/assets/props/polyhaven/<id>/<id>.gltf (+ .bin + textures/),
        public/assets/props/polyhaven/manifest.json, docs/credits/polyhaven.md
Small items get their textures downscaled to 512 px to keep the repo light.
Re-run safely: existing files are skipped.  Usage: python3 tools/assets/fetch_polyhaven.py
"""
import json, os, sys, urllib.request, io
from PIL import Image

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
OUT = os.path.join(ROOT, 'public', 'assets', 'props', 'polyhaven')
API = 'https://api.polyhaven.com'

# id -> (group, texture size). Groups tell the game where each model belongs.
CURATED = {
    # garage (Ah Kong's cluttered workshop, reference image 5)
    'mounted_fluorescent_lights': ('garage', 1024), 'ceiling_fan': ('garage', 512), 'boombox': ('garage', 512),
    'portable_cassette_player': ('garage', 512), 'old_tyre': ('garage', 1024), 'metal_toolbox': ('garage', 512),
    'metal_tool_chest': ('garage', 1024), 'tool_cart': ('garage', 1024), 'adjustable_wrench': ('garage', 512),
    'combination_wrench': ('garage', 512), 'pipe_wrench': ('garage', 512), 'pliers': ('garage', 512),
    'screwdrivers_02': ('garage', 512), 'oil_tin': ('garage', 512), 'small_oil_can_01': ('garage', 512),
    'metal_jerrycan': ('garage', 512), 'plastic_jerrycan': ('garage', 512), 'multi_cleaner_5_litre': ('garage', 512),
    'spray_paint_bottles': ('garage', 512), 'steel_frame_shelves_02': ('garage', 1024), 'worn_metal_rack': ('garage', 1024),
    'tire_pump': ('garage', 512), 'rusted_wheel_rim_01': ('garage', 512), 'fancy_picture_frame_01': ('garage', 512),
    'wall_clock': ('garage', 512), 'plastic_thermos': ('garage', 512), 'vintage_electric_kettle': ('garage', 512),
    'chinese_stool': ('garage', 1024), 'chinese_tea_table': ('garage', 1024), 'small_lpg_tank': ('garage', 512),
    'hanging_industrial_lamp': ('garage', 512), 'lightbulb_01': ('garage', 512), 'metal_trash_can': ('garage', 512),
    'power_box_01': ('roadside', 512), 'utility_box_01': ('roadside', 512), 'utility_box_02': ('roadside', 512),
    'vintage_lighter': ('garage', 512), 'cardboard_box_01': ('garage', 512),
    # seating & stalls (sala, noodle stall, bus stop)
    'plastic_monobloc_chair_01': ('stall', 1024), 'metal_stool_02': ('stall', 512), 'folding_wooden_stool': ('stall', 512),
    'wooden_stool_01': ('stall', 512), 'plastic_crate_01': ('stall', 512), 'plastic_crate_02': ('stall', 512),
    'pot_enamel_01': ('stall', 512), 'ceramic_pot': ('stall', 512), 'jug_01': ('stall', 512), 'wooden_bowl_01': ('stall', 512),
    'wooden_cutting_board': ('stall', 512), 'wicker_basket_01': ('stall', 512), 'wicker_basket_02': ('stall', 512),
    'bananas': ('stall', 512), 'food_lime_01': ('stall', 512), 'plastic_bottle_gallon': ('stall', 512),
    # shrine & spirit houses
    'brass_candleholders': ('shrine', 512), 'brass_diya_lantern': ('shrine', 512), 'brass_pot_01': ('shrine', 512),
    'brass_vase_01': ('shrine', 512), 'ceramic_vase_01': ('shrine', 512), 'chinese_console_table': ('shrine', 1024),
    'wooden_lantern_01': ('shrine', 512), 'wooden_candlestick': ('shrine', 512), 'carved_wooden_elephant': ('shrine', 512),
    # roadside & forest floor
    'concrete_road_barrier': ('roadside', 1024), 'concrete_road_barrier_02': ('roadside', 1024),
    'rock_moss_set_01': ('forest', 1024), 'rock_moss_set_02': ('forest', 1024), 'root_cluster_01': ('forest', 1024),
    'root_cluster_02': ('forest', 1024), 'tree_stump_01': ('forest', 1024), 'tree_stump_02': ('forest', 1024),
    'dead_tree_trunk_02': ('forest', 1024), 'bark_debris_01': ('forest', 512), 'moss_01': ('forest', 512),
    'fern_02': ('forest', 1024), 'pachira_aquatica_01': ('forest', 1024), 'calathea_orbifolia_01': ('forest', 1024),
    'anthurium_botany_01': ('forest', 1024), 'boulder_01': ('forest', 1024), 'wooden_bucket_01': ('roadside', 512),
}

def get(url):
    req = urllib.request.Request(url, headers={'User-Agent': 'dlbih-asset-fetch/1.0'})
    with urllib.request.urlopen(req, timeout=120) as r:
        return r.read()

def main():
    os.makedirs(OUT, exist_ok=True)
    info_all = json.loads(get(f'{API}/assets?t=models'))
    manifest, credits = {}, []
    total = 0
    for aid, (group, size) in CURATED.items():
        if aid not in info_all:
            print('missing', aid); continue
        files = json.loads(get(f'{API}/files/{aid}'))
        g = files['gltf']['1k']['gltf']
        d = os.path.join(OUT, aid)
        os.makedirs(d, exist_ok=True)
        gl_path = os.path.join(d, f'{aid}.gltf')
        if not os.path.exists(gl_path):
            open(gl_path, 'wb').write(get(g['url']))
        for rel, inc in g['include'].items():
            p = os.path.join(d, rel)
            os.makedirs(os.path.dirname(p), exist_ok=True)
            if os.path.exists(p):
                continue
            data = get(inc['url'])
            if rel.lower().endswith(('.jpg', '.jpeg', '.png')) and size < 1024:
                im = Image.open(io.BytesIO(data))
                im = im.resize((size, size), Image.LANCZOS) if im.width > size else im
                buf = io.BytesIO()
                if rel.lower().endswith('.png'):
                    im.save(buf, 'PNG', optimize=True)
                else:
                    im.convert('RGB').save(buf, 'JPEG', quality=86, optimize=True)
                data = buf.getvalue()
            open(p, 'wb').write(data)
        sz = sum(os.path.getsize(os.path.join(dp, f)) for dp, _, fs in os.walk(d) for f in fs)
        total += sz
        a = info_all[aid]
        authors = ', '.join(a.get('authors', {}).keys()) or 'Poly Haven'
        manifest[aid] = {'gltf': f'assets/props/polyhaven/{aid}/{aid}.gltf', 'group': group, 'name': a.get('name', aid),
                         'categories': a.get('categories', []), 'author': authors, 'license': 'CC0 1.0',
                         'source': f'https://polyhaven.com/a/{aid}', 'bytes': sz}
        credits.append((aid, a.get('name', aid), authors))
        print(f'{aid:32s} {group:9s} {sz/1e6:5.2f} MB')
    json.dump(manifest, open(os.path.join(OUT, 'manifest.json'), 'w'), indent=1)
    lines = ['# Poly Haven model credits', '',
             'Models downloaded by `tools/assets/fetch_polyhaven.py` from https://polyhaven.com (CC0 1.0, no attribution',
             'required; credited anyway). glTF with 1k textures; small items downscaled to 512 px.', '',
             '| id | name | author(s) | licence | source |', '|---|---|---|---|---|']
    for aid, name, au in credits:
        lines.append(f'| {aid} | {name} | {au} | CC0 1.0 | https://polyhaven.com/a/{aid} |')
    os.makedirs(os.path.join(ROOT, 'docs', 'credits'), exist_ok=True)
    open(os.path.join(ROOT, 'docs', 'credits', 'polyhaven.md'), 'w').write('\n'.join(lines) + '\n')
    print(f'total {total/1e6:.1f} MB, {len(manifest)} models')

if __name__ == '__main__':
    main()
