// UI overlay (HTML/CSS over the canvas) — menus, subtitles, minimal prompts
// (contract: docs/ARCHITECTURE.md "ui").
//
// Design: "almost no UI", like a film title sequence. Bone text on near-black, a single
// dim incense-red accent with a tiny ember, soft fades, film grain behind menus.
// Every screen works with mouse, keyboard (arrows/WASD + Enter/Esc) and gamepad
// (d-pad/stick + A/B, LB/RB tabs) through ./nav.js.
import './styles.css';
import { bus } from '../core/Events.js';
import { settings } from '../core/Settings.js';
import { input } from '../core/Input.js';
import { FONTS } from './fonts.js';
import { h } from './dom.js';
import { grainUrl } from './common.js';
import { Nav } from './nav.js';
import { Loading } from './Loading.js';
import { MainMenu, PauseMenu } from './Menu.js';
import { SlotPicker } from './SlotPicker.js';
import { SettingsPanel } from './SettingsPanel.js';
import { CreditsScreen } from './Credits.js';
import { Subtitles } from './Subtitles.js';
import { Crosshair } from './Prompt.js';
import { Hints, Toasts } from './Hints.js';
import { Chapter } from './Chapter.js';
import { Choice } from './Choice.js';
import { DeathCard } from './Death.js';
import { Ending } from './Ending.js';
import { confirmDialog } from './Confirm.js';
import { drawRulesPaper as drawPaper } from './RulesPaper.js';

export { DEFAULT_RULES, HIDDEN_LINE } from './RulesPaper.js';
export { glyph } from './glyphs.js';

/** CPU-rendered WebGL (SwiftShader) or the QA harness: avoid backdrop-filter blur. */
function isSoftwareRendering() {
  try {
    if (new URLSearchParams(location.search).get('test') === '1') return true;
    const c = document.createElement('canvas');
    const gl = c.getContext('webgl2') || c.getContext('webgl');
    if (!gl) return true;
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    const r = ext ? String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)) : '';
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return /swiftshader|llvmpipe|software/i.test(r);
  } catch (e) {
    return false;
  }
}

class UI {
  constructor() {
    this.root = null;
    this.bus = bus;
    this._grainUsers = new Map();
    this._dimCount = 0;
  }

  /** Mount into the #ui element. Safe to call more than once. */
  init(root) {
    if (this.root && (!root || root === this.root)) return this;
    root = root || document.getElementById('ui');
    if (!root) {
      root = document.createElement('div');
      root.id = 'ui';
      document.body.appendChild(root);
    }
    this.root = root;
    this.layer = root;
    root.classList.add('dlb-ui');
    root.dataset.device = input.lastDevice || 'keyboard';
    const fv = { '--f-title': FONTS.title, '--f-body': FONTS.body, '--f-sign': FONTS.sign, '--f-lcd': FONTS.lcd, '--f-hand': FONTS.hand, '--f-display': FONTS.display || FONTS.sign };
    for (const k in fv) root.style.setProperty(k, fv[k]);
    root.style.setProperty('--grain-url', `url("${grainUrl()}")`);
    if (isSoftwareRendering()) root.classList.add('dlb-lite');
    this.grainEl = h('div', { class: 'dlb-grain', attrs: { 'aria-hidden': 'true' } });
    root.appendChild(this.grainEl);

    this.nav = new Nav(this);
    this.nav.install();
    this.subs = new Subtitles(this);
    this.xhair = new Crosshair(this);
    this.hints = new Hints(this);
    this.toasts = new Toasts(this);
    this.chapterCard = new Chapter(this);
    this.choiceUI = new Choice(this);
    this.death = new DeathCard(this);
    this.endingUI = new Ending(this);
    this.loading = new Loading(this);
    this.menu = new MainMenu(this);
    this.pause = new PauseMenu(this);
    this.slots = new SlotPicker(this);
    this.settingsPanel = new SettingsPanel(this);
    this.credits = new CreditsScreen(this);
    this.fadeEl = h('div', { class: 'dlb-fade' });
    root.appendChild(this.fadeEl);

    bus.on('interact:target', (t) => this.xhair.setTarget(t));
    bus.on('subtitle', (line) => this.subtitle(line));
    settings.onChange(() => {
      this.subs.applySettings();
      this.xhair.applySettings();
    });
    this.subs.applySettings();
    // follow the last used device for key glyphs
    let last = input.lastDevice;
    setInterval(() => {
      if (input.lastDevice !== last) {
        last = input.lastDevice;
        this.setDevice(last);
      }
    }, 250);
    return this;
  }

  _ensure() {
    if (!this.root) this.init(document.getElementById('ui'));
  }

  /** 'keyboard' | 'gamepad' — switches every key glyph. */
  setDevice(d) {
    if (!this.root || !d || this.root.dataset.device === d) return;
    this.root.dataset.device = d;
  }

  _grain(delta, who) {
    const n = Math.max(0, (this._grainUsers.get(who) || 0) + delta);
    this._grainUsers.set(who, n);
    let any = false;
    for (const v of this._grainUsers.values()) if (v > 0) any = true;
    this.root?.classList.toggle('has-grain', any);
  }

