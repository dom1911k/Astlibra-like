import type { Action, Input } from '../core/input';
import { UI_H, UI_W } from '../core/constants';

export const FONT = '"Source Sans 3", "Trebuchet MS", "Segoe UI", Arial, sans-serif';
export const TITLE_FONT = '"Cinzel", Georgia, "Times New Roman", serif';
export const C = {
  bg: 'rgba(12,9,18,0.95)',
  bg2: 'rgba(28,22,40,0.92)',
  border: '#5e4e76',
  borderHi: '#ffd27a',
  title: '#ffd27a',
  text: '#ece4d4',
  dim: '#958aa6',
  good: '#7cff8a',
  bad: '#ff6a6a',
  sel: 'rgba(255,210,122,0.14)',
  hp: '#e04848',
  mp: '#4a8cff',
  xp: '#c77dff',
  gilt: '#ffd23c',
  cinder: '#ff8a3d',
};

export type Ctx = CanvasRenderingContext2D;

export function font(size: number, bold = false): string {
  return `${bold ? 'bold ' : ''}${size}px ${FONT}`;
}
export function titleFont(size: number): string {
  return `700 ${size}px ${TITLE_FONT}`;
}

/** Heading text in the display face, with a soft dark shadow. */
export function heading(g: Ctx, s: string, x: number, y: number, color = C.title, size = 18, align: CanvasTextAlign = 'left'): void {
  g.font = titleFont(size);
  g.textAlign = align;
  g.textBaseline = 'top';
  g.fillStyle = 'rgba(0,0,0,0.7)';
  g.fillText(s, x + 1, y + 2);
  g.fillStyle = color;
  g.fillText(s, x, y);
}

function diamond(g: Ctx, x: number, y: number, r: number, color: string): void {
  g.fillStyle = color;
  g.beginPath();
  g.moveTo(x, y - r);
  g.lineTo(x + r, y);
  g.lineTo(x, y + r);
  g.lineTo(x - r, y);
  g.fill();
}

export function text(g: Ctx, s: string, x: number, y: number, color = C.text, size = 14, align: CanvasTextAlign = 'left', bold = false): void {
  g.font = font(size, bold);
  g.textAlign = align;
  g.textBaseline = 'top';
  g.fillStyle = color;
  g.fillText(s, x, y);
}

export function textShadow(g: Ctx, s: string, x: number, y: number, color = C.text, size = 14, align: CanvasTextAlign = 'left', bold = false): void {
  g.font = font(size, bold);
  g.textAlign = align;
  g.textBaseline = 'top';
  g.lineWidth = 3;
  g.strokeStyle = 'rgba(0,0,0,0.9)';
  g.strokeText(s, x, y);
  g.fillStyle = color;
  g.fillText(s, x, y);
}

export function wrap(g: Ctx, s: string, maxW: number, size = 13): string[] {
  g.font = font(size);
  const out: string[] = [];
  for (const para of s.split('\n')) {
    const words = para.split(' ');
    let line = '';
    for (const w of words) {
      const t = line ? line + ' ' + w : w;
      if (g.measureText(t).width > maxW && line) {
        out.push(line);
        line = w;
      } else line = t;
    }
    out.push(line);
  }
  return out;
}

export function para(g: Ctx, s: string, x: number, y: number, maxW: number, color = C.text, size = 13, lh = 1.35): number {
  const lines = wrap(g, s, maxW, size);
  for (const l of lines) {
    text(g, l, x, y, color, size);
    y += size * lh;
  }
  return y;
}

export function panel(g: Ctx, x: number, y: number, w: number, h: number, title?: string, accent = C.border): void {
  const bg = g.createLinearGradient(0, y, 0, y + h);
  bg.addColorStop(0, 'rgba(30,22,40,0.97)');
  bg.addColorStop(1, 'rgba(10,7,14,0.97)');
  g.fillStyle = bg;
  g.fillRect(x, y, w, h);
  // subtle inner glow at the top
  const ig = g.createLinearGradient(0, y, 0, y + 60);
  ig.addColorStop(0, 'rgba(255,210,122,0.07)');
  ig.addColorStop(1, 'rgba(255,210,122,0)');
  g.fillStyle = ig;
  g.fillRect(x, y, w, 60);
  // double frame: dark outer, gold hairline inner
  g.strokeStyle = '#05030a';
  g.lineWidth = 3;
  g.strokeRect(x + 1.5, y + 1.5, w - 3, h - 3);
  g.strokeStyle = accent === C.border ? 'rgba(200,160,90,0.55)' : accent;
  g.lineWidth = 1;
  g.strokeRect(x + 5.5, y + 5.5, w - 11, h - 11);
  // ornamental corners
  const gold = accent === C.border ? '#d8a860' : accent;
  for (const [cx, cy] of [[x + 6, y + 6], [x + w - 6, y + 6], [x + 6, y + h - 6], [x + w - 6, y + h - 6]]) {
    diamond(g, cx, cy, 4, '#05030a');
    diamond(g, cx, cy, 3, gold);
  }
  if (title) {
    heading(g, title, x + 20, y + 14, C.title, 18);
    g.font = titleFont(18);
    const tw = g.measureText(title).width;
    const ly = y + 41;
    const grad = g.createLinearGradient(x + 20, 0, x + w - 20, 0);
    grad.addColorStop(0, 'rgba(216,168,96,0.7)');
    grad.addColorStop(1, 'rgba(216,168,96,0)');
    g.fillStyle = grad;
    g.fillRect(x + 20, ly, w - 40, 1);
    diamond(g, x + 24 + tw + 10, y + 24, 2.5, gold);
  }
}

