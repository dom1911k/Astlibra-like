import { describe, expect, it } from 'vitest';
import { Rng } from '../src/core/rng';
import { TICK_MS } from '../src/core/constants';
import { TimeController } from '../src/core/time';
import { Tuning } from '../src/core/tuning';
import { computeDamage, defenseFactor } from '../src/sim/damage';
import { addStats, emptyStats } from '../src/sim/stats';
import { generateMap, validateMap } from '../src/meta/expedition';
import { rollItem, makeItem, itemStats } from '../src/meta/items';
import { newProfile, unlocks, canBuyNode, respec } from '../src/meta/profile';
import { serialize, deserialize, saveProfile, loadProfile } from '../src/meta/save';
import { startRun, resolveDeath, bankRun, gainXp, xpForLevel } from '../src/meta/run';
import { masteryLevel, MASTERY_XP } from '../src/meta/mastery';
import { buildLoadout } from '../src/meta/build';
import { upgrade, upgradeCost } from '../src/meta/forge';

describe('damage', () => {
  it('is deterministic for a given seed', () => {
    const inp = { power: 20, motion: 1, kind: 'light' as const, element: 'phys' as const, stats: null, critChance: 0.5, critMult: 2, defense: 5 };
    expect(computeDamage(inp, new Rng(9))).toEqual(computeDamage(inp, new Rng(9)));
  });
  it('defense reduces damage monotonically', () => {
    expect(defenseFactor(0)).toBe(1);
    expect(defenseFactor(10)).toBeLessThan(defenseFactor(5));
    expect(defenseFactor(1000)).toBeGreaterThan(0);
  });
  it('crits multiply, conversions add elemental damage, min damage is 1', () => {
    const s = addStats(emptyStats(), { fireConv: 0.5 });
    const base = { power: 10, motion: 1, kind: 'light' as const, element: 'phys' as const, critChance: 0, critMult: 2, defense: 0, variance: false };
    const plain = computeDamage({ ...base, stats: emptyStats() }, new Rng(1)).total;
    const fire = computeDamage({ ...base, stats: s }, new Rng(1));
    expect(fire.parts.fire).toBeGreaterThan(0);
    expect(fire.total).toBeGreaterThan(plain);
    const crit = computeDamage({ ...base, stats: emptyStats(), forceCrit: true }, new Rng(1)).total;
    expect(crit).toBe(plain * 2);
    expect(computeDamage({ ...base, power: 0.001, stats: null }, new Rng(1)).total).toBe(1);
  });
});

describe('hit stop', () => {
  it('skips gameplay ticks, merges requests by max, and respects the budget', () => {
    const t = new TimeController();
    let ticks = 0;
    t.request('light');
    t.request('heavy'); // same tick → max, not sum
    t.flush();
    expect(t.hitStopMs).toBeCloseTo(Tuning.hitstop.heavy);
    t.advance(Tuning.hitstop.heavy - 1, () => ticks++);
    expect(ticks).toBe(0);
    t.advance(TICK_MS + 2, () => ticks++);
    expect(ticks).toBe(1);
    // chained stops are clamped by the rolling budget
    const t2 = new TimeController();
    let total = 0;
    for (let i = 0; i < 10; i++) {
      t2.request('finisher');
      t2.flush();
      total += t2.hitStopMs;
      t2.advance(t2.hitStopMs + TICK_MS, () => {});
    }
    expect(total).toBeLessThan(Tuning.hitstop.finisher * 10 * 0.7);
  });
});

describe('expedition maps', () => {
  it('always generate valid, completable graphs', () => {
    for (let seed = 1; seed < 200; seed++) {
      for (const depth of [1, 2, 3]) {
        const m = generateMap(seed * 97, depth, { reveal: seed % 2 === 0, difficulty: seed % 5 });
        expect(validateMap(m).ok).toBe(true);
        expect(m.nodes[m.boss].type).toBe('boss');
      }
    }
  });
});

