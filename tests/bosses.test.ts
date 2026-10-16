import { describe, expect, it } from 'vitest';
import { TICK_MS } from '../src/core/constants';
import { Tuning } from '../src/core/tuning';
import { BOSSES } from '../src/data/enemies';
import { ROOMS } from '../src/data/rooms';
import { defaultLoadout } from '../src/sim/loadout';
import { Room } from '../src/sim/room';
import { addStats } from '../src/sim/stats';
import { World } from '../src/sim/world';
import { Bot } from '../tools/bot';

describe('guardians', () => {
  for (const id of Object.keys(BOSSES)) {
    it(`${id}: all phases play out and the fight can be won`, () => {
      Tuning.godMode = true;
      const bot = new Bot(0.8);
      const l = defaultLoadout('maul');
      addStats(l.stats, { atk: 60, critChance: 0.3 });
      const w = new World(new Room(ROOMS.boss_arena), l, bot.input, 3);
      const m = w.room.boss!;
      const b = w.spawnBoss(id, m.x, m.y);
      const phases = new Set<number>();
      for (let t = 0; t < 60 * 300 && b.alive; t++) {
        bot.tick(w);
        w.time.advance(TICK_MS, () => w.step());
        phases.add(b.phase);
        w.events.length = 0;
      }
      Tuning.godMode = false;
      if (b.alive) console.log(id, 'hp', Math.round(b.hp), '/', b.maxHp, 'phase', b.phase, b.state, 'dealt', w.stats.dmgDealt, 'hits', w.stats.hits, 'player', Math.round(w.player.x), Math.round(w.player.y), 'boss', Math.round(b.x), Math.round(b.y), 'roar', b.roar);
      expect(b.alive).toBe(false);
      expect(phases.size).toBe(b.thresholds.length + 1);
    });
  }
});
