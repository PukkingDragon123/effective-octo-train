// Render layers. The mirror / reflection mechanics depend on these, so every
// module must respect them (see docs/ARCHITECTURE.md "Layers").
//
//   main camera       : DEFAULT, MAIN_ONLY, (GLASS rendered in a separate pass)
//   mirror cameras    : DEFAULT, REFLECTION_ONLY, PLAYER_HEAD
//   glass pass        : GLASS only
//
// Ghosts "without a reflection" put all their meshes on MAIN_ONLY.
// Things that "only exist in reflections" go on REFLECTION_ONLY.
// The player's own head/hair goes on PLAYER_HEAD (invisible to the first-person
// camera so it never clips, but visible in mirrors).
export const LAYERS = Object.freeze({
  DEFAULT: 0,
  MAIN_ONLY: 1,
  REFLECTION_ONLY: 2,
  PLAYER_HEAD: 3,
  GLASS: 4,
  INTERACT: 5, // raycast-only proxies for interactables (never rendered)
});

/** Put an object (and all descendants) exclusively on one layer. */
export function setLayerDeep(object, layer) {
  object.traverse((o) => o.layers.set(layer));
}

/** Enable an extra layer on an object and its descendants (keeps existing layers). */
export function enableLayerDeep(object, layer) {
  object.traverse((o) => o.layers.enable(layer));
}
