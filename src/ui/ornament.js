// The UI's simple SVG icon set and cursor (crisp at any resolution and DPR). No ornament (owner).
const enc = (svg) => `url("data:image/svg+xml,${encodeURIComponent(svg.replace(/\s+/g, ' ').trim())}")`;

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

/** CSS custom properties for the cursor (set on the UI root). */
export function ornamentVars() {
  return {
    '--cursor': `${enc(cursorSVG())} 4 2, default`,
  };
}
