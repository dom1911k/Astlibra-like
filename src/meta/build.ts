import { ITEMS, type ItemInst } from '../data/items';
import { MOVESETS } from '../data/movesets';
import { CURSES, RELICS } from '../data/relics';
import { BOARD } from '../data/starboard';
import type { Loadout } from '../sim/loadout';
import { BASE_PLAYER, addStats, emptyStats, type Stats } from '../sim/stats';
import type { ProcDef } from '../sim/types';
import { baseOf, itemProcs, itemStats } from './items';
import { masteryLevel } from './mastery';
import { EQUIP_SLOTS, findItem, passiveSlots, type EquipSlot, type Profile } from './profile';
import type { RunState } from './run';

export interface BuildBreakdown {
  loadout: Loadout;
  equipped: Partial<Record<EquipSlot, ItemInst>>;
  activePassives: string[]; // passive names active
}

export function levelStats(level: number): Partial<Stats> {
  const l = level - 1;
  return { maxHp: l * 8, atk: l * 1.3, magic: l * 1.3, def: l * 0.7, maxMp: l * 2 };
}

/** Aggregate every stat/proc source into the simulation loadout. Deterministic & pure. */
export function buildLoadout(p: Profile, r: RunState | null, override?: Partial<Record<EquipSlot, string | null>>): BuildBreakdown {
  const s = addStats(emptyStats(), BASE_PLAYER);
  const procs: ProcDef[] = [];
  const active: string[] = [];
  const equippedUids = { ...(r ? r.equipped : p.equipped), ...(override ?? {}) };
  const equipped: Partial<Record<EquipSlot, ItemInst>> = {};
  const extra = r?.items ?? [];
  const passiveIds = new Set<string>();
  for (const slot of EQUIP_SLOTS) {
    const it = findItem(p, equippedUids[slot], extra);
    if (!it) continue;
    equipped[slot] = it;
    addStats(s, itemStats(it));
    procs.push(...itemProcs(it));
    const b = baseOf(it);
    if (!passiveIds.has(b.passive.id)) {
      passiveIds.add(b.passive.id);
      addStats(s, b.passive.stats);
      if (b.passive.procs) procs.push(...b.passive.procs);
      active.push(b.passive.name);
    }
  }
  // learned passives slotted (mastery 3+)
  const slots = passiveSlots(p);
  for (const baseId of p.slotted.slice(0, slots)) {
    const b = ITEMS[baseId];
    if (!b || masteryLevel(p.mastery[baseId] ?? 0) < 3 || passiveIds.has(b.passive.id)) continue;
    passiveIds.add(b.passive.id);
    addStats(s, b.passive.stats);
    if (b.passive.procs) procs.push(...b.passive.procs);
    active.push(b.passive.name + ' (learned)');
  }
  // weapon mastery: +4% damage per mastery level of the equipped weapon
  const weapon = equipped.weapon;
  if (weapon) s.dmgPct += 0.04 * masteryLevel(p.mastery[weapon.baseId] ?? 0);
  // starboard
  for (const id of p.board) addStats(s, BOARD[id]?.stats);
  // run-temporary
  if (r) {
    addStats(s, levelStats(r.level));
    for (const id of r.relics) {
      const rel = RELICS[id];
      if (!rel) continue;
      addStats(s, rel.stats);
      if (rel.procs) procs.push(...rel.procs);
    }
    for (const id of r.curses) addStats(s, CURSES.find((c) => c.id === id)?.stats);
  }
  const wb = weapon ? baseOf(weapon) : null;
  const cls = wb?.cls ?? 'fang';
  const shield = equipped.shield ? baseOf(equipped.shield).shield ?? null : null;
  const armor = equipped.armor ? baseOf(equipped.armor).id : '';
  const armorColor = armor === 'miners_plate' || armor === 'cinderforged_mail' ? '#6a6470' : armor === 'ashweave_robe' ? '#5a4a6a' : armor === 'mothsilk_mantle' || armor === 'moth_veil' ? '#7a6a8e' : armor === 'starwoven_raiment' ? '#5a6aa8' : armor === 'bloodbound_harness' ? '#6a3438' : '#4a5a6a';
  const loadout: Loadout = {
    stats: s,
    procs,
    weaponCls: cls,
    weaponBaseId: wb?.id ?? 'twin_fangs',
    weaponColor: weapon ? weaponColor(weapon) : MOVESETS.fang.color,
    shield,
    armorColor,
    spells: [...p.spells],
  };
  return { loadout, equipped, activePassives: active };
}

function weaponColor(i: ItemInst): string {
  const b = baseOf(i);
  if (b.legendary) return '#ffd27a';
  if ((b.stats.fireConv ?? 0) > 0) return '#ffb080';
  if ((b.stats.shockConv ?? 0) > 0) return '#fff0a0';
  if ((b.stats.frostConv ?? 0) > 0) return '#b0f0ff';
  return MOVESETS[b.cls!].color;
}
