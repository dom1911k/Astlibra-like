import type { ShieldProps } from '../data/items';
import type { WeaponClass } from '../data/movesets';
import { BASE_PLAYER, addStats, emptyStats, type Stats } from './stats';
import type { ProcDef } from './types';

/** Everything the simulation needs to know about the player's build. Built by the meta layer. */
export interface Loadout {
  stats: Stats;
  procs: ProcDef[];
  weaponCls: WeaponClass;
  weaponBaseId: string;
  weaponColor: string;
  shield: ShieldProps | null;
  armorColor: string;
  spells: (string | null)[];
}

export function defaultLoadout(cls: WeaponClass = 'fang'): Loadout {
  const s = addStats(emptyStats(), BASE_PLAYER);
  s.atk += 6;
  return { stats: s, procs: [], weaponCls: cls, weaponBaseId: 'twin_fangs', weaponColor: '#cfe3ff', shield: null, armorColor: '#6a5a8a', spells: [null, null] };
}
