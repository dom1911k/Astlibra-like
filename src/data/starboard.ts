import type { StatMods } from '../sim/stats';

/** Permanent progression board. Nodes are bought with Cinders; respec is free at the hub. */
export interface BoardNode {
  id: string;
  name: string;
  text: string;
  x: number;
  y: number;
  cost: number;
  links: string[]; // adjacent nodes (bidirectional)
  stats?: StatMods;
  unlock?: string;
  branch: 'core' | 'might' | 'finesse' | 'arcana' | 'bulwark' | 'fortune';
  keystone?: boolean;
}

const N: BoardNode[] = [
  { id: 'core', name: 'Lantern Core', text: 'Your lantern. Everything grows from here.', x: 0, y: 0, cost: 0, links: ['m1', 'f1', 'a1', 'b1', 'g1'], branch: 'core' },
  // Might (up)
  { id: 'm1', name: 'Tempered Arm', text: '+3 Attack.', x: 0, y: -1, cost: 8, links: ['m2', 'u_glaive'], stats: { atk: 3 }, branch: 'might' },
  { id: 'u_glaive', name: 'Glaive Drills', text: 'Unlock the Glaive weapon class (loot & starting choice).', x: -1, y: -1, cost: 10, links: [], unlock: 'unlock_glaive', branch: 'might' },
  { id: 'm2', name: 'Heavy Hands', text: '+15% Heavy Attack damage.', x: 0, y: -2, cost: 18, links: ['m3', 'm2b'], stats: { heavyPct: 0.15 }, branch: 'might' },
  { id: 'm2b', name: 'Breaker', text: '+20% Stagger Power.', x: -1, y: -2, cost: 22, links: ['m4b'], stats: { poiseDmg: 0.2 }, branch: 'might' },
  { id: 'm3', name: 'Whetted Edge', text: '+8% Attack.', x: 0, y: -3, cost: 30, links: ['m4', 'm4b'], stats: { atkPct: 0.08 }, branch: 'might' },
  { id: 'm4b', name: 'Bell Founding', text: 'Unlock the Pendulum weapon class.', x: -1, y: -3, cost: 45, links: [], unlock: 'unlock_pendulum', branch: 'might' },
  { id: 'm4', name: 'Finisher Training', text: '+15% damage. Riposte +30%.', x: 0, y: -4, cost: 60, links: ['m5'], stats: { dmgPct: 0.15, riposteDmg: 0.3 }, branch: 'might' },
  { id: 'm5', name: 'KEYSTONE: Juggernaut', text: '+25% Attack, +30 Max HP, +30% Stagger Power.', x: 0, y: -5, cost: 140, links: [], stats: { atkPct: 0.25, maxHp: 30, poiseDmg: 0.3 }, branch: 'might', keystone: true },
  // Finesse (right-up)
  { id: 'f1', name: 'Light Feet', text: '+5% Move Speed.', x: 1, y: -1, cost: 8, links: ['f2'], stats: { moveSpeed: 0.05 }, branch: 'finesse' },
  { id: 'f2', name: 'Second Wind', text: 'Unlock the Double Jump.', x: 2, y: -1, cost: 15, links: ['f3', 'f2b'], stats: { airJumps: 1 }, branch: 'finesse' },
  { id: 'f2b', name: 'Keen Eye', text: '+5% Crit Chance.', x: 2, y: -2, cost: 20, links: ['f4b'], stats: { critChance: 0.05 }, branch: 'finesse' },
  { id: 'f3', name: 'Quickening', text: '+6% Attack Speed.', x: 3, y: -1, cost: 28, links: ['f4', 'f4b'], stats: { atkSpeed: 0.06 }, branch: 'finesse' },
  { id: 'f4b', name: 'Vital Strikes', text: '+30% Crit Damage.', x: 3, y: -2, cost: 40, links: ['f5'], stats: { critDmg: 0.3 }, branch: 'finesse' },
  { id: 'f4', name: 'Skyrunner', text: 'Unlock the Air Dash. +10% Aerial damage.', x: 4, y: -1, cost: 45, links: ['f5'], stats: { airDash: 1, airPct: 0.1 }, branch: 'finesse' },
  { id: 'f5', name: 'KEYSTONE: Thousand Cuts', text: '+10% Crit Chance, +10% Attack Speed, +3 dodge i-frames.', x: 4, y: -2, cost: 140, links: [], stats: { critChance: 0.1, atkSpeed: 0.1, iframes: 3 }, branch: 'finesse', keystone: true },
  // Arcana (right-down)
  { id: 'a1', name: 'Kindled Mind', text: '+3 Magic, +10 Max Aether.', x: 1, y: 1, cost: 8, links: ['a2', 'u_rod'], stats: { magic: 3, maxMp: 10 }, branch: 'arcana' },
  { id: 'u_rod', name: 'Lumen Studies', text: 'Unlock the Lumen Rod weapon class.', x: 1, y: 2, cost: 12, links: ['s_frost'], unlock: 'unlock_rod', branch: 'arcana' },
  { id: 'a2', name: 'Spell: Ember Lance', text: 'Learn the Ember Lance spell.', x: 2, y: 1, cost: 15, links: ['a3', 's_nova'], unlock: 'spell_ember_lance', branch: 'arcana' },
  { id: 's_nova', name: 'Spell: Arc Nova', text: 'Learn the Arc Nova spell.', x: 2, y: 2, cost: 25, links: ['s_blades'], unlock: 'spell_arc_nova', branch: 'arcana' },
  { id: 's_frost', name: 'Spell: Frost Ward', text: 'Learn the Frost Ward spell.', x: 1, y: 3, cost: 25, links: ['s_gale'], unlock: 'spell_frost_ward', branch: 'arcana' },
  { id: 's_gale', name: 'Spell: Gale Step', text: 'Learn the Gale Step spell.', x: 2, y: 3, cost: 30, links: [], unlock: 'spell_gale_step', branch: 'arcana' },
  { id: 's_blades', name: 'Spell: Phantom Edge', text: 'Learn the Phantom Edge spell.', x: 3, y: 2, cost: 40, links: ['a5'], unlock: 'spell_phantom_edge', branch: 'arcana' },
  { id: 'a3', name: 'Elemental Affinity', text: '+15% Fire, Shock and Frost damage; +15% Status Buildup.', x: 3, y: 1, cost: 30, links: ['a4'], stats: { firePct: 0.15, shockPct: 0.15, frostPct: 0.15, statusPower: 0.15 }, branch: 'arcana' },
  { id: 'a4', name: 'Spell: Blood Pact', text: 'Learn the Blood Pact spell.', x: 4, y: 1, cost: 40, links: ['a5'], unlock: 'spell_blood_pact', branch: 'arcana' },
  { id: 'a5', name: 'KEYSTONE: Starcaller', text: '+30% Spell & Art damage, +20% Cooldown Recovery, +2 Aether Regen.', x: 4, y: 2, cost: 140, links: [], stats: { spellPct: 0.3, artPct: 0.3, cdr: 0.2, mpRegen: 2 }, branch: 'arcana', keystone: true },
  // Bulwark (left)
  { id: 'b1', name: 'Thick Hide', text: '+20 Max HP.', x: -1, y: 0, cost: 8, links: ['b2'], stats: { maxHp: 20 }, branch: 'bulwark' },
  { id: 'b2', name: 'Steady Guard', text: '+10% Guard reduction, +2 parry frames.', x: -2, y: 0, cost: 15, links: ['b3', 'b2b'], stats: { guardPct: 0.1, parryWindow: 2 }, branch: 'bulwark' },
  { id: 'b2b', name: 'Deep Flask', text: '+1 Lamp Oil charge.', x: -2, y: 1, cost: 20, links: ['b4b'], stats: { potions: 1 }, branch: 'bulwark' },
  { id: 'b3', name: 'Stoneskin', text: '+5 Defense.', x: -3, y: 0, cost: 28, links: ['b4', 'b4b'], stats: { def: 5 }, branch: 'bulwark' },
  { id: 'b4b', name: 'Bloodletting', text: '+2% Life Steal, +5 HP on kill.', x: -3, y: 1, cost: 40, links: ['b5'], stats: { lifesteal: 0.02, lifeOnKill: 5 }, branch: 'bulwark' },
  { id: 'b4', name: 'Unbroken', text: '+40 Max HP, take 6% less damage.', x: -4, y: 0, cost: 50, links: ['b5'], stats: { maxHp: 40, dmgTaken: -0.06 }, branch: 'bulwark' },
  { id: 'b5', name: 'KEYSTONE: Last Light', text: '+60 Max HP, +30% Lamp Oil healing, +60% Riposte damage.', x: -4, y: 1, cost: 140, links: [], stats: { maxHp: 60, potionPower: 0.3, riposteDmg: 0.6 }, branch: 'bulwark', keystone: true },
  // Fortune (down)
  { id: 'g1', name: 'Pocket Change', text: 'Start each expedition with 40 Gilt.', x: 0, y: 1, cost: 8, links: ['g2', 'p1'], unlock: 'start_gilt', branch: 'fortune' },
  { id: 'p1', name: 'Learned Memory', text: '+1 Learned Passive slot.', x: -1, y: 2, cost: 15, links: ['p2'], unlock: 'passive_slot', branch: 'fortune' },
  { id: 'g2', name: 'Keen Prospector', text: '+15% Gilt find, +10% Loot Rarity.', x: 0, y: 2, cost: 18, links: ['g3'], stats: { goldFind: 0.15, lootLuck: 0.1 }, branch: 'fortune' },
  { id: 'fr', name: 'Reforging', text: 'Unlock affix rerolling at the Forge.', x: 1, y: 4, cost: 25, links: ['fe'], unlock: 'forge_reroll', branch: 'fortune' },
  { id: 'fe', name: 'Starforging', text: 'Unlock Evolution of mastered gear at the Forge.', x: 2, y: 4, cost: 50, links: [], unlock: 'forge_evolve', branch: 'fortune' },
  { id: 'g3', name: 'Relic Hunter', text: 'Begin each expedition by choosing 1 of 3 relics.', x: 0, y: 3, cost: 35, links: ['g4', 'p2', 'fr'], unlock: 'start_relic', branch: 'fortune' },
  { id: 'p2', name: 'Deep Memory', text: '+1 Learned Passive slot.', x: -1, y: 3, cost: 40, links: ['p3'], unlock: 'passive_slot', branch: 'fortune' },
  { id: 'p3', name: 'Total Recall', text: '+1 Learned Passive slot.', x: -1, y: 4, cost: 80, links: [], unlock: 'passive_slot', branch: 'fortune' },
  { id: 'g4', name: 'Cartographer', text: 'Reveal secret rooms on the expedition map; +10% Run XP.', x: 0, y: 4, cost: 45, links: ['g5'], unlock: 'map_reveal', stats: { xpGain: 0.1 }, branch: 'fortune' },
  { id: 'g5', name: 'KEYSTONE: Treasure Sense', text: '+25% Loot Rarity, +30% Gilt find, +20% Run XP.', x: 0, y: 5, cost: 120, links: [], stats: { lootLuck: 0.25, goldFind: 0.3, xpGain: 0.2 }, branch: 'fortune', keystone: true },
];

// make links bidirectional
const byId: Record<string, BoardNode> = Object.fromEntries(N.map((n) => [n.id, n]));
for (const n of N) for (const l of n.links) if (byId[l] && !byId[l].links.includes(n.id)) byId[l].links.push(n.id);

export const BOARD: Record<string, BoardNode> = byId;
export const BOARD_LIST = N;
