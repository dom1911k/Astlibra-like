import { Rng } from '../core/rng';
import type { ItemInst, Rarity } from '../data/items';
import { CURSES, RELIC_LIST, RELICS, type RelicDef } from '../data/relics';
import { DIFFICULTIES, EQUIP_SLOTS, unlocks, type EquipSlot, type Profile } from './profile';
import { generateMap, type ExpMap } from './expedition';
import { rarityIndex, rollItem } from './items';

export interface RunStats {
  kills: number;
  elites: number;
  bosses: string[];
  itemsFound: number;
  rooms: number;
  time: number; // seconds
  dmgDealt: number;
  dmgTaken: number;
  maxHit: number;
  maxCombo: number;
  mastery: Record<string, number>;
  cinders: number;
  parries: number;
  perfectDodges: number;
  levelUps: number;
  relicsFound: number;
}

export interface RunState {
  seed: number;
  depth: number;
  difficulty: number;
  map: ExpMap;
  node: string;
  visited: string[];
  level: number;
  xp: number;
  relics: string[];
  curses: string[];
  gilt: number;
  slag: number;
  starglass: number;
  echoes: number;
  items: ItemInst[]; // unbanked equipment found this run
  equipped: Record<EquipSlot, string | null>;
  hp: number; // fraction of max carried between rooms
  mp: number;
  potions: number;
  pendingChoices: number; // relic choices owed from level-ups
  stats: RunStats;
  roomCleared: boolean;
  bankedThisRun: { items: number; gilt: number };
  freeForge: boolean;
}

export function xpForLevel(level: number): number {
  return Math.round(24 * Math.pow(level, 1.45));
}

export function startRun(p: Profile, seed: number): RunState {
  const reveal = unlocks(p).has('map_reveal');
  const map = generateMap(seed, 1, { reveal, difficulty: p.difficulty });
  const u = unlocks(p);
  return {
    seed, depth: 1, difficulty: p.difficulty, map, node: map.start, visited: [map.start], level: 1, xp: 0, relics: [], curses: [],
    gilt: u.has('start_gilt') ? 40 : 0, slag: 0, starglass: 0, echoes: 0, items: [], equipped: { ...p.equipped }, hp: 1, mp: 0.5, potions: -1,
    pendingChoices: 0, roomCleared: false, bankedThisRun: { items: 0, gilt: 0 }, freeForge: true,
    stats: { kills: 0, elites: 0, bosses: [], itemsFound: 0, rooms: 0, time: 0, dmgDealt: 0, dmgTaken: 0, maxHit: 0, maxCombo: 0, mastery: {}, cinders: 0, parries: 0, perfectDodges: 0, levelUps: 0, relicsFound: 0 },
  };
}

export function nextDepth(p: Profile, r: RunState): void {
  r.depth++;
  const reveal = unlocks(p).has('map_reveal');
  r.map = generateMap(r.seed + r.depth * 1000, r.depth, { reveal, difficulty: r.difficulty });
  r.node = r.map.start;
  r.visited = [r.map.start];
  r.freeForge = true;
}

/** Gain run XP; returns number of levels gained. Every 2nd level owes a relic choice. */
export function gainXp(r: RunState, amount: number): number {
  r.xp += amount;
  let n = 0;
  while (r.xp >= xpForLevel(r.level)) {
    r.xp -= xpForLevel(r.level);
    r.level++;
    n++;
    r.stats.levelUps++;
    if (r.level % 2 === 0) r.pendingChoices++;
  }
  return n;
}

/** Relic offers biased toward tags the player already has (build coherence), excluding owned. */
export function relicOffers(rng: Rng, r: RunState, count: number, minRarity: Rarity = 'common', maxRarity: Rarity = 'legendary'): RelicDef[] {
  const owned = new Set(r.relics);
  const tagCount: Record<string, number> = {};
  for (const id of r.relics) for (const t of RELICS[id]?.tags ?? []) tagCount[t] = (tagCount[t] ?? 0) + 1;
  const rw: Record<Rarity, number> = { common: 50, uncommon: 32, rare: 14 + r.depth * 4, epic: 0, legendary: 2 + r.depth * 1.5 };
  const pool = RELIC_LIST.filter((x) => !owned.has(x.id) && rarityIndex(x.rarity) >= rarityIndex(minRarity) && rarityIndex(x.rarity) <= rarityIndex(maxRarity));
  const out: RelicDef[] = [];
  const avail = [...pool];
  while (out.length < count && avail.length) {
    const pick = rng.weighted(avail, (x) => rw[x.rarity] * (1 + x.tags.reduce((s, t) => s + (tagCount[t] ?? 0) * 0.6, 0)));
    out.push(pick);
    avail.splice(avail.indexOf(pick), 1);
  }
  return out;
}

