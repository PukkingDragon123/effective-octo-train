# DON'T LOOK BACK IN HORROR (Pukking Dragon)

A Thai supernatural first-person taxi horror game for the browser (Three.js 0.170 + Vite,
WebGL2). Everything (textures, models, animation, audio, music) is **procedurally
generated in code**. Bundled OFL fonts come from `@fontsource/*`. The network policy
blocks external asset sites, so never fetch remote assets at runtime or build time.

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
- No real-world brands, logos, or copyrighted designs; make original fictional Thai-style ones.
- Test visually: `node tools/shot.mjs --sandbox=<name> --out=.shots/<name>.png` then
  Read the PNG. Fix every console error it prints. `.shots/` is gitignored.
- Reference images supplied with the brief (view them with Read):
  `/tmp/claude-0/-home-user-effective-octo-train/a0910a86-1464-533c-bd6b-3f5c3909f33b/scratchpad/refs/1.jpg … 6.jpg`
  (1 mossy Thai pavilion/well by day; 2 golden shrine in night mist seen from a car;
  3 night forest drive, masked passenger in the rearview mirror; 4 woman in white by a
  delineator-lit guardrail; 5 cluttered lived-in Thai room, a mood reference for Ah Kong's garage).
