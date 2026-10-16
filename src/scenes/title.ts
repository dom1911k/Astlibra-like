import { UI_H, UI_W } from '../core/constants';
import type { Game, Scene } from '../game';
import { MessagePanel } from '../ui/panels/common';
import { SettingsPanel } from '../ui/panels/settings';
import { C, ListNav, hints, selRow, text, type Ctx } from '../ui/ui';
import { ExpeditionScene, controlsText } from './expedition';
import { HubScene } from './hub';

export class TitleScene implements Scene {
  name = 'title';
  t = 0;
  nav = new ListNav(5);
  started = false;
  embers: { x: number; y: number; v: number; s: number }[] = [];
  constructor(public game: Game) {
    for (let i = 0; i < 90; i++) this.embers.push({ x: Math.random() * UI_W, y: Math.random() * UI_H, v: 0.2 + Math.random() * 0.8, s: 1 + Math.random() * 2 });
  }
  items(g: Game): { label: string; action: () => void }[] {
    const out: { label: string; action: () => void }[] = [];
    if (g.profile.run) out.push({ label: `Continue Expedition (Depth ${g.profile.run.depth})`, action: () => g.setScene(new ExpeditionScene(g)) });
    out.push({ label: 'Enter Lamplight', action: () => g.setScene(new HubScene(g)) });
    out.push({ label: 'Controls', action: () => g.push(new MessagePanel('Controls', controlsText(g), undefined, 640)) });
    out.push({ label: 'Settings', action: () => g.push(new SettingsPanel(g)) });
    return out;
  }
  enter(g: Game): void {
    g.audio.setMusic('title');
  }
  frame(g: Game, dt: number, sim: boolean): void {
    this.t += dt;
    for (const e of this.embers) {
      e.y -= e.v * dt * 0.05;
      e.x += Math.sin(this.t / 1000 + e.s * 3) * 0.2;
      if (e.y < -5) {
        e.y = UI_H + 5;
        e.x = Math.random() * UI_W;
      }
    }
    if (!sim) return;
    if (!this.started) {
      if (g.input.anyPressedThisFrame || g.input.take('confirm')) {
        this.started = true;
        g.audio.unlock();
        g.audio.setMusic('title');
        g.input.take('confirm');
        g.sfx('confirm');
      }
      return;
    }
    const items = this.items(g);
    if (this.nav.update(g.input, items.length)) g.sfx('menu');
    if (g.input.take('confirm')) {
      g.sfx('confirm');
      items[this.nav.i].action();
    }
  }
  render(ctx: Ctx, g: Game): void {
    const grad = ctx.createLinearGradient(0, 0, 0, UI_H);
    grad.addColorStop(0, '#08060e');
    grad.addColorStop(0.7, '#1a0e14');
    grad.addColorStop(1, '#3a1a10');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, UI_W, UI_H);
    // abyss silhouette
    ctx.fillStyle = '#05040a';
    ctx.beginPath();
    ctx.moveTo(0, UI_H);
    for (let x = 0; x <= UI_W; x += 40) ctx.lineTo(x, UI_H - 90 - Math.sin(x * 0.02) * 30 - (x % 80 === 0 ? 20 : 0));
    ctx.lineTo(UI_W, UI_H);
    ctx.fill();
    for (const e of this.embers) {
      ctx.globalAlpha = 0.4 + Math.sin(this.t / 300 + e.x) * 0.3;
      ctx.fillStyle = e.s > 2 ? '#ffd27a' : '#ff8a3d';
      ctx.fillRect(Math.round(e.x), Math.round(e.y), e.s, e.s);
    }
    ctx.globalAlpha = 1;
    // lantern glow
    const lg = ctx.createRadialGradient(UI_W / 2, 200, 0, UI_W / 2, 200, 260);
    lg.addColorStop(0, 'rgba(255,170,80,0.25)');
    lg.addColorStop(1, 'rgba(255,170,80,0)');
    ctx.fillStyle = lg;
    ctx.fillRect(0, 0, UI_W, UI_H);
    text(ctx, 'CINDERDEEP', UI_W / 2, 140, '#ffd27a', 64, 'center', true);
    text(ctx, 'Expeditions of the Last Lantern', UI_W / 2, 214, '#c8a8a0', 18, 'center');
    if (!this.started) {
      ctx.globalAlpha = 0.5 + Math.sin(this.t / 300) * 0.5;
      text(ctx, 'Press any key', UI_W / 2, 340, C.text, 18, 'center', true);
      ctx.globalAlpha = 1;
    } else {
      this.items(g).forEach((it, i) => {
        const y = 300 + i * 38;
        selRow(ctx, UI_W / 2 - 170, y, 340, 32, this.nav.i === i, g.t);
        text(ctx, it.label, UI_W / 2, y + 8, this.nav.i === i ? C.title : C.text, 16, 'center', true);
      });
      hints(ctx, g.input, [['up', 'Choose'], ['confirm', 'Select']]);
    }
    text(ctx, 'Keyboard & gamepad supported · v0.1', 16, UI_H - 24, '#5a5068', 12);
  }
}
