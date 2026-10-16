import type { Box, Element, ProjectileSpec, StatusType } from '../sim/types';

export interface EnemyAttack {
  id: string;
  windup: number;
  active: number;
  recovery: number;
  hitbox?: Box;
  motion: number;
  kb: [number, number];
  range: [number, number]; // horizontal distance window to start this attack
  cooldown: number;
  move?: [number, number]; // velocity during active (facing-relative)
  windupMove?: [number, number];
  projectile?: ProjectileSpec;
  unblockable?: boolean; // red telegraph — must dodge
  status?: { type: StatusType; amount: number };
  special?: 'summon' | 'barrier' | 'explode' | 'blink' | 'guard';
  weight?: number;
}

export type AiKind = 'skitter' | 'knight' | 'spitter' | 'moth' | 'shepherd' | 'tick' | 'duelist' | 'dummy';

export interface EnemyDef {
  id: string;
  name: string;
  desc: string;
  role: string;
  ai: AiKind;
  hp: number;
  atk: number;
  def: number;
  poise: number;
  speed: number;
  w: number;
  h: number;
  flying?: boolean;
  heavy?: boolean; // cannot be launched
  frontGuard?: boolean; // blocks frontal light attacks while not staggered
  xp: number;
  gilt: number;
  color: string;
  accent: string;
  attacks: EnemyAttack[];
  resist?: Partial<Record<Element, number>>;
  aggro: number;
  minDepth: number;
  cost: number; // encounter budget cost
}

