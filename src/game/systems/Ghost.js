// One pale figure, shared: the jumpscare face and the one standing where you died (created once,
// lazily, a few seconds into the shift so it never hitches a scare).
import { g } from '../context.js';
import { createHumanoid } from '../../characters/index.js';

let ghost = null;
let tried = false;
export function getGhost() {
  if (ghost || tried) return ghost;
  tried = true;
  try {
    ghost = createHumanoid({
      id: 'paleFigure', sex: 'f', age: 30, height: 1.62, build: 'thin', skinTone: 0.12,
      hair: { style: 'long', color: '#0a0909' },
      outfit: { type: 'dress', top: '#c6c2b6', bottom: '#b8b4a8', accent: '#1d1a18', shoes: 'barefoot' },
      face: { seed: 4441, wrinkles: 0, smile: 0, eyeSize: 1.15, noseWidth: 0.95, jaw: 0.9, cheek: 0.9 },
      ghost: { pale: 1, eyes: 'black', wet: 0.5, decay: 0.4, bloodStains: 0.3 },
      noBlink: true,
    });
    g.engine.scene.add(ghost.root);
    ghost.root.visible = false;
    ghost.setMode?.('stand');
    ghost.setGhost?.({ stare: 1, noBlink: 1, unlimited: 1, headRoll: 0.25 }, 50);
  } catch (e) {
    console.warn('[ghost] figure', e);
    ghost = null;
  }
  return ghost;
}
/** Warm it up in the background (call once things are loaded). */
export function prewarmGhost(delayMs = 5000) {
  setTimeout(() => getGhost(), delayMs);
}
