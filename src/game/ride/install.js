// Engineer B's systems, installed once (idempotent) as soon as the world and the taxi exist:
//   g.kill / g.registerDeath (death/index.js, B's default cinematics), g.knowledge (Knowledge),
//   g.rules (RuleMonitor), g.exploration (Exploration). Also finds C's encounter director
//   (src/game/encounters/Director.js or index.js) when present and sets g.director.
import { g } from '../context.js';
import { bus } from '../../core/Events.js';
import { kill, registerDeath, registerDefaultDeath, isDying, deathCardFor } from '../death/index.js';
import '../death/cinematics.js';
import '../death/lastChance.js';
import { RuleMonitor } from '../rules/RuleMonitor.js';
import { Knowledge } from '../systems/Knowledge.js';
import { Exploration } from '../systems/Exploration.js';
import { CHARACTERS } from '../data/characters.js';
import { resetNightWorld } from '../death/reset.js';

// C's encounter director, if it exists yet (an empty object otherwise; Vite resolves this at build time)
const DIRECTOR_MODS = import.meta.glob(['../encounters/Director.js', '../encounters/index.js'], { eager: true });

let installed = false;

function findDirector() {
  if (g.director) return g.director;
  for (const m of Object.values(DIRECTOR_MODS)) {
    try {
      if (typeof m.installDirector === 'function') {
        const d = m.installDirector(g);
        if (d && !g.director) g.director = d;
      } else if (m.director) g.director = m.director;
      else if (typeof m.EncounterDirector === 'function') g.director = new m.EncounterDirector(g);
      else if (typeof m.Director === 'function') g.director = new m.Director(g);
    } catch (e) {
      console.warn('[gameplay-b] could not start the encounter director', e);
    }
    if (g.director) break;
  }
  return g.director || null;
}

/** Install B's gameplay systems (safe to call many times). */
export function installGameplayB() {
  if (installed) {
    if (!g.director) findDirector();
    return true;
  }
  if (!g.engine || !g.taxi || !g.world || !g.dialogue) return false;
  installed = true;
  g.kill = kill;
  g.registerDeath = registerDeath;
  g.registerDefaultDeath = registerDefaultDeath;
  g.isDying = isDying;
  g.deathCardFor = deathCardFor;
  g.knowledge = new Knowledge();
  g.rules = new RuleMonitor();
  g.exploration = new Exploration();
  // voices that come out of the taxi radio
  const radioObj = g.taxi.anchors.radioKnob;
  for (const id of ['radio', 'djNok']) {
    const c = CHARACTERS[id] || {};
    g.dialogue.setSpeaker(id, { nameTH: c.nameTH || '', nameEN: c.nameEN || '', voice: { ...(c.voice || {}) }, humanoid: null, object: radioObj });
  }
  findDirector();
  bus.emit('gameplayB:ready', {});
  return true;
}

// install on the first state change (the world, the taxi and the dialogue exist by then);
// every loop restart (GarageState({restart:true}), also after A's wrong_home ending) starts clean
bus.on('game:state', ({ state, from, params } = {}) => {
  installGameplayB();
  if (state === 'garage' && params?.restart && from !== 'death') {
    try {
      resetNightWorld();
    } catch (e) {
      console.warn('[gameplay-b] reset failed', e);
    }
  }
});
