import { describe, expect, it } from 'vitest';
import { ScriptedInput } from '../src/core/input';
import { TICK_MS } from '../src/core/constants';
import { ROOMS } from '../src/data/rooms';
import { defaultLoadout } from '../src/sim/loadout';
import { Room } from '../src/sim/room';
import { World } from '../src/sim/world';

function makeWorld(cls: Parameters<typeof defaultLoadout>[0] = 'fang') {
  const input = new ScriptedInput();
  const w = new World(new Room(ROOMS.arena), defaultLoadout(cls), input, 1234);
  return { w, input };
}
function run(w: World, ticks: number, each?: (t: number) => void) {
  for (let i = 0; i < ticks; i++) {
    each?.(i);
    w.time.advance(TICK_MS, () => w.step());
  }
}

describe('simulation', () => {
  it('player lands on the floor and stays there', () => {
    const { w } = makeWorld();
    run(w, 60);
    expect(w.player.onGround).toBe(true);
    expect(w.player.y % 16).toBe(0);
  });

  it('player can walk right', () => {
    const { w, input } = makeWorld();
    run(w, 30);
    const x0 = w.player.x;
    input.heldSet.add('right');
    run(w, 30);
    expect(w.player.x).toBeGreaterThan(x0 + 40);
  });

  it('jump goes up and comes back down', () => {
    const { w, input } = makeWorld();
    run(w, 30);
    const y0 = w.player.y;
    input.press('jump');
    input.heldSet.add('jump');
    let minY = y0;
    run(w, 60, () => (minY = Math.min(minY, w.player.y)));
    expect(y0 - minY).toBeGreaterThan(40);
    expect(w.player.y).toBe(y0);
  });

  it('light attack chain kills a gloomling with hit stop', () => {
    const { w, input } = makeWorld();
    run(w, 20);
    const e = w.spawnEnemy('gloomling', w.player.x + 24, w.player.y, { noSpawnAnim: true });
    let stopped = false;
    run(w, 600, (t) => {
      if (t % 6 === 0) input.press('light');
      if (w.time.hitStopMs > 0) stopped = true;
      // chase
      input.heldSet.delete('left');
      input.heldSet.delete('right');
      if (e.alive && Math.abs(e.x - w.player.x) > 20) input.heldSet.add(e.x > w.player.x ? 'right' : 'left');
    });
    expect(e.alive).toBe(false);
    expect(stopped).toBe(true);
    expect(w.stats.hits).toBeGreaterThan(2);
  });

  for (const cls of ['fang', 'maul', 'glaive', 'rod', 'pendulum'] as const) {
    it(`${cls}: every move in the moveset executes without errors`, () => {
      const { w, input } = makeWorld(cls);
      w.spawnEnemy('dummy', w.player.x + 30, w.player.y, { noSpawnAnim: true });
      const seq: [string[], string][] = [
        [[], 'light'], [[], 'light'], [[], 'light'], [[], 'light'], [[], 'heavy'], [['up'], 'light'], [[], 'jump'], [[], 'light'], [[], 'light'], [[], 'heavy'], [[], 'dodge'], [[], 'light'], [[], 'art'],
      ];
      w.player.mp = 999;
      run(w, 20);
      for (const [held, a] of seq) {
        for (const h of held) input.heldSet.add(h as any);
        input.press(a as any);
        run(w, 40);
        input.heldSet.clear();
      }
      run(w, 120);
      expect(w.stats.hits).toBeGreaterThan(3);
      expect(Number.isFinite(w.player.x)).toBe(true);
    });
  }
});
