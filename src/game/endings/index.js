// Ending orchestrator: plays every scene of ENDINGS[id] (filtered by logic.endingFor for this
// save), then the title, the epilogue cards and the credits roll (ui.ending), records the ending
// in the save, and hands back to the menu (or, for wrong_home, loops the night).
import * as THREE from 'three';
import { g } from '../context.js';
import { wait } from '../util.js';
import { CineCam, Stage, ctx as saveCtx, logic, runLines, music, holdSky, releaseSky, showPlayerHead, hidePlayer, isAbort } from '../opening/common.js';
import { SCENES, genericScene, phoneInTheDark } from './scenes.js';
import { attachToLatestRoll } from './credits.js';

const MOOD = { 'song:wayHome': 'dawn', dread: 'dread', surreal: 'surreal', nostalgic: 'nostalgic', calm: 'calm', dawn: 'dawn', ending: 'ending' };

/** Record the ending in the save: endingsSeen, unlocks (persistent k.* flags). */
export function recordEnding(E) {
  const save = g.save;
  if (!save || !E) return;
  save.endingsSeen = save.endingsSeen || [];
  if (!save.endingsSeen.includes(E.id)) save.endingsSeen.push(E.id);
  for (const u of E.unlocks || []) save.flags['k.' + u] = true;
  g.persist();
}

/**
 * Play ending `id`. state: the EndingState (active flag), S: its guard.
 */
export async function playEnding(id, state, S) {
  const L = logic();
  const ctx = saveCtx();
  const E = (L.endingFor ? L.endingFor(id, ctx) : null) || { id, scenes: [], epilogue: [], unlocks: [] };
  const save = g.save;
  recordEnding(E);
  if (save) {
    save.stage = E.countsAsDeath ? 'garage' : 'ending';
    g.persist();
  }
  const cam = new CineCam();
  state.cam = cam;
  const shared = {};
  const restore = setupLook();
  state._restoreLook = restore;
  const mood = MOOD[E.music] || 'ending';
  music(mood, 4);
  g.cine.letterbox(true, 1.4);
  let stage = new Stage();
  state.sceneStage = stage;
  const X = {
    get stage() {
      return stage;
    },
    cam,
    S,
    shared,
    keepStage: false,
    say: (lines, opts = {}) => runLines(lines || [], { alive: () => state.active, ...opts }),
    shot: (fn, dur, opts) => S.step(cam.play(fn, dur, opts)),
    reveal: (secs = 1.6) => S.step(g.cine.fade(0, secs)),
    close: (secs = 1.2, color) => S.step(g.cine.fade(1, secs, color ? new THREE.Color(color) : null)),
    radioSong: () => radioSong(stage),
    goldMist: (on) => goldMist(on, stage),
    phone: () => phoneInTheDark(X),
  };
  // the screen is black between scenes; every scene reveals itself
  await S.step(g.cine.fade(1, 1.2));
  for (const sc of E.scenes || []) {
    S.chk();
    const fn = SCENES[sc.id] || genericScene;
    try {
      await fn(sc, X);
    } catch (e) {
      if (isAbort(e)) throw e;
      console.error(`[ending] scene ${sc.id}`, e);
    }
    S.chk();
    if (X.keepStage) {
      // a continuation (house -> porch, spur -> mirror): same actors, a straight cut
      X.keepStage = false;
      continue;
    }
    await S.step(g.cine.fade(1, 0.6));
    cam.stop();
    stage.clear();
    stage = new Stage();
    state.sceneStage = stage;
    resetSpeakers();
    g.dialogue.interrupt?.();
  }
  // title, epilogue, credits (the ui card covers the frame; the world stays black beneath)
  g.cine.letterbox(false, 0.6);
  music(E.countsAsDeath ? 'silence' : 'ending', 3);
  await S.step(showEndingCard(E, !E.countsAsDeath));
  await S.wait(0.6);
  return E;
}

/** ui.ending with the save-filtered epilogue and the attributions in the roll. */
function showEndingCard(E, credits) {
  const data = g.data?.endings?.ENDINGS?.[E.id];
  let orig = null;
  if (data) {
    orig = data.epilogue;
    data.epilogue = E.epilogue || orig; // ui reads ENDINGS[id].epilogue when it builds the card
  }
  let p;
  try {
    p = g.ui.ending({ id: E.id, titleTH: E.titleTH, titleEN: E.titleEN, subtitleTH: E.subtitleTH, subtitleEN: E.subtitleEN, credits, keepBlack: true });
  } finally {
    if (data) data.epilogue = orig;
  }
  if (credits) attachToLatestRoll('.dlb-ending .dlb-roll');
  return p;
}

function resetSpeakers() {
  const C = g.data?.characters?.CHARACTERS || {};
  g.dialogue.setSpeaker('player', { humanoid: null, object: g.player?.root || null, voice: C.player?.voice || { gender: 'm', age: 27 } });
  g.dialogue.setSpeaker('ahKong', { humanoid: g.ahKong, object: g.ahKong?.root || null, voice: C.ahKong?.voice });
}

/** Cutscene look: the player's head shows, the clock is held, the HUD is gone. */
function setupLook() {
  const P = g.postfx.params;
  const keep = { tint: P.tint.clone(), exposure: P.exposure, saturation: P.saturation, sun: g.sky?.sunAzimuth };
  g.ui.hint(null);
  g.ui.setCrosshair?.(false);
  g.input.setWantPointerLock(false);
  g.actions?.setEnabled(false);
  g.taxi.setControlsEnabled(false);
  g.taxi.setInteractionsEnabled(false);
  g.player.setWalkEnabled(false);
  showPlayerHead(true);
  holdSky(g.clock.hour);
  return () => {
    P.tint.copy(keep.tint);
    P.exposure = keep.exposure;
    P.saturation = keep.saturation;
    P.amulet = 0;
    if (g.sky && keep.sun !== undefined) g.sky.sunAzimuth = keep.sun;
    showPlayerHead(false);
    hidePlayer(false);
    releaseSky();
    g.sky?.setFogBoost?.(1, 1);
    g.sky?.setGroundMist?.(1, 1);
    g.ui.setCrosshair?.(true);
  };
}

/** The radio switches itself on: his song, "ทางกลับบ้าน" (station 3 plays it in the father's hour). */
function radioSong(stage) {
  const t = g.taxi;
  const radio = g.audio?.radio;
  try {
    radio?.setHour?.(27.5);
    t.setControl('radio', true);
    t.setControl('radioTune', 3, { force: true });
    stage.add(() => {
      t.setControl('radio', false);
      radio?.setHour?.(g.clock?.hour ?? 21);
    });
  } catch (e) {
    /* audio optional */
  }
}

/** The mist turns gold. */
function goldMist(on, stage) {
  const P = g.postfx.params;
  if (on) {
    const keep = P.tint.clone();
    P.tint.setRGB(1.12, 1.0, 0.78);
    g.sky?.setFogBoost?.(2.2, 2.5);
    g.sky?.setGroundMist?.(2.4, 2.5);
    g.cine.amulet(0.28, 2.5);
    stage.add(() => {
      P.tint.copy(keep);
      g.cine.amulet(0, 1);
    });
  } else {
    P.tint.setRGB(1, 1, 1);
    g.cine.amulet(0, 1);
  }
}

export { wait };