  _dimMenu(delta) {
    this._dimCount = Math.max(0, this._dimCount + delta);
    this.menu?.dim(this._dimCount > 0);
  }

  _onModalChange(open) {
    this.xhair?.apply();
    bus.emit('ui:modal', { open });
  }

  /** Number of full-screen cards currently covering the view (loading, death, ending). */
  _fullscreenCards() {
    let n = 0;
    if (this.loading?.el && !this.loading.el.hidden) n++;
    if (this.death?.el) n++;
    if (this.endingUI?.el) n++;
    return n;
  }

  _refreshXhair() {
    this.xhair?.apply();
  }

  /** True while any modal screen (menu, pause, settings, slots, credits, ending) owns input. */
  get modalOpen() {
    return !!this.nav?._modal;
  }

  // ------------------------------------------------------------------ screens --
  showLoading(progress, th = '', en = '') {
    this._ensure();
    this.loading.show(progress, th, en);
  }
  hideLoading() {
    this._ensure();
    return this.loading.hide();
  }
  /** Main menu over the live cinematic scene. handlers {canResume, onNew, onResume, onSettings, onCredits} */
  showMainMenu(handlers) {
    this._ensure();
    this.menu.show(handlers || {});
  }
  hideMainMenu() {
    this._ensure();
    return this.menu.hide();
  }
  /** Save slot picker. mode 'new'|'load' -> Promise<slotIndex|null> */
  pickSlot(mode) {
    this._ensure();
    return this.slots.pick(mode || 'new');
  }
  showSettings() {
    this._ensure();
    return this.settingsPanel.open();
  }
  showCredits() {
    this._ensure();
    return this.credits.open();
  }
  /** Pause menu. handlers {onResume, onSettings, onQuitToMenu, time?, th?, en?} */
  showPause(handlers) {
    this._ensure();
    this.pause.show(handlers || {});
  }
  hidePause() {
    this._ensure();
    this.pause.hide();
  }
  get pauseVisible() {
    return !!this.pause?.visible;
  }
  /** Yes/no dialog: {th, en, subTh?, subEn?, yes:{th,en}, no:{th,en}, danger} -> Promise<boolean> */
  confirm(opts) {
    this._ensure();
    return confirmDialog(this, opts || {});
  }

  // -------------------------------------------------------------- in-game text --
  /** Subtitle line. {speakerTH, speakerEN, th, en, duration (s), tone:'normal'|'whisper'|'ghost'|'shout'|'thought', queue?} */
  subtitle(line) {
    this._ensure();
    this.subs.show(line);
  }
  clearSubtitle() {
    this._ensure();
    this.subs.clear();
  }
  /** Minimal tutorial / instruction hint (bottom-left, fades). {th, en, keys?: ['W','S'], duration} ; pass null to clear */
  hint(hnt) {
    this._ensure();
    this.hints.show(hnt);
  }
  /** Chapter card for hour changes: {time:'23:00', th, en} */
  chapter(c) {
    this._ensure();
    return this.chapterCard.show(c || {});
  }
  /** Small toast (e.g. saved). */
  toast(th, en, opts) {
    this._ensure();
    this.toasts.show(th, en, opts);
  }
  /** Dialogue choice: {options:[{key, th, en}], timeout?: seconds, defaultKey?, th?, en?, modal?} -> Promise<key> */
  choice(c) {
    this._ensure();
    if (!c || !c.options || !c.options.length) return Promise.resolve(c?.defaultKey ?? null);
    return this.choiceUI.show(c);
  }
  /** Death screen text: {th, en, sub?, hold?, keepBlack?} -> Promise (resolves after it has been shown, while black) */
  deathCard(d) {
    this._ensure();
    return this.death.show(d || {});
  }
  /** Ending title + credits roll: {id, titleTH, titleEN, th, en, credits?, keepBlack?} -> Promise */
  ending(e) {
    this._ensure();
    return this.endingUI.show(e || {});
  }
  /** Crosshair / interaction dot visibility */
  setCrosshair(visible) {
    this._ensure();
    this.xhair.setVisible(visible);
  }
  /**
   * Full-screen black. fade(true, s) -> Promise when black; fade(false, s) fades back in
   * (and releases a death/ending card held with keepBlack).
   */
  fade(on, secs = 1) {
    this._ensure();
    const el = this.fadeEl;
    el.style.transitionDuration = `${secs}s`;
    el.classList.toggle('is-on', !!on);
    if (!on) {
      this.death.release(secs);
      this.endingUI.release(secs);
    }
    return new Promise((r) => setTimeout(r, secs * 1000));
  }

  /** Draw the old man's handwritten rules paper into a canvas 2D context (used for the 3D paper prop).
   *  data {rules:[{id,th,en}], annotations:{ruleId|passengerId: text}, revealed:[ruleIds], hiddenLine?: bool} */
  drawRulesPaper(ctx, w, h, data) {
    drawPaper(ctx, w, h, data || {});
  }
}

export const ui = new UI();
bus.on('ui:init', (root) => ui.init(root));
