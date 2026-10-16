import { ITEMS } from '../data/items';

/** Equipment mastery: XP per base item, earned while equipped. Persists through death. */
export const MASTERY_XP = [0, 40, 120, 260, 480, 850];
export const MASTERY_MAX = 5;
export const LEARN_LEVEL = 3;

export function masteryLevel(xp: number): number {
  let l = 0;
  for (let i = 1; i < MASTERY_XP.length; i++) if (xp >= MASTERY_XP[i]) l = i;
  return l;
}
export function masteryProgress(xp: number): { level: number; cur: number; need: number } {
  const level = masteryLevel(xp);
  if (level >= MASTERY_MAX) return { level, cur: 1, need: 1 };
  return { level, cur: xp - MASTERY_XP[level], need: MASTERY_XP[level + 1] - MASTERY_XP[level] };
}

export const MASTERY_REWARDS = [
  '',
  'Lv1: +4% damage while wielding (weapons)',
  'Lv2: +1 Echo when reached; affixes reveal full values',
  'Lv3: Passive LEARNED — slot it with any gear',
  'Lv4: +4 Slag when reached; another +4% damage',
  'Lv5: MASTERED — Evolution & crafting recipe unlocked',
];

/** Returns milestone messages crossed between two xp values. */
export function masteryMilestones(baseId: string, before: number, after: number): string[] {
  const a = masteryLevel(before);
  const b = masteryLevel(after);
  const out: string[] = [];
  const name = ITEMS[baseId]?.name ?? baseId;
  for (let l = a + 1; l <= b; l++) {
    if (l === LEARN_LEVEL) out.push(`${name}: passive "${ITEMS[baseId].passive.name}" learned!`);
    else if (l === MASTERY_MAX) out.push(`${name} MASTERED! Evolution & recipe unlocked.`);
    else out.push(`${name} mastery Lv${l}`);
  }
  return out;
}
