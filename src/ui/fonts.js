// The game's typefaces (owner: Thai WITH heads only, never loopless; all SIL OFL 1.1, bundled via
// @fontsource, Thai + Latin subsets only):
//   Noto Serif Thai (Google): titles and cards, 600 / 800, and 400 for large light lines.
//   Sarabun (Cadson Demak): text, menus, subtitles, signs and printed props (400 / 500 / 600 / 700 / 800).
//   Sriracha (Cadson Demak): handwriting, the rules paper and notes (400 only).
// Canvas-generated textures (signs, labels, the rules paper) must await loadFonts() before drawing.
import '@fontsource/noto-serif-thai/thai-400.css';
import '@fontsource/noto-serif-thai/latin-400.css';
import '@fontsource/noto-serif-thai/thai-600.css';
import '@fontsource/noto-serif-thai/latin-600.css';
import '@fontsource/noto-serif-thai/thai-800.css';
import '@fontsource/noto-serif-thai/latin-800.css';
import '@fontsource/sarabun/thai-400.css';
import '@fontsource/sarabun/latin-400.css';
import '@fontsource/sarabun/thai-500.css';
import '@fontsource/sarabun/latin-500.css';
import '@fontsource/sarabun/thai-600.css';
import '@fontsource/sarabun/latin-600.css';
import '@fontsource/sarabun/thai-700.css';
import '@fontsource/sarabun/latin-700.css';
import '@fontsource/sarabun/thai-800.css';
import '@fontsource/sarabun/latin-800.css';
import '@fontsource/sriracha/thai-400.css';
import '@fontsource/sriracha/latin-400.css';

const SERIF = "'Noto Serif Thai', 'Sarabun', 'Leelawadee UI', 'Thonburi', serif";
const SARABUN = "'Sarabun', 'Noto Sans Thai Looped', 'Leelawadee UI', 'Thonburi', sans-serif";

/** Font stacks for canvas & CSS use. */
export const FONTS = {
  body: SARABUN, // UI text, subtitles, menus
  sign: SARABUN, // road signs, posters, labels: looped Thai with heads
  lcd: SARABUN, // taxi meter, clocks, digital displays (tabular figures)
  hand: "'Sriracha', 'Sarabun', cursive", // handwriting: notes and the rules paper
  title: SERIF, // game title / menu headings
  display: SERIF, // chapter titles, death and ending cards
};

/** Weights bundled per family (use only these). */
export const FONT_WEIGHTS = { serif: [400, 600, 800], sarabun: [400, 500, 600, 700, 800], sriracha: [400] };

let promise = null;
export function loadFonts() {
  if (promise) return promise;
  const specs = ["400 32px 'Noto Serif Thai'", "600 32px 'Noto Serif Thai'", "800 32px 'Noto Serif Thai'", "400 32px 'Sarabun'", "500 32px 'Sarabun'", "600 32px 'Sarabun'", "700 32px 'Sarabun'", "800 32px 'Sarabun'", "400 32px 'Sriracha'"];
  const sample = 'กขคงจ ศาลเจ้ามารวย ABC 123';
  promise = Promise.race([
    Promise.all(specs.map((s) => document.fonts.load(s, sample).catch(() => null))),
    new Promise((r) => setTimeout(r, 4000)),
  ]).then(() => true);
  return promise;
}
