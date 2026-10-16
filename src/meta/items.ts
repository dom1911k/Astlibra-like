import type { Rng } from '../core/rng';
import { AFFIXES, AFFIX_BY_ID, ITEMS, ITEM_LIST, RARITIES, RARITY_AFFIXES, type AffixRoll, type ItemBase, type ItemInst, type Rarity, type Slot } from '../data/items';
import { addStats, emptyStats, formatStat, type StatKey, type StatMods, type Stats } from '../sim/stats';
import type { ProcDef } from '../sim/types';

export const TIER_MULT = [1, 1, 1.7, 2.6, 3.4];
const RARITY_MULT: Record<Rarity, number> = { common: 1, uncommon: 1, rare: 1.1, epic: 1.2, legendary: 1.35 };
export const rarityIndex = (r: Rarity) => RARITIES.indexOf(r);

let uidCounter = Date.now() % 100000;
export function newUid(): string {
  return (uidCounter++).toString(36) + Math.floor(Math.random() * 1e6).toString(36);
}

export function baseOf(i: ItemInst): ItemBase {
  return ITEMS[i.baseId];
}

/** Stats an item instance grants (base scaled by forge level + affixes). */
export function itemStats(inst: ItemInst): Stats {
  const b = baseOf(inst);
  const s = emptyStats();
  const plusMult = 1 + inst.plus * 0.1;
  for (const k in b.stats) {
    const key = k as StatKey;
    const v = b.stats[key]!;
    const scaled = key === 'atk' || key === 'def' || key === 'magic' || key === 'maxHp' ? v * plusMult : v;
    s[key] += scaled;
  }
  for (const a of inst.affixes) {
    const def = AFFIX_BY_ID[a.id];
    if (def?.stat) s[def.stat as StatKey] += a.value;
  }
  return s;
}

export function itemProcs(inst: ItemInst): ProcDef[] {
  const out: ProcDef[] = [];
  for (const a of inst.affixes) {
    const def = AFFIX_BY_ID[a.id];
    if (def?.proc) out.push(def.proc);
  }
  return out;
}

export function affixText(a: AffixRoll): string {
  const def = AFFIX_BY_ID[a.id];
  if (!def) return a.id;
  if (def.proc) return def.procText ?? a.id;
  return formatStat(def.stat as StatKey, a.value);
}

export function statLines(mods: StatMods): string[] {
  const out: string[] = [];
  for (const k in mods) {
    const v = mods[k as StatKey]!;
    if (Math.abs(v) > 1e-6) out.push(formatStat(k as StatKey, v));
  }
  return out;
}

export function itemName(i: ItemInst): string {
  return (i.plus > 0 ? `${baseOf(i).name} +${i.plus}` : baseOf(i).name);
}

/** Rough single-number power estimate, used for sorting and "upgrade" arrows (not for balance). */
export function itemScore(i: ItemInst): number {
  const s = itemStats(i);
  return s.atk * 3 + s.magic * 2.5 + s.def * 2 + s.maxHp * 0.3 + s.critChance * 200 + s.critDmg * 60 + s.atkSpeed * 150 + s.dmgPct * 150 + rarityIndex(i.rarity) * 8 + (baseOf(i).tier - 1) * 10;
}

// ─────────────────────────────── generation ───────────────────────────────
export interface LootCtx {
  depth: number;
  luck: number; // lootLuck stat
  unlocks: Set<string>;
  minRarity?: Rarity;
  slot?: Slot;
  legendaryBoost?: number;
}

export function rollRarity(rng: Rng, ctx: LootCtx): Rarity {
  const d = ctx.depth;
  const luck = 1 + ctx.luck;
  const w: Record<Rarity, number> = {
    common: Math.max(8, 52 - d * 10),
    uncommon: 30,
    rare: (12 + d * 4) * luck,
    epic: (3 + d * 2.5) * luck,
    legendary: (0.6 + d * 0.6 + (ctx.legendaryBoost ?? 0)) * luck,
  };
  const min = ctx.minRarity ? rarityIndex(ctx.minRarity) : 0;
  const opts = RARITIES.filter((r) => rarityIndex(r) >= min);
  return rng.weighted(opts, (r) => w[r]);
}

export function baseAllowed(b: ItemBase, unlocks: Set<string>): boolean {
  if (b.special) return false;
  if (b.unlock && !unlocks.has(b.unlock)) return false;
  if (b.cls === 'glaive' && !unlocks.has('unlock_glaive')) return false;
  if (b.cls === 'rod' && !unlocks.has('unlock_rod')) return false;
  if (b.cls === 'pendulum' && !unlocks.has('unlock_pendulum')) return false;
  return true;
}

