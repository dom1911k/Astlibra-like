import type { Rng } from '../core/rng';
import { ITEMS, MAX_PLUS, RARITIES, type ItemInst } from '../data/items';
import { baseOf, makeItem, rarityIndex, rollAffix } from './items';
import { MASTERY_MAX, masteryLevel } from './mastery';
import { unlocks, type Profile } from './profile';

export interface Wallet {
  slag: number;
  starglass: number;
  echoes: number;
  gilt: number;
}

export function upgradeCost(i: ItemInst): { slag: number; starglass: number } {
  const tier = baseOf(i).tier;
  return { slag: Math.round(6 * Math.pow(i.plus + 1, 1.35) * (0.7 + tier * 0.3)), starglass: i.plus >= 6 ? 1 + Math.floor((i.plus - 6) / 2) : 0 };
}
export function canUpgrade(i: ItemInst, w: Wallet): boolean {
  if (i.plus >= MAX_PLUS) return false;
  const c = upgradeCost(i);
  return w.slag >= c.slag && w.starglass >= c.starglass;
}
export function upgrade(i: ItemInst, w: Wallet): boolean {
  if (!canUpgrade(i, w)) return false;
  const c = upgradeCost(i);
  w.slag -= c.slag;
  w.starglass -= c.starglass;
  i.plus++;
  return true;
}

export function rerollCost(i: ItemInst): number {
  return 2 + rarityIndex(i.rarity);
}
export function reroll(rng: Rng, i: ItemInst, idx: number, w: Wallet): boolean {
  const cost = rerollCost(i);
  if (w.echoes < cost || !i.affixes[idx]) return false;
  const others = i.affixes.filter((_, k) => k !== idx);
  const a = rollAffix(rng, baseOf(i).slot, i.rarity, Math.max(i.ilvl, 1), others, i.affixes[idx].id);
  if (!a) return false;
  w.echoes -= cost;
  i.affixes[idx] = a;
  return true;
}

/** Improve an affix roll by +15% (max 1.6× of its original roll range). */
export function refineCost(i: ItemInst): { slag: number; starglass: number } {
  return { slag: 10 + rarityIndex(i.rarity) * 6, starglass: 1 };
}
export function refine(i: ItemInst, idx: number, w: Wallet): boolean {
  const c = refineCost(i);
  const a = i.affixes[idx];
  if (!a || w.slag < c.slag || w.starglass < c.starglass) return false;
  w.slag -= c.slag;
  w.starglass -= c.starglass;
  a.value = Math.round(a.value * 1.15 * 1000) / 1000;
  if (Number.isInteger(a.value) || a.value >= 1) a.value = Math.round(a.value * 10) / 10;
  return true;
}

export function salvageValue(i: ItemInst): { slag: number; echoes: number; starglass: number } {
  const r = rarityIndex(i.rarity);
  return { slag: Math.round(3 * baseOf(i).tier * (r + 1) + i.plus * 2), echoes: r >= 2 ? r - 1 : 0, starglass: r >= 4 ? 1 : 0 };
}

export function canEvolve(p: Profile, i: ItemInst): { ok: boolean; reason: string } {
  const b = baseOf(i);
  if (!b.evolvesTo) return { ok: false, reason: 'This item has no evolution.' };
  if (!unlocks(p).has('forge_evolve')) return { ok: false, reason: 'Requires Starboard: Starforging.' };
  if (masteryLevel(p.mastery[b.id] ?? 0) < MASTERY_MAX) return { ok: false, reason: 'Requires Mastery Lv5.' };
  if (i.plus < 5) return { ok: false, reason: 'Requires +5 or higher.' };
  if (p.starglass < 3) return { ok: false, reason: 'Requires 3 Starglass.' };
  return { ok: true, reason: `Evolve into ${ITEMS[b.evolvesTo].name}` };
}
export function evolve(p: Profile, i: ItemInst): boolean {
  if (!canEvolve(p, i).ok) return false;
  const b = baseOf(i);
  p.starglass -= 3;
  i.baseId = b.evolvesTo!;
  const ri = Math.min(RARITIES.length - 1, rarityIndex(i.rarity) + 1);
  i.rarity = ITEMS[i.baseId].legendary ? 'legendary' : RARITIES[ri];
  i.plus = Math.max(0, i.plus - 3);
  if (!p.codex.items.includes(i.baseId)) p.codex.items.push(i.baseId);
  return true;
}

/** Recipes: mastered bases + boss-granted legendaries. */
export function recipeCost(baseId: string): { slag: number; starglass: number } {
  const b = ITEMS[baseId];
  return { slag: 20 * b.tier, starglass: b.legendary ? 5 : b.tier >= 2 ? 1 : 0 };
}
export function craft(rng: Rng, p: Profile, baseId: string): ItemInst | null {
  const c = recipeCost(baseId);
  if (p.slag < c.slag || p.starglass < c.starglass) return null;
  p.slag -= c.slag;
  p.starglass -= c.starglass;
  const b = ITEMS[baseId];
  const it = makeItem(rng, baseId, b.legendary ? 'legendary' : 'rare', Math.max(1, b.tier));
  p.stash.push(it);
  return it;
}
