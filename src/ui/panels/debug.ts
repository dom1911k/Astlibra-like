import { UI_H, UI_W } from '../../core/constants';
import { Tuning, resetTuning, saveTuning, type HitStopKind } from '../../core/tuning';
import type { Game, Panel } from '../../game';
import { C, ListNav, hints, panel, para, selRow, text, type Ctx } from '../ui';

export interface DebugRow {
  label: string;
  get: () => string;
  adjust?: (d: number) => void;
  action?: () => void;
}

/** Live combat-feel tuning (Training Grounds, F1). Values persist to localStorage. */
export class DebugPanel implements Panel {
  closed = false;
  nav = new ListNav(16);
  constructor(public extra: DebugRow[]) {}
  rows(): DebugRow[] {
    const hs = (k: HitStopKind): DebugRow => ({ label: `Hit stop: ${k}`, get: () => `${Tuning.hitstop[k]} ms`, adjust: (d) => (Tuning.hitstop[k] = Math.max(0, Tuning.hitstop[k] + d * 5)) });
    const num = (label: string, get: () => number, set: (v: number) => void, step: number, fmt = (v: number) => v.toFixed(2)): DebugRow => ({ label, get: () => fmt(get()), adjust: (d) => set(Math.max(0, Math.round((get() + d * step) * 100) / 100)) });
    return [
      ...this.extra,
      num('Hit stop global scale', () => Tuning.hitstop.scale, (v) => (Tuning.hitstop.scale = v), 0.1),
      hs('light'), hs('heavy'), hs('crit'), hs('finisher'), hs('parry'), hs('guardBreak'), hs('kill'), hs('hurt'), hs('magic'),
      num('Multi-target bonus', () => Tuning.hitstop.multiTargetBonus, (v) => (Tuning.hitstop.multiTargetBonus = v), 0.05),
      num('Hit stop budget (ms / window)', () => Tuning.hitstop.budgetMs, (v) => (Tuning.hitstop.budgetMs = v), 10, (v) => `${v}`),
      num('Knockback scale', () => Tuning.knockbackScale, (v) => (Tuning.knockbackScale = v), 0.1),
      num('Screen shake scale', () => Tuning.shakeScale, (v) => (Tuning.shakeScale = v), 0.1),
      num('Input buffer (ticks)', () => Tuning.inputBufferTicks, (v) => (Tuning.inputBufferTicks = v), 1, (v) => `${v}`),
      num('Coyote time (ticks)', () => Tuning.coyoteTicks, (v) => (Tuning.coyoteTicks = v), 1, (v) => `${v}`),
      num('Parry window (ticks)', () => Tuning.parryWindowTicks, (v) => (Tuning.parryWindowTicks = v), 1, (v) => `${v}`),
      num('Dodge i-frames (ticks)', () => Tuning.dodgeIframes, (v) => (Tuning.dodgeIframes = v), 1, (v) => `${v}`),
      num('Victim shake (px)', () => Tuning.victimShakePx, (v) => (Tuning.victimShakePx = v), 1, (v) => `${v}`),
      { label: 'Show hitboxes', get: () => (Tuning.showHitboxes ? 'On' : 'Off'), adjust: () => (Tuning.showHitboxes = !Tuning.showHitboxes) },
      { label: 'God mode (no death)', get: () => (Tuning.godMode ? 'On' : 'Off'), adjust: () => (Tuning.godMode = !Tuning.godMode) },
      { label: 'Reset all tuning to defaults', get: () => '', action: () => resetTuning() },
    ];
  }
  update(g: Game): void {
    const rows = this.rows();
    this.nav.update(g.input, rows.length);
    const r = rows[this.nav.i];
    if (r?.adjust) {
      if (g.input.take('left')) r.adjust(-1);
      if (g.input.take('right')) r.adjust(1);
    }
    if (g.input.take('confirm')) {
      if (r?.action) r.action();
      else r?.adjust?.(1);
      g.sfx('menu');
    }
    if (g.input.take('debug') || g.input.take('back') || g.input.take('pause')) {
      this.closed = true;
      saveTuning();
    }
  }
  draw(g: Ctx, game: Game): void {
    const w = 430;
    const x = UI_W - w - 10;
    panel(g, x, 10, w, UI_H - 20, 'Combat Feel Tuning (F1)');
    const rows = this.rows();
    const nav = this.nav;
    for (let k = 0; k < nav.visible; k++) {
      const idx = nav.scroll + k;
      if (idx >= rows.length) break;
      const r = rows[idx];
      const y = 52 + k * 26;
      selRow(g, x + 8, y, w - 16, 24, nav.i === idx, game.t);
      text(g, r.label, x + 18, y + 5, nav.i === idx ? C.title : C.text, 13);
      text(g, r.get(), x + w - 18, y + 5, C.text, 13, 'right', true);
    }
    para(g, 'Simulation is paused while this panel is open. Changes persist and apply instantly.', x + 14, UI_H - 66, w - 28, C.dim, 11);
    hints(g, game.input, [['left', 'Adjust'], ['confirm', 'Do'], ['debug', 'Close']], UI_W - 20, UI_H - 34);
  }
}
