"""Every external photo source used by the photobash pipeline.

All entries are CC0 / public domain. Each record:
    id        local folder name under the raw directory
    provider  'polyhaven' (texture | model | hdri), 'ambientcg', or 'url'
    asset     provider asset id
    maps      which maps to fetch (provider map names; see fetch.py)
    res       resolution tag ('1k', '2k', '4k' for Poly Haven; '1K', '2K' for ambientCG)
    author    credited author (Poly Haven: from api.polyhaven.com/info; ambientCG: Lennart Demes)
    licence   'CC0 1.0'
    page      human-readable source page (licence statement lives there)
    used_by   which outputs use it (also written into docs/credits/textures.md)

Reject list (not used): anything NC / ND / BY-SA / unknown licence, Flickr (rate limited, not
needed), photos with brands, logos or identifiable people.
"""

PH_TEX = ['Diffuse', 'nor_gl', 'Rough', 'Displacement', 'AO']


def ph(asset, used_by, author, res='2k', maps=None, kind='texture'):
    page = {'texture': 'textures', 'model': 'models', 'hdri': 'hdris'}[kind]
    return dict(id='ph_' + asset, provider='polyhaven', kind=kind, asset=asset, maps=maps or PH_TEX, res=res,
                author=author, licence='CC0 1.0', page=f'https://polyhaven.com/a/{asset}', used_by=used_by)


def acg(asset, used_by, res='2K'):
    return dict(id='acg_' + asset, provider='ambientcg', asset=asset, res=res, author='Lennart Demes (ambientCG)',
                licence='CC0 1.0', page=f'https://ambientcg.com/view?id={asset}', used_by=used_by)


