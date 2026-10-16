import type { StatMods } from '../sim/stats';
import type { ProcDef } from '../sim/types';
import type { Rarity } from './items';

/** Relics are temporary (one expedition). They are the main source of in-run build shaping. */
export interface RelicDef {
  id: string;
  name: string;
  text: string;
  rarity: Rarity;
  stats?: StatMods;
  procs?: ProcDef[];
  tags: string[]; // archetype tags used to bias offers towards builds the player already has
  unlock?: string;
}

const R: RelicDef[] = [
  // common
  { id: 'whetstone', name: 'Whetstone', rarity: 'common', text: '+12% Attack.', stats: { atkPct: 0.12 }, tags: ['dmg'] },
  { id: 'tallow', name: 'Tallow Candle', rarity: 'common', text: '+25 Max HP.', stats: { maxHp: 25 }, tags: ['sustain'] },
  { id: 'iron_nail', name: 'Iron Nail', rarity: 'common', text: '+4 Defense, 20% retaliation damage.', stats: { def: 4, thorns: 0.2 }, tags: ['counter'] },
  { id: 'spark_jar', name: 'Spark Jar', rarity: 'common', text: 'Hits add 10% shock damage.', stats: { shockConv: 0.1 }, tags: ['shock', 'elemental'] },
  { id: 'coal_lump', name: 'Lump of Coal', rarity: 'common', text: 'Hits add 10% fire damage.', stats: { fireConv: 0.1 }, tags: ['fire', 'elemental'] },
  { id: 'rime_chip', name: 'Rime Chip', rarity: 'common', text: 'Hits add 10% frost damage.', stats: { frostConv: 0.1 }, tags: ['frost', 'elemental'] },
  { id: 'sweet_oil', name: 'Sweet Oil', rarity: 'common', text: '+1 Lamp Oil charge, +15% healing.', stats: { potions: 1, potionPower: 0.15 }, tags: ['sustain'] },
  { id: 'quick_cord', name: 'Quick Cord', rarity: 'common', text: '+8% Attack Speed.', stats: { atkSpeed: 0.08 }, tags: ['combo'] },
  { id: 'leather_wrap', name: 'Leather Grip', rarity: 'common', text: '+5% Crit Chance.', stats: { critChance: 0.05 }, tags: ['crit'] },
  { id: 'moth_wing', name: 'Moth Wing', rarity: 'common', text: '+25% Aerial damage.', stats: { airPct: 0.25 }, tags: ['air'] },
  { id: 'aether_drop', name: 'Aether Drop', rarity: 'common', text: '+20 Max Aether, +1 Aether on hit.', stats: { maxMp: 20, mpOnHit: 1 }, tags: ['caster'] },
  // uncommon
  { id: 'focus_lens', name: 'Lens of Focus', rarity: 'uncommon', text: '+35% Crit Damage.', stats: { critDmg: 0.35 }, tags: ['crit'] },
  { id: 'pilgrim_boots', name: 'Pilgrim Boots', rarity: 'uncommon', text: '+12% Move Speed, +3 dodge i-frames.', stats: { moveSpeed: 0.12, iframes: 3 }, tags: ['mobility'] },
  { id: 'blood_chalice', name: 'Blood Chalice', rarity: 'uncommon', text: '3% Life Steal.', stats: { lifesteal: 0.03 }, tags: ['sustain'] },
  { id: 'sand_glass', name: 'Sandglass', rarity: 'uncommon', text: '+20% Cooldown Recovery.', stats: { cdr: 0.2 }, tags: ['caster'] },
  { id: 'warhorn', name: 'Warhorn', rarity: 'uncommon', text: 'Kills grant +12% damage for 5s (stacks 3x).', procs: [{ trigger: 'kill', action: { type: 'buff', id: 'warhorn', name: 'Warhorn', stats: { dmgPct: 0.12 }, dur: 300, maxStacks: 3 } }], tags: ['dmg'] },
  { id: 'echo_shard', name: 'Echo Shard', rarity: 'uncommon', text: 'Every 10 combo hits restore 4 Aether.', procs: [{ trigger: 'combo', every: 10, action: { type: 'mp', amount: 4 } }], tags: ['combo', 'caster'] },
  { id: 'tinder_box', name: 'Tinderbox', rarity: 'uncommon', text: '+25% damage to afflicted foes.', stats: { dmgVsAfflicted: 0.25 }, tags: ['elemental'] },
  { id: 'bellows', name: 'Forge Bellows', rarity: 'uncommon', text: '+30% Heavy Attack damage, +20% Stagger Power.', stats: { heavyPct: 0.3, poiseDmg: 0.2 }, tags: ['heavy'] },
  { id: 'cracked_lantern', name: 'Cracked Lantern', rarity: 'uncommon', text: '+40% damage while below 50% HP.', stats: { lowHpDmg: 0.4 }, tags: ['glass'] },
  { id: 'catalyst', name: 'Catalyst Vial', rarity: 'uncommon', text: '+40% Status Buildup.', stats: { statusPower: 0.4 }, tags: ['elemental'] },
  // rare
  { id: 'prism', name: 'Prism of Ignition', rarity: 'rare', text: 'Crits detonate a fire burst (0.6x).', procs: [{ trigger: 'crit', icd: 6, action: { type: 'explode', element: 'fire', motion: 0.6, radius: 30, status: { type: 'burn', amount: 20 } } }], tags: ['crit', 'fire'] },
  { id: 'stormglass', name: 'Stormglass', rarity: 'rare', text: '15% of hits arc lightning to 3 foes.', procs: [{ trigger: 'hit', chance: 0.15, icd: 6, action: { type: 'chain', element: 'shock', motion: 0.45, jumps: 3, range: 90 } }], tags: ['shock'] },
  { id: 'grave_candle', name: 'Grave Candle', rarity: 'rare', text: 'Kills release 3 homing soul-bolts.', procs: [{ trigger: 'kill', action: { type: 'bolt', element: 'phys', motion: 0.55, count: 3, homing: true } }], tags: ['proc'] },
  { id: 'phantom_thread', name: 'Phantom Thread', rarity: 'rare', text: 'Dodging summons a spectral blade (max 4).', procs: [{ trigger: 'dodge', icd: 30, action: { type: 'blade', motion: 0.4, dur: 600, max: 4 } }], tags: ['proc', 'mobility'] },
  { id: 'duelist_ribbon', name: "Duelist's Ribbon", rarity: 'rare', text: '+80% Riposte damage. Parries heal 5%.', stats: { riposteDmg: 0.8 }, procs: [{ trigger: 'parry', action: { type: 'heal', pct: 0.05 } }], tags: ['counter'] },
  { id: 'metronome', name: 'Metronome', rarity: 'rare', text: '+5% damage per 10 combo (max 100 combo).', stats: { comboDmg: 0.05 }, tags: ['combo'] },
  { id: 'ember_heart', name: 'Ember Heart', rarity: 'rare', text: 'Burning foes explode on death, igniting neighbors.', procs: [{ trigger: 'kill', cond: 'targetBurning', action: { type: 'explode', element: 'fire', motion: 1.0, radius: 48, status: { type: 'burn', amount: 50 } } }], tags: ['fire'] },
  { id: 'glacier_core', name: 'Glacier Core', rarity: 'rare', text: 'Frozen foes take crits that shatter (1.2x frost burst).', procs: [{ trigger: 'hit', cond: 'targetFrozen', icd: 20, action: { type: 'explode', element: 'frost', motion: 1.2, radius: 36 } }], tags: ['frost'] },
  { id: 'vampire_sigil', name: 'Sanguine Sigil', rarity: 'rare', text: 'Finishers heal 4% Max HP and build Bleed.', procs: [{ trigger: 'finisher', action: { type: 'heal', pct: 0.04 } }, { trigger: 'finisher', action: { type: 'status', status: 'bleed', amount: 50 } }], tags: ['sustain', 'combo'] },
  { id: 'arcane_battery', name: 'Arcane Battery', rarity: 'rare', text: 'Spells deal +40% damage; casts restore a burst of Aether.', stats: { spellPct: 0.4 }, procs: [{ trigger: 'cast', action: { type: 'mp', amount: 6 } }], tags: ['caster'] },
  // legendary
  { id: 'crown_cinders', name: 'Crown of Cinders', rarity: 'legendary', text: 'Triggered effects deal +80% damage. Crits trigger a fire burst.', stats: { procPct: 0.8 }, procs: [{ trigger: 'crit', icd: 8, action: { type: 'explode', element: 'fire', motion: 0.5, radius: 28 } }], tags: ['proc', 'crit'] },
  { id: 'second_lantern', name: 'The Second Lantern', rarity: 'legendary', text: '+1 mid-air jump and an air dash. +25% Aerial damage.', stats: { airJumps: 1, airDash: 1, airPct: 0.25 }, tags: ['air', 'mobility'] },
  { id: 'hydra_coil', name: 'Hydra Coil', rarity: 'legendary', text: 'Every hit has 18% chance to fire 2 homing bolts.', procs: [{ trigger: 'hit', chance: 0.18, icd: 4, action: { type: 'bolt', element: 'shock', motion: 0.45, count: 2, homing: true } }], tags: ['proc'] },
  { id: 'gilded_glass', name: 'Gilded Glass', rarity: 'legendary', text: '+80% damage. You take +50% damage.', stats: { dmgPct: 0.8, dmgTaken: 0.5 }, tags: ['glass'] },
  { id: 'eternal_wick', name: 'Eternal Wick', rarity: 'legendary', text: 'Arts cost 40% less. Arts trigger a lightning nova.', stats: { artCost: -0.4 }, procs: [{ trigger: 'art', action: { type: 'nova', element: 'shock', motion: 1.5, radius: 70 } }], tags: ['caster'] },
];

export const RELICS: Record<string, RelicDef> = Object.fromEntries(R.map((r) => [r.id, r]));
export const RELIC_LIST = R;

/** Curses imposed by shrine vows (temporary for the run). */
export interface CurseDef {
  id: string;
  name: string;
  text: string;
  stats: StatMods;
}
export const CURSES: CurseDef[] = [
  { id: 'frailty', name: 'Frailty', text: 'Take 20% more damage.', stats: { dmgTaken: 0.2 } },
  { id: 'dim_lamp', name: 'Dim Lamp', text: '-1 Lamp Oil charge.', stats: { potions: -1 } },
  { id: 'leaden', name: 'Leaden Limbs', text: '-10% Move and Attack Speed.', stats: { moveSpeed: -0.1, atkSpeed: -0.1 } },
  { id: 'brittle', name: 'Brittle Bones', text: '-25 Max HP.', stats: { maxHp: -25 } },
  { id: 'thin_aether', name: 'Thin Aether', text: '-25 Max Aether.', stats: { maxMp: -25 } },
];