export const ENEMIES: Record<string, EnemyDef> = {
  dummy: {
    id: 'dummy', name: 'Straw Wick', desc: 'A training effigy stuffed with old lamp-wicks. Endlessly patient.', role: 'Training',
    ai: 'dummy', hp: 999999, atk: 0, def: 0, poise: 40, speed: 0, w: 14, h: 26, xp: 0, gilt: 0, color: '#b89a5e', accent: '#7a5a2e', attacks: [], aggro: 0, minDepth: 99, cost: 0,
  },
  gloomling: {
    id: 'gloomling', name: 'Gloomling', desc: 'A skittering knot of shadow and cinder-grit. Weak alone, dangerous in packs. Lunges when it smells lamplight.', role: 'Fast melee',
    ai: 'skitter', hp: 34, atk: 9, def: 2, poise: 8, speed: 1.7, w: 13, h: 12, xp: 6, gilt: 3, color: '#3a2f4a', accent: '#ff7a3c', aggro: 220, minDepth: 1, cost: 1,
    attacks: [
      { id: 'lunge', windup: 20, active: 10, recovery: 22, hitbox: { x: 0, y: -12, w: 16, h: 12 }, motion: 1, kb: [3, -2], range: [10, 70], cooldown: 50, move: [4.4, -2.2] },
    ],
  },
  husk_knight: {
    id: 'husk_knight', name: 'Husk Knight', desc: 'An empty suit of miner\'s plate animated by a cinder heart. Its shield turns aside light blows from the front — break its poise or strike from behind.', role: 'Heavy armored / shielded',
    ai: 'knight', hp: 130, atk: 15, def: 9, poise: 70, speed: 0.75, w: 16, h: 28, heavy: true, frontGuard: true, xp: 18, gilt: 9, color: '#55606e', accent: '#ffb347', aggro: 200, minDepth: 1, cost: 3,
    attacks: [
      { id: 'thrust', windup: 22, active: 6, recovery: 26, hitbox: { x: 4, y: -22, w: 34, h: 10 }, motion: 1, kb: [4, -1], range: [10, 46], cooldown: 70, move: [2.5, 0] },
      { id: 'overhead', windup: 38, active: 6, recovery: 36, hitbox: { x: 0, y: -40, w: 34, h: 40 }, motion: 1.6, kb: [5, -3], range: [0, 40], cooldown: 120, unblockable: true, weight: 0.6 },
    ],
  },
  thornspitter: {
    id: 'thornspitter', name: 'Thornspitter', desc: 'A rooted bulb that lobs bursting spore-pods. Keeps its distance and shrinks back into the soil when rushed.', role: 'Ranged artillery',
    ai: 'spitter', hp: 52, atk: 10, def: 3, poise: 12, speed: 0.9, w: 14, h: 18, xp: 9, gilt: 5, color: '#3f5a36', accent: '#d6ff5c', aggro: 260, minDepth: 1, cost: 2,
    attacks: [
      { id: 'pod', windup: 26, active: 2, recovery: 40, motion: 1, kb: [2, -2], range: [40, 260], cooldown: 80, projectile: { kind: 'spore', speed: 3.4, angle: -0.9, w: 8, h: 8, life: 140, gravity: 0.12, motion: 1, explode: { radius: 18, motion: 0.8 } } },
      { id: 'bramble', windup: 16, active: 6, recovery: 30, hitbox: { x: -18, y: -22, w: 36, h: 22 }, motion: 0.8, kb: [4, -3], range: [0, 26], cooldown: 70 },
    ],
  },
  moth_wraith: {
    id: 'moth_wraith', name: 'Moth Wraith', desc: 'Drawn to light, it circles overhead and dives in a long swooping arc. Easy to juggle once grounded.', role: 'Flying diver',
    ai: 'moth', hp: 40, atk: 10, def: 2, poise: 10, speed: 1.4, w: 14, h: 12, flying: true, xp: 9, gilt: 5, color: '#6b5a7e', accent: '#ffe9a8', aggro: 260, minDepth: 1, cost: 2,
    attacks: [
      { id: 'dive', windup: 26, active: 34, recovery: 30, hitbox: { x: -8, y: -12, w: 16, h: 12 }, motion: 1, kb: [3, -2], range: [0, 140], cooldown: 90 },
    ],
  },
  ember_tick: {
    id: 'ember_tick', name: 'Ember Tick', desc: 'A bloated cinder-louse. Runs at you and bursts into flame — knock it back into its friends instead.', role: 'Suicide bomber',
    ai: 'tick', hp: 22, atk: 16, def: 0, poise: 4, speed: 1.9, w: 11, h: 10, xp: 5, gilt: 3, color: '#7a2e1e', accent: '#ffcf3c', aggro: 240, minDepth: 1, cost: 1,
    attacks: [{ id: 'burst', windup: 40, active: 4, recovery: 0, motion: 1.6, kb: [5, -4], range: [0, 26], cooldown: 999, special: 'explode', status: { type: 'burn', amount: 60 } }],
  },
  hollow_shepherd: {
    id: 'hollow_shepherd', name: 'Hollow Shepherd', desc: 'A robed husk that calls Gloomlings from the dark and wraps its flock in cinder-wards. Blinks away when cornered — kill it first.', role: 'Summoner / support',
    ai: 'shepherd', hp: 85, atk: 9, def: 4, poise: 20, speed: 0.8, w: 14, h: 26, xp: 20, gilt: 12, color: '#4a3a2a', accent: '#9cf2ff', aggro: 280, minDepth: 1, cost: 3,
    attacks: [
      { id: 'summon', windup: 40, active: 2, recovery: 30, motion: 0, kb: [0, 0], range: [0, 400], cooldown: 260, special: 'summon' },
      { id: 'barrier', windup: 30, active: 2, recovery: 30, motion: 0, kb: [0, 0], range: [0, 400], cooldown: 300, special: 'barrier' },
      { id: 'bolt', windup: 24, active: 2, recovery: 36, motion: 1, kb: [2, -1], range: [30, 220], cooldown: 90, projectile: { kind: 'bolt', speed: 3.2, w: 8, h: 8, life: 120, motion: 1, homing: 0.04, element: 'frost', status: { type: 'frost', amount: 20 } } },
      { id: 'blink', windup: 12, active: 2, recovery: 12, motion: 0, kb: [0, 0], range: [0, 34], cooldown: 150, special: 'blink' },
    ],
  },
  duelist: {
    id: 'duelist', name: 'Ashen Duelist', desc: 'A fencer burned hollow, still drilling its forms. Turns aside careless strings of light attacks and answers with a riposte. Vary your rhythm.', role: 'Anti-spam duelist',
    ai: 'duelist', hp: 110, atk: 13, def: 6, poise: 40, speed: 1.4, w: 12, h: 26, xp: 22, gilt: 12, color: '#5e4e48', accent: '#ff5c5c', aggro: 240, minDepth: 2, cost: 3,
    attacks: [
      { id: 'flurry', windup: 14, active: 14, recovery: 26, hitbox: { x: 2, y: -22, w: 28, h: 16 }, motion: 0.7, kb: [2, -1], range: [0, 40], cooldown: 60, move: [1.5, 0] },
      { id: 'lunge', windup: 22, active: 8, recovery: 30, hitbox: { x: 0, y: -22, w: 26, h: 14 }, motion: 1.3, kb: [4, -1], range: [40, 110], cooldown: 80, move: [7, 0] },
      { id: 'guard', windup: 1, active: 30, recovery: 4, motion: 0, kb: [0, 0], range: [0, 0], cooldown: 120, special: 'guard', weight: 0 },
    ],
  },
  cinder_golem: {
    id: 'cinder_golem', name: 'Cinder Golem', desc: 'Slag and starstone packed around a hot core. Immune to fire, slow, and hits like a collapsing mine shaft.', role: 'Juggernaut',
    ai: 'knight', hp: 260, atk: 20, def: 14, poise: 140, speed: 0.55, w: 22, h: 32, heavy: true, xp: 30, gilt: 18, color: '#4a3530', accent: '#ff6a2a', aggro: 200, minDepth: 2, cost: 4,
    resist: { fire: 1 },
    attacks: [
      { id: 'slam', windup: 40, active: 6, recovery: 40, hitbox: { x: -6, y: -40, w: 46, h: 40 }, motion: 1.5, kb: [5, -4], range: [0, 46], cooldown: 120, unblockable: true, projectile: { kind: 'wave', speed: 3.4, w: 12, h: 16, life: 40, motion: 0.7, ground: true, pierce: 99, element: 'fire', offset: [30, 0] } },
      { id: 'thrust', windup: 26, active: 8, recovery: 30, hitbox: { x: 4, y: -26, w: 34, h: 14 }, motion: 1.1, kb: [4, -1], range: [0, 46], cooldown: 70, move: [2, 0] },
    ],
  },
};

