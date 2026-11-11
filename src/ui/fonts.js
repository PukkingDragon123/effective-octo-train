// The game's typefaces (owner's choice, both SIL OFL 1.1, bundled via @fontsource, Thai + Latin
// subsets only):
//   Kanit (Cadson Demak): titles and cards, heavy 600 / 800 for the big lines, light 200 / 300
//   for large secondary lines and numerals.
//   IBM Plex Sans Thai (IBM / Cadson Demak): body text, subtitles, menus, labels; clean Thai with
//   its own Latin.
// Canvas-generated textures (signs, labels, the rules paper) must await loadFonts() before drawing.
import '@fontsource/kanit/thai-200.css';
import '@fontsource/kanit/latin-200.css';
import '@fontsource/kanit/thai-300.css';
import '@fontsource/kanit/latin-300.css';
import '@fontsource/kanit/thai-600.css';
import '@fontsource/kanit/latin-600.css';
import '@fontsource/kanit/thai-800.css';
import '@fontsource/kanit/latin-800.css';
import '@fontsource/ibm-plex-sans-thai/thai-400.css';
import '@fontsource/ibm-plex-sans-thai/latin-400.css';
import '@fontsource/ibm-plex-sans-thai/thai-500.css';
import '@fontsource/ibm-plex-sans-thai/latin-500.css';
import '@fontsource/ibm-plex-sans-thai/thai-600.css';
import '@fontsource/ibm-plex-sans-thai/latin-600.css';
// owner: street signs, shop boards and printed props use a Thai font WITH heads (Sarabun);
// handwriting (notes, the rules paper) uses a real handwriting face (Sriracha)
import '@fontsource/sarabun/thai-400.css';
import '@fontsource/sarabun/latin-400.css';
import '@fontsource/sarabun/thai-700.css';
import '@fontsource/sarabun/latin-700.css';
import '@fontsource/sarabun/thai-800.css';
import '@fontsource/sarabun/latin-800.css';
import '@fontsource/sriracha/thai-400.css';
import '@fontsource/sriracha/latin-400.css';

const KANIT = "'Kanit', 'IBM Plex Sans Thai', 'Noto Sans Thai', 'Leelawadee UI', 'Thonburi', sans-serif";
const PLEX = "'IBM Plex Sans Thai', 'Noto Sans Thai', 'Leelawadee UI', 'Thonburi', sans-serif";

/** Font stacks for canvas & CSS use. */
export const FONTS = {
  body: PLEX, // UI text, subtitles, menus
  sign: "'Sarabun', 'Noto Sans Thai Looped', 'Leelawadee UI', sans-serif", // road signs, posters, labels: looped Thai with heads
  lcd: PLEX, // taxi meter, clocks, digital displays (tabular figures)
  hand: "'Sriracha', 'Sarabun', cursive", // handwriting: notes and the rules paper
  title: KANIT, // game title / menu headings
  display: KANIT, // chapter titles, death and ending cards
};

/** Weights bundled per family (use only these). */
export const FONT_WEIGHTS = { kanit: [200, 300, 600, 800], plex: [400, 500, 600] };

let promise = null;
export function loadFonts() {
  if (promise) return promise;
  const specs = ["700 32px 'Sarabun'", "800 32px 'Sarabun'", "400 32px 'Sarabun'", "400 32px 'Sriracha'", "800 32px 'Kanit'", "600 32px 'Kanit'", "300 32px 'Kanit'", "200 32px 'Kanit'", "400 32px 'IBM Plex Sans Thai'", "500 32px 'IBM Plex Sans Thai'", "600 32px 'IBM Plex Sans Thai'"];
  const sample = 'กขคงจ ศาลเจ้ามารวย ABC 123';
  promise = Promise.race([
    Promise.all(specs.map((s) => document.fonts.load(s, sample).catch(() => null))),
    new Promise((r) => setTimeout(r, 4000)),
  ]).then(() => true);
  return promise;
}