SOURCES = [
    # ---------------------------------------------------------------- ground & stone
    ph('asphalt_02', 'asphalt*', 'Rob Tuytel', res='4k'),
    ph('asphalt_track', 'asphalt* (tar patches)', 'Rob Tuytel'),
    acg('AsphaltDamageSet001', 'asphalt* (cracks, potholes)'),
    ph('dirty_concrete', 'concrete*', 'Rob Tuytel'),
    ph('concrete_moss', 'concrete_moss*', 'Rob Tuytel'),
    ph('worn_mossy_plasterwall', 'concrete_moss*', 'Rob Tuytel'),
    acg('Moss002', 'moss*, concrete_moss*, rock*, bark*'),
    acg('Moss003', 'moss*'),
    ph('red_laterite_soil_stones', 'soil*', 'Rob Tuytel'),
    ph('forest_ground_04', 'soil*', 'Rob Tuytel'),
    ph('rocky_gravel', 'gravel*', 'Rob Tuytel'),
    ph('forest_leaves_04', 'leaf_litter*', 'Rob Tuytel'),
    ph('dry_decay_leaves', 'leaf_litter*', 'Rob Tuytel'),
    ph('mossy_rock', 'rock*', 'Rob Tuytel'),
    # ---------------------------------------------------------------- bark & wood
    ph('bark_willow_02', 'bark*', 'Rob Tuytel'),
    ph('chinese_hackberry_bark', 'bark_banyan*', 'Rob Tuytel'),
    ph('weathered_planks', 'wood_planks*', 'Rob Tuytel'),
    ph('wood_planks_grey', 'wood_old*', 'Rob Tuytel'),
    ph('lacquered_cherry_wood', 'red_lacquer* (wood under the lacquer)', 'Rob Tuytel'),
    # ---------------------------------------------------------------- built
    ph('rust_coarse_01', 'rust*', 'Rob Tuytel'),
    acg('Rust004', 'rust*, taxi_paint* (sill rust), roof_corrugated*'),
    acg('PaintedMetal014', 'metal_painted*'),
    ph('peeling_painted_wall', 'paint_peel_white*, paint_peel_red*, red_lacquer* (crackle)', 'Rob Tuytel'),
    ph('worn_plaster_wall', 'paint_peel_white*', 'Rob Tuytel'),
    ph('red_plaster_weathered', 'paint_peel_red*', 'Rob Tuytel'),
    ph('clay_roof_tiles_02', 'roof_tiles*', 'Rob Tuytel'),
    ph('worn_corrugated_iron', 'roof_corrugated*', 'Rob Tuytel'),
    ph('rusty_corrugated_iron', 'roof_corrugated* (rust bleed)', 'Rob Tuytel'),
    acg('Foil002', 'gold_leaf*'),
    # ---------------------------------------------------------------- vehicle & cloth
    acg('Scratches001', 'taxi_paint*, dash_plastic*'),
    acg('Scratches004', 'taxi_paint*'),
    acg('SurfaceImperfections006', 'taxi_paint* (water spots)'),
    acg('Leaking004', 'taxi_paint*, concrete* (water streaks)'),
    acg('Leaking006', 'paint_peel_*, metal_painted* (water streaks)'),
    acg('Plastic012A', 'dash_plastic*'),
    ph('brown_leather', 'leather_seat*', 'Rob Tuytel'),
    acg('Fabric012', 'fabric_seat*'),
    acg('Fabric062', 'headliner*'),
    ph('dirty_carpet', 'carpet*', 'Rob Tuytel'),
    acg('Fabric061', 'fabric_cotton*, fabric_sarong*'),
    ph('crepe_satin', 'fabric_silk*, cloth_red/yellow/green', 'Rob Tuytel'),
    ph('denim_fabric', 'fabric_denim*', 'Rob Tuytel'),
    ph('rough_linen', 'monk_robe*', 'Rob Tuytel'),
    # ---------------------------------------------------------------- paper & print
    acg('Paper001', '2D printed matter (white paper)'),
    acg('Paper002', '2D printed matter (cream paper)'),
    acg('Paper003', '2D printed matter (crumpled paper)'),
    acg('Paper005', 'lantern_paper*, 2D printed matter (crinkled kraft)'),
    acg('Cardboard001', '2D packaging (cardboard)'),
    acg('Cardboard003', '2D packaging (corrugated board)'),
    acg('Tape004', '2D posters (packing tape)'),
    acg('Leaking012A', '2D water damage, blood_drip*'),
    acg('Leaking017A', 'blood_drip*, 2D water damage'),
    acg('Smear002', 'blood_smear*'),
    acg('Smear005', 'blood_smear*'),
    acg('Fingerprints004', 'blood_handprint*'),
    # ---------------------------------------------------------------- foliage scans (alpha)
    acg('LeafSet024', 'foliage atlases (small ovate leaves, reference 6)'),
    acg('LeafSet022', 'foliage atlases (elongated leaves)'),
    acg('LeafSet023', 'foliage atlases (pointed leaves)'),
    acg('LeafSet018', 'foliage atlases (broad leaves)'),
    acg('LeafSet013', 'foliage atlases (lanceolate leaflets)'),
    acg('LeafSet004', 'foliage atlases (heart leaves, vines)'),
    acg('LeafSet017', 'vine atlas (ivy)'),
    acg('LeafSet030', 'dead leaves (foliage_world dead-twig slot)'),
    acg('LeafSet012', 'dead leaves (foliage_world dead-twig slot)'),
    acg('Foliage001', 'grass_card* (blades)'),
    acg('Foliage002', 'grass_card* (seed heads)'),
    acg('Foliage006', 'grass_card* (strands)'),
    acg('StickSet001', 'foliage atlases (twigs)'),
    ph('anthurium_botany_01', 'leaf_tropical*, foliage_world (broad tropical leaves)', 'Rico Cilliers',
       maps=['Diffuse', 'Alpha', 'nor_gl'], kind='model'),
    ph('fern_02', 'leaf_fern*, foliage_world fern / epiphyte', 'Rico Cilliers',
       maps=['Diffuse', 'Alpha', 'nor_gl'], kind='model'),
    ph('jacaranda_tree', 'foliage_world rain-tree slot (bipinnate leaves)', 'Rico Cilliers',
       maps=['leaves_diff', 'leaves_alpha', 'leaves_nor_gl'], kind='model'),
    ph('island_tree_02', 'leaf_tropical*, foliage clusters', 'Rico Cilliers',
       maps=['leaves_diff', 'leaves_alpha', 'leaves_nor_gl'], kind='model'),
    ph('potted_plant_02', 'foliage_world elephant-ear slot, leaf_tropical heart', 'Rico Cilliers',
       maps=['leaves_diff', 'leaves_alpha', 'leaves_nor_gl'], kind='model'),
    ph('shrub_02', 'leaf_bamboo* (narrow leaves)', 'Rico Cilliers',
       maps=['Diffuse', 'Alpha', 'nor_gl'], kind='model'),
    ph('shrub_04', 'foliage clusters (small leaves)', 'Rico Cilliers',
       maps=['Diffuse', 'Alpha', 'nor_gl'], kind='model'),
    ph('dry_branches_medium_01', 'twig bark in foliage atlases', 'Rico Cilliers',
       maps=['Diffuse'], kind='model'),
    # ---------------------------------------------------------------- flower scans (flower_atlas)
    acg('FlowerSet001', 'flower_atlas (white daisy heads: chrysanthemum, jasmine petal texture, centres)'),
    ph('flower_gazania', 'flower_atlas (petal scans: chrysanthemum, rose, lotus, jasmine petals)', 'Rico Cilliers',
       maps=['Diffuse', 'Alpha', 'nor_gl'], kind='model'),
    ph('flower_ursinia', 'flower_atlas (petal scans, daisy heads)', 'Rico Cilliers',
       maps=['Diffuse', 'Alpha', 'nor_gl'], kind='model'),
    ph('flower_stinkkruid', 'flower_atlas (pompom heads: marigold; green buds)', 'Rico Cilliers',
       maps=['Diffuse', 'Alpha', 'nor_gl'], kind='model'),
    ph('periwinkle_plant', 'flower_atlas (5-petal flowers: frangipani, crown flower, orchid; filler leaves)',
       'Rico Cilliers', maps=['Diffuse', 'nor_gl'], kind='model'),
    # ---------------------------------------------------------------- photo plates for posters
    ph('rainforest_trail', '2D posters (forest backdrop)', 'Greg Zaal', maps=['tonemapped'], kind='hdri'),
    ph('narrow_moonlit_road', '2D posters (night road backdrop)', 'Greg Zaal', maps=['tonemapped'], kind='hdri'),
    dict(id='wm_banana_plant_garden', provider='url', asset='Banana_plant_garden.jpg',
         url='https://upload.wikimedia.org/wikipedia/commons/thumb/7/73/Banana_plant_garden.jpg/1280px-Banana_plant_garden.jpg',
         author='Sankuba Damasus Erasong', licence='CC0 1.0',
         page='https://commons.wikimedia.org/w/index.php?curid=170745660', used_by='leaf_banana*, foliage_world banana / bananaDead slots (lamina photo; dried leaves on the pseudostem)'),
]

BY_ID = {s['id']: s for s in SOURCES}
