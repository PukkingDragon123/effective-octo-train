# Texture credits (photobashed library)

Every photographic source used by `tools/photobash/` to build `public/assets/textures/` is listed
below. Almost all of them are **CC0 1.0 / public domain** (no attribution required; credited anyway).
Licence checked on each source page: Poly Haven (https://polyhaven.com/license: CC0 for all
assets), ambientCG (https://docs.ambientcg.com/license/: CC0 for all assets), Wikimedia Commons
files marked CC0 1.0 on their file page.

**Borrowed from the owner's other game เฮียผัด** (provider "เฮียผัด (owner)"): processed PBR sets from
its `public/assets/textures/pbr/` folder. Only sets whose rows in its `CREDITS.md` are CC0, Public
Domain Mark or CC BY were taken (its unverified web photos were not). The original photo / scan each
set was made from is named in the asset column. **CC BY 2.0 rows require this attribution** (keep it
in the shipped credits): "Texture - Galvanized metal" by Andrew Beeston and "water ripples texture 1
of 3" by JunCTionS, both on Flickr, licensed CC BY 2.0 (https://creativecommons.org/licenses/by/2.0/),
modified (tiled, recoloured, combined with other scans).

**Stock photos for printed matter** (`st_*` rows): the picture on every poster, calendar, wall
picture, product label / pack, newspaper, lottery ticket, offering label and sticker is a real
photograph found through Openverse (https://openverse.org) with the CC0 filter, from Flickr (CC0
1.0 "public domain dedication" on the Flickr photo page), the WordPress Photo Directory (CC0 1.0 for
every photo), the Metropolitan Museum Open Access (CC0 1.0), or Wikimedia Commons (CC0 1.0 on the
file page; the same files as docs/credits/screens.md). No Unsplash, Pexels or Pixabay imports. No
royal images, brands, logos or portraits of real people (the missing-person poster shows a helmet).
Each photo is cover-cropped, lightly graded and printed by `tools/photobash/stockprint.py`.

Rejected / not used: anything NC, ND, BY-SA or with unknown licence; Flickr results other than the
CC0 photos listed here and the two CC BY photos named above; photos showing brands, logos or identifiable people.
Brand names on packs are fictional; text is set in Srisakdi (SIL OFL 1.1, Cadson Demak, bundled via
@fontsource/srisakdi).

Rebuild: `python3 -I tools/photobash/fetch.py --raw <dir>` then
`python3 -I tools/photobash/build.py --raw <dir>` (see docs/ARCHITECTURE.md, textures).
`*` in "used by" = the key and its `_normal` / `_rough` / `_height` companions.

| asset | provider | author(s) | licence | source page | used by |
|---|---|---|---|---|---|
| asphalt_02 | Poly Haven | Rob Tuytel | CC0 1.0 | <https://polyhaven.com/a/asphalt_02> | asphalt* |
| asphalt_track | Poly Haven | Dimitrios Savva | CC0 1.0 | <https://polyhaven.com/a/asphalt_track> | asphalt* (tar patches) |
| AsphaltDamageSet001 | ambientCG | Lennart Demes | CC0 1.0 | <https://ambientcg.com/view?id=AsphaltDamageSet001> | asphalt* (cracks, potholes) |
| dirty_concrete | Poly Haven | Rob Tuytel | CC0 1.0 | <https://polyhaven.com/a/dirty_concrete> | concrete* |
| concrete_moss | Poly Haven | Rob Tuytel | CC0 1.0 | <https://polyhaven.com/a/concrete_moss> | concrete_moss* |
| worn_mossy_plasterwall | Poly Haven | Amal Kumar | CC0 1.0 | <https://polyhaven.com/a/worn_mossy_plasterwall> | concrete_moss* |
| Moss002 | ambientCG | Lennart Demes | CC0 1.0 | <https://ambientcg.com/view?id=Moss002> | moss*, concrete_moss*, rock*, bark*, brick* (moss in the joints) |
| Moss003 | ambientCG | Lennart Demes | CC0 1.0 | <https://ambientcg.com/view?id=Moss003> | moss* |
| red_laterite_soil_stones | Poly Haven | Amal Kumar | CC0 1.0 | <https://polyhaven.com/a/red_laterite_soil_stones> | soil* |
| forest_ground_04 | Poly Haven | Rob Tuytel, Rico Cilliers | CC0 1.0 | <https://polyhaven.com/a/forest_ground_04> | soil* |
| rocky_gravel | Poly Haven | Dario Barresi, Dimitrios Savva | CC0 1.0 | <https://polyhaven.com/a/rocky_gravel> | gravel* |
| forest_leaves_04 | Poly Haven | Rob Tuytel | CC0 1.0 | <https://polyhaven.com/a/forest_leaves_04> | leaf_litter*, water_surface* (floating leaves) |
| dry_decay_leaves | Poly Haven | Amal Kumar | CC0 1.0 | <https://polyhaven.com/a/dry_decay_leaves> | leaf_litter*, water_surface* (floating leaves) |
| mossy_rock | Poly Haven | Rob Tuytel | CC0 1.0 | <https://polyhaven.com/a/mossy_rock> | rock*, creature_hide (wrinkles) |
| bark_willow_02 | Poly Haven | Charlotte Baglioni | CC0 1.0 | <https://polyhaven.com/a/bark_willow_02> | bark* |
| chinese_hackberry_bark | Poly Haven | Charlotte Baglioni | CC0 1.0 | <https://polyhaven.com/a/chinese_hackberry_bark> | bark_banyan* |
| weathered_planks | Poly Haven | Dario Barresi, Dimitrios Savva | CC0 1.0 | <https://polyhaven.com/a/weathered_planks> | wood_planks* |
| wood_planks_grey | Poly Haven | Rob Tuytel | CC0 1.0 | <https://polyhaven.com/a/wood_planks_grey> | wood_old* |
| lacquered_cherry_wood | Poly Haven | Jenelle van Heerden, Rico Cilliers | CC0 1.0 | <https://polyhaven.com/a/lacquered_cherry_wood> | red_lacquer* (wood under the lacquer) |
| rust_coarse_01 | Poly Haven | Dimitrios Savva, Rico Cilliers | CC0 1.0 | <https://polyhaven.com/a/rust_coarse_01> | rust* |
| Rust004 | ambientCG | Lennart Demes | CC0 1.0 | <https://ambientcg.com/view?id=Rust004> | rust*, taxi_paint* (sill rust), roof_corrugated* |
| PaintedMetal014 | ambientCG | Lennart Demes | CC0 1.0 | <https://ambientcg.com/view?id=PaintedMetal014> | metal_painted* |
| peeling_painted_wall | Poly Haven | Dimitrios Savva | CC0 1.0 | <https://polyhaven.com/a/peeling_painted_wall> | paint_peel_white*, paint_peel_red*, red_lacquer* (crackle), ceramic* (crazing) |
| worn_plaster_wall | Poly Haven | Dimitrios Savva | CC0 1.0 | <https://polyhaven.com/a/worn_plaster_wall> | paint_peel_white* |
| red_plaster_weathered | Poly Haven | Amal Kumar | CC0 1.0 | <https://polyhaven.com/a/red_plaster_weathered> | paint_peel_red* |
| clay_roof_tiles_02 | Poly Haven | Amal Kumar | CC0 1.0 | <https://polyhaven.com/a/clay_roof_tiles_02> | roof_tiles* |
| worn_corrugated_iron | Poly Haven | Jenelle van Heerden, Dimitrios Savva | CC0 1.0 | <https://polyhaven.com/a/worn_corrugated_iron> | roof_corrugated* |
| rusty_corrugated_iron | Poly Haven | Charlotte Baglioni | CC0 1.0 | <https://polyhaven.com/a/rusty_corrugated_iron> | roof_corrugated* (rust bleed) |
| Foil002 | ambientCG | Lennart Demes | CC0 1.0 | <https://ambientcg.com/view?id=Foil002> | gold_leaf* |
| Scratches001 | ambientCG | Lennart Demes | CC0 1.0 | <https://ambientcg.com/view?id=Scratches001> | taxi_paint*, dash_plastic*, plastic_worn* |
| Scratches004 | ambientCG | Lennart Demes | CC0 1.0 | <https://ambientcg.com/view?id=Scratches004> | taxi_paint*, plastic_worn*, rubber_worn*, ceramic* |
| SurfaceImperfections006 | ambientCG | Lennart Demes | CC0 1.0 | <https://ambientcg.com/view?id=SurfaceImperfections006> | taxi_paint* (water spots) |
| Leaking004 | ambientCG | Lennart Demes | CC0 1.0 | <https://ambientcg.com/view?id=Leaking004> | taxi_paint*, concrete* (water streaks), brick* (streaks) |
| Leaking006 | ambientCG | Lennart Demes | CC0 1.0 | <https://ambientcg.com/view?id=Leaking006> | paint_peel_*, metal_painted* (water streaks), galv*, stem_fibre* (streaks) |
| Plastic012A | ambientCG | Lennart Demes | CC0 1.0 | <https://ambientcg.com/view?id=Plastic012A> | dash_plastic* |
| brown_leather | Poly Haven | Rob Tuytel | CC0 1.0 | <https://polyhaven.com/a/brown_leather> | leather_seat*, creature_hide (grain) |
| Fabric012 | ambientCG | Lennart Demes | CC0 1.0 | <https://ambientcg.com/view?id=Fabric012> | fabric_seat* |
| Fabric062 | ambientCG | Lennart Demes | CC0 1.0 | <https://ambientcg.com/view?id=Fabric062> | headliner* |
| dirty_carpet | Poly Haven | Rohit Seervi | CC0 1.0 | <https://polyhaven.com/a/dirty_carpet> | carpet* |
| Fabric061 | ambientCG | Lennart Demes | CC0 1.0 | <https://ambientcg.com/view?id=Fabric061> | fabric_cotton*, fabric_sarong* |
| crepe_satin | Poly Haven | colormass, Rico Cilliers | CC0 1.0 | <https://polyhaven.com/a/crepe_satin> | fabric_silk*, cloth_red/yellow/green |
| denim_fabric | Poly Haven | Rob Tuytel | CC0 1.0 | <https://polyhaven.com/a/denim_fabric> | fabric_denim* |
| rough_linen | Poly Haven | colormass, Rico Cilliers | CC0 1.0 | <https://polyhaven.com/a/rough_linen> | monk_robe* |
| Paper001 | ambientCG | Lennart Demes | CC0 1.0 | <https://ambientcg.com/view?id=Paper001> | 2D printed matter (white paper) |
| Paper002 | ambientCG | Lennart Demes | CC0 1.0 | <https://ambientcg.com/view?id=Paper002> | 2D printed matter (cream paper) |
| Paper003 | ambientCG | Lennart Demes | CC0 1.0 | <https://ambientcg.com/view?id=Paper003> | 2D printed matter (crumpled paper), paper_worn* |
| Paper005 | ambientCG | Lennart Demes | CC0 1.0 | <https://ambientcg.com/view?id=Paper005> | lantern_paper*, 2D printed matter (crinkled kraft) |
| Cardboard001 | ambientCG | Lennart Demes | CC0 1.0 | <https://ambientcg.com/view?id=Cardboard001> | 2D packaging (cardboard), paper_worn* |
| Cardboard003 | ambientCG | Lennart Demes | CC0 1.0 | <https://ambientcg.com/view?id=Cardboard003> | 2D packaging (corrugated board) |
| Tape004 | ambientCG | Lennart Demes | CC0 1.0 | <https://ambientcg.com/view?id=Tape004> | 2D posters (packing tape) |
| Leaking012A | ambientCG | Lennart Demes | CC0 1.0 | <https://ambientcg.com/view?id=Leaking012A> | 2D water damage, blood_drip*, paper_worn* (tide-lines) |
| Leaking017A | ambientCG | Lennart Demes | CC0 1.0 | <https://ambientcg.com/view?id=Leaking017A> | blood_drip*, 2D water damage |
| Smear002 | ambientCG | Lennart Demes | CC0 1.0 | <https://ambientcg.com/view?id=Smear002> | blood_smear* |
| Smear005 | ambientCG | Lennart Demes | CC0 1.0 | <https://ambientcg.com/view?id=Smear005> | blood_smear* |
| Fingerprints004 | ambientCG | Lennart Demes | CC0 1.0 | <https://ambientcg.com/view?id=Fingerprints004> | blood_handprint* |
| LeafSet024 | ambientCG | Lennart Demes | CC0 1.0 | <https://ambientcg.com/view?id=LeafSet024> | foliage atlases (small ovate leaves, reference 6) |
| LeafSet022 | ambientCG | Lennart Demes | CC0 1.0 | <https://ambientcg.com/view?id=LeafSet022> | foliage atlases (elongated leaves) |
| LeafSet023 | ambientCG | Lennart Demes | CC0 1.0 | <https://ambientcg.com/view?id=LeafSet023> | foliage atlases (pointed leaves) |
| LeafSet018 | ambientCG | Lennart Demes | CC0 1.0 | <https://ambientcg.com/view?id=LeafSet018> | foliage atlases (broad leaves) |
| LeafSet013 | ambientCG | Lennart Demes | CC0 1.0 | <https://ambientcg.com/view?id=LeafSet013> | foliage atlases (lanceolate leaflets) |
| LeafSet004 | ambientCG | Lennart Demes | CC0 1.0 | <https://ambientcg.com/view?id=LeafSet004> | foliage atlases (heart leaves, vines) |
| LeafSet017 | ambientCG | Lennart Demes | CC0 1.0 | <https://ambientcg.com/view?id=LeafSet017> | vine atlas (ivy) |
| LeafSet030 | ambientCG | Lennart Demes | CC0 1.0 | <https://ambientcg.com/view?id=LeafSet030> | dead leaves (foliage_world dead-twig slot) |
| LeafSet012 | ambientCG | Lennart Demes | CC0 1.0 | <https://ambientcg.com/view?id=LeafSet012> | dead leaves (foliage_world dead-twig slot) |
| Foliage001 | ambientCG | Lennart Demes | CC0 1.0 | <https://ambientcg.com/view?id=Foliage001> | grass_card* (blades) |
| Foliage002 | ambientCG | Lennart Demes | CC0 1.0 | <https://ambientcg.com/view?id=Foliage002> | grass_card* (seed heads) |
| Foliage006 | ambientCG | Lennart Demes | CC0 1.0 | <https://ambientcg.com/view?id=Foliage006> | grass_card* (strands) |
| StickSet001 | ambientCG | Lennart Demes | CC0 1.0 | <https://ambientcg.com/view?id=StickSet001> | foliage atlases (twigs) |
| anthurium_botany_01 | Poly Haven | Rob Tuytel, Rico Cilliers | CC0 1.0 | <https://polyhaven.com/a/anthurium_botany_01> | leaf_tropical*, foliage_world (broad tropical leaves) |
| fern_02 | Poly Haven | Rob Tuytel, Rico Cilliers | CC0 1.0 | <https://polyhaven.com/a/fern_02> | leaf_fern*, foliage_world fern / epiphyte |
| jacaranda_tree | Poly Haven | Rob Tuytel, Rico Cilliers | CC0 1.0 | <https://polyhaven.com/a/jacaranda_tree> | foliage_world rain-tree slot (bipinnate leaves) |
| island_tree_02 | Poly Haven | Rob Tuytel, Rico Cilliers | CC0 1.0 | <https://polyhaven.com/a/island_tree_02> | leaf_tropical*, foliage clusters |
| potted_plant_02 | Poly Haven | Rico Cilliers | CC0 1.0 | <https://polyhaven.com/a/potted_plant_02> | foliage_world elephant-ear slot, leaf_tropical heart |
| shrub_02 | Poly Haven | Rico Cilliers | CC0 1.0 | <https://polyhaven.com/a/shrub_02> | leaf_bamboo* (narrow leaves) |
| shrub_04 | Poly Haven | Rico Cilliers | CC0 1.0 | <https://polyhaven.com/a/shrub_04> | foliage clusters (small leaves) |
| dry_branches_medium_01 | Poly Haven | Rico Cilliers | CC0 1.0 | <https://polyhaven.com/a/dry_branches_medium_01> | twig bark in foliage atlases |
| FlowerSet001 | ambientCG | Lennart Demes | CC0 1.0 | <https://ambientcg.com/view?id=FlowerSet001> | flower_atlas (white daisy heads: chrysanthemum, jasmine petal texture, centres) |
| flower_gazania | Poly Haven | James Ray Cock, Jenelle van Heerden | CC0 1.0 | <https://polyhaven.com/a/flower_gazania> | flower_atlas (petal scans: chrysanthemum, rose, lotus, jasmine petals) |
| flower_ursinia | Poly Haven | Jenelle van Heerden, Rico Cilliers | CC0 1.0 | <https://polyhaven.com/a/flower_ursinia> | flower_atlas (petal scans, daisy heads) |
| flower_stinkkruid | Poly Haven | Jenelle van Heerden, Rico Cilliers | CC0 1.0 | <https://polyhaven.com/a/flower_stinkkruid> | flower_atlas (pompom heads: marigold; green buds) |
| periwinkle_plant | Poly Haven | Amal Kumar | CC0 1.0 | <https://polyhaven.com/a/periwinkle_plant> | flower_atlas (5-petal flowers: frangipani, crown flower, orchid; filler leaves) |
| rainforest_trail | Poly Haven | Dimitrios Savva, Jarod Guest | CC0 1.0 | <https://polyhaven.com/a/rainforest_trail> | 2D posters (forest backdrop) |
| narrow_moonlit_road | Poly Haven | Greg Zaal | CC0 1.0 | <https://polyhaven.com/a/narrow_moonlit_road> | 2D posters (night road backdrop) |
| Banana_plant_garden.jpg | Wikimedia Commons | Sankuba Damasus Erasong | CC0 1.0 | <https://commons.wikimedia.org/w/index.php?curid=170745660> | leaf_banana*, foliage_world banana / bananaDead slots (lamina photo; dried leaves on the pseudostem) |
| SurfaceImperfections010 | ambientCG | Lennart Demes | CC0 1.0 | <https://ambientcg.com/view?id=SurfaceImperfections010> | ceramic* (glaze runs), blood_drip* (runs), 2D water streaks |
| Rubber004 | ambientCG | Lennart Demes | CC0 1.0 | <https://ambientcg.com/view?id=Rubber004> | rubber_worn* (tyres, hoses, cables, black plastic) |
| Bamboo001A | ambientCG | Lennart Demes | CC0 1.0 | <https://ambientcg.com/view?id=Bamboo001A> | bamboo_culm*, stem_fibre* (longitudinal fibres) |
| pbr/galvanized_steel (from Flickr photo 'Texture - Galvanized metal') | เฮียผัด (owner) | Andrew Beeston | CC BY 2.0 | <https://www.flickr.com/photos/94018078@N00/6846270808> | galv* (zinc spangle) |
| pbr/aluminium_scratched (from Flickr photo 'Galvanized sheet') | เฮียผัด (owner) | walmarc04 | Public Domain Mark 1.0 | <https://www.flickr.com/photos/30924550@N04/35399953944> | galv* (white-rust mottling) |
| pbr/steel_rusty (from Poly Haven 'Rusty Metal 02') | เฮียผัด (owner) | Rob Tuytel | CC0 1.0 | <https://polyhaven.com/a/rusty_metal_02> | galv* (rust spots, bleed) |
| pbr/plastic_rough (from ambientCG Plastic001) | เฮียผัด (owner) | Lennart Demes (ambientCG) | CC0 1.0 | <https://ambientcg.com/a/Plastic001> | plastic_worn* (scuffed PP plastic) |
| pbr/bamboo_woven (from Poly Haven 'Bamboo Wall 03') | เฮียผัด (owner) | Amal Kumar | CC0 1.0 | <https://polyhaven.com/a/bamboo_wall_03> | bamboo_weave* (woven bamboo strips: winnowing trays, baskets) |
| pbr/water_canal_calm (from Flickr photo 'water ripples texture 1 of 3') | เฮียผัด (owner) | JunCTionS | CC BY 2.0 | <https://www.flickr.com/photos/17333088@N00/2937691081> | water_surface* (ripple normals) |
| pbr/brick_exposed_red (from ambientCG Bricks090) | เฮียผัด (owner) | Lennart Demes (ambientCG) | CC0 1.0 | <https://ambientcg.com/a/Bricks090> | brick* |
| Ayutthaya: Phra Mongkhon Bophit Temple Buddha Statue | Flickr (via Openverse) | Gary Lee Todd, Ph.D. | CC0 1.0 | <https://www.flickr.com/photos/101561334@N08/45582796675> | 2D printed: calendar buddha |
| Ayutthaya: Phra Mongkhon Bophit Temple Buddha Statue | Flickr (via Openverse) | Gary Lee Todd, Ph.D. | CC0 1.0 | <https://www.flickr.com/photos/101561334@N08/46496112121> | 2D printed: amulet_card luangpho |
| A golden Buddha statue inside a Chinese Buddhist temple in Lumbini, seated on a  | WordPress Photo Directory (via Openverse) | aveline127 | CC0 1.0 | <https://wordpress.org/photos/photo/5196973217/> | 2D printed: amulet_card phra_somdej, sticker yantra |
| Bell Temple (Wat Rakan). Bangkok. | Flickr (via Openverse) | Bernard Spragg | CC0 1.0 | <https://www.flickr.com/photos/88123769@N02/12450068764> | 2D printed: lottery ticket |
| Lotus Flower | Flickr (via Openverse) | MyStockPhotos | CC0 1.0 | <https://www.flickr.com/photos/136375272@N05/24206938531> | 2D printed: candle_pack, sticker merit, picture lotus |
| A vibrant yellow marigold flower in full bloom, surrounded by green leaves, plac | WordPress Photo Directory (via Openverse) | Yam B Chhetri | CC0 1.0 | <https://wordpress.org/photos/photo/657695cba7/> | 2D printed: offering_label spirit, sticker lucky |
| White Chrysanthemum | Flickr (via Openverse) | Mustang Joe | CC0 1.0 | <https://www.flickr.com/photos/63234672@N04/30754214520> | 2D printed: offering_label condolence |
| Thai War Elephant | Flickr (via Openverse) | Gary Lee Todd, Ph.D. | CC0 1.0 | <https://www.flickr.com/photos/101561334@N08/31288806287> | 2D printed: poster lottery, sticker cartoon |
| Tom yum | Flickr (via Openverse) | sarahstierch | CC0 1.0 | <https://www.flickr.com/photos/7633518@N08/54047731397> | 2D printed: noodle_cup tomyum |
| Local Thai food Tom Yum Noodles | WordPress Photo Directory (via Openverse) | Raju Alam | CC0 1.0 | <https://wordpress.org/photos/photo/1763eefdaf/> | 2D printed: noodle_cup pork |
| Kimchi Beef Udon at Bay Sushi Cafe - Roland in Vancouver 2082 | Flickr (via Openverse) | roland | CC0 1.0 | <https://www.flickr.com/photos/35034347371@N01/138568275> | 2D printed: noodle_menu |
| Tuesday Lunch Sweet Corn with Carrots & Cucumber | Flickr (via Openverse) | Gary Lee Todd, Ph.D. | CC0 1.0 | <https://www.flickr.com/photos/101561334@N08/34381075175> | 2D printed: snack_bag corn |
| Boneless pork feet, stuffed with shrimps and black sausage | Flickr (via Openverse) | dkblnt | CC0 1.0 | <https://www.flickr.com/photos/121988714@N05/21103832420> | 2D printed: snack_bag prawn |
| Japanese Lunch | Flickr (via Openverse) | cogdogblog | CC0 1.0 | <https://www.flickr.com/photos/37996646802@N01/2898929660> | 2D printed: snack_bag squid |
| Heap of Dried Red Chili Peppers | Flickr (via Openverse) | qubodup | CC0 1.0 | <https://www.flickr.com/photos/21051491@N02/7698343400> | 2D printed: drink_label energy_red |
| A close-up of fresh ginger roots with rough brown skin still covered in soil, so | WordPress Photo Directory (via Openverse) | Vishnu Chandra | CC0 1.0 | <https://wordpress.org/photos/photo/74569c5422/> | 2D printed: poster balm, drink_label energy |
| Crisom winged parrot. (Aprosmictus erythropterus), | Flickr (via Openverse) | Bernard Spragg | CC0 1.0 | <https://www.flickr.com/photos/88123769@N02/8065423579> | 2D printed: betel_pack |
| Buddha in background with incense sticks and incense smoke | WordPress Photo Directory (via Openverse) | Jose Varghese | CC0 1.0 | <https://wordpress.org/photos/photo/55564ea66c/> | 2D printed: incense_box |
| A black motorcycle helmet rests on a cut tree stump near a river. | WordPress Photo Directory (via Openverse) | Yam B Chhetri | CC0 1.0 | <https://wordpress.org/photos/photo/87968da2fd/> | 2D printed: poster missing (Boy M) |
| Motorcycle...Vroom...Vroom | Flickr (via Openverse) | Crusty Da Klown | CC0 1.0 | <https://www.flickr.com/photos/148598741@N02/42712819810> | 2D printed: newspaper classifieds, picture motorbike |
| Flexaret 3a - Abandoned House at the Rail | Flickr (via Openverse) | Kojotisko | CC0 1.0 | <https://www.flickr.com/photos/98796230@N03/12345334633> | 2D printed: poster movie |
| A misty mountainous landscape in Genting Highlands, Malaysia, with lush forests  | WordPress Photo Directory (via Openverse) | Zaved Sadek Chowdhury | CC0 1.0 | <https://wordpress.org/photos/photo/5266935405/> | 2D printed: poster movie_2, sticker no_stop |
| Yellow vintage car | Flickr (via Openverse) | StockyPics | CC0 1.0 | <https://www.flickr.com/photos/135371437@N04/21299606203> | 2D printed: picture snapshot, sticker meter |
| Tobacco Pipe with Maple Leaves in a River early to mid-1800s | Flickr (via Openverse) | museado | CC0 1.0 | <https://www.flickr.com/photos/200781279@N05/53865541232> | 2D printed: sticker no_smoking |
| Bodhisattva Day, Torma, Incense, Candles, Flowers, ritual Tibetan Buddhist Offer | Flickr (via Openverse) | Wonderlane | CC0 1.0 | <https://www.flickr.com/photos/71401718@N00/4687243758> | 2D printed: poster temple_fair |
| candle flame closeup | Flickr (via Openverse) | lisafree54 | CC0 1.0 | <https://www.flickr.com/photos/136594255@N06/24857435811> | 2D printed: cigarette_pack khwanthian |
| Rainy | Flickr (via Openverse) | ₡ґǘșϯγ Ɗᶏ Ⱪᶅṏⱳդ | CC0 1.0 | <https://www.flickr.com/photos/148598741@N02/54005818507> | 2D printed: newspaper front |
| ice tea glass in vietnam trà đá việt nam | Flickr (via Openverse) | Saigon Time | CC0 1.0 | <https://www.flickr.com/photos/117673294@N04/43670804651> | 2D printed: poster drink |
| Strawberry spinach, Lower Lovetts Farm | Flickr (via Openverse) | karenblakeman | CC0 1.0 | <https://www.flickr.com/photos/11569642@N00/19815206662> | 2D printed: drink_label soda_red |
| limes | Flickr (via Openverse) | lisafree54 | CC0 1.0 | <https://www.flickr.com/photos/136594255@N06/26532651385> | 2D printed: drink_label soda_green |
| Rockaway Sunset Sky | Flickr (via Openverse) | romainguy | CC0 1.0 | <https://www.flickr.com/photos/24046097@N00/6249263074> | 2D printed: cigarette_pack plaifah, poster concert |
| Temple Wat Arun 1.jpg | Wikimedia Commons | Welcome to Thailand | CC0 1.0 | <https://commons.wikimedia.org/wiki/File:Temple_Wat_Arun_1.jpg> | 2D printed: picture temple, joss_paper hell_note |
| Temple Wat Mahathat de Sukhothai 1.jpg | Wikimedia Commons | Welcome to Thailand | CC0 1.0 | <https://commons.wikimedia.org/wiki/File:Temple_Wat_Mahathat_de_Sukhothai_1.jpg> | 2D printed: calendar buddha_2 |
| Rice paddy in Thailand.jpg | Wikimedia Commons | Eerin25 | CC0 1.0 | <https://commons.wikimedia.org/wiki/File:Rice_paddy_in_Thailand.jpg> | 2D printed: poster election, sticker drive_slow |
| Rice paddy in Thailand (Boon Kho Ku Sui Bridge).jpg | Wikimedia Commons | Eerin25 | CC0 1.0 | <https://commons.wikimedia.org/wiki/File:Rice_paddy_in_Thailand_(Boon_Kho_Ku_Sui_Bridge).jpg> | 2D printed: newspaper classifieds, picture rice |
| Wang Mai Pak Waterfall.jpg | Wikimedia Commons | ประสบโชคชัยลาภขุมทรัพย์วนาลี | CC0 1.0 | <https://commons.wikimedia.org/wiki/File:Wang_Mai_Pak_Waterfall.jpg> | 2D printed: picture waterfall |
