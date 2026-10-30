// Tiny constructors for dialogue lines so the script files stay readable.
// They return plain objects that follow the Line schema (see SCHEMA.md):
//   { who, th, en, tone?, emotion?, action?, pause?, choice?, set?, if? }
//
//   P('สวัสดีค่ะ', 'Hello.', { emotion:'smile' })  -> current passenger speaks
//   Y('ครับ', 'Yes.')                              -> Ton speaks aloud (player)
//   T('...พ่อ', '...Dad.')                          -> Ton's thought (tone 'thought', subtitle only: use rarely)
//   S(who, th, en, extra)                          -> any other speaker id (CHARACTERS key, 'radio', 'voice')
//   O(key, th, en, { if })                         -> one reply option (2–7 Thai words, colloquial)
//   SIL()                                          -> the silent reply '…' (always LAST = the timeout default)
//   C(options, extra)                              -> a reply moment (who:'player', no on-screen prompt)
//   tr(pid, tag, n)                                -> { 'trust.<pid>.<tag>': n }  (passenger trust delta)

export const P = (th, en, x = {}) => ({ who: 'passenger', th, en, ...x });
export const Y = (th, en, x = {}) => ({ who: 'player', th, en, ...x });
export const T = (th, en, x = {}) => ({ who: 'player', th, en, tone: 'thought', ...x });
export const S = (who, th, en, x = {}) => ({ who, th, en, ...x });

/** A reply option. x.if = condition (see SCHEMA.md "Conditions"): the option only exists when it holds. */
export const O = (key, th, en, x = {}) => ({ key, th, en, ...x });
/** The silent reply. Shown as '…'; on timeout ui.choice resolves it. */
export const SIL = (en = '(say nothing)') => ({ key: 'silent', th: '…', en });

/** Trust delta flag (summed by logic.trustOf). */
export const tr = (pid, tag, n = 1) => ({ [`trust.${pid}.${tag}`]: n });

/**
 * Reply moment, shaped for src/game/Dialogue.js and ui.choice():
 *   { who:'player', tone:'thought', th:'', en:'',            // no prompt text by default (Thai-first, minimal)
 *     choice: { id, options:[{key,th,en,if?}], defaultKey, timeout?, branches?, setOnPick? }, if? }
 *
 * extra (x):
 *   id          stable choice id (Dialogue.play() returns choices[id] = picked key). Always give one.
 *   prompt      {th,en} optional prompt text (subtitle while the choice is up). Default: none.
 *   timeout     seconds; on timeout ui.choice resolves `defaultKey` (default: the LAST option = SIL())
 *   branches    { [key]: [Line] } played right after the pick (Dialogue reads choice.branches)
 *   setOnPick   { [key]: {flag:value} } flags for that pick. They are ALSO baked into the first line
 *               of the matching branch as `set`, so the stock Dialogue runner applies them
 *               (an option with setOnPick must have a non-empty branch).
 *   if          condition on the whole reply moment (resolveLines drops it when false)
 */
export const C = (options, x = {}) => {
  const choice = { id: x.id || null, options, defaultKey: x.defaultKey ?? options[options.length - 1].key };
  if (x.timeout) choice.timeout = x.timeout;
  if (x.branches || x.setOnPick) {
    const branches = {};
    for (const [k, ls] of Object.entries(x.branches || {})) branches[k] = ls.slice();
    for (const [k, flags] of Object.entries(x.setOnPick || {})) {
      if (!branches[k] || !branches[k].length) continue; // validator: setOnPick needs a non-empty branch
      branches[k][0] = { ...branches[k][0], set: { ...(branches[k][0].set || {}), ...flags } };
    }
    choice.branches = branches;
  }
  if (x.setOnPick) choice.setOnPick = x.setOnPick;
  const line = { who: 'player', th: x.prompt?.th ?? '', en: x.prompt?.en ?? '', tone: 'thought', choice };
  if (x.if) line.if = x.if;
  return line;
};
