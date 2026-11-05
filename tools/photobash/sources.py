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

provider 'hiaphat': processed PBR sets borrowed from the owner's other game เฮียผัด
(public/assets/textures/pbr/<name>/ albedo.jpg, normal.jpg (OpenGL), orm.jpg (R ao, G rough, B metal)).
Only sets whose rows in its CREDITS.md are CC0, Public Domain Mark or CC BY are used; `origin` is
the original photo / scan it was made from (credited in docs/credits/textures.md). CC BY sources
REQUIRE the attribution kept there.
"""

PH_TEX = ['Diffuse', 'nor_gl', 'Rough', 'Displacement', 'AO']


def ph(asset, used_by, author, res='2k', maps=None, kind='texture'):
    page = {'texture': 'textures', 'model': 'models', 'hdri': 'hdris'}[kind]
    return dict(id='ph_' + asset, provider='polyhaven', kind=kind, asset=asset, maps=maps or PH_TEX, res=res,
                author=author, licence='CC0 1.0', page=f'https://polyhaven.com/a/{asset}', used_by=used_by)


def acg(asset, used_by, res='2K'):
    return dict(id='acg_' + asset, provider='ambientcg', asset=asset, res=res, author='Lennart Demes (ambientCG)',
                licence='CC0 1.0', page=f'https://ambientcg.com/view?id={asset}', used_by=used_by)


def hp(name, used_by, origin, author, licence, page):
    return dict(id='hp_' + name, provider='hiaphat', asset=f'pbr/{name}', path=f'public/assets/textures/pbr/{name}',
                maps=['albedo', 'normal', 'orm'], author=author, licence=licence, page=page, origin=origin,
                used_by=used_by)


SOURCES = [
    # ---------------------------------------------------------------- ground & stone
    ph('asphalt_02', 'asphalt*', 'Rob Tuytel', res='4k'),
    ph('asphalt_track', 'asphalt* (tar patches)', 'Rob Tuytel'),
    acg('AsphaltDamageSet001', 'asphalt* (cracks, potholes)'),
    ph('dirty_concrete', 'concrete*', 'Rob Tuytel'),
    ph('concrete_moss', 'concrete_moss*', 'Rob Tuytel'),
    ph('worn_mossy_plasterwall', 'concrete_moss*', 'Rob Tuytel'),
    acg('Moss002', 'moss*, concrete_moss*, rock*, bark*, brick* (moss in the joints)'),
    acg('Moss003', 'moss*'),
    ph('red_laterite_soil_stones', 'soil*', 'Rob Tuytel'),
    ph('forest_ground_04', 'soil*', 'Rob Tuytel'),
    ph('rocky_gravel', 'gravel*', 'Rob Tuytel'),
    ph('forest_leaves_04', 'leaf_litter*, water_surface* (floating leaves)', 'Rob Tuytel'),
    ph('dry_decay_leaves', 'leaf_litter*, water_surface* (floating leaves)', 'Rob Tuytel'),
    ph('mossy_rock', 'rock*, creature_hide (wrinkles)', 'Rob Tuytel'),
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
    ph('peeling_painted_wall', 'paint_peel_white*, paint_peel_red*, red_lacquer* (crackle), ceramic* (crazing)', 'Rob Tuytel'),
    ph('worn_plaster_wall', 'paint_peel_white*', 'Rob Tuytel'),
    ph('red_plaster_weathered', 'paint_peel_red*', 'Rob Tuytel'),
    ph('clay_roof_tiles_02', 'roof_tiles*', 'Rob Tuytel'),
    ph('worn_corrugated_iron', 'roof_corrugated*', 'Rob Tuytel'),
    ph('rusty_corrugated_iron', 'roof_corrugated* (rust bleed)', 'Rob Tuytel'),
    acg('Foil002', 'gold_leaf*'),
    # ---------------------------------------------------------------- vehicle & cloth
    acg('Scratches001', 'taxi_paint*, dash_plastic*, plastic_worn*'),
    acg('Scratches004', 'taxi_paint*, plastic_worn*, rubber_worn*, ceramic*'),
    acg('SurfaceImperfections006', 'taxi_paint* (water spots)'),
    acg('Leaking004', 'taxi_paint*, concrete* (water streaks), brick* (streaks)'),
    acg('Leaking006', 'paint_peel_*, metal_painted* (water streaks), galv*, stem_fibre* (streaks)'),
    acg('Plastic012A', 'dash_plastic*'),
    ph('brown_leather', 'leather_seat*, creature_hide (grain)', 'Rob Tuytel'),
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
    acg('Paper003', '2D printed matter (crumpled paper), paper_worn*'),
    acg('Paper005', 'lantern_paper*, 2D printed matter (crinkled kraft)'),
    acg('Cardboard001', '2D packaging (cardboard), paper_worn*'),
    acg('Cardboard003', '2D packaging (corrugated board)'),
    acg('Tape004', '2D posters (packing tape)'),
    acg('Leaking012A', '2D water damage, blood_drip*, paper_worn* (tide-lines)'),
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
    # ---------------------------------------------------------------- props / world detail sets (2026-11)
    acg('SurfaceImperfections010', 'ceramic* (glaze runs), blood_drip* (runs), 2D water streaks'),
    acg('Rubber004', 'rubber_worn* (tyres, hoses, cables, black plastic)', res='1K'),
    acg('Bamboo001A', 'bamboo_culm*, stem_fibre* (longitudinal fibres)', res='1K'),
    hp('galvanized_steel', 'galv* (zinc spangle)', "Flickr photo 'Texture - Galvanized metal'", 'Andrew Beeston',
       'CC BY 2.0', 'https://www.flickr.com/photos/94018078@N00/6846270808'),
    hp('aluminium_scratched', 'galv* (white-rust mottling)', "Flickr photo 'Galvanized sheet'", 'walmarc04',
       'Public Domain Mark 1.0', 'https://www.flickr.com/photos/30924550@N04/35399953944'),
    hp('steel_rusty', 'galv* (rust spots, bleed)', "Poly Haven 'Rusty Metal 02'", 'Rob Tuytel', 'CC0 1.0',
       'https://polyhaven.com/a/rusty_metal_02'),
    hp('plastic_rough', 'plastic_worn* (scuffed PP plastic)', 'ambientCG Plastic001', 'Lennart Demes (ambientCG)',
       'CC0 1.0', 'https://ambientcg.com/a/Plastic001'),
    hp('bamboo_woven', 'bamboo_weave* (woven bamboo strips: winnowing trays, baskets)', "Poly Haven 'Bamboo Wall 03'",
       'Amal Kumar', 'CC0 1.0', 'https://polyhaven.com/a/bamboo_wall_03'),
    hp('water_canal_calm', 'water_surface* (ripple normals)', "Flickr photo 'water ripples texture 1 of 3'", 'JunCTionS',
       'CC BY 2.0', 'https://www.flickr.com/photos/17333088@N00/2937691081'),
    hp('brick_exposed_red', 'brick*', 'ambientCG Bricks090', 'Lennart Demes (ambientCG)', 'CC0 1.0',
       'https://ambientcg.com/a/Bricks090'),
    # ---------------------------------------------------------------- stock photos for printed matter (stockprint.py)
    # CC0 via Openverse (Flickr / WordPress Photo Directory) and Wikimedia Commons CC0; 'site' = where it was found
    dict(id='st_buddha_hall', provider='url', asset='Ayutthaya: Phra Mongkhon Bophit Temple Buddha Statue', url='https://live.staticflickr.com/4832/45582796675_0d84da2acf_b.jpg', author='Gary Lee Todd, Ph.D.', licence='CC0 1.0', page='https://www.flickr.com/photos/101561334@N08/45582796675', site='Flickr (via Openverse)', used_by='2D printed: calendar buddha'),
    dict(id='st_buddha_seated', provider='url', asset='Ayutthaya: Phra Mongkhon Bophit Temple Buddha Statue', url='https://live.staticflickr.com/7896/46496112121_634174f3b6_b.jpg', author='Gary Lee Todd, Ph.D.', licence='CC0 1.0', page='https://www.flickr.com/photos/101561334@N08/46496112121', site='Flickr (via Openverse)', used_by='2D printed: amulet_card luangpho'),
    dict(id='st_buddha_gold', provider='url', asset='A golden Buddha statue inside a Chinese Buddhist temple in Lumbini, seated on a ', url='https://pd.w.org/2026/01/519697321799e8ba7.05043182-1152x2048.jpg', author='aveline127', licence='CC0 1.0', page='https://wordpress.org/photos/photo/5196973217/', site='WordPress Photo Directory (via Openverse)', used_by='2D printed: amulet_card phra_somdej, sticker yantra'),
    dict(id='st_temple_river', provider='url', asset='Bell Temple (Wat Rakan). Bangkok.', url='https://live.staticflickr.com/3776/12450068764_cf2607c95f_b.jpg', author='Bernard Spragg', licence='CC0 1.0', page='https://www.flickr.com/photos/88123769@N02/12450068764', site='Flickr (via Openverse)', used_by='2D printed: lottery ticket'),
    dict(id='st_lotus', provider='url', asset='Lotus Flower', url='https://live.staticflickr.com/1578/24206938531_131cd752d4_b.jpg', author='MyStockPhotos', licence='CC0 1.0', page='https://www.flickr.com/photos/136375272@N05/24206938531', site='Flickr (via Openverse)', used_by='2D printed: candle_pack, sticker merit, picture lotus'),
    dict(id='st_marigold', provider='url', asset='A vibrant yellow marigold flower in full bloom, surrounded by green leaves, plac', url='https://pd.w.org/2026/01/657695cba76e1c475.29379324-1823x2048.jpeg', author='Yam B Chhetri', licence='CC0 1.0', page='https://wordpress.org/photos/photo/657695cba7/', site='WordPress Photo Directory (via Openverse)', used_by='2D printed: offering_label spirit, sticker lucky'),
    dict(id='st_chrysanthemum', provider='url', asset='White Chrysanthemum', url='https://live.staticflickr.com/5730/30754214520_99869bd3c0_b.jpg', author='Mustang Joe', licence='CC0 1.0', page='https://www.flickr.com/photos/63234672@N04/30754214520', site='Flickr (via Openverse)', used_by='2D printed: offering_label condolence'),
    dict(id='st_elephant', provider='url', asset='Thai War Elephant', url='https://live.staticflickr.com/4876/31288806287_3e6e685947_b.jpg', author='Gary Lee Todd, Ph.D.', licence='CC0 1.0', page='https://www.flickr.com/photos/101561334@N08/31288806287', site='Flickr (via Openverse)', used_by='2D printed: poster lottery, sticker cartoon'),
    dict(id='st_tomyum', provider='url', asset='Tom yum', url='https://live.staticflickr.com/65535/54047731397_cb65d66316_b.jpg', author='sarahstierch', licence='CC0 1.0', page='https://www.flickr.com/photos/7633518@N08/54047731397', site='Flickr (via Openverse)', used_by='2D printed: noodle_cup tomyum'),
    dict(id='st_pork_noodle', provider='url', asset='Local Thai food Tom Yum Noodles', url='https://pd.w.org/2023/02/1763eefdafb58bd4.86439070-2048x1538.jpg', author='Raju Alam', licence='CC0 1.0', page='https://wordpress.org/photos/photo/1763eefdaf/', site='WordPress Photo Directory (via Openverse)', used_by='2D printed: noodle_cup pork'),
    dict(id='st_noodles', provider='url', asset='Kimchi Beef Udon at Bay Sushi Cafe - Roland in Vancouver 2082', url='https://live.staticflickr.com/44/138568275_f898f57868_b.jpg', author='roland', licence='CC0 1.0', page='https://www.flickr.com/photos/35034347371@N01/138568275', site='Flickr (via Openverse)', used_by='2D printed: noodle_menu'),
    dict(id='st_corn', provider='url', asset='Tuesday Lunch Sweet Corn with Carrots & Cucumber', url='https://live.staticflickr.com/2851/34381075175_7fda262ec9_b.jpg', author='Gary Lee Todd, Ph.D.', licence='CC0 1.0', page='https://www.flickr.com/photos/101561334@N08/34381075175', site='Flickr (via Openverse)', used_by='2D printed: snack_bag corn'),
    dict(id='st_prawn', provider='url', asset='Boneless pork feet, stuffed with shrimps and black sausage', url='https://live.staticflickr.com/759/21103832420_94040e9f7a_b.jpg', author='dkblnt', licence='CC0 1.0', page='https://www.flickr.com/photos/121988714@N05/21103832420', site='Flickr (via Openverse)', used_by='2D printed: snack_bag prawn'),
    dict(id='st_squid', provider='url', asset='Japanese Lunch', url='https://live.staticflickr.com/3269/2898929660_f6e7fb11c9_b.jpg', author='cogdogblog', licence='CC0 1.0', page='https://www.flickr.com/photos/37996646802@N01/2898929660', site='Flickr (via Openverse)', used_by='2D printed: snack_bag squid'),
    dict(id='st_chili', provider='url', asset='Heap of Dried Red Chili Peppers', url='https://live.staticflickr.com/8019/7698343400_966335843b_b.jpg', author='qubodup', licence='CC0 1.0', page='https://www.flickr.com/photos/21051491@N02/7698343400', site='Flickr (via Openverse)', used_by='2D printed: drink_label energy_red'),
    dict(id='st_ginger', provider='url', asset='A close-up of fresh ginger roots with rough brown skin still covered in soil, so', url='https://pd.w.org/2026/03/74569c54222577f72.05087479-1536x2048.jpeg', author='Vishnu Chandra', licence='CC0 1.0', page='https://wordpress.org/photos/photo/74569c5422/', site='WordPress Photo Directory (via Openverse)', used_by='2D printed: poster balm, drink_label energy'),
    dict(id='st_parrot', provider='url', asset='Crisom winged parrot. (Aprosmictus erythropterus),', url='https://live.staticflickr.com/8320/8065423579_44a05a805f_b.jpg', author='Bernard Spragg', licence='CC0 1.0', page='https://www.flickr.com/photos/88123769@N02/8065423579', site='Flickr (via Openverse)', used_by='2D printed: betel_pack'),
    dict(id='st_incense', provider='url', asset='Buddha in background with incense sticks and incense smoke', url='https://pd.w.org/2023/08/55564ea66c6b7a5b8.73261189-1153x2048.jpeg', author='Jose Varghese', licence='CC0 1.0', page='https://wordpress.org/photos/photo/55564ea66c/', site='WordPress Photo Directory (via Openverse)', used_by='2D printed: incense_box'),
    dict(id='st_helmet', provider='url', asset='A black motorcycle helmet rests on a cut tree stump near a river.', url='https://pd.w.org/2025/09/87968da2fd8f3a683.48854620-1152x2048.jpeg', author='Yam B Chhetri', licence='CC0 1.0', page='https://wordpress.org/photos/photo/87968da2fd/', site='WordPress Photo Directory (via Openverse)', used_by='2D printed: poster missing (Boy M)'),
    dict(id='st_old_moto', provider='url', asset='Motorcycle...Vroom...Vroom', url='https://live.staticflickr.com/1876/42712819810_3dd28ef390_b.jpg', author='Crusty Da Klown', licence='CC0 1.0', page='https://www.flickr.com/photos/148598741@N02/42712819810', site='Flickr (via Openverse)', used_by='2D printed: newspaper classifieds, picture motorbike'),
    dict(id='st_house_fog', provider='url', asset='Flexaret 3a - Abandoned House at the Rail', url='https://live.staticflickr.com/3763/12345334633_93dd728048_b.jpg', author='Kojotisko', licence='CC0 1.0', page='https://www.flickr.com/photos/98796230@N03/12345334633', site='Flickr (via Openverse)', used_by='2D printed: poster movie'),
    dict(id='st_mist_road', provider='url', asset='A misty mountainous landscape in Genting Highlands, Malaysia, with lush forests ', url='https://pd.w.org/2025/12/5266935405d3ef870.07970440-1542x2048.jpg', author='Zaved Sadek Chowdhury', licence='CC0 1.0', page='https://wordpress.org/photos/photo/5266935405/', site='WordPress Photo Directory (via Openverse)', used_by='2D printed: poster movie_2, sticker no_stop'),
    dict(id='st_stage', provider='url', asset='Microphone', url='https://live.staticflickr.com/4076/4946114680_d1f08b637f_b.jpg', author='Photo Cindy', licence='CC0 1.0', page='https://www.flickr.com/photos/13631562@N00/4946114680', site='Flickr (via Openverse)', used_by='2D printed: poster concert'),
    dict(id='st_yellow_car', provider='url', asset='Yellow vintage car', url='https://live.staticflickr.com/771/21299606203_0ce9cd0273_b.jpg', author='StockyPics', licence='CC0 1.0', page='https://www.flickr.com/photos/135371437@N04/21299606203', site='Flickr (via Openverse)', used_by='2D printed: picture snapshot, sticker meter'),
    dict(id='st_pipe', provider='url', asset='Tobacco Pipe with Maple Leaves in a River early to mid-1800s', url='https://live.staticflickr.com/65535/53865541232_ea5023b801.jpg', author='museado', licence='CC0 1.0', page='https://www.flickr.com/photos/200781279@N05/53865541232', site='Flickr (via Openverse)', used_by='2D printed: sticker no_smoking'),
    dict(id='st_lanterns', provider='url', asset='Bodhisattva Day, Torma, Incense, Candles, Flowers, ritual Tibetan Buddhist Offer', url='https://live.staticflickr.com/4009/4687243758_48df1468b0_b.jpg', author='Wonderlane', licence='CC0 1.0', page='https://www.flickr.com/photos/71401718@N00/4687243758', site='Flickr (via Openverse)', used_by='2D printed: poster temple_fair'),
    dict(id='st_candles', provider='url', asset='candle flame closeup', url='https://live.staticflickr.com/1477/24857435811_e48ef809a5_b.jpg', author='lisafree54', licence='CC0 1.0', page='https://www.flickr.com/photos/136594255@N06/24857435811', site='Flickr (via Openverse)', used_by='2D printed: cigarette_pack khwanthian'),
    dict(id='st_car_wreck', provider='url', asset='Rainy', url='https://live.staticflickr.com/65535/54005818507_9a73240be2_b.jpg', author='₡ґǘșϯγ Ɗᶏ Ⱪᶅṏⱳդ', licence='CC0 1.0', page='https://www.flickr.com/photos/148598741@N02/54005818507', site='Flickr (via Openverse)', used_by='2D printed: newspaper front'),
    dict(id='st_drink', provider='url', asset='ice tea glass in vietnam trà đá việt nam', url='https://live.staticflickr.com/862/43670804651_9c4395cf63_b.jpg', author='Saigon Time', licence='CC0 1.0', page='https://www.flickr.com/photos/117673294@N04/43670804651', site='Flickr (via Openverse)', used_by='2D printed: poster drink'),
    dict(id='st_strawberry', provider='url', asset='Strawberry spinach, Lower Lovetts Farm', url='https://live.staticflickr.com/462/19815206662_3ab17f86f5_b.jpg', author='karenblakeman', licence='CC0 1.0', page='https://www.flickr.com/photos/11569642@N00/19815206662', site='Flickr (via Openverse)', used_by='2D printed: drink_label soda_red'),
    dict(id='st_lime', provider='url', asset='limes', url='https://live.staticflickr.com/1469/26532651385_f2e3843bd5_b.jpg', author='lisafree54', licence='CC0 1.0', page='https://www.flickr.com/photos/136594255@N06/26532651385', site='Flickr (via Openverse)', used_by='2D printed: drink_label soda_green'),
    dict(id='st_sunset_sky', provider='url', asset='Rockaway Sunset Sky', url='https://live.staticflickr.com/6040/6249263074_2e411529e6_b.jpg', author='romainguy', licence='CC0 1.0', page='https://www.flickr.com/photos/24046097@N00/6249263074', site='Flickr (via Openverse)', used_by='2D printed: cigarette_pack plaifah'),
    dict(id='st_temple_sunset', provider='url', asset='Temple Wat Arun 1.jpg', url='https://commons.wikimedia.org/wiki/File:Temple_Wat_Arun_1.jpg', author='Welcome to Thailand', licence='CC0 1.0', page='https://commons.wikimedia.org/wiki/File:Temple_Wat_Arun_1.jpg', site='Wikimedia Commons', used_by='2D printed: picture temple, joss_paper hell_note'),
    dict(id='st_temple_sukhothai', provider='url', asset='Temple Wat Mahathat de Sukhothai 1.jpg', url='https://commons.wikimedia.org/wiki/File:Temple_Wat_Mahathat_de_Sukhothai_1.jpg', author='Welcome to Thailand', licence='CC0 1.0', page='https://commons.wikimedia.org/wiki/File:Temple_Wat_Mahathat_de_Sukhothai_1.jpg', site='Wikimedia Commons', used_by='2D printed: calendar buddha_2'),
    dict(id='st_rice_field', provider='url', asset='Rice paddy in Thailand.jpg', url='https://commons.wikimedia.org/wiki/File:Rice_paddy_in_Thailand.jpg', author='Eerin25', licence='CC0 1.0', page='https://commons.wikimedia.org/wiki/File:Rice_paddy_in_Thailand.jpg', site='Wikimedia Commons', used_by='2D printed: poster election, sticker drive_slow'),
    dict(id='st_rice_bridge', provider='url', asset='Rice paddy in Thailand (Boon Kho Ku Sui Bridge).jpg', url='https://commons.wikimedia.org/wiki/File:Rice_paddy_in_Thailand_(Boon_Kho_Ku_Sui_Bridge).jpg', author='Eerin25', licence='CC0 1.0', page='https://commons.wikimedia.org/wiki/File:Rice_paddy_in_Thailand_(Boon_Kho_Ku_Sui_Bridge).jpg', site='Wikimedia Commons', used_by='2D printed: newspaper classifieds, picture rice'),
    dict(id='st_waterfall', provider='url', asset='Wang Mai Pak Waterfall.jpg', url='https://commons.wikimedia.org/wiki/File:Wang_Mai_Pak_Waterfall.jpg', author='ประสบโชคชัยลาภขุมทรัพย์วนาลี', licence='CC0 1.0', page='https://commons.wikimedia.org/wiki/File:Wang_Mai_Pak_Waterfall.jpg', site='Wikimedia Commons', used_by='2D printed: picture waterfall'),
]

BY_ID = {s['id']: s for s in SOURCES}
