// The game's typefaces (owner's choice: modern Thai WITH heads (looped), both SIL OFL 1.1, bundled
// via @fontsource, Thai + Latin subsets only):
//   Noto Serif Thai: titles and cards (grand, looped), 800 / 600 for big lines, 300 for secondary.
//   IBM Plex Sans Thai Looped: body text, subtitles, menus, labels (clean modern looped Thai).
// Canvas-generated textures (signs, labels, the rules paper) must await loadFonts() before drawing.
import '@fontsource/noto-serif-thai/thai-300.css';
import '@fontsource/noto-serif-thai/latin-300.css';
import '@fontsource/noto-serif-thai/thai-600.css';
import '@fontsource/noto-serif-thai/latin-600.css';
import '@fontsource/noto-serif-thai/thai-800.css';
import '@fontsource/noto-serif-thai/latin-800.css';
import '@fontsource/ibm-plex-sans-thai-looped/thai-400.css';
import '@fontsource/ibm-plex-sans-thai-looped/latin-400.css';
import '@fontsource/ibm-plex-sans-thai-looped/thai-500.css';
import '@fontsource/ibm-plex-sans-thai-looped/latin-500.css';
import '@fontsource/ibm-plex-sans-thai-looped/thai-600.css';
import '@fontsource/ibm-plex-sans-thai-looped/latin-600.css';

const KANIT = "'Noto Serif Thai', 'IBM Plex Sans Thai Looped', 'Leelawadee UI', 'Thonburi', serif";
const PLEX = "'IBM Plex Sans Thai Looped', 'Noto Sans Thai Looped', 'Leelawadee UI', 'Thonburi', sans-serif";

/** Font stacks for canvas & CSS use. */
export const FONTS = {
  body: PLEX, // UI text, subtitles, menus
  sign: KANIT, // road signs, posters, shop signs (bold condensed-feeling sans)
  lcd: PLEX, // taxi meter, clocks, digital displays (tabular figures)
  hand: PLEX, // notes and the rules paper (canvas painters add their own hand jitter)
  title: KANIT, // game title / menu headings
  display: KANIT, // chapter titles, death and ending cards
};

/** Weights bundled per family (use only these). */
export const FONT_WEIGHTS = { kanit: [300, 600, 800], plex: [400, 500, 600] }; // kanit = title family (now Noto Serif Thai)

let promise = null;
export function loadFonts() {
  if (promise) return promise;
  const specs = ["800 32px 'Noto Serif Thai'", "600 32px 'Noto Serif Thai'", "300 32px 'Noto Serif Thai'", "400 32px 'IBM Plex Sans Thai Looped'", "500 32px 'IBM Plex Sans Thai Looped'", "600 32px 'IBM Plex Sans Thai Looped'"];
  const sample = 'กขคงจ ศาลเจ้ามารวย ABC 123';
  promise = Promise.race([
    Promise.all(specs.map((s) => document.fonts.load(s, sample).catch(() => null))),
    new Promise((r) => setTimeout(r, 4000)),
  ]).then(() => true);
  return promise;
}
