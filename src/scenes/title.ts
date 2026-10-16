import { UI_H, UI_W } from '../core/constants';
import type { Game, Scene } from '../game';
import { MessagePanel } from '../ui/panels/common';
import { SettingsPanel } from '../ui/panels/settings';
import { C, ListNav, heading, hints, selRow, text, titleFont, type Ctx } from '../ui/ui';
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
  private art: HTMLCanvasElement | null = null;
  private px: HTMLCanvasElement | null = null;

  /** Static pixel-art backdrop at 480x270 (rendered once). */
  private buildArt(): HTMLCanvasElement {
    const c = document.createElement('canvas');
    c.width = 480;
    c.height = 270;
    const g = c.getContext('2d')!;
    const sky = g.createLinearGradient(0, 0, 0, 270);
    sky.addColorStop(0, '#07051a');
    sky.addColorStop(0.55, '#1c1030');
    sky.addColorStop(0.85, '#4a1c20');
    sky.addColorStop(1, '#a04018');
    g.fillStyle = sky;
    g.fillRect(0, 0, 480, 270);
    let seed = 7;
    const rnd = () => ((seed = (seed * 1103515245 + 12345) >>> 0) / 4294967296);
    for (let i = 0; i < 160; i++) {
      g.fillStyle = `rgba(255,240,220,${rnd() * 0.7})`;
      g.fillRect(Math.floor(rnd() * 480), Math.floor(rnd() * 150), 1, 1);
    }
    // the fallen star
    const sg = g.createRadialGradient(330, 52, 0, 330, 52, 60);
    sg.addColorStop(0, 'rgba(255,240,200,0.9)');
    sg.addColorStop(0.15, 'rgba(255,190,120,0.45)');
    sg.addColorStop(1, 'rgba(255,120,60,0)');
    g.fillStyle = sg;
    g.fillRect(260, 0, 140, 120);
    g.strokeStyle = 'rgba(255,220,170,0.35)';
    g.beginPath();
    g.moveTo(330, 52);
    g.lineTo(420, 6);
    g.stroke();
    g.fillStyle = '#fff6e0';
    g.fillRect(328, 50, 4, 4);
    // cliff layers, far to near
    const layer = (color: string, base: number, amp: number, step: number) => {
      g.fillStyle = color;
      g.beginPath();
      g.moveTo(0, 270);
      for (let x = 0; x <= 480; x += step) g.lineTo(x, base - Math.abs(Math.sin(x * 0.031 + base)) * amp - rnd() * amp * 0.4);
      g.lineTo(480, 270);
      g.fill();
    };
    layer('#24132a', 170, 40, 12);
    layer('#1a0e1e', 200, 30, 9);
    // abyss glow & fog
    const ab = g.createRadialGradient(240, 300, 10, 240, 300, 220);
    ab.addColorStop(0, 'rgba(255,140,60,0.65)');
    ab.addColorStop(1, 'rgba(255,90,40,0)');
    g.fillStyle = ab;
    g.fillRect(0, 120, 480, 150);
    // foreground cliff (right) with the lone Wick
    g.fillStyle = '#0a0610';
    g.beginPath();
    g.moveTo(480, 270);
    g.lineTo(300, 270);
    g.lineTo(316, 222);
    g.lineTo(334, 214);
    g.lineTo(370, 210);
    g.lineTo(392, 196);
    g.lineTo(480, 190);
    g.fill();
    g.beginPath();
    g.moveTo(0, 270);
    g.lineTo(0, 214);
    g.lineTo(40, 226);
    g.lineTo(70, 248);
    g.lineTo(96, 270);
    g.fill();
    // the Wick silhouette
    g.fillRect(352, 194, 6, 16);
    g.fillRect(353, 189, 4, 5);
    g.beginPath();
    g.moveTo(352, 196);
    g.lineTo(344, 208);
    g.lineTo(352, 206);
    g.fill();
    g.fillRect(358, 199, 5, 1);
    return c;
  }

  render(ctx: Ctx, g: Game): void {
    if (!this.art) {
      this.art = this.buildArt();
      this.px = document.createElement('canvas');
      this.px.width = 480;
      this.px.height = 270;
    }
    const pg = this.px!.getContext('2d')!;
    pg.drawImage(this.art, 0, 0);
    // embers rising from the abyss
    for (const e of this.embers) {
      const x = Math.round(e.x / 2);
      const y = Math.round(e.y / 2);
      pg.globalAlpha = 0.5 + Math.sin(this.t / 300 + e.x) * 0.4;
      pg.fillStyle = e.s > 2 ? '#ffe0a0' : '#ff8a3d';
      pg.fillRect(x, y, 1, 1);
    }
    pg.globalAlpha = 1;
    // the lantern
    const lx = 363;
    const ly = 201;
    pg.globalCompositeOperation = 'lighter';
    const lg = pg.createRadialGradient(lx, ly, 0, lx, ly, 34);
    lg.addColorStop(0, `rgba(255,200,110,${0.75 + Math.sin(this.t / 120) * 0.08})`);
    lg.addColorStop(0.3, 'rgba(255,170,80,0.22)');
    lg.addColorStop(1, 'rgba(255,140,60,0)');
    pg.fillStyle = lg;
    pg.fillRect(lx - 34, ly - 34, 68, 68);
    pg.globalCompositeOperation = 'source-over';
    pg.fillStyle = '#fff2c0';
    pg.fillRect(lx - 1, ly - 1, 2, 3);
    // fluttering cloak
    pg.fillStyle = '#0a0610';
    pg.beginPath();
    pg.moveTo(352, 197);
    pg.lineTo(343 + Math.sin(this.t / 240) * 2, 203 + Math.sin(this.t / 170));
    pg.lineTo(351, 204);
    pg.fill();
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(this.px!, 0, 0, UI_W, UI_H);
    // vignette
    const vg = ctx.createRadialGradient(UI_W / 2, UI_H / 2, UI_H * 0.3, UI_W / 2, UI_H / 2, UI_W * 0.65);
    vg.addColorStop(0, 'rgba(0,0,0,0)');
    vg.addColorStop(1, 'rgba(0,0,0,0.6)');
    ctx.fillStyle = vg;
    ctx.fillRect(0, 0, UI_W, UI_H);
    // logo
    ctx.save();
    ctx.shadowColor = 'rgba(255,150,60,0.8)';
    ctx.shadowBlur = 28;
    heading(ctx, 'CINDERDEEP', UI_W / 2 - 150, 92, '#ffd890', 60, 'center');
    ctx.restore();
    heading(ctx, 'CINDERDEEP', UI_W / 2 - 150, 92, '#ffe6b0', 60, 'center');
    ctx.font = titleFont(15);
    ctx.textAlign = 'center';
    ctx.fillStyle = '#d8b8a0';
    ctx.fillText('EXPEDITIONS  OF  THE  LAST  LANTERN', UI_W / 2 - 150, 166);
    for (const dir of [-1, 1]) {
      const gr = ctx.createLinearGradient(UI_W / 2 - 150, 0, UI_W / 2 - 150 + dir * 220, 0);
      gr.addColorStop(0, 'rgba(216,168,96,0.9)');
      gr.addColorStop(1, 'rgba(216,168,96,0)');
      ctx.fillStyle = gr;
      ctx.fillRect(Math.min(UI_W / 2 - 150, UI_W / 2 - 150 + dir * 220), 192, 220, 1);
    }
    if (!this.started) {
      ctx.globalAlpha = 0.45 + Math.sin(this.t / 350) * 0.4;
      heading(ctx, 'Press any key', UI_W / 2 - 150, 330, '#f4ead8', 18, 'center');
      ctx.globalAlpha = 1;
    } else {
      this.items(g).forEach((it, i) => {
        const y = 250 + i * 42;
        const x0 = UI_W / 2 - 150 - 170;
        selRow(ctx, x0, y, 340, 34, this.nav.i === i, g.t);
        heading(ctx, it.label, UI_W / 2 - 150, y + 9, this.nav.i === i ? C.title : '#cfc2b0', 16, 'center');
      });
      hints(ctx, g.input, [['up', 'Choose'], ['confirm', 'Select']]);
    }
    text(ctx, 'Keyboard & gamepad supported · v0.2', 16, UI_H - 24, '#6a5c74', 12);
  }
}
