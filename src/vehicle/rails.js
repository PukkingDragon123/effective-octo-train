// Guardrails as hard walls for the vehicles: the world's placement lists every guardrail run
// ({ type:'guardrail', id (spline), s0, s1, side ±1 }, the rail at lateral side * (halfWidth + 0.45)).
const cache = new WeakMap();
export const RAIL_OFFSET = 0.45;

function runs(world) {
  const items = world?.placement?.items;
  if (!items) return null;
  let c = cache.get(items);
  if (!c || c.n !== items.length) {
    c = { n: items.length, by: {} };
    for (const it of items) if (it.type === 'guardrail') (c.by[it.id] ||= []).push({ s0: it.s0, s1: it.s1, side: Math.sign(it.side) || 1, broken: !!it.broken });
    cache.set(items, c);
  }
  return c.by;
}
/** Is there a guardrail on `side` (±1) of spline `id` at `s`? */
export function railAt(world, id, s, side) {
  const by = runs(world);
  const list = by?.[id];
  if (!list) return false;
  for (const r of list) if (r.side === side && s >= r.s0 && s <= r.s1 && !r.broken) return true;
  return false;
}
