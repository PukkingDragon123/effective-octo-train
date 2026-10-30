# DON'T LOOK BACK IN HORROR (Pukking Dragon)

A Thai supernatural first-person taxi horror game for the browser (Three.js 0.170 + Vite,
WebGL2). Most content (textures, world, props, animation layers, music, fallback sounds)
is **generated procedurally in code**. Some assets are reused or downloaded with verified
licences (CC0, CC BY) and credited in `docs/credits/`: the Quaternius character meshes and
animations (CC0, reused from the owner's game เฮียผัด), CC0 Poly Haven props, and licensed
sound recordings in `public/assets/audio/`. Bundled OFL fonts come from `@fontsource/*`.
Never ship assets with unknown, NC or ND licences.

Read first: `docs/GAME_DESIGN.md` (story, rules, passengers, art and audio direction)
and `docs/ARCHITECTURE.md` (module contracts, conventions, layers, events, budgets).
World placement truth: `src/world/layout.js`.

## Rules for contributors (humans and agents)
- Each `src/<module>/index.js` is that module's **public contract**. Keep exported
  names and signatures; add exports freely; put internals in other files in the same dir.
- Only edit files in the directory you own (see the ARCHITECTURE ownership table) plus
  your own `src/sandbox/<module>*.js` test scenes. Don't touch `src/core/` or other
  modules. If you need something missing, write a local helper and report it.
- Do **not** `git commit` or push. The orchestrator commits.
- Units metres, Y-up, local forward = −Z. Thailand drives on the **left**; the taxi is
  **right-hand drive** (driver at local +X).
- Use `paintedMaterial` / `foliageMaterial` / `skinMaterial` from `src/render` for meshes.
- Deterministic content: `makeRng(seed)` and `noise` from `src/core/math.js`.
- Bilingual text `{ th, en }`; Thai must be natural and correct.
- Art target: **painterly semi-realistic**, hand-painted texture feel, restrained natural
  colours, rough worn materials, volumetric fog. Not photoreal, not cartoon, not
  low-poly or plastic.
- **Never use lazy model shapes** (owner's hard rule): no primitive mash-ups of boxes,
  cylinders and spheres. Model real forms: traced profiles, lathes, extrusions of real
  cross-sections, swept curves, bevels/chamfers, tapered irregular hand-made shapes,
  enough segments where the eye lands. Hero assets (taxi, motorbike) are modelled in
  headless Blender (`tools/blender/`) and loaded as GLB.
- **Super sharp, detailed, handmade, polished**: no blur-based looks (see GAME_DESIGN §9).
- No real-world brands, logos, or copyrighted designs; make original fictional Thai-style ones.
- Test visually: `node tools/shot.mjs --sandbox=<name> --out=.shots/<name>.png` then
  Read the PNG. Fix every console error it prints. `.shots/` is gitignored.
- Reference images supplied with the brief (view them with Read):
  `/tmp/claude-0/-home-user-effective-octo-train/a0910a86-1464-533c-bd6b-3f5c3909f33b/scratchpad/refs/1.jpg … 6.jpg`
  (1 mossy Thai pavilion/well by day; 2 golden shrine in night mist seen from a car;
  3 night forest drive, masked passenger in the rearview mirror; 4 woman in white by a
  delineator-lit guardrail; 5 cluttered lived-in Thai room, a mood reference for Ah Kong's garage;
  6 THE tree/foliage reference: trees, undergrowth and guardrail lamps at night).
