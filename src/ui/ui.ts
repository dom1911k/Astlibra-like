import type { Action, Input } from '../core/input';
import { UI_H, UI_W } from '../core/constants';

export const FONT = '"Trebuchet MS", "Segoe UI", "Helvetica Neue", Arial, sans-serif';
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
  g.fillStyle = C.bg;
  g.fillRect(x, y, w, h);
  g.strokeStyle = accent;
  g.lineWidth = 2;
  g.strokeRect(x + 1, y + 1, w - 2, h - 2);
  g.fillStyle = accent;
  g.fillRect(x, y, 6, 2);
  g.fillRect(x + w - 6, y + h - 2, 6, 2);
  if (title) {
    text(g, title, x + 14, y + 10, C.title, 18, 'left', true);
    g.fillStyle = 'rgba(255,210,122,0.25)';
    g.fillRect(x + 14, y + 33, w - 28, 1);
  }
}

export function dim(g: Ctx, a = 0.55): void {
  g.fillStyle = `rgba(0,0,0,${a})`;
  g.fillRect(0, 0, UI_W, UI_H);
}

export function bar(g: Ctx, x: number, y: number, w: number, h: number, frac: number, color: string, back = 'rgba(0,0,0,0.6)', ghost?: number): void {
  g.fillStyle = back;
  g.fillRect(x, y, w, h);
  if (ghost !== undefined && ghost > frac) {
    g.fillStyle = 'rgba(255,255,255,0.5)';
    g.fillRect(x, y, w * Math.max(0, Math.min(1, ghost)), h);
  }
  g.fillStyle = color;
  g.fillRect(x, y, w * Math.max(0, Math.min(1, frac)), h);
  g.fillStyle = 'rgba(255,255,255,0.2)';
  g.fillRect(x, y, w * Math.max(0, Math.min(1, frac)), 1);
}

export function selRow(g: Ctx, x: number, y: number, w: number, h: number, selected: boolean, t: number): void {
  if (!selected) return;
  g.fillStyle = C.sel;
  g.fillRect(x, y, w, h);
  g.fillStyle = C.borderHi;
  g.fillRect(x, y, 3, h);
  g.globalAlpha = 0.4 + Math.sin(t / 150) * 0.2;
  g.strokeStyle = C.borderHi;
  g.lineWidth = 1;
  g.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
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
    const kw = g.measureText(key).width + 10;
    cx -= kw + 4;
    g.fillStyle = 'rgba(255,255,255,0.12)';
    g.fillRect(cx, y - 2, kw, 18);
    g.fillStyle = C.text;
    g.fillText(key, cx + 5, y);
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
  g.font = font(14, true);
  const lk = input.keyName('tabL');
  const rk = input.keyName('tabR');
  text(g, `◀ ${lk}`, cx, y + 4, C.dim, 12);
  cx += 40;
  names.forEach((n, i) => {
    g.font = font(14, true);
    const w = g.measureText(n).width + 22;
    g.fillStyle = i === active ? 'rgba(255,210,122,0.18)' : 'rgba(255,255,255,0.04)';
    g.fillRect(cx, y, w, 24);
    if (i === active) {
      g.fillStyle = C.borderHi;
      g.fillRect(cx, y + 22, w, 2);
    }
    text(g, n, cx + 11, y + 4, i === active ? C.title : C.dim, 14, 'left', true);
    cx += w + 4;
  });
  text(g, `${rk} ▶`, cx + 4, y + 4, C.dim, 12);
}

export interface Card {
  title: string;
  color: string;
  sub?: string;
  body: string;
  extra?: string;
}

export function drawCards(g: Ctx, cards: Card[], sel: number, y: number, t: number, w = 250, h = 230): void {
  const gap = 20;
  const total = cards.length * w + (cards.length - 1) * gap;
  let x = (UI_W - total) / 2;
  cards.forEach((c, i) => {
    const s = i === sel;
    const yy = y + (s ? -6 : 0);
    g.fillStyle = s ? 'rgba(40,30,56,0.98)' : C.bg;
    g.fillRect(x, yy, w, h);
    g.strokeStyle = s ? c.color : C.border;
    g.lineWidth = s ? 3 : 2;
    g.strokeRect(x + 1, yy + 1, w - 2, h - 2);
    g.fillStyle = c.color;
    g.globalAlpha = 0.18;
    g.fillRect(x + 2, yy + 2, w - 4, 44);
    g.globalAlpha = 1;
    text(g, c.title, x + w / 2, yy + 10, c.color, 17, 'center', true);
    if (c.sub) text(g, c.sub, x + w / 2, yy + 31, C.dim, 11, 'center');
    let ty = para(g, c.body, x + 14, yy + 58, w - 28, C.text, 13);
    if (c.extra) para(g, c.extra, x + 14, ty + 6, w - 28, C.bad, 12);
    if (s) {
      g.globalAlpha = 0.3 + Math.sin(t / 160) * 0.2;
      g.fillStyle = c.color;
      g.fillRect(x, yy + h - 4, w, 4);
      g.globalAlpha = 1;
    }
    x += w + gap;
  });
}