export function dim(g: Ctx, a = 0.55): void {
  g.fillStyle = `rgba(0,0,0,${a})`;
  g.fillRect(0, 0, UI_W, UI_H);
}

export function bar(g: Ctx, x: number, y: number, w: number, h: number, frac: number, color: string, back = 'rgba(0,0,0,0.6)', ghost?: number): void {
  frac = Math.max(0, Math.min(1, frac));
  g.fillStyle = '#05030a';
  g.fillRect(x - 1, y - 1, w + 2, h + 2);
  g.fillStyle = back;
  g.fillRect(x, y, w, h);
  if (ghost !== undefined && ghost > frac) {
    g.fillStyle = 'rgba(255,240,220,0.55)';
    g.fillRect(x, y, w * Math.min(1, ghost), h);
  }
  if (frac > 0) {
    const grad = g.createLinearGradient(0, y, 0, y + h);
    grad.addColorStop(0, lighten(color, 0.35));
    grad.addColorStop(0.5, color);
    grad.addColorStop(1, darken(color, 0.35));
    g.fillStyle = grad;
    g.fillRect(x, y, w * frac, h);
    g.fillStyle = 'rgba(255,255,255,0.35)';
    g.fillRect(x, y, w * frac, 1);
    if (h >= 6) {
      g.fillStyle = 'rgba(255,255,255,0.8)';
      g.fillRect(x + w * frac - 1, y, 1, h);
    }
  }
}

function lighten(c: string, t: number): string {
  return mixHex(c, '#ffffff', t);
}
function darken(c: string, t: number): string {
  return mixHex(c, '#000000', t);
}
function mixHex(a: string, b: string, t: number): string {
  if (!a.startsWith('#')) return a;
  let h = a.slice(1);
  if (h.length === 3) h = h.split('').map((x) => x + x).join('');
  const pa = parseInt(h, 16);
  const pb = parseInt(b.slice(1), 16);
  const ch = (s: number) => Math.round(((pa >> s) & 255) * (1 - t) + ((pb >> s) & 255) * t);
  return `rgb(${ch(16)},${ch(8)},${ch(0)})`;
}

export function selRow(g: Ctx, x: number, y: number, w: number, h: number, selected: boolean, t: number): void {
  if (!selected) return;
  const grad = g.createLinearGradient(x, 0, x + w, 0);
  grad.addColorStop(0, 'rgba(255,200,110,0.26)');
  grad.addColorStop(0.6, 'rgba(255,200,110,0.08)');
  grad.addColorStop(1, 'rgba(255,200,110,0)');
  g.fillStyle = grad;
  g.fillRect(x, y, w, h);
  g.fillStyle = 'rgba(255,220,150,0.5)';
  g.fillRect(x, y, w * 0.6, 1);
  g.fillRect(x, y + h - 1, w * 0.6, 1);
  const pulse = 0.75 + Math.sin(t / 160) * 0.25;
  g.globalAlpha = pulse;
  diamond(g, x + 2, y + h / 2, 4, '#ffd27a');
  g.globalAlpha = 1;
}

/** Bottom-right key hint row like "[J] Select  [K] Back". */
export function hints(g: Ctx, input: Input, items: [Action, string][], x = UI_W - 16, y = UI_H - 26): void {
  g.font = font(13);
  let cx = x;
  for (let i = items.length - 1; i >= 0; i--) {
    const [a, label] = items[i];
    const key = input.keyName(a);
    const s = `${label}`;
    const w1 = g.measureText(s).width;
    g.textAlign = 'left';
    g.textBaseline = 'top';
    cx -= w1;
    g.fillStyle = C.dim;
    g.fillText(s, cx, y);
    g.font = font(12, true);
    const kw = g.measureText(key).width + 12;
    cx -= kw + 5;
    g.fillStyle = '#05030a';
    g.fillRect(cx - 1, y - 3, kw + 2, 20);
    const kg = g.createLinearGradient(0, y - 2, 0, y + 16);
    kg.addColorStop(0, '#4a3e58');
    kg.addColorStop(1, '#241c2e');
    g.fillStyle = kg;
    g.fillRect(cx, y - 2, kw, 18);
    g.fillStyle = 'rgba(255,255,255,0.18)';
    g.fillRect(cx, y - 2, kw, 1);
    g.fillStyle = '#f4ead8';
    g.fillText(key, cx + 6, y + 1);
    g.font = font(13);
    cx -= 16;
  }
}