describe('loot', () => {
  it('rolls items with the right number of affixes and respects unlocks', () => {
    const rng = new Rng(5);
    const u = unlocks(newProfile());
    for (let i = 0; i < 300; i++) {
      const it = rollItem(rng, { depth: 1 + (i % 3), luck: 0, unlocks: u });
      expect(['glaive', 'rod', 'pendulum']).not.toContain(ITEM_CLS(it.baseId));
      expect(it.affixes.length).toBeLessThanOrEqual(3);
      expect(new Set(it.affixes.map((a) => a.id)).size).toBe(it.affixes.length);
    }
  });
  it('forge upgrades raise base stats and cost more each level', () => {
    const it = makeItem(new Rng(1), 'twin_fangs', 'common', 1);
    const w = { slag: 999, starglass: 99, echoes: 0, gilt: 0 };
    const c0 = upgradeCost(it).slag;
    const a0 = itemStats(it).atk;
    expect(upgrade(it, w)).toBe(true);
    expect(itemStats(it).atk).toBeGreaterThan(a0);
    expect(upgradeCost(it).slag).toBeGreaterThan(c0);
  });
});
import { ITEMS } from '../src/data/items';
const ITEM_CLS = (id: string) => ITEMS[id].cls;

describe('progression & persistence', () => {
  it('starboard requires adjacency and respec refunds everything', () => {
    const p = newProfile();
    p.cinders = 1000;
    expect(canBuyNode(p, 'm5')).toBe(false);
    expect(canBuyNode(p, 'm1')).toBe(true);
    p.board.push('m1');
    p.cinders -= 8;
    expect(respec(p)).toBe(8);
    expect(p.cinders).toBe(1000);
  });
  it('mastery levels follow thresholds', () => {
    expect(masteryLevel(0)).toBe(0);
    expect(masteryLevel(MASTERY_XP[3])).toBe(3);
    expect(masteryLevel(99999)).toBe(5);
  });
  it('run levels and stat aggregation', () => {
    const p = newProfile();
    const r = startRun(p, 1);
    const before = buildLoadout(p, r).loadout.stats.atk;
    expect(gainXp(r, xpForLevel(1) + xpForLevel(2))).toBe(2);
    expect(buildLoadout(p, r).loadout.stats.atk).toBeGreaterThan(before);
  });
  it('death keeps brought gear, salvages the best find, loses the rest; banking keeps all', () => {
    const p = newProfile();
    const stashBefore = p.stash.length;
    const r = startRun(p, 2);
    r.items.push(makeItem(new Rng(1), 'gloomcutters', 'common', 1), makeItem(new Rng(2), 'emberfang', 'epic', 2));
    r.gilt = 100;
    const out = resolveDeath(p, r);
    expect(out.salvaged?.baseId).toBe('emberfang');
    expect(p.stash.length).toBe(stashBefore + 1);
    expect(p.gilt).toBe(50);
    const r2 = startRun(p, 3);
    r2.items.push(makeItem(new Rng(3), 'lucky_coin', 'rare', 1));
    bankRun(p, r2);
    expect(p.stash.length).toBe(stashBefore + 2);
  });
  it('save round-trips, detects corruption and falls back to the backup', () => {
    const store = new Map<string, string>();
    const s = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v), removeItem: (k: string) => void store.delete(k) };
    const p = newProfile();
    p.cinders = 42;
    expect(deserialize(serialize(p))?.cinders).toBe(42);
    saveProfile(p, s);
    p.cinders = 43;
    saveProfile(p, s); // previous good save becomes the backup
    store.set('cinderdeep_save_v1', store.get('cinderdeep_save_v1')!.slice(0, 50)); // corrupt primary
    const res = loadProfile(s);
    expect(res.source).toBe('backup');
    expect(res.corrupt).toBe(true);
    expect(res.profile.cinders).toBe(42);
    store.clear();
    expect(loadProfile(s).source).toBe('new');
  });
});
