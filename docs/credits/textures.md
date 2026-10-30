# Texture credits (photobashed library)

Every photographic source used by `tools/photobash/` to build `public/assets/textures/` is listed
below. All of them are **CC0 1.0 / public domain** (no attribution required; credited anyway).
Licence checked on each source page: Poly Haven (https://polyhaven.com/license: CC0 for all
assets), ambientCG (https://docs.ambientcg.com/license/: CC0 for all assets), Wikimedia Commons
files marked CC0 1.0 on their file page.

Rejected / not used: anything NC, ND, BY-SA or with unknown licence; Flickr results (rate limited,
not needed); photos showing brands, logos or identifiable people. All printed matter, packaging,
signage and labels are ORIGINAL fictional designs (no real brands); text is set in Srisakdi
(SIL OFL 1.1, Cadson Demak, bundled via @fontsource/srisakdi). Poster portraits are painted,
generic and not of real people.

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
| Moss002 | ambientCG | Lennart Demes | CC0 1.0 | <https://ambientcg.com/view?id=Moss002> | moss*, concrete_moss*, rock*, bark* |
| Moss003 | ambientCG | Lennart Demes | CC0 1.0 | <https://ambientcg.com/view?id=Moss003> | moss* |
| red_laterite_soil_stones | Poly Haven | Amal Kumar | CC0 1.0 | <https://polyhaven.com/a/red_laterite_soil_stones> | soil* |
| forest_ground_04 | Poly Haven | Rob Tuytel, Rico Cilliers | CC0 1.0 | <https://polyhaven.com/a/forest_ground_04> | soil* |
| rocky_gravel | Poly Haven | Dario Barresi, Dimitrios Savva | CC0 1.0 | <https://polyhaven.com/a/rocky_gravel> | gravel* |
| forest_leaves_04 | Poly Haven | Rob Tuytel | CC0 1.0 | <https://polyhaven.com/a/forest_leaves_04> | leaf_litter* |
| dry_decay_leaves | Poly Haven | Amal Kumar | CC0 1.0 | <https://polyhaven.com/a/dry_decay_leaves> | leaf_litter* |
| mossy_rock | Poly Haven | Rob Tuytel | CC0 1.0 | <https://polyhaven.com/a/mossy_rock> | rock* |
| bark_willow_02 | Poly Haven | Charlotte Baglioni | CC0 1.0 | <https://polyhaven.com/a/bark_willow_02> | bark* |
| chinese_hackberry_bark | Poly Haven | Charlotte Baglioni | CC0 1.0 | <https://polyhaven.com/a/chinese_hackberry_bark> | bark_banyan* |
| weathered_planks | Poly Haven | Dario Barresi, Dimitrios Savva | CC0 1.0 | <https://polyhaven.com/a/weathered_planks> | wood_planks* |
| wood_planks_grey | Poly Haven | Rob Tuytel | CC0 1.0 | <https://polyhaven.com/a/wood_planks_grey> | wood_old* |
| lacquered_cherry_wood | Poly Haven | Jenelle van Heerden, Rico Cilliers | CC0 1.0 | <https://polyhaven.com/a/lacquered_cherry_wood> | red_lacquer* (wood under the lacquer) |
| rust_coarse_01 | Poly Haven | Dimitrios Savva, Rico Cilliers | CC0 1.0 | <https://polyhaven.com/a/rust_coarse_01> | rust* |
| Rust004 | ambientCG | Lennart Demes | CC0 1.0 | <https://ambientcg.com/view?id=Rust004> | rust*, taxi_paint* (sill rust), roof_corrugated* |
| PaintedMetal014 | ambientCG | Lennart Demes | CC0 1.0 | <https://ambientcg.com/view?id=PaintedMetal014> | metal_painted* |
| peeling_painted_wall | Poly Haven | Dimitrios Savva | CC0 1.0 | <https://polyhaven.com/a/peeling_painted_wall> | paint_peel_white*, paint_peel_red*, red_lacquer* (crackle) |
| worn_plaster_wall | Poly Haven | Dimitrios Savva | CC0 1.0 | <https://polyhaven.com/a/worn_plaster_wall> | paint_peel_white* |
| red_plaster_weathered | Poly Haven | Amal Kumar | CC0 1.0 | <https://polyhaven.com/a/red_plaster_weathered> | paint_peel_red* |
| clay_roof_tiles_02 | Poly Haven | Amal Kumar | CC0 1.0 | <https://polyhaven.com/a/clay_roof_tiles_02> | roof_tiles* |
| worn_corrugated_iron | Poly Haven | Jenelle van Heerden, Dimitrios Savva | CC0 1.0 | <https://polyhaven.com/a/worn_corrugated_iron> | roof_corrugated* |
| rusty_corrugated_iron | Poly Haven | Charlotte Baglioni | CC0 1.0 | <https://polyhaven.com/a/rusty_corrugated_iron> | roof_corrugated* (rust bleed) |
| Foil002 | ambientCG | Lennart Demes | CC0 1.0 | <https://ambientcg.com/view?id=Foil002> | gold_leaf* |
| Scratches001 | ambientCG | Lennart Demes | CC0 1.0 | <https://ambientcg.com/view?id=Scratches001> | taxi_paint*, dash_plastic* |
| Scratches004 | ambientCG | Lennart Demes | CC0 1.0 | <https://ambientcg.com/view?id=Scratches004> | taxi_paint* |
| SurfaceImperfections006 | ambientCG | Lennart Demes | CC0 1.0 | <https://ambientcg.com/view?id=SurfaceImperfections006> | taxi_paint* (water spots) |
| Leaking004 | ambientCG | Lennart Demes | CC0 1.0 | <https://ambientcg.com/view?id=Leaking004> | taxi_paint*, concrete* (water streaks) |
| Leaking006 | ambientCG | Lennart Demes | CC0 1.0 | <https://ambientcg.com/view?id=Leaking006> | paint_peel_*, metal_painted* (water streaks) |
| Plastic012A | ambientCG | Lennart Demes | CC0 1.0 | <https://ambientcg.com/view?id=Plastic012A> | dash_plastic* |
| brown_leather | Poly Haven | Rob Tuytel | CC0 1.0 | <https://polyhaven.com/a/brown_leather> | leather_seat* |
| Fabric012 | ambientCG | Lennart Demes | CC0 1.0 | <https://ambientcg.com/view?id=Fabric012> | fabric_seat* |
| Fabric062 | ambientCG | Lennart Demes | CC0 1.0 | <https://ambientcg.com/view?id=Fabric062> | headliner* |
| dirty_carpet | Poly Haven | Rohit Seervi | CC0 1.0 | <https://polyhaven.com/a/dirty_carpet> | carpet* |
| Fabric061 | ambientCG | Lennart Demes | CC0 1.0 | <https://ambientcg.com/view?id=Fabric061> | fabric_cotton*, fabric_sarong* |
| crepe_satin | Poly Haven | colormass, Rico Cilliers | CC0 1.0 | <https://polyhaven.com/a/crepe_satin> | fabric_silk*, cloth_red/yellow/green |
| denim_fabric | Poly Haven | Rob Tuytel | CC0 1.0 | <https://polyhaven.com/a/denim_fabric> | fabric_denim* |
| rough_linen | Poly Haven | colormass, Rico Cilliers | CC0 1.0 | <https://polyhaven.com/a/rough_linen> | monk_robe* |
| Paper001 | ambientCG | Lennart Demes | CC0 1.0 | <https://ambientcg.com/view?id=Paper001> | 2D printed matter (white paper) |
| Paper002 | ambientCG | Lennart Demes | CC0 1.0 | <https://ambientcg.com/view?id=Paper002> | 2D printed matter (cream paper) |
| Paper003 | ambientCG | Lennart Demes | CC0 1.0 | <https://ambientcg.com/view?id=Paper003> | 2D printed matter (crumpled paper) |
| Paper005 | ambientCG | Lennart Demes | CC0 1.0 | <https://ambientcg.com/view?id=Paper005> | lantern_paper*, 2D printed matter (crinkled kraft) |
| Cardboard001 | ambientCG | Lennart Demes | CC0 1.0 | <https://ambientcg.com/view?id=Cardboard001> | 2D packaging (cardboard) |
| Cardboard003 | ambientCG | Lennart Demes | CC0 1.0 | <https://ambientcg.com/view?id=Cardboard003> | 2D packaging (corrugated board) |
| Tape004 | ambientCG | Lennart Demes | CC0 1.0 | <https://ambientcg.com/view?id=Tape004> | 2D posters (packing tape) |
| Leaking012A | ambientCG | Lennart Demes | CC0 1.0 | <https://ambientcg.com/view?id=Leaking012A> | 2D water damage, blood_drip* |
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
