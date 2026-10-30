// The shared gameplay context. Game.js fills it at boot; every state / system
// imports `g` instead of passing a dozen references around.
//
// g.engine g.cameraRig g.interact g.input g.bus g.settings g.saves g.colliders
// g.postfx g.sky g.lightPool g.particles g.audio g.ui
// g.world   (World)            g.taxi (Taxi)        g.bike (Motorcycle)
// g.player  (PlayerBody)       g.ahKong (Humanoid)  g.clock (Clock)
// g.fsm     (StateMachine)     g.dialogue (Dialogue)
// g.cine    (Cinematic helpers)
// g.data    { characters, rules, passengers, ahkong, encounters, memories, endings, radio, worldtext, credits }
// g.save    -> saves.data (current slot), g.persist() writes it
// g.director (EncounterDirector)  g.rules (RuleMonitor)  g.ride (current Ride | null)
export const g = {
  ready: false,
  save: null,
  ride: null,
  /** Write the active save slot. */
  persist() {
    if (this.saves && this.saves.data) this.saves.write();
  },
};
