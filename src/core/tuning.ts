/**
 * Runtime-tunable combat feel values. Editable live in the Training Grounds debug panel (F1)
 * and persisted to localStorage, so feel can be iterated without rebuilding.
 */
export interface TuningValues {
  hitstop: Record<HitStopKind, number> & {
    scale: number;
    multiTargetBonus: number;
    multiTargetCap: number;
    budgetMs: number;
    budgetWindowMs: number;
    overBudgetScale: number;
  };
  knockbackScale: number;
  shakeScale: number;
  inputBufferTicks: number;
  coyoteTicks: number;
  parryWindowTicks: number;
  dodgeIframes: number;
  victimShakePx: number;
  showHitboxes: boolean;
  godMode: boolean;
}

/** Playtest cheats (never persisted; reset every session). */
export const Dev = { damageMult: 1, infiniteMp: false, timeScale: 1, fastExit: false };
export function devActive(): string[] {
  const out: string[] = [];
  if (Tuning.godMode) out.push('GOD');
  if (Dev.damageMult !== 1) out.push(`DMG×${Dev.damageMult}`);
  if (Dev.infiniteMp) out.push('∞AETHER');
  if (Dev.timeScale !== 1) out.push(`SPEED×${Dev.timeScale}`);
  return out;
}
export type HitStopKind = 'light' | 'heavy' | 'crit' | 'finisher' | 'parry' | 'guardBreak' | 'kill' | 'hurt' | 'magic';

export const DEFAULT_TUNING: TuningValues = {
  hitstop: {
    light: 45,
    heavy: 85,
    crit: 95,
    finisher: 110,
    parry: 150,
    guardBreak: 120,
    kill: 70,
    hurt: 75,
    magic: 40,
    scale: 1,
    multiTargetBonus: 0.15,
    multiTargetCap: 1.5,
    budgetMs: 170,
    budgetWindowMs: 320,
    overBudgetScale: 0.35,
  },
  knockbackScale: 1,
  shakeScale: 1,
  inputBufferTicks: 8,
  coyoteTicks: 6,
  parryWindowTicks: 9,
  dodgeIframes: 14,
  victimShakePx: 2,
  showHitboxes: false,
  godMode: false,
};

export const Tuning: TuningValues = structuredCloneSafe(DEFAULT_TUNING);

function structuredCloneSafe<T>(v: T): T {
  return JSON.parse(JSON.stringify(v));
}

const KEY = 'cinderdeep_tuning_v1';
export function loadTuning(): void {
  try {
    const raw = globalThis.localStorage?.getItem(KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw);
    Object.assign(Tuning.hitstop, parsed.hitstop ?? {});
    for (const k of Object.keys(DEFAULT_TUNING) as (keyof TuningValues)[]) {
      if (k !== 'hitstop' && k in parsed && typeof parsed[k] === typeof DEFAULT_TUNING[k]) (Tuning as any)[k] = parsed[k];
    }
  } catch {
    /* ignore corrupt tuning */
  }
}
export function saveTuning(): void {
  try {
    globalThis.localStorage?.setItem(KEY, JSON.stringify(Tuning));
  } catch {
    /* storage unavailable */
  }
}
export function resetTuning(): void {
  const d = structuredCloneSafe(DEFAULT_TUNING);
  Object.assign(Tuning.hitstop, d.hitstop);
  for (const k of Object.keys(d) as (keyof TuningValues)[]) if (k !== 'hitstop') (Tuning as any)[k] = d[k];
  saveTuning();
}
