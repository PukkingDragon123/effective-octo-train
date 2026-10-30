// Reset of the taxi, the screen and B's systems for a new night (the loop restart). Called by
// DeathState and, through install.js, whenever GarageState({ restart:true }) begins (A's
// wrong_home ending loops the night that way too).
import { g } from '../context.js';

/** Put the taxi, the screen and the rules back the way a new night starts. */
export function resetNightWorld() {
  const t = g.taxi;
  if (t) {
    t.autopilot(null);
    t.physicsSim.frozen = false;
    t.setControlsEnabled(false);
    t.setMeterGlitch(null);
    t.setCabinOverride(null);
    t.clearBlood?.();
    t.setFog('all', 0);
    try {
      t.addGlassMark('all', 'clear', { x: 0.5, y: 0.5 }, {});
    } catch (e) {
      /* older glass: ignore */
    }
    for (const seat of ['frontPassenger', 'rearLeft', 'rearRight', 'rearCenter']) t.setSeatWeight(seat, 0);
    const s = t.state;
    for (const d of ['fl', 'fr', 'rl', 'rr', 'trunk']) if (s.doors[d] > 0.01) t.openDoor(d, 0, 0.01);
    for (const w of ['fl', 'fr', 'rl', 'rr']) {
      s.windows[w] = 0;
      if (t.controls?.windowDrive) delete t.controls.windowDrive[w];
    }
    s.meterOn = false;
    s.vacantLamp = true;
    if (t.controls) t.controls.fare = 35;
    t.garlandWilt = 0;
    for (const gl of [...(t.dashGarlands || [])]) gl.dispose?.();
  }
  const p = g.postfx?.params;
  if (p) {
    p.horror = 0;
    p.blood = 0;
    p.distortion = 0;
    p.amulet = 0;
    p.blur = 0;
    p.letterbox = 0;
    p.temperature = 0;
    p.tint?.setRGB?.(1, 1, 1);
  }
  g.sky?.setFogBoost?.(1, 0);
  g.sky?.setGroundMist?.(1, 0);
  g.cameraRig?.setFocus(null);
  if (g.cameraRig) {
    g.cameraRig.fovOffset = 0;
    g.cameraRig.roll = 0;
    g.cameraRig.release(0.01);
  }
  g.audio?.radio?.setStatic?.(0);
  g.rules?.reset();
  g.exploration?.resetNight();
}
