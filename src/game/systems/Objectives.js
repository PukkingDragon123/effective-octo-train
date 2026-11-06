// Objective line (ui/Objective.js) by key (data/kongTalk.js OBJECTIVES), e.g. setObjective('shrine'),
// setObjective('deliver', { dest: 'บ้านห้วยทราย' }). Cleared in the menu, on death and in endings.
import { g } from '../context.js';
import { bus } from '../../core/Events.js';
import { objective } from '../../ui/Objective.js';
import { OBJECTIVES } from '../data/kongTalk.js';

const fill = (s, vars) => String(s || '').replace(/\{(\w+)\}/g, (_, k) => vars?.[k] ?? '');

export function setObjective(key, vars = {}) {
  const o = OBJECTIVES[key];
  if (!o) return objective.clear();
  objective.setBoth((g.settings?.get?.('language') ?? 'th') === 'both');
  objective.set({ th: fill(o.th, vars.th ? { dest: vars.th } : vars), en: fill(o.en, vars.en ? { dest: vars.en } : vars) });
}
export const objectiveDone = () => objective.done();
export const clearObjective = () => objective.clear();

bus.on('game:state', ({ state } = {}) => {
  if (['menu', 'death', 'ending'].includes(state)) objective.clear();
});
