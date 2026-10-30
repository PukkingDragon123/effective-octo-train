// Tiny constructors for dialogue lines so the script files stay readable.
// They return plain objects that follow the Line schema (see SCHEMA.md):
//   { who, th, en, tone?, emotion?, action?, pause?, choice?, branches?, set? }
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
 * Player choice. options: [{key, th, en}]. extra may hold prompt {th,en} (on-screen question), timeout (s), defaultKey,
 * branches: { [key]: [lines] } played right after the pick, set: flags to set per key
 * via setOnPick: { [key]: {flag:value} }.
 * The choice line itself has th/en = the on-screen prompt (may be empty-ish ellipsis).
 */
export const C = (options, x = {}) => {
  const line = { who: 'player', th: x.prompt?.th ?? '…', en: x.prompt?.en ?? '…', tone: 'thought', choice: { options, defaultKey: x.defaultKey ?? options[options.length - 1].key } };
  if (x.timeout) line.choice.timeout = x.timeout;
  if (x.branches) line.branches = x.branches;
  if (x.setOnPick) line.setOnPick = x.setOnPick;
  return line;
};
