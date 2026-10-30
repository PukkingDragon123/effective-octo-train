// Tiny constructors for dialogue lines so the script files stay readable.
// They return plain objects that follow the Line schema (see SCHEMA.md):
//   { who, th, en, tone?, emotion?, action?, pause?, choice?, set? }
//
//   P('สวัสดีค่ะ', 'Hello.', { emotion:'smile' })  -> current passenger speaks
//   Y('ครับ', 'Yes.')                              -> Ton speaks aloud (player)
//   T('มิเตอร์เดินเอง...', 'The meter started by itself...') -> Ton's thought (tone 'thought')
//   S(who, th, en, extra)                          -> any other speaker id (CHARACTERS key, 'radio', 'voice')
//   C(options, extra)                              -> a player choice line (who:'player', th/en = prompt text)

export const P = (th, en, x = {}) => ({ who: 'passenger', th, en, ...x });
export const Y = (th, en, x = {}) => ({ who: 'player', th, en, ...x });
export const T = (th, en, x = {}) => ({ who: 'player', th, en, tone: 'thought', ...x });
export const S = (who, th, en, x = {}) => ({ who, th, en, ...x });

/**
 * Player choice line, shaped for src/game/Dialogue.js and ui.choice():
 *   { who:'player', tone:'thought', th, en,               // on-screen prompt (may be '…')
 *     choice: { id, options:[{key,th,en}], defaultKey, timeout?, branches?, setOnPick? } }
 *
 * extra (x):
 *   id          stable choice id (Dialogue.play() returns choices[id] = picked key). Always give one.
 *   prompt      {th,en} prompt text (default '…')
 *   timeout     seconds; on timeout ui.choice resolves `defaultKey` (default: the LAST option = the silent one)
 *   branches    { [key]: [Line] } played right after the pick (Dialogue reads choice.branches)
 *   setOnPick   { [key]: {flag:value} } story flags for that pick. They are ALSO baked into the
 *               first line of the matching branch as `set`, so the stock Dialogue runner applies them.
 */
export const C = (options, x = {}) => {
  const choice = { id: x.id || null, options, defaultKey: x.defaultKey ?? options[options.length - 1].key };
  if (x.timeout) choice.timeout = x.timeout;
  if (x.branches || x.setOnPick) {
    const branches = {};
    for (const [k, ls] of Object.entries(x.branches || {})) branches[k] = ls.slice();
    for (const [k, flags] of Object.entries(x.setOnPick || {})) {
      if (!branches[k] || !branches[k].length) continue; // gameplay reads choice.setOnPick for empty branches
      branches[k][0] = { ...branches[k][0], set: { ...(branches[k][0].set || {}), ...flags } };
    }
    choice.branches = branches;
  }
  if (x.setOnPick) choice.setOnPick = x.setOnPick;
  return { who: 'player', th: x.prompt?.th ?? '…', en: x.prompt?.en ?? '…', tone: 'thought', choice };
};
