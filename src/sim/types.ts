import type { HitStopKind } from '../core/tuning';
import type { StatMods } from './stats';

export type Element = 'phys' | 'fire' | 'shock' | 'frost';
export type StatusType = 'burn' | 'shock' | 'frost' | 'bleed';
export type AttackKind = 'light' | 'heavy' | 'air' | 'art' | 'spell' | 'proc' | 'riposte' | 'enemy';
export type Sfx = 'slash' | 'blunt' | 'pierce' | 'magic' | 'fire' | 'shock' | 'frost';

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface ProjectileSpec {
  kind: 'bolt' | 'orb' | 'wave' | 'star' | 'arrow' | 'spore' | 'shard' | 'pillar' | 'blade';
  speed: number;
  angle?: number; // radians, relative to facing (0 = forward, negative = up)
  count?: number;
  spread?: number;
  w: number;
  h: number;
  life: number;
  gravity?: number;
  pierce?: number;
  rehit?: number;
  motion: number;
  element?: Element;
  status?: { type: StatusType; amount: number };
  explode?: { radius: number; motion: number };
  ground?: boolean; // travels along ground (shockwaves)
  homing?: number;
  offset?: [number, number];
  delay?: number;
  launch?: boolean;
}

/** One move in a player moveset, in 60 Hz ticks at 1.0 attack speed. */
export interface AttackDef {
  id: string;
  name: string;
  kind: AttackKind;
  startup: number;
  active: number;
  recovery: number;
  hitbox?: Box; // facing right, origin at feet center
  hitbox2?: Box; // end-of-active hitbox; interpolated across active frames (sweeps)
  motion: number;
  hitstop: HitStopKind;
  hitstopMult?: number;
  kb: [number, number];
  launch?: boolean;
  spike?: boolean;
  poise: number;
  stun?: number;
  hits?: number; // max hits per target
  rehit?: number; // ticks between hits on the same target
  moveStartup?: [number, number];
  moveActive?: [number, number];
  /** absolute tick at which links/dodge become available */
  cancel: number;
  links?: { light?: string; heavy?: string };
  armor?: boolean;
  charge?: { maxTicks: number; motionAt: number; chargedHitstop?: HitStopKind; launchAt?: boolean; projectileAt?: ProjectileSpec };
  element?: Element;
  status?: { type: StatusType; amount: number };
  shake?: number;
  sfx: Sfx;
  projectile?: ProjectileSpec;
  finisher?: boolean;
  gravity?: number; // gravity scale while attacking in the air
  plunge?: { vy: number; vx: number; landing?: { box: Box; motion: number; projectile?: ProjectileSpec } };
  pogo?: boolean;
  counter?: { window: number; attack: string }; // stance: if hit during window, perform attack instead
  mpCost?: number;
  scaling?: 'atk' | 'magic' | 'hybrid';
  swing: { from: number; to: number; style: 'arc' | 'thrust' | 'spin' | 'slam' | 'cast'; reach?: number };
  selfLaunch?: number; // vy applied to self (rising attacks)
  flurry?: boolean;
}

export type Trigger =
  | 'hit' | 'crit' | 'kill' | 'dodge' | 'perfectDodge' | 'parry' | 'block' | 'heavyHit' | 'airHit'
  | 'combo' | 'cast' | 'statusApplied' | 'hurt' | 'roomStart' | 'finisher' | 'art' | 'riposte';

export type ProcAction =
  | { type: 'explode'; element: Element; motion: number; radius: number; status?: { type: StatusType; amount: number } }
  | { type: 'bolt'; element: Element; motion: number; count: number; homing?: boolean }
  | { type: 'status'; status: StatusType; amount: number }
  | { type: 'heal'; pct: number }
  | { type: 'mp'; amount: number }
  | { type: 'buff'; id: string; name: string; stats: StatMods; dur: number; maxStacks?: number; consumeOn?: 'heavy' | 'hit' | 'art' | 'spell' }
  | { type: 'cdr'; ticks: number }
  | { type: 'chain'; element: Element; motion: number; jumps: number; range: number }
  | { type: 'spread'; range: number }
  | { type: 'blade'; motion: number; dur: number; max: number }
  | { type: 'shield'; pct: number; dur: number }
  | { type: 'nova'; element: Element; motion: number; radius: number };

export interface ProcDef {
  trigger: Trigger;
  chance?: number;
  icd?: number; // internal cooldown (ticks)
  every?: number; // for 'combo': fires every N hits
  cond?: 'targetAfflicted' | 'targetBurning' | 'targetShocked' | 'targetFrozen' | 'targetBleeding' | 'lowHp' | 'fullHp' | 'airborne';
  action: ProcAction;
}

export interface PassiveDef {
  id: string;
  name: string;
  text: string;
  stats?: StatMods;
  procs?: ProcDef[];
}

export interface StatusState {
  burn: number; // remaining ticks
  burnPower: number;
  shock: number;
  frost: number;
  frozen: number;
  bleed: number; // stacks
  bleedTimer: number;
  build: Record<StatusType, number>;
}

export function emptyStatus(): StatusState {
  return { burn: 0, burnPower: 0, shock: 0, frost: 0, frozen: 0, bleed: 0, bleedTimer: 0, build: { burn: 0, shock: 0, frost: 0, bleed: 0 } };
}