/** Vertical list navigation helper (wraps, supports page jumps). */
export class ListNav {
  i = 0;
  scroll = 0;
  constructor(public visible = 10) {}
  update(input: Input, n: number, horizontal = false): boolean {
    if (n <= 0) {
      this.i = 0;
      return false;
    }
    const prev = this.i;
    const up: Action = horizontal ? 'left' : 'up';
    const down: Action = horizontal ? 'right' : 'down';
    if (input.take(up)) this.i = (this.i - 1 + n) % n;
    if (input.take(down)) this.i = (this.i + 1) % n;
    if (this.i >= n) this.i = n - 1;
    if (this.i < this.scroll) this.scroll = this.i;
    if (this.i >= this.scroll + this.visible) this.scroll = this.i - this.visible + 1;
    return prev !== this.i;
  }
}

export function scrollbar(g: Ctx, x: number, y: number, h: number, n: number, visible: number, scroll: number): void {
  if (n <= visible) return;
  g.fillStyle = 'rgba(255,255,255,0.08)';
  g.fillRect(x, y, 3, h);
  g.fillStyle = C.border;
  g.fillRect(x, y + (scroll / n) * h, 3, Math.max(10, (visible / n) * h));
}

export function tabs(g: Ctx, names: string[], active: number, x: number, y: number, input: Input): void {
  let cx = x;
  const lk = input.keyName('tabL');
  const rk = input.keyName('tabR');
  text(g, `◀ ${lk}`, cx, y + 6, C.dim, 12, 'left', true);
  cx += 42;
  names.forEach((n, i) => {
    g.font = titleFont(13);
    const w = g.measureText(n).width + 26;
    const on = i === active;
    if (on) {
      const grad = g.createLinearGradient(0, y, 0, y + 26);
      grad.addColorStop(0, 'rgba(255,200,110,0.28)');
      grad.addColorStop(1, 'rgba(255,200,110,0.04)');
      g.fillStyle = grad;
      g.fillRect(cx, y, w, 26);
      g.fillStyle = '#d8a860';
      g.fillRect(cx, y + 25, w, 1);
      g.fillRect(cx, y, 1, 26);
      g.fillRect(cx + w - 1, y, 1, 26);
      g.fillRect(cx, y, w, 1);
    } else {
      g.fillStyle = 'rgba(255,255,255,0.035)';
      g.fillRect(cx, y + 3, w, 23);
    }
    g.font = titleFont(13);
    g.textAlign = 'left';
    g.textBaseline = 'top';
    g.fillStyle = on ? C.title : C.dim;
    g.fillText(n, cx + 13, y + 6);
    cx += w + 3;
  });
  text(g, `${rk} ▶`, cx + 6, y + 6, C.dim, 12, 'left', true);
}

export interface Card {
  title: string;
  color: string;
  sub?: string;
  body: string;
  extra?: string;
}

export function drawCards(g: Ctx, cards: Card[], sel: number, y: number, t: number, w = 250, h = 240): void {
  const gap = 22;
  const total = cards.length * w + (cards.length - 1) * gap;
  let x = (UI_W - total) / 2;
  cards.forEach((c, i) => {
    const s = i === sel;
    const yy = y + (s ? -8 : 0);
    if (s) {
      g.save();
      g.shadowColor = c.color;
      g.shadowBlur = 24;
      g.fillStyle = 'rgba(0,0,0,0.01)';
      g.fillRect(x, yy, w, h);
      g.restore();
    }
    panel(g, x, yy, w, h, undefined, s ? c.color : C.border);
    // header band with a gem
    const hb = g.createLinearGradient(0, yy, 0, yy + 58);
    hb.addColorStop(0, hexA(c.color, s ? 0.3 : 0.16));
    hb.addColorStop(1, hexA(c.color, 0));
    g.fillStyle = hb;
    g.fillRect(x + 6, yy + 6, w - 12, 52);
    diamond(g, x + w / 2, yy + 6, 7, '#05030a');
    diamond(g, x + w / 2, yy + 6, 5, c.color);
    diamond(g, x + w / 2 - 1, yy + 5, 2, '#ffffff');
    heading(g, c.title, x + w / 2, yy + 18, c.color, c.title.length > 18 ? 14 : 16, 'center');
    if (c.sub) text(g, c.sub.toUpperCase(), x + w / 2, yy + 40, C.dim, 11, 'center', true);
    g.fillStyle = hexA(c.color, 0.35);
    g.fillRect(x + 30, yy + 58, w - 60, 1);
    const ty = para(g, c.body, x + 16, yy + 68, w - 32, C.text, 14);
    if (c.extra) para(g, c.extra, x + 16, ty + 6, w - 32, C.bad, 13);
    if (s) {
      g.globalAlpha = 0.35 + Math.sin(t / 160) * 0.25;
      g.fillStyle = c.color;
      g.fillRect(x + 8, yy + h - 10, w - 16, 3);
      g.globalAlpha = 1;
    }
    x += w + gap;
  });
}

function hexA(c: string, a: number): string {
  if (!c.startsWith('#')) return c;
  let h = c.slice(1);
  if (h.length === 3) h = h.split('').map((x) => x + x).join('');
  const n = parseInt(h, 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}
