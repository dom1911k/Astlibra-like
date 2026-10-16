import { hashString } from '../core/rng';
import { DEFAULT_SETTINGS } from '../core/settings';
import { newProfile, SAVE_VERSION, type Profile } from './profile';

const KEY = 'cinderdeep_save_v1';
const BAK = 'cinderdeep_save_v1_bak';

export interface Storage {
  getItem(k: string): string | null;
  setItem(k: string, v: string): void;
  removeItem(k: string): void;
}

function store(): Storage | null {
  try {
    return (globalThis as any).localStorage ?? null;
  } catch {
    return null;
  }
}

export function serialize(p: Profile): string {
  const data = JSON.stringify(p);
  return JSON.stringify({ v: SAVE_VERSION, sum: hashString(data), data });
}

export function deserialize(raw: string | null): Profile | null {
  if (!raw) return null;
  try {
    const env = JSON.parse(raw);
    if (typeof env?.data !== 'string' || hashString(env.data) !== env.sum) return null;
    return migrate(JSON.parse(env.data));
  } catch {
    return null;
  }
}

/** Fill in fields added in later versions so old saves keep working. */
export function migrate(p: any): Profile | null {
  if (!p || typeof p !== 'object' || !Array.isArray(p.stash)) return null;
  const d = newProfile() as any;
  for (const k of Object.keys(d)) if (p[k] === undefined) p[k] = d[k];
  p.settings = { ...DEFAULT_SETTINGS, ...(p.settings ?? {}) };
  p.records = { ...d.records, ...(p.records ?? {}) };
  p.codex = { ...d.codex, ...(p.codex ?? {}) };
  p.version = SAVE_VERSION;
  return p as Profile;
}

export function saveProfile(p: Profile, s: Storage | null = store()): boolean {
  if (!s) return false;
  try {
    const cur = s.getItem(KEY);
    if (cur && deserialize(cur)) s.setItem(BAK, cur);
    s.setItem(KEY, serialize(p));
    return true;
  } catch {
    return false;
  }
}

export interface LoadResult {
  profile: Profile;
  source: 'primary' | 'backup' | 'new';
  corrupt: boolean;
}

export function loadProfile(s: Storage | null = store()): LoadResult {
  if (!s) return { profile: newProfile(), source: 'new', corrupt: false };
  const primaryRaw = s.getItem(KEY);
  const primary = deserialize(primaryRaw);
  if (primary) return { profile: primary, source: 'primary', corrupt: false };
  const backup = deserialize(s.getItem(BAK));
  if (backup) return { profile: backup, source: 'backup', corrupt: !!primaryRaw };
  return { profile: newProfile(), source: 'new', corrupt: !!primaryRaw };
}

export function wipeSave(s: Storage | null = store()): void {
  s?.removeItem(KEY);
  s?.removeItem(BAK);
}
