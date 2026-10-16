/** Additive stat block. Every source (gear, affixes, passives, relics, levels, Starboard) adds into one. */
export const STAT_KEYS = [
  'maxHp', 'maxMp', 'atk', 'atkPct', 'magic', 'magicPct', 'def', 'defPct',
  'critChance', 'critDmg', 'atkSpeed', 'moveSpeed',
  'dmgPct', 'lightPct', 'heavyPct', 'airPct', 'artPct', 'spellPct', 'procPct',
  'firePct', 'shockPct', 'frostPct', 'fireConv', 'shockConv', 'frostConv',
  'statusPower', 'bleedPower', 'dmgVsAfflicted', 'dmgVsStaggered', 'lowHpDmg', 'comboDmg',
  'cdr', 'mpOnHit', 'mpRegen', 'lifesteal', 'lifeOnKill', 'poiseDmg', 'guardPct', 'parryWindow',
  'iframes', 'dmgTaken', 'thorns', 'goldFind', 'lootLuck', 'xpGain', 'potionPower', 'potions',
  'airJumps', 'airDash', 'knockbackPct', 'riposteDmg', 'artCost',
] as const;
export type StatKey = (typeof STAT_KEYS)[number];
export type Stats = Record<StatKey, number>;
export type StatMods = Partial<Stats>;

export function emptyStats(): Stats {
  const s = {} as Stats;
  for (const k of STAT_KEYS) s[k] = 0;
  return s;
}

export function addStats(into: Stats, mods: StatMods | undefined, mult = 1): Stats {
  if (!mods) return into;
  for (const k in mods) into[k as StatKey] += (mods[k as StatKey] ?? 0) * mult;
  return into;
}

export const BASE_PLAYER: StatMods = {
  maxHp: 100, maxMp: 60, atk: 8, magic: 8, def: 4, critChance: 0.05, critDmg: 0.5,
  guardPct: 0.55, potions: 3, potionPower: 0.4, mpRegen: 0,
};

/** Derived (final) values the simulation actually uses. */
export interface Derived {
  maxHp: number;
  maxMp: number;
  atk: number;
  magic: number;
  def: number;
  critChance: number;
  critMult: number;
  speedMult: number; // attack animation speed
  moveMult: number;
  s: Stats;
}

export function derive(s: Stats): Derived {
  return {
    maxHp: Math.max(1, Math.round(s.maxHp)),
    maxMp: Math.max(10, Math.round(s.maxMp)),
    atk: Math.max(1, s.atk * (1 + s.atkPct)),
    magic: Math.max(1, s.magic * (1 + s.magicPct)),
    def: Math.max(0, s.def * (1 + s.defPct)),
    critChance: Math.min(1, Math.max(0, s.critChance)),
    critMult: 1 + Math.max(0, s.critDmg),
    speedMult: Math.min(2.2, Math.max(0.5, 1 + s.atkSpeed)),
    moveMult: Math.min(1.8, Math.max(0.6, 1 + s.moveSpeed)),
    s,
  };
}

/** Human-readable stat formatting used by tooltips/comparison. */
export const STAT_INFO: Record<StatKey, { label: string; pct?: boolean }> = {
  maxHp: { label: 'Max HP' }, maxMp: { label: 'Max Aether' }, atk: { label: 'Attack' }, atkPct: { label: 'Attack', pct: true },
  magic: { label: 'Magic' }, magicPct: { label: 'Magic', pct: true }, def: { label: 'Defense' }, defPct: { label: 'Defense', pct: true },
  critChance: { label: 'Crit Chance', pct: true }, critDmg: { label: 'Crit Damage', pct: true }, atkSpeed: { label: 'Attack Speed', pct: true },
  moveSpeed: { label: 'Move Speed', pct: true }, dmgPct: { label: 'Damage', pct: true }, lightPct: { label: 'Light Attack Dmg', pct: true },
  heavyPct: { label: 'Heavy Attack Dmg', pct: true }, airPct: { label: 'Aerial Dmg', pct: true }, artPct: { label: 'Weapon Art Dmg', pct: true },
  spellPct: { label: 'Spell Dmg', pct: true }, procPct: { label: 'Triggered Effect Dmg', pct: true },
  firePct: { label: 'Fire Dmg', pct: true }, shockPct: { label: 'Shock Dmg', pct: true }, frostPct: { label: 'Frost Dmg', pct: true },
  fireConv: { label: 'Hits add Fire', pct: true }, shockConv: { label: 'Hits add Shock', pct: true }, frostConv: { label: 'Hits add Frost', pct: true },
  statusPower: { label: 'Status Buildup', pct: true }, bleedPower: { label: 'Bleed Buildup', pct: true },
  dmgVsAfflicted: { label: 'Dmg vs Afflicted', pct: true }, dmgVsStaggered: { label: 'Dmg vs Staggered', pct: true },
  lowHpDmg: { label: 'Dmg while below 50% HP', pct: true }, comboDmg: { label: 'Dmg per 10 Combo', pct: true },
  cdr: { label: 'Cooldown Recovery', pct: true }, mpOnHit: { label: 'Aether on Hit' }, mpRegen: { label: 'Aether Regen/s' },
  lifesteal: { label: 'Life Steal', pct: true }, lifeOnKill: { label: 'HP on Kill' }, poiseDmg: { label: 'Stagger Power', pct: true },
  guardPct: { label: 'Guard Reduction', pct: true }, parryWindow: { label: 'Parry Window (frames)' }, iframes: { label: 'Dodge I-frames' },
  dmgTaken: { label: 'Damage Taken', pct: true }, thorns: { label: 'Retaliation Dmg', pct: true }, goldFind: { label: 'Gilt Find', pct: true },
  lootLuck: { label: 'Loot Rarity', pct: true }, xpGain: { label: 'Run XP', pct: true }, potionPower: { label: 'Lamp Oil Heal', pct: true },
  potions: { label: 'Lamp Oil Charges' }, airJumps: { label: 'Extra Jumps' }, airDash: { label: 'Air Dash' }, knockbackPct: { label: 'Knockback', pct: true },
  riposteDmg: { label: 'Riposte Dmg', pct: true }, artCost: { label: 'Art Aether Cost', pct: true },
};

export function formatStat(k: StatKey, v: number): string {
  const info = STAT_INFO[k];
  const sign = v >= 0 ? '+' : '';
  if (info.pct) return `${sign}${Math.round(v * 1000) / 10}% ${info.label}`;
  return `${sign}${Math.round(v * 10) / 10} ${info.label}`;
}
