import type { Rng } from '../core/rng';
import type { Stats } from './stats';
import type { AttackKind, Element, StatusState } from './types';

export interface DamageInput {
  power: number; // attacker's relevant attack value (Attack / Magic / hybrid)
  motion: number;
  kind: AttackKind;
  element: Element;
  stats: Stats | null; // attacker stat block (player) — null for enemies
  critChance: number;
  critMult: number;
  forceCrit?: boolean;
  canCrit?: boolean;
  defense: number;
  resist?: Partial<Record<Element, number>>;
  targetDmgTaken?: number; // additive % (player dmgTaken stat)
  targetAfflicted?: boolean;
  targetStaggered?: boolean;
  targetFrozen?: boolean;
  targetShocked?: boolean;
  attackerLowHp?: boolean;
  combo?: number;
  variance?: boolean;
}

export interface DamageResult {
  total: number;
  crit: boolean;
  parts: Record<Element, number>;
  /** dominant element for feedback */
  element: Element;
}

const KIND_STAT: Partial<Record<AttackKind, keyof Stats>> = {
  light: 'lightPct', heavy: 'heavyPct', air: 'airPct', art: 'artPct', spell: 'spellPct', proc: 'procPct',
};
const ELEM_PCT: Record<Element, keyof Stats | null> = { phys: null, fire: 'firePct', shock: 'shockPct', frost: 'frostPct' };

export function defenseFactor(def: number): number {
  return 60 / (60 + Math.max(0, def) * 3);
}

/** Pure, deterministic (given rng) damage calculation used by every hit in the game. */
export function computeDamage(inp: DamageInput, rng: Rng): DamageResult {
  const s = inp.stats;
  const base = inp.power * inp.motion;
  let mult = 1;
  if (s) {
    mult += s.dmgPct;
    const ks = KIND_STAT[inp.kind];
    if (ks) mult += s[ks];
    if (inp.kind === 'riposte') mult += s.riposteDmg;
    if (inp.targetAfflicted) mult += s.dmgVsAfflicted;
    if (inp.targetStaggered) mult += s.dmgVsStaggered;
    if (inp.attackerLowHp) mult += s.lowHpDmg;
    if (inp.combo) mult += s.comboDmg * Math.min(10, Math.floor(inp.combo / 10));
  }
  if (inp.targetStaggered) mult += 0.25;
  if (inp.targetShocked) mult += 0.2;
  mult = Math.max(0.1, mult);

  const parts: Record<Element, number> = { phys: 0, fire: 0, shock: 0, frost: 0 };
  const elemMult = (e: Element) => (s && ELEM_PCT[e] ? 1 + s[ELEM_PCT[e]!] : 1) * (1 - Math.min(1, inp.resist?.[e] ?? 0));
  parts[inp.element] += base * elemMult(inp.element);
  if (s && inp.kind !== 'proc') {
    if (s.fireConv) parts.fire += base * s.fireConv * elemMult('fire');
    if (s.shockConv) parts.shock += base * s.shockConv * elemMult('shock');
    if (s.frostConv) parts.frost += base * s.frostConv * elemMult('frost');
  }
  const df = defenseFactor(inp.defense);
  const dfElem = defenseFactor(inp.defense * 0.5);
  let total = 0;
  for (const e of ['phys', 'fire', 'shock', 'frost'] as Element[]) {
    parts[e] *= mult * (e === 'phys' ? df : dfElem);
    total += parts[e];
  }
  let crit = false;
  if (inp.canCrit !== false) {
    const cc = inp.critChance + (inp.targetFrozen ? 0.25 : 0);
    crit = inp.forceCrit || rng.next() < cc;
  }
  if (crit) total *= inp.critMult;
  if (inp.variance !== false) total *= 0.95 + rng.next() * 0.1;
  total *= Math.max(0.2, 1 + (inp.targetDmgTaken ?? 0));
  total = Math.max(1, Math.round(total));
  let element: Element = inp.element;
  let best = 0;
  for (const e of ['phys', 'fire', 'shock', 'frost'] as Element[]) if (parts[e] > best) {
    best = parts[e];
    element = e;
  }
  return { total, crit, parts, element };
}

export function isAfflicted(st: StatusState): boolean {
  return st.burn > 0 || st.shock > 0 || st.frost > 0 || st.frozen > 0 || st.bleed > 0;
}

/** Status buildup thresholds grow each time a status procs on the same target (bosses resist faster). */
export function statusThreshold(timesApplied: number, boss: boolean): number {
  return 100 * (1 + timesApplied * (boss ? 0.6 : 0.25));
}
