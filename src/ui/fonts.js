// The game's typeface: Srisakdi (ornate traditional Thai, Cadson Demak, SIL OFL 1.1),
// chosen by the owner for EVERYTHING: title, cards, subtitles, menus, handwriting,
// signs and the taxi meter. Bundled via @fontsource. Canvas-generated textures (signs,
// labels, the rules paper) must await loadFonts() before drawing text.
import '@fontsource/srisakdi/400.css';
import '@fontsource/srisakdi/700.css';

const SRISAKDI = "'Srisakdi', 'Noto Serif Thai', 'Leelawadee UI', 'Thonburi', serif";

/** Font stacks for canvas & CSS use. Every role uses Srisakdi (only weights 400 and 700 exist). */
export const FONTS = {
  body: SRISAKDI, // UI text, subtitles
  sign: SRISAKDI, // road signs, posters, shop signs
  lcd: SRISAKDI, // taxi meter, clocks, digital displays
  hand: SRISAKDI, // handwriting (rules paper, notes)
  title: SRISAKDI, // game title / menu
  display: SRISAKDI, // chapter titles, death card
};

let promise = null;
export function loadFonts() {
  if (promise) return promise;
  const specs = ["400 32px 'Srisakdi'", "700 32px 'Srisakdi'"];
  const sample = 'กขคงจ ศาลเจ้ามารวย ABC 123';
  promise = Promise.race([
    Promise.all(specs.map((s) => document.fonts.load(s, sample).catch(() => null))),
    new Promise((r) => setTimeout(r, 4000)),
  ]).then(() => true);
  return promise;
}