export function rollItem(rng: Rng, ctx: LootCtx): ItemInst {
  let rarity = rollRarity(rng, ctx);
  const slot: Slot = ctx.slot ?? rng.weighted<Slot>(['weapon', 'armor', 'shield', 'charm'], (s) => ({ weapon: 34, armor: 22, shield: 14, charm: 30 })[s]);
  let pool = ITEM_LIST.filter((b) => b.slot === slot && baseAllowed(b, ctx.unlocks) && !!b.legendary === (rarity === 'legendary') && b.tier <= Math.max(1, ctx.depth));
  if (!pool.length && rarity === 'legendary') {
    pool = ITEM_LIST.filter((b) => b.legendary && baseAllowed(b, ctx.unlocks));
    if (!pool.length) {
      rarity = 'epic';
      pool = ITEM_LIST.filter((b) => b.slot === slot && baseAllowed(b, ctx.unlocks) && !b.legendary && b.tier <= Math.max(1, ctx.depth));
    }
  }
  if (!pool.length) pool = ITEM_LIST.filter((b) => baseAllowed(b, ctx.unlocks) && !b.legendary && b.tier === 1);
  // favor bases from the current depth's tier
  const base = rng.weighted(pool, (b) => (b.tier === ctx.depth ? 3 : 1));
  return makeItem(rng, base.id, rarity, ctx.depth);
}

export function makeItem(rng: Rng, baseId: string, rarity: Rarity, depth: number): ItemInst {
  const base = ITEMS[baseId];
  const inst: ItemInst = { uid: newUid(), baseId, rarity, plus: 0, affixes: [], ilvl: depth, isNew: true };
  const n = RARITY_AFFIXES[rarity];
  for (let i = 0; i < n; i++) {
    const a = rollAffix(rng, base.slot, rarity, depth, inst.affixes);
    if (a) inst.affixes.push(a);
  }
  return inst;
}

export function rollAffix(rng: Rng, slot: Slot, rarity: Rarity, depth: number, existing: AffixRoll[], exclude?: string): AffixRoll | null {
  const hasProc = existing.some((e) => AFFIX_BY_ID[e.id]?.proc);
  const pool = AFFIXES.filter((a) => a.slots.includes(slot) && !existing.some((e) => e.id === a.id) && a.id !== exclude && (!a.minRarity || rarityIndex(rarity) >= rarityIndex(a.minRarity)) && !(a.proc && hasProc));
  if (!pool.length) return null;
  const def = rng.weighted(pool, (a) => a.weight * (a.proc ? 2 : 1));
  let value = def.base * TIER_MULT[Math.min(4, depth)] * rng.range(0.7, 1.0) * RARITY_MULT[rarity];
  if (def.stat === 'parryWindow' || def.stat === 'mpOnHit' || def.stat === 'mpRegen') value = def.base * rng.range(0.8, 1.2) * (1 + (depth - 1) * 0.5);
  if (def.intRound) value = Math.max(1, Math.round(value));
  else value = Math.round(value * 1000) / 1000;
  return { id: def.id, value };
}

/** Full tooltip lines for an item (used by inventory/shop/forge UIs). */
export function describeItem(i: ItemInst): { title: string; color: string; lines: { text: string; color?: string }[] } {
  const b = baseOf(i);
  const lines: { text: string; color?: string }[] = [];
  lines.push({ text: `${i.rarity.toUpperCase()} ${b.slot.toUpperCase()}${b.cls ? ' · ' + b.cls.toUpperCase() : ''} · Tier ${b.tier}`, color: '#a8a0b8' });
  for (const l of statLines(itemStats({ ...i, affixes: [] }))) lines.push({ text: l, color: '#e8e0d0' });
  for (const a of i.affixes) lines.push({ text: '◆ ' + affixText(a), color: AFFIX_BY_ID[a.id]?.proc ? '#ffb86a' : '#9fd0ff' });
  lines.push({ text: `Passive — ${b.passive.name}: ${b.passive.text}`, color: '#ffd27a' });
  if (b.shield) lines.push({ text: `Guard ${Math.round(b.shield.guardPct * 100)}% · Parry ${b.shield.parryBonus >= 0 ? '+' : ''}${b.shield.parryBonus}f · Guard move ${Math.round(b.shield.guardMove * 100)}%`, color: '#c8d8e8' });
  lines.push({ text: b.flavor, color: '#8a8098' });
  return { title: itemName(i), color: '', lines };
}

export function sumStats(items: ItemInst[]): Stats {
  const s = emptyStats();
  for (const i of items) addStats(s, itemStats(i));
  return s;
}