export function lootCtx(p: Profile, r: RunState, luck: number, minRarity?: Rarity) {
  return { depth: r.depth, luck: luck + DIFFICULTIES[r.difficulty].loot, unlocks: unlocks(p), minRarity };
}

export function dropItem(p: Profile, r: RunState, rng: Rng, luck: number, minRarity?: Rarity): ItemInst {
  const it = rollItem(rng, lootCtx(p, r, luck, minRarity));
  return it;
}

/** Move all unbanked run gains into the permanent profile (checkpoint / extraction). */
export function bankRun(p: Profile, r: RunState): { items: number; gilt: number } {
  const res = { items: r.items.length, gilt: r.gilt };
  p.stash.push(...r.items);
  for (const i of r.items) if (!p.codex.items.includes(i.baseId)) p.codex.items.push(i.baseId);
  r.items = [];
  p.gilt += r.gilt;
  r.gilt = 0;
  p.slag += r.slag;
  p.starglass += r.starglass;
  p.echoes += r.echoes;
  r.slag = r.starglass = r.echoes = 0;
  // run-equipped items are now in the stash: carry equipment choices over permanently
  for (const s of EQUIP_SLOTS) p.equipped[s] = r.equipped[s];
  r.bankedThisRun.items += res.items;
  r.bankedThisRun.gilt += res.gilt;
  return res;
}

export interface DeathOutcome {
  salvaged: ItemInst | null;
  lostItems: number;
  giltLost: number;
  slagKept: number;
  starglassKept: number;
  echoesKept: number;
}

/**
 * Death rules: Cinders & mastery were already saved as earned. Equipment you brought is never lost.
 * Unbanked finds are lost except the single best one (salvaged). Half of unbanked Gilt/materials kept.
 * Ember V: nothing unbanked is kept.
 */
export function resolveDeath(p: Profile, r: RunState): DeathOutcome {
  const harsh = r.difficulty >= 4;
  let salvaged: ItemInst | null = null;
  if (!harsh && r.items.length) {
    salvaged = [...r.items].sort((a, b) => rarityIndex(b.rarity) - rarityIndex(a.rarity) || b.plus - a.plus)[0];
    p.stash.push(salvaged);
  }
  const keep = harsh ? 0 : 0.5;
  const out: DeathOutcome = {
    salvaged, lostItems: r.items.length - (salvaged ? 1 : 0), giltLost: Math.ceil(r.gilt * (1 - keep)),
    slagKept: Math.floor(r.slag * keep), starglassKept: Math.floor(r.starglass * keep), echoesKept: Math.floor(r.echoes * keep),
  };
  p.gilt += Math.floor(r.gilt * keep);
  p.slag += out.slagKept;
  p.starglass += out.starglassKept;
  p.echoes += out.echoesKept;
  // equipment: keep profile equipment for slots whose run item was lost
  for (const s of EQUIP_SLOTS) {
    const uid = r.equipped[s];
    if (uid && p.stash.some((i) => i.uid === uid)) p.equipped[s] = uid;
  }
  r.items = [];
  return out;
}

export function addCurse(r: RunState, rng: Rng): string {
  const avail = CURSES.filter((c) => !r.curses.includes(c.id));
  const c = rng.pick(avail.length ? avail : CURSES);
  r.curses.push(c.id);
  return c.id;
}

/** Cinders earned for an event, scaled by difficulty. */
export function cinderReward(kind: 'kill' | 'elite' | 'boss' | 'lore' | 'secret' | 'depth', depth: number, diff: number): number {
  const mult = 1 + diff * 0.35 + (diff >= 3 ? 0.6 : 0);
  const base = { kill: 0.35, elite: 4, boss: 25, lore: 6, secret: 14, depth: 10 }[kind];
  return Math.max(kind === 'kill' ? 0 : 1, Math.round(base * (1 + (depth - 1) * 0.6) * mult * 100) / 100);
}
