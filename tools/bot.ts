import { ScriptedInput } from '../src/core/input';
import type { World } from '../src/sim/world';
import type { Enemy } from '../src/sim/enemy';

const RANGE: Record<string, number> = { fang: 26, maul: 34, glaive: 46, rod: 30, pendulum: 32 };

/**
 * A simple scripted player used by the headless playtest simulator.
 * It approaches, attacks with light chains/heavies/arts, dodges telegraphed attacks and drinks oil.
 * It is deliberately "average-skilled" — the numbers it produces are a floor, not a ceiling.
 */
export class Bot {
  input = new ScriptedInput();
  t = 0;
  stuck = 0;
  lastX = 0;
  skill: number;
  constructor(skill = 0.6) {
    this.skill = skill;
  }
  tick(w: World): void {
    const inp = this.input;
    const p = w.player;
    this.t++;
    inp.heldSet.clear();
    if (p.dead) return;
    const target = this.nearest(w);
    const range = RANGE[p.moveset.cls] ?? 28;
    // threat detection → dodge / parry
    const threat = w.enemies.some((e) => e.alive && e.telegraph > 0.82 && Math.abs(e.x - p.x) < 80 + e.w) || w.projectiles.some((pr) => pr.team === 'enemy' && Math.abs(pr.x - p.x) < 34 && Math.abs(pr.y - p.cy) < 30);
    if (threat && p.state !== 'dodge' && this.rand() < this.skill * 0.35) {
      inp.press('dodge');
      if (target) inp.heldSet.add(target.x > p.x ? 'left' : 'right');
      return;
    }
    if (p.hp < p.derived.maxHp * 0.35 && p.potions > 0 && !threat && this.t % 30 === 0) inp.press('potion');
    if (!target) {
      // no enemies: walk to the exit
      const ex = w.room.exits[0];
      if (ex && w.exitOpen) this.moveTo(w, ex.x, ex.y);
      return;
    }
    const dx = target.x - p.x;
    const dy = target.y - target.h / 2 - p.cy;
    const adx = Math.abs(dx);
    if (p.onGround && dy > 30 && adx < 60) {
      // target below: drop through planks / walk off ledges
      this.input.heldSet.add('down');
      if (this.t % 10 === 0) this.input.press('jump');
      this.moveTo(w, target.x, target.y);
      return;
    }
    if (adx > range || Math.abs(dy) > 40) {
      this.moveTo(w, target.x - Math.sign(dx) * range * 0.6, target.y);
      if (target.def.flying && Math.abs(dy) > 30 && adx < 60 && p.onGround) inp.press('jump');
      if (!p.onGround && adx < range + 10 && this.t % 6 === 0) inp.press('light');
      return;
    }
    if (Math.sign(dx) !== p.facing && Math.abs(dx) > 4) inp.heldSet.add(dx > 0 ? 'right' : 'left');
    if (p.mp >= p.artCost() && this.t % 90 === 0) inp.press('art');
    else if (this.t % 6 === 0) inp.press(this.t % 36 === 0 ? 'heavy' : 'light');
    if (target.def.flying && dy < -20 && p.onGround && this.t % 40 === 0) inp.press('jump');
  }
  private moveTo(w: World, x: number, _y: number): void {
    const p = w.player;
    const dir = x > p.x ? 'right' : 'left';
    if (Math.abs(x - p.x) > 6) this.input.heldSet.add(dir);
    if (Math.abs(p.x - this.lastX) < 0.2 && Math.abs(x - p.x) > 10) this.stuck++;
    else this.stuck = 0;
    this.lastX = p.x;
    if (this.stuck > 8 && p.onGround) {
      this.input.press('jump');
      this.input.heldSet.add('jump');
      this.stuck = 0;
    }
    if (!p.onGround && p.vy < 0) this.input.heldSet.add('jump');
    // gaps / ledges
    if (p.onGround && !w.room.groundBelow(p.x + (dir === 'right' ? 14 : -14), p.y)) {
      this.input.press('jump');
      this.input.heldSet.add('jump');
    }
  }
  private nearest(w: World): Enemy | null {
    let best: Enemy | null = null;
    let bd = 1e9;
    for (const e of w.enemies) {
      if (!e.alive || e.def.ai === 'dummy') continue;
      const d = Math.abs(e.x - w.player.x) + Math.abs(e.y - w.player.y) * 0.5;
      if (d < bd) {
        bd = d;
        best = e;
      }
    }
    return best;
  }
  private seed = 1234567;
  private rand(): number {
    this.seed = (this.seed * 1103515245 + 12345) >>> 0;
    return this.seed / 4294967296;
  }
}