export const ELITE_MODS = {
  hasted: { name: 'Hasted', color: '#7cf', text: 'Moves and attacks 35% faster.' },
  warded: { name: 'Warded', color: '#9cf2ff', text: 'Regenerating barrier; takes 40% less damage until staggered.' },
  vampiric: { name: 'Vampiric', color: '#f45', text: 'Heals from damage dealt.' },
  volatile: { name: 'Volatile', color: '#fa3', text: 'Explodes in fire on death.' },
  colossal: { name: 'Colossal', color: '#db8', text: '+80% HP, larger, more poise.' },
} as const;
export type EliteMod = keyof typeof ELITE_MODS;

export interface BossDef {
  id: string;
  name: string;
  title: string;
  desc: string;
  hp: number;
  atk: number;
  def: number;
  poise: number;
  w: number;
  h: number;
  depth: number;
  color: string;
  accent: string;
  xp: number;
  gilt: number;
}

export const BOSSES: Record<string, BossDef> = {
  rootmaw: {
    id: 'rootmaw', name: 'Rootmaw Warden', title: 'Keeper of the Gloomroot', desc: 'A colossal burrowing beast grown through with cinder-roots. Charges, leaps and drives root-spikes through the earth. Enraged below half health.',
    hp: 1500, atk: 16, def: 6, poise: 260, w: 44, h: 40, depth: 1, color: '#4b3a2c', accent: '#ff8c3a', xp: 120, gilt: 80,
  },
  matriarch: {
    id: 'matriarch', name: 'Cinder Matriarch', title: 'Mother of Moths', desc: 'An enormous moth-queen whose wings shed burning dust. Dives, fans spores, and darkens the sky with her brood.',
    hp: 3600, atk: 22, def: 9, poise: 300, w: 46, h: 30, depth: 2, color: '#5a4870', accent: '#ffd36a', xp: 220, gilt: 160,
  },
  vessel: {
    id: 'vessel', name: 'The Pale Vessel', title: 'Hollow of the Fallen Star', desc: 'A duelist hollowed out and filled with starlight. Lightning-fast sword strings, teleports, and a final Judgment that must be dodged.',
    hp: 7600, atk: 30, def: 12, poise: 320, w: 16, h: 32, depth: 3, color: '#d8d4e8', accent: '#8fd8ff', xp: 400, gilt: 300,
  },
};
