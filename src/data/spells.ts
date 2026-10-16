import type { Element, ProjectileSpec } from '../sim/types';
import type { StatMods } from '../sim/stats';

export interface SpellDef {
  id: string;
  name: string;
  text: string;
  mp: number;
  cooldown: number; // ticks
  cast: number; // cast time ticks
  type: 'projectile' | 'nova' | 'ward' | 'blades' | 'buff' | 'blink';
  element: Element;
  color: string;
  projectile?: ProjectileSpec;
  nova?: { radius: number; motion: number; launch?: boolean };
  ward?: { pct: number; dur: number };
  blades?: { count: number; dur: number; motion: number };
  buff?: { stats: StatMods; dur: number; hpCost: number };
  blink?: { dist: number; motion: number };
}

export const SPELLS: Record<string, SpellDef> = {
  ember_lance: {
    id: 'ember_lance', name: 'Ember Lance', text: 'Hurl a piercing lance of fire that ignites foes.', mp: 12, cooldown: 45, cast: 6,
    type: 'projectile', element: 'fire', color: '#ff8a3d',
    projectile: { kind: 'shard', speed: 8, w: 24, h: 6, life: 45, motion: 1.6, pierce: 5, element: 'fire', status: { type: 'burn', amount: 45 }, offset: [10, -14] },
  },
  arc_nova: {
    id: 'arc_nova', name: 'Arc Nova', text: 'Discharge a ring of lightning around you that launches and shocks.', mp: 20, cooldown: 150, cast: 8,
    type: 'nova', element: 'shock', color: '#ffe86a', nova: { radius: 58, motion: 2.2, launch: true },
  },
  frost_ward: {
    id: 'frost_ward', name: 'Frost Ward', text: 'Gain a barrier worth 35% Max HP for 8s. Attackers are chilled.', mp: 22, cooldown: 600, cast: 6,
    type: 'ward', element: 'frost', color: '#8fe0ff', ward: { pct: 0.35, dur: 480 },
  },
  phantom_edge: {
    id: 'phantom_edge', name: 'Phantom Edge', text: 'Summon 3 orbiting spectral blades for 10s that cut anything they touch.', mp: 24, cooldown: 420, cast: 8,
    type: 'blades', element: 'phys', color: '#c7b8ff', blades: { count: 3, dur: 600, motion: 0.45 },
  },
  blood_pact: {
    id: 'blood_pact', name: 'Blood Pact', text: 'Sacrifice 15% current HP: +40% damage and +20% crit chance for 8s.', mp: 0, cooldown: 900, cast: 4,
    type: 'buff', element: 'phys', color: '#ff4060', buff: { stats: { dmgPct: 0.4, critChance: 0.2, lifesteal: 0.03 }, dur: 480, hpCost: 0.15 },
  },
  gale_step: {
    id: 'gale_step', name: 'Gale Step', text: 'Blink forward through enemies, shocking everything along the path. Invulnerable during.', mp: 10, cooldown: 90, cast: 2,
    type: 'blink', element: 'shock', color: '#a8fff0', blink: { dist: 90, motion: 1.2 },
  },
};
