import { DEFAULT_SETTINGS, type Settings } from '../core/settings';
import type { ItemInst } from '../data/items';
import type { WeaponClass } from '../data/movesets';
import { BOARD } from '../data/starboard';
import { newUid } from './items';
import type { RunState } from './run';

export type EquipSlot = 'weapon' | 'shield' | 'armor' | 'charm1' | 'charm2';
export const EQUIP_SLOTS: EquipSlot[] = ['weapon', 'shield', 'armor', 'charm1', 'charm2'];

export interface Records {
  runs: number;
  deaths: number;
  extractions: number;
  victories: number;
  bestDepth: number;
  bossKills: Record<string, number>;
  maxHit: number;
  maxCombo: number;
  totalKills: number;
  cindersEarned: number;
  fastestVictory: number; // seconds
}

export interface Profile {
  version: number;
  created: number;
  cinders: number;
  gilt: number;
  slag: number;
  starglass: number;
  echoes: number;
  board: string[];
  stash: ItemInst[];
  equipped: Record<EquipSlot, string | null>;
  mastery: Record<string, number>;
  slotted: string[]; // baseIds whose learned passive is slotted
  spells: (string | null)[];
  recipes: string[];
  codex: { enemies: Record<string, number>; items: string[]; relics: string[]; lore: string[] };
  records: Records;
  difficultyUnlocked: number;
  difficulty: number;
  startClass: WeaponClass;
  settings: Settings;
  run: RunState | null;
  flags: Record<string, boolean>;
}

export const SAVE_VERSION = 1;

export function newProfile(): Profile {
  const fangs: ItemInst = { uid: newUid(), baseId: 'twin_fangs', rarity: 'common', plus: 0, affixes: [], ilvl: 1 };
  const maul: ItemInst = { uid: newUid(), baseId: 'mining_maul', rarity: 'common', plus: 0, affixes: [], ilvl: 1 };
  const coat: ItemInst = { uid: newUid(), baseId: 'delvers_coat', rarity: 'common', plus: 0, affixes: [], ilvl: 1 };
  const buckler: ItemInst = { uid: newUid(), baseId: 'tin_buckler', rarity: 'common', plus: 0, affixes: [], ilvl: 1 };
  return {
    version: SAVE_VERSION,
    created: Date.now(),
    cinders: 0,
    gilt: 0,
    slag: 0,
    starglass: 0,
    echoes: 0,
    board: ['core'],
    stash: [fangs, maul, coat, buckler],
    equipped: { weapon: fangs.uid, shield: buckler.uid, armor: coat.uid, charm1: null, charm2: null },
    mastery: {},
    slotted: [],
    spells: [null, null],
    recipes: [],
    codex: { enemies: {}, items: ['twin_fangs', 'mining_maul', 'delvers_coat', 'tin_buckler'], relics: [], lore: [] },
    records: { runs: 0, deaths: 0, extractions: 0, victories: 0, bestDepth: 0, bossKills: {}, maxHit: 0, maxCombo: 0, totalKills: 0, cindersEarned: 0, fastestVictory: 0 },
    difficultyUnlocked: 0,
    difficulty: 0,
    startClass: 'fang',
    settings: { ...DEFAULT_SETTINGS },
    run: null,
    flags: {},
  };
}

export function unlocks(p: Profile): Set<string> {
  const s = new Set<string>();
  for (const id of p.board) {
    const n = BOARD[id];
    if (n?.unlock) s.add(n.unlock);
  }
  return s;
}

export function passiveSlots(p: Profile): number {
  return 2 + p.board.filter((id) => BOARD[id]?.unlock === 'passive_slot').length;
}

export function unlockedSpells(p: Profile): string[] {
  const u = unlocks(p);
  return ['ember_lance', 'arc_nova', 'frost_ward', 'phantom_edge', 'blood_pact', 'gale_step'].filter((s) => u.has('spell_' + s));
}

export function findItem(p: Profile, uid: string | null, extra: ItemInst[] = []): ItemInst | null {
  if (!uid) return null;
  return p.stash.find((i) => i.uid === uid) ?? extra.find((i) => i.uid === uid) ?? null;
}

/** Board purchase rules: node must be adjacent to an owned node. */
export function canBuyNode(p: Profile, id: string): boolean {
  const n = BOARD[id];
  if (!n || p.board.includes(id)) return false;
  if (p.cinders < n.cost) return false;
  return n.links.some((l) => p.board.includes(l));
}

export function respec(p: Profile): number {
  let refund = 0;
  for (const id of p.board) refund += BOARD[id]?.cost ?? 0;
  p.cinders += refund;
  p.board = ['core'];
  const slots = passiveSlots(p);
  p.slotted = p.slotted.slice(0, slots);
  const sp = unlockedSpells(p);
  p.spells = p.spells.map((s) => (s && sp.includes(s) ? s : null));
  return refund;
}

export const DIFFICULTIES = [
  { name: 'Ember I', hp: 1, atk: 1, loot: 0, text: 'The standard descent.' },
  { name: 'Ember II', hp: 1.3, atk: 1.25, loot: 0.15, text: 'Foes are tougher; elites appear more often. +15% loot rarity.' },
  { name: 'Ember III', hp: 1.7, atk: 1.5, loot: 0.3, text: 'Foes strike faster and hit harder. +30% loot rarity, extra Cinders.' },
  { name: 'Ember IV', hp: 2.2, atk: 1.8, loot: 0.5, text: 'Every room has an elite. +50% loot rarity, double Cinders.' },
  { name: 'Ember V', hp: 3, atk: 2.2, loot: 0.8, text: 'The true Cinderdeep. Lose all unbanked loot on death.' },
];
