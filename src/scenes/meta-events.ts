import { ITEMS, type ItemInst } from '../data/items';
import type { Game } from '../game';
import { MASTERY_MAX, masteryLevel, masteryMilestones } from '../meta/mastery';
import { EQUIP_SLOTS, findItem, type Profile } from '../meta/profile';
import type { RunState } from '../meta/run';
import type { SimEvent } from '../sim/events';
import { C } from '../ui/ui';

/**
 * Distribute mastery XP to equipped gear. Weapons learn from hits & kills, shields from
 * guarding/parrying, armor from dodging and kills, charms from kills.
 */
export function applyMastery(g: Game, p: Profile, run: RunState | null, e: Extract<SimEvent, { t: 'mastery' }>): void {
  const eq = run ? run.equipped : p.equipped;
  const extra = run?.items ?? [];
  const add = (it: ItemInst | null, amount: number) => {
    if (!it || amount <= 0) return;
    const id = it.baseId;
    const before = p.mastery[id] ?? 0;
    const after = before + amount;
    p.mastery[id] = after;
    if (run) run.stats.mastery[id] = (run.stats.mastery[id] ?? 0) + amount;
    const lb = masteryLevel(before);
    const la = masteryLevel(after);
    if (la > lb) {
      for (const msg of masteryMilestones(id, before, after)) g.toast(msg, '#ffb86a', 3500);
      g.sfx(la >= 3 ? 'rare' : 'levelup', 0.7);
      for (let l = lb + 1; l <= la; l++) {
        if (l === 2) p.echoes += 1;
        if (l === 4) p.slag += 4;
        if (l === MASTERY_MAX && !p.recipes.includes(id)) p.recipes.push(id);
        if (l === MASTERY_MAX && ITEMS[id].evolvesTo) g.toast(`${ITEMS[id].name} can now evolve at the Forge (+5, Starforging).`, '#ffd27a', 4000);
      }
    }
  };
  const get = (s: (typeof EQUIP_SLOTS)[number]) => findItem(p, eq[s], extra);
  switch (e.kind) {
    case 'hit':
      add(get('weapon'), e.amount);
      break;
    case 'kill':
      add(get('weapon'), e.amount);
      add(get('armor'), Math.ceil(e.amount / 2));
      add(get('charm1'), Math.ceil(e.amount / 2));
      add(get('charm2'), Math.ceil(e.amount / 2));
      add(get('shield'), Math.ceil(e.amount / 3));
      break;
    case 'guard':
      add(get('shield'), e.amount);
      break;
    case 'dodge':
      add(get('armor'), e.amount);
      break;
  }
}

export const RARITY_TOAST: Record<string, string> = { common: C.text, uncommon: '#6fdc6f', rare: '#5fa8ff', epic: '#c77dff', legendary: '#ffb03a' };
