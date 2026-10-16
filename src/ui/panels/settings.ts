import { UI_H, UI_W } from '../../core/constants';
import { ACTION_LABEL, DEFAULT_KEYS, GAMEPLAY_ACTIONS, keyLabel, type Action } from '../../core/input';
import { DEFAULT_SETTINGS, type Settings } from '../../core/settings';
import type { Game, Panel } from '../../game';
import { wipeSave } from '../../meta/save';
import { C, ListNav, bar, dim, hints, panel, para, selRow, tabs, text, type Ctx } from '../ui';
import { ConfirmPanel } from './common';

interface Row {
  label: string;
  get: (s: Settings) => string;
  frac?: (s: Settings) => number;
  adjust?: (s: Settings, d: number) => void;
  action?: () => void;
  help?: string;
}

export class SettingsPanel implements Panel {
  closed = false;
  tab = 0;
  nav = new ListNav(14);
  keyNav = new ListNav(14);
  capturing: Action | null = null;
  constructor(public game: Game, public onQuitToTitle?: () => void) {}

  private rows(): Row[] {
    const num = (k: 'master' | 'sfx' | 'music' | 'screenShake' | 'effects' | 'darkness', min = 0, max = 1, step = 0.1): Partial<Row> => ({
      get: (s) => `${Math.round(s[k] * 100)}%`,
      frac: (s) => (s[k] - min) / (max - min),
      adjust: (s, d) => (s[k] = Math.round(Math.min(max, Math.max(min, s[k] + d * step)) * 100) / 100),
    });
    const bool = (k: 'flashes' | 'damageNumbers' | 'rumble' | 'showFps'): Partial<Row> => ({ get: (s) => (s[k] ? 'On' : 'Off'), adjust: (s) => (s[k] = !s[k]) });
    return [
      { label: 'Master Volume', ...num('master') } as Row,
      { label: 'Effects Volume', ...num('sfx') } as Row,
      { label: 'Music Volume', ...num('music') } as Row,
      { label: 'Screen Shake', ...num('screenShake'), help: 'Scales all camera shake and impact kicks. 0% disables them.' } as Row,
      { label: 'Screen Flashes', ...bool('flashes'), help: 'Full-screen flashes on parries, crits and boss attacks.' } as Row,
      { label: 'Particle Intensity', ...num('effects', 0.25, 1, 0.25), help: 'Reduce sparks, embers and debris for clarity or performance.' } as Row,
      { label: 'Lantern Darkness', ...num('darkness'), help: 'How dark the caverns are outside your lantern light.' } as Row,
      { label: 'Damage Numbers', ...bool('damageNumbers') } as Row,
      { label: 'Controller Vibration', ...bool('rumble') } as Row,
      { label: 'Show FPS / Frame Time', ...bool('showFps') } as Row,
      { label: 'Reset to Defaults', get: () => '', action: () => Object.assign(this.game.profile.settings, { ...DEFAULT_SETTINGS, bindings: this.game.profile.settings.bindings }) },
      {
        label: 'Delete Save Data', get: () => '', help: 'Permanently erases all progress.', action: () =>
          this.game.push(new ConfirmPanel('Erase ALL progress permanently? This cannot be undone.', () => {
            wipeSave();
            location.reload();
          }, 'Erase', 'Keep')),
      },
      ...(this.onQuitToTitle ? [{ label: 'Quit to Title', get: () => '', action: () => { this.closed = true; this.onQuitToTitle!(); } }] : []),
    ];
  }

  update(g: Game): void {
    const inp = g.input;
    if (this.capturing) return; // waiting for key (Input.captureNext)
    if (inp.take('tabL') || inp.take('tabR')) {
      this.tab = 1 - this.tab;
      g.sfx('menu');
    }
    const s = g.profile.settings;
    if (this.tab === 0) {
      const rows = this.rows();
      if (this.nav.update(inp, rows.length)) g.sfx('menu');
      const r = rows[this.nav.i];
      if (r.adjust) {
        if (inp.take('left')) {
          r.adjust(s, -1);
          g.applySettings();
          g.sfx('menu');
        }
        if (inp.take('right') || inp.take('confirm')) {
          r.adjust(s, 1);
          g.applySettings();
          g.sfx('menu');
        }
      } else if (r.action && inp.take('confirm')) {
        r.action();
        g.applySettings();
        g.sfx('confirm');
      }
    } else {
      const acts = GAMEPLAY_ACTIONS;
      if (this.keyNav.update(inp, acts.length + 1)) g.sfx('menu');
      if (inp.take('confirm')) {
        if (this.keyNav.i === acts.length) {
          g.input.bindings = JSON.parse(JSON.stringify(DEFAULT_KEYS));
          s.bindings = null;
          g.sfx('confirm');
          g.toast('Controls reset to defaults', C.good);
        } else {
          const a = acts[this.keyNav.i];
          this.capturing = a;
          g.input.captureNext = (code) => {
            this.capturing = null;
            if (code === 'Escape') return;
            const b = g.input.bindings;
            // replace the primary key, keep secondary
            b[a] = [code, ...b[a].filter((k, i) => i > 0 && k !== code)];
            s.bindings = JSON.parse(JSON.stringify(b));
            g.sfx('confirm');
          };
        }
      }
    }
    if (inp.take('back') || inp.take('pause')) {
      this.closed = true;
      g.save();
      g.sfx('cancel');
    }
  }

  draw(g: Ctx, game: Game): void {
    dim(g, 0.75);
    panel(g, 120, 16, UI_W - 240, UI_H - 32);
    tabs(g, ['Options', 'Controls'], this.tab, 136, 26, game.input);
    const s = game.profile.settings;
    if (this.tab === 0) {
      const rows = this.rows();
      rows.forEach((r, i) => {
        const y = 66 + i * 30;
        selRow(g, 136, y, UI_W - 272, 28, this.nav.i === i, game.t);
        text(g, r.label, 150, y + 6, this.nav.i === i ? C.title : C.text, 14, 'left', true);
        if (r.frac) bar(g, 520, y + 10, 160, 8, r.frac(s), '#ffd27a');
        text(g, r.get(s), UI_W - 150, y + 6, C.text, 14, 'right');
      });
      const h = rows[this.nav.i]?.help;
      if (h) para(g, h, 150, UI_H - 76, 600, C.dim, 12);
    } else {
      const acts = GAMEPLAY_ACTIONS;
      text(g, 'Keyboard bindings (gamepad uses standard layout: A jump, X light, Y heavy, B dodge, LB guard, RB art, LT/RT spells, R3 oil)', 150, 60, C.dim, 11);
      for (let k = 0; k < this.keyNav.visible; k++) {
        const idx = this.keyNav.scroll + k;
        if (idx > acts.length) break;
        const y = 78 + k * 30;
        selRow(g, 136, y, UI_W - 272, 28, this.keyNav.i === idx, game.t);
        if (idx === acts.length) {
          text(g, 'Reset all to defaults', 150, y + 6, C.text, 14, 'left', true);
          continue;
        }
        const a = acts[idx];
        text(g, ACTION_LABEL[a], 150, y + 6, C.text, 14, 'left', true);
        const keys = this.capturing === a ? 'press a key…' : game.input.bindings[a].map(keyLabel).join(' / ');
        text(g, keys, UI_W - 150, y + 6, this.capturing === a ? C.title : C.text, 14, 'right');
      }
    }
    hints(g, game.input, [['left', 'Adjust'], ['confirm', 'Select'], ['back', 'Save & Close']], UI_W - 140, UI_H - 40);
  }
}
