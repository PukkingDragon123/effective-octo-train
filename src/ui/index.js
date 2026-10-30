// UI overlay (HTML/CSS over the canvas) — menus, subtitles, minimal prompts
// (contract: docs/ARCHITECTURE.md "ui").
// STUB IMPLEMENTATION — the UI agent replaces internals; signatures must stay.
import { bus } from '../core/Events.js';

class UIStub {
  constructor() {
    this.root = null;
  }
  init(root) {
    this.root = root;
    this._sub = document.createElement('div');
    this._sub.style.cssText = 'position:absolute;left:0;right:0;bottom:8%;text-align:center;color:#eee;font:20px sans-serif;text-shadow:0 2px 4px #000';
    root.appendChild(this._sub);
  }
  showLoading(progress, th = '', en = '') {}
  hideLoading() {}
  /** Main menu over the live cinematic scene. handlers {canResume, onNew, onResume, onSettings, onCredits} */
  showMainMenu(handlers) {}
  hideMainMenu() {}
  /** Save slot picker. mode 'new'|'load' -> Promise<slotIndex|null> */
  pickSlot(mode) { return Promise.resolve(0); }
  showSettings() { return Promise.resolve(); }
  showCredits() { return Promise.resolve(); }
  /** Pause menu. handlers {onResume, onSettings, onQuitToMenu} */
  showPause(handlers) {}
  hidePause() {}
  /** Subtitle line. {speakerTH, speakerEN, th, en, duration (s), tone:'normal'|'whisper'|'ghost'|'shout'|'thought'} */
  subtitle(line) {
    if (this._sub) this._sub.textContent = line.en || line.th || '';
    clearTimeout(this._t);
    this._t = setTimeout(() => this.clearSubtitle(), (line.duration || 3) * 1000);
  }
  clearSubtitle() { if (this._sub) this._sub.textContent = ''; }
  /** Minimal tutorial / instruction hint (bottom-left, fades). {th, en, keys?: ['W','S'], duration} ; pass null to clear */
  hint(h) {}
  /** Chapter card for hour changes: {time:'23:00', th, en} */
  chapter(c) { return Promise.resolve(); }
  /** Small toast (e.g. saved). */
  toast(th, en) {}
  /** Dialogue choice: {options:[{key, th, en}], timeout?: seconds, defaultKey?} -> Promise<key> */
  choice(c) { return Promise.resolve(c.defaultKey ?? c.options[0].key); }
  /** Death screen text: {th, en} -> Promise (resolves after it has been shown) */
  deathCard(d) { return Promise.resolve(); }
  /** Ending title + credits roll: {id, titleTH, titleEN, th, en} -> Promise */
  ending(e) { return Promise.resolve(); }
  /** Crosshair / interaction dot visibility */
  setCrosshair(visible) {}
  /** Draw the old man's handwritten rules paper into a canvas 2D context (used for the 3D paper prop).
   *  data {rules:[{id,th,en}], annotations:{ruleId|passengerId: text}, revealed:[ruleIds], hiddenLine?: bool} */
  drawRulesPaper(ctx, w, h, data) {
    ctx.fillStyle = '#e8dcc0';
    ctx.fillRect(0, 0, w, h);
  }
}

export const ui = new UIStub();
bus.on('ui:init', (root) => ui.init(root));
