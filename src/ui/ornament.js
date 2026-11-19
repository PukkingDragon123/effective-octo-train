// Vector ornament and the UI icon set (SVG line work, crisp at any resolution and DPR).
// The rule is a thin line drawn out from a lotus bud with two leaf-petals, after the bud-and-leaf
// (ดอกบัวตูม / กลีบบัว) motif of Thai borders: line work only, no painted art.
const enc = (svg) => `url("data:image/svg+xml,${encodeURIComponent(svg.replace(/\s+/g, ' ').trim())}")`;

/** The ornamental rule (240 x 16): fades out to both sides from the bud. */
export function ruleSVG(color = '#ebe5d8', accent = '#d0402e') {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 16" preserveAspectRatio="none">
    <defs><linearGradient id="l" x1="0" x2="1"><stop offset="0" stop-color="${color}" stop-opacity="0"/><stop offset="1" stop-color="${color}" stop-opacity="0.55"/></linearGradient>
    <linearGradient id="r" x1="0" x2="1"><stop offset="0" stop-color="${color}" stop-opacity="0.55"/><stop offset="1" stop-color="${color}" stop-opacity="0"/></linearGradient></defs>
    <rect x="0" y="7.6" width="98" height="0.8" fill="url(#l)"/><rect x="142" y="7.6" width="98" height="0.8" fill="url(#r)"/>
    <circle cx="101.5" cy="8" r="1" fill="${color}" fill-opacity="0.6"/><circle cx="138.5" cy="8" r="1" fill="${color}" fill-opacity="0.6"/>
    <path d="M113.5 8c-2.4-3.2-5.6-3.6-8.4-1.6 2.6 0.6 4.6 1.2 8.4 1.6zM113.5 8c-2.4 3.2-5.6 3.6-8.4 1.6 2.6-0.6 4.6-1.2 8.4-1.6z" fill="none" stroke="${color}" stroke-opacity="0.7" stroke-width="0.7"/>
    <path d="M126.5 8c2.4-3.2 5.6-3.6 8.4-1.6-2.6 0.6-4.6 1.2-8.4 1.6zM126.5 8c2.4 3.2 5.6 3.6 8.4 1.6-2.6-0.6-4.6-1.2-8.4-1.6z" fill="none" stroke="${color}" stroke-opacity="0.7" stroke-width="0.7"/>
    <path d="M120 1.6c3.4 2.4 4.4 5 4.4 6.6 0 2.6-2 4.6-4.4 6.2-2.4-1.6-4.4-3.6-4.4-6.2 0-1.6 1-4.2 4.4-6.6z" fill="none" stroke="${color}" stroke-opacity="0.85" stroke-width="0.8"/>
    <path d="M120 4.8c1.5 1.3 2 2.6 2 3.6 0 1.3-0.8 2.4-2 3.3-1.2-0.9-2-2-2-3.3 0-1 0.5-2.3 2-3.6z" fill="${accent}"/>
  </svg>`;
}

/** A corner bracket with a small curl (40 x 40), for panel corners. */
export function cornerSVG(color = '#ebe5d8') {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40">
    <path d="M1 39V8c0-3.9 3.1-7 7-7h31" fill="none" stroke="${color}" stroke-opacity="0.38" stroke-width="1"/>
    <path d="M6 30V12c0-3.3 2.7-6 6-6h18" fill="none" stroke="${color}" stroke-opacity="0.16" stroke-width="1"/>
    <path d="M12 12c3-2.6 6.6-2 7.6 0.6 0.8 2.2-1 4-3 3.4-1.4-0.4-1.6-2-0.6-2.6" fill="none" stroke="${color}" stroke-opacity="0.5" stroke-width="0.9" stroke-linecap="round"/>
  </svg>`;
}

/** The pointer: a slim arrow, bone with a dark keyline (SVG, so it is sharp on any display). */
export function cursorSVG() {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 28 28">
    <path d="M4 2.5l17 11.2-7.4 1.3 4.3 8.2-3 1.6-4.3-8.3-5.6 5z" fill="#0b0c0d" stroke="#0b0c0d" stroke-width="3" stroke-linejoin="round"/>
    <path d="M4 2.5l17 11.2-7.4 1.3 4.3 8.2-3 1.6-4.3-8.3-5.6 5z" fill="#efe9dc"/>
    <path d="M5.4 5.6v12.6" stroke="#d0402e" stroke-width="1.2" stroke-linecap="round"/>
  </svg>`;
}

const ICONS = {
  graphics: '<rect x="3" y="4.5" width="18" height="12" rx="1.6"/><path d="M9 20h6M12 16.5V20"/><path d="M6.5 13l3.4-3.6 2.6 2.4 2-2 3 3.2"/>',
  audio: '<path d="M4 9.5h3.6L12 5.5v13l-4.4-4H4z"/><path d="M15.5 9a4.4 4.4 0 010 6M18 6.6a8 8 0 010 10.8"/>',
  controls: '<path d="M7.4 7.5h9.2c2.6 0 4.2 2.2 4.6 5l0.5 3.6c0.3 2-2 3.2-3.4 1.8L15.8 15.4H8.2l-2.5 2.5c-1.4 1.4-3.7 0.2-3.4-1.8l0.5-3.6c0.4-2.8 2-5 4.6-5z"/><path d="M7.5 10.2v3.2M5.9 11.8h3.2"/><circle cx="15.8" cy="11" r="0.7"/><circle cx="17.6" cy="12.8" r="0.7"/>',
  text: '<path d="M4 18.5L9.2 5.5h1.2l5.2 13M6 13.6h7.6"/><path d="M16.6 12.4c1.2-1 3.6-1 4.2 0.6v5.5M20.8 15.6c-3.6-0.4-4.8 0.6-4.8 1.6 0 1.4 2.4 1.8 4.8 0"/>',
  check: '<path d="M5 12.5l4.4 4.4L19 7.4"/>',
};

/** One icon of the UI's set (24 x 24 line icons, 1.6 stroke). */
export function icon(name, cls = 'dlb-ic') {
  return `<svg class="${cls}" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">${ICONS[name] || ''}</svg>`;
}

/** CSS custom properties for the ornament, corners and cursor (set on the UI root). */
export function ornamentVars() {
  return {
    '--orn-rule': enc(ruleSVG()),
    '--orn-corner': enc(cornerSVG()),
    '--cursor': `${enc(cursorSVG())} 4 2, default`,
  };
}
