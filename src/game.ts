import { Audio } from './core/audio';
import { UI_H, UI_W } from './core/constants';
import { DEFAULT_KEYS, Input } from './core/input';
import type { Settings } from './core/settings';
import { loadTuning } from './core/tuning';
import type { Profile } from './meta/profile';
import { loadProfile, saveProfile } from './meta/save';
import { C, font, type Ctx } from './ui/ui';

export interface Panel {
  update(g: Game, dt: number): void;
  draw(ctx: Ctx, g: Game): void;
  closed?: boolean;
  /** if false the scene keeps simulating underneath (e.g. HUD-like overlays) */
  blocksSim?: boolean;
  onClose?: () => void;
}

export interface Scene {
  name: string;
  enter?(g: Game): void;
  exit?(g: Game): void;
  frame(g: Game, dt: number, simAllowed: boolean): void;
  render(ctx: Ctx, g: Game): void;
}

interface Toast {
  text: string;
  color: string;
  t: number;
  dur: number;
}

export class Game {
  canvas: HTMLCanvasElement;
  ctx: Ctx;
  input = new Input();
  audio = new Audio();
  profile: Profile;
  panels: Panel[] = [];
  scene!: Scene;
  toasts: Toast[] = [];
  t = 0;
  scale = 1;
  ox = 0;
  oy = 0;
  private last = 0;
  fps = 60;
  private fpsAcc = 0;
  private fpsN = 0;
  saveNotice = '';
  frameTimes: number[] = [];

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d')!;
    const lr = loadProfile();
    this.profile = lr.profile;
    if (lr.corrupt) this.saveNotice = lr.source === 'backup' ? 'Save data was damaged — restored from backup.' : 'Save data was unreadable — a new save was started.';
    loadTuning();
    this.applySettings();
    this.input.attach(window);
    this.input.onFirstInput = () => {
      this.audio.unlock();
      this.audio.applyVolumes();
    };
    window.addEventListener('resize', () => this.resize());
    this.resize();
  }

  get settings(): Settings {
    return this.profile.settings;
  }

  applySettings(): void {
    const s = this.settings;
    this.audio.volumes = { master: s.master, sfx: s.sfx, music: s.music };
    this.audio.applyVolumes();
    if (s.bindings) {
      // merge so new actions added in later versions keep their defaults
      this.input.bindings = { ...JSON.parse(JSON.stringify(DEFAULT_KEYS)), ...s.bindings };
    }
  }

  resize(): void {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.canvas.width = Math.round(w * dpr);
    this.canvas.height = Math.round(h * dpr);
    this.canvas.style.width = w + 'px';
    this.canvas.style.height = h + 'px';
    const s = Math.min(this.canvas.width / UI_W, this.canvas.height / UI_H);
    this.scale = s;
    this.ox = Math.round((this.canvas.width - UI_W * s) / 2);
    this.oy = Math.round((this.canvas.height - UI_H * s) / 2);
  }

  setScene(s: Scene): void {
    this.scene?.exit?.(this);
    this.panels = [];
    this.scene = s;
    s.enter?.(this);
    this.input.clearSim();
  }

  push(p: Panel): void {
    this.panels.push(p);
    this.input.clearSim();
  }
  get topPanel(): Panel | null {
    return this.panels[this.panels.length - 1] ?? null;
  }

  toast(text: string, color = C.text, dur = 2600): void {
    this.toasts.push({ text, color, t: 0, dur });
    if (this.toasts.length > 6) this.toasts.shift();
  }

  save(): void {
    if (!saveProfile(this.profile)) this.toast('Warning: could not write save data', C.bad);
  }

  sfx(id: string, vol = 1): void {
    this.audio.play(id, vol);
  }

  start(): void {
    const loop = (now: number) => {
      const dt = this.last ? Math.min(100, now - this.last) : 16.7;
      this.last = now;
      this.frame(dt);
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  }

  frame(dt: number): void {
    const t0 = performance.now();
    this.t += dt;
    this.fpsAcc += dt;
    this.fpsN++;
    if (this.fpsAcc > 500) {
      this.fps = Math.round((this.fpsN * 1000) / this.fpsAcc);
      this.fpsAcc = 0;
      this.fpsN = 0;
    }
    this.input.poll();
    this.audio.update();
    // panels
    const top = this.topPanel;
    if (top) {
      top.update(this, dt);
      if (top.closed) {
        this.panels.splice(this.panels.indexOf(top), 1);
        top.onClose?.();
        this.input.clearSim();
      }
    }
    const simAllowed = !this.panels.some((p) => p.blocksSim !== false);
    this.scene.frame(this, dt, simAllowed);
    for (const t of this.toasts) t.t += dt;
    this.toasts = this.toasts.filter((t) => t.t < t.dur);
    // render
    const g = this.ctx;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.fillStyle = '#000';
    g.fillRect(0, 0, this.canvas.width, this.canvas.height);
    g.setTransform(this.scale, 0, 0, this.scale, this.ox, this.oy);
    g.imageSmoothingEnabled = false;
    g.save();
    g.beginPath();
    g.rect(0, 0, UI_W, UI_H);
    g.clip();
    this.scene.render(g, this);
    for (const p of this.panels) p.draw(g, this);
    this.drawToasts(g);
    if (this.settings.showFps) {
      const ft = this.frameTimes.length ? Math.max(...this.frameTimes) : 0;
      g.font = font(12);
      g.fillStyle = '#9f9';
      g.textAlign = 'right';
      g.fillText(`${this.fps} fps · worst ${ft.toFixed(1)}ms`, UI_W - 8, UI_H - 46);
    }
    g.restore();
    this.input.endFrame();
    this.frameTimes.push(performance.now() - t0);
    if (this.frameTimes.length > 120) this.frameTimes.shift();
  }

  private drawToasts(g: Ctx): void {
    let y = 70;
    for (const t of this.toasts) {
      const a = t.t < 150 ? t.t / 150 : t.t > t.dur - 400 ? (t.dur - t.t) / 400 : 1;
      g.globalAlpha = Math.max(0, a);
      g.font = font(15, true);
      const w = g.measureText(t.text).width + 30;
      g.fillStyle = 'rgba(10,8,16,0.85)';
      g.fillRect(UI_W / 2 - w / 2, y, w, 26);
      g.fillStyle = t.color;
      g.fillRect(UI_W / 2 - w / 2, y, 3, 26);
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText(t.text, UI_W / 2, y + 13);
      y += 30;
    }
    g.globalAlpha = 1;
  }
}
