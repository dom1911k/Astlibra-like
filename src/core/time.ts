import { TICK_MS } from './constants';
import { Tuning, type HitStopKind } from './tuning';

/**
 * Controls gameplay time independently of rendering.
 *
 * Rules (documented in docs/DESIGN.md §8):
 *  - Hit stop skips whole gameplay ticks. Everything inside the World simulation
 *    (movement, AI, projectiles, cooldowns, DoTs, buffs, input-buffer ageing) pauses.
 *  - Rendering, UI, audio, screen shake and "fx" particles keep running in real time.
 *  - Requests within one tick merge by max; while active, a new request only extends to
 *    max(remaining, new). A rolling budget clamps long chains of stops.
 */
export class TimeController {
  hitStopMs = 0;
  timeScale = 1;
  private slowMoMs = 0;
  private slowMoScale = 1;
  private acc = 0;
  private pending = 0;
  private recent: { t: number; ms: number }[] = [];
  private clock = 0; // game-ms clock used for the budget window
  /** total ticks simulated, useful for stats */
  ticks = 0;

  request(kind: HitStopKind, mult = 1): void {
    const ms = Tuning.hitstop[kind] * Tuning.hitstop.scale * mult;
    if (ms > this.pending) this.pending = ms;
  }
  requestMs(ms: number): void {
    if (ms > this.pending) this.pending = ms;
  }
  /** Called after each simulated tick: applies merged hit-stop requests with budget. */
  flush(): void {
    if (this.pending <= 0) return;
    let ms = this.pending;
    this.pending = 0;
    const win = Tuning.hitstop.budgetWindowMs;
    this.recent = this.recent.filter((r) => this.clock - r.t < win);
    const used = this.recent.reduce((s, r) => s + r.ms, 0);
    if (used + ms > Tuning.hitstop.budgetMs) {
      const room = Math.max(0, Tuning.hitstop.budgetMs - used);
      ms = room + (ms - room) * Tuning.hitstop.overBudgetScale;
    }
    if (ms <= this.hitStopMs) return;
    this.recent.push({ t: this.clock, ms: ms - this.hitStopMs });
    this.hitStopMs = ms;
  }
  slowMo(scale: number, ms: number): void {
    this.slowMoScale = scale;
    this.slowMoMs = ms;
  }
  get frozen(): boolean {
    return this.hitStopMs > 0;
  }
  /**
   * Advance by real elapsed ms; calls `tick` for each fixed simulation step.
   * Returns interpolation alpha for rendering.
   */
  advance(realMs: number, tick: () => void): number {
    realMs = Math.min(realMs, 100); // avoid spiral of death after tab-out
    let scale = this.timeScale;
    if (this.slowMoMs > 0) {
      this.slowMoMs -= realMs;
      scale *= this.slowMoScale;
    }
    this.acc += realMs * scale;
    let guard = 0;
    for (;;) {
      if (this.hitStopMs > 0) {
        const c = Math.min(this.hitStopMs, this.acc);
        this.hitStopMs -= c;
        this.acc -= c;
        this.clock += c;
        if (this.hitStopMs > 0) break;
      }
      if (this.acc < TICK_MS || guard++ > 8) break;
      tick();
      this.ticks++;
      this.acc -= TICK_MS;
      this.clock += TICK_MS;
      this.flush();
    }
    if (guard > 8) this.acc = 0;
    return this.hitStopMs > 0 ? 1 : Math.min(1, this.acc / TICK_MS);
  }
  reset(): void {
    this.hitStopMs = 0;
    this.acc = 0;
    this.pending = 0;
    this.recent = [];
    this.slowMoMs = 0;
  }
}
