// Bundled OFL fonts (via @fontsource). Canvas-generated textures (signs, labels,
// the handwritten rules paper) must await loadFonts() before drawing text.
import '@fontsource/sarabun/300.css';
import '@fontsource/sarabun/400.css';
import '@fontsource/sarabun/600.css';
import '@fontsource/kanit/400.css';
import '@fontsource/kanit/600.css';
import '@fontsource/kanit/800.css';
import '@fontsource/chakra-petch/500.css';
import '@fontsource/chakra-petch/700.css';
import '@fontsource/mali/400.css';
import '@fontsource/mali/600.css';
import '@fontsource/cormorant-garamond/400.css';
import '@fontsource/cormorant-garamond/600.css';

/** Font stacks for canvas & CSS use. */
export const FONTS = {
  body: "'Sarabun', 'Leelawadee UI', 'Thonburi', 'Noto Sans Thai', sans-serif", // UI text, subtitles
  sign: "'Kanit', 'Sarabun', sans-serif", // road signs, posters, shop signs
  lcd: "'Chakra Petch', 'Kanit', monospace", // taxi meter, clocks, digital displays
  hand: "'Mali', 'Sarabun', cursive", // handwriting (rules paper, notes)
  title: "'Cormorant Garamond', 'Times New Roman', serif", // game title / menu
};

let promise = null;
export function loadFonts() {
  if (promise) return promise;
  const specs = [
    "400 32px 'Sarabun'", "600 32px 'Sarabun'", "300 32px 'Sarabun'",
    "400 32px 'Kanit'", "600 32px 'Kanit'", "800 32px 'Kanit'",
    "500 32px 'Chakra Petch'", "700 32px 'Chakra Petch'",
    "400 32px 'Mali'", "600 32px 'Mali'",
    "400 32px 'Cormorant Garamond'", "600 32px 'Cormorant Garamond'",
  ];
  const sample = 'กขคงจ ศาลเจ้ามารวย ABC 123';
  promise = Promise.race([
    Promise.all(specs.map((s) => document.fonts.load(s, sample).catch(() => null))),
    new Promise((r) => setTimeout(r, 4000)),
  ]).then(() => true);
  return promise;
}
