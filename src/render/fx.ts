import { VIEW_H, VIEW_W } from '../core/constants';
import { clamp } from '../core/math';
import type { BurstKind } from '../sim/events';
import type { Element } from '../sim/types';

/** Real-time (not hit-stopped) visual particles. */
interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  size: number;
  color: string;
  kind: BurstKind;
  g: number;
  rot: number;
}

export class Particles {
  list: Particle[] = [];
  intensity = 1;
  burst(x: number, y: number, kind: BurstKind, color: string, count = 8, dir = 0, r = 0): void {
    const n = Math.max(1, Math.round(count * this.intensity));
    for (let i = 0; i < n; i++) {
      if (this.list.length > 900) this.list.shift();
      const a = dir !== 0 ? (dir > 0 ? 0 : Math.PI) + (Math.random() - 0.5) * 1.6 : Math.random() * Math.PI * 2;
      let sp = 0.5 + Math.random() * 2.5;
      const p: Particle = { x: x + (r ? (Math.random() - 0.5) * r : 0), y: y + (r ? (Math.random() - 0.5) * r * 0.6 : 0), vx: 0, vy: 0, life: 0, max: 30, size: 1, color, kind, g: 0, rot: Math.random() * 6 };
      switch (kind) {
        case 'spark': sp = 2 + Math.random() * 4; p.max = 10 + Math.random() * 10; p.size = 1; p.g = 0.05; break;
        case 'dust': sp = 0.3 + Math.random() * 0.9; p.max = 18 + Math.random() * 14; p.size = 2; p.g = -0.01; break;
        case 'blood': sp = 1 + Math.random() * 2.5; p.max = 30 + Math.random() * 20; p.size = 1.5; p.g = 0.15; break;
        case 'ember': sp = 0.5 + Math.random() * 2; p.max = 30 + Math.random() * 30; p.size = 1.5; p.g = -0.04; break;
        case 'shard': sp = 1.5 + Math.random() * 3; p.max = 30 + Math.random() * 15; p.size = 2; p.g = 0.18; break;
        case 'smoke': sp = 0.3 + Math.random() * 0.8; p.max = 30 + Math.random() * 30; p.size = 3; p.g = -0.02; break;
        case 'star': sp = 1 + Math.random() * 2; p.max = 25 + Math.random() * 20; p.size = 2; p.g = 0; break;
        case 'coin': sp = 1 + Math.random() * 2; p.max = 40; p.size = 2; p.g = 0.12; break;
      }
      p.vx = Math.cos(a) * sp;
      p.vy = Math.sin(a) * sp - (kind === 'coin' ? 2 : 0);
      this.list.push(p);
    }
  }
  update(dt: number): void {
    const k = dt / 16.67;
    for (const p of this.list) {
      p.life += k;
      p.vy += p.g * k;
      p.x += p.vx * k;
      p.y += p.vy * k;
      p.vx *= Math.pow(0.95, k);
      p.vy *= Math.pow(p.kind === 'blood' || p.kind === 'shard' || p.kind === 'coin' ? 0.99 : 0.95, k);
      p.rot += 0.2 * k;
    }
    this.list = this.list.filter((p) => p.life < p.max);
  }
  draw(g: CanvasRenderingContext2D, cx: number, cy: number): void {
    for (const p of this.list) {
      const t = p.life / p.max;
      const x = p.x - cx;
      const y = p.y - cy;
      if (x < -10 || y < -10 || x > VIEW_W + 10 || y > VIEW_H + 10) continue;
      g.globalAlpha = 1 - t * t;
      g.fillStyle = p.color;
      switch (p.kind) {
        case 'spark': {
          g.strokeStyle = p.color;
          g.lineWidth = 1;
          g.beginPath();
          g.moveTo(x, y);
          g.lineTo(x - p.vx * 2.2, y - p.vy * 2.2);
          g.stroke();
          break;
        }
        case 'smoke': {
          g.globalAlpha = (1 - t) * 0.35;
          g.beginPath();
          g.arc(x, y, p.size + t * 6, 0, Math.PI * 2);
          g.fill();
          break;
        }
        case 'star': {
          const s = p.size * (1 - t);
          g.fillRect(x - s, y - 0.5, s * 2, 1);
          g.fillRect(x - 0.5, y - s, 1, s * 2);
          break;
        }
        case 'ember':
          g.globalCompositeOperation = 'lighter';
          g.fillRect(Math.round(x), Math.round(y), p.size, p.size);
          g.globalCompositeOperation = 'source-over';
          break;
        default:
          g.fillRect(Math.round(x), Math.round(y), p.size, p.size);
      }
    }
    g.globalAlpha = 1;
  }
}

export interface Ring { x: number; y: number; r: number; color: string; t: number; dur: number }
export interface Bolt { pts: [number, number][]; color: string; t: number; dur: number }
export interface FloatNum { x: number; y: number; text: string; color: string; t: number; dur: number; scale: number; vy: number; crit: boolean; big: boolean }

export function elemHex(e: Element): string {
  return e === 'fire' ? '#ff9a4a' : e === 'shock' ? '#ffe86a' : e === 'frost' ? '#9ae8ff' : '#ffffff';
}

export class Camera {
  x = 0;
  y = 0;
  trauma = 0;
  kickX = 0;
  kickY = 0;
  shakeScale = 1;
  ox = 0;
  oy = 0;
  private seed = 0;
  follow(tx: number, ty: number, roomW: number, roomH: number, dt: number, snap = false): void {
    const goalX = clamp(tx - VIEW_W / 2, 0, Math.max(0, roomW - VIEW_W));
    const goalY = clamp(ty - VIEW_H * 0.58, 0, Math.max(0, roomH - VIEW_H));
    if (snap) {
      this.x = goalX;
      this.y = goalY;
    } else {
      const k = 1 - Math.pow(0.0018, dt / 1000);
      this.x += (goalX - this.x) * k;
      this.y += (goalY - this.y) * Math.min(1, k * 0.8);
    }
  }
  shake(amt: number): void {
    this.trauma = Math.min(1, this.trauma + amt * 0.1);
  }
  kick(dx: number, dy: number): void {
    this.kickX += dx;
    this.kickY += dy;
  }
  update(dt: number): void {
    this.seed += dt;
    this.trauma = Math.max(0, this.trauma - dt / 600);
    const s = this.trauma * this.trauma * 7 * this.shakeScale;
    this.ox = s * (Math.sin(this.seed * 0.071) + Math.sin(this.seed * 0.137)) * 0.5 + this.kickX * this.shakeScale;
    this.oy = s * (Math.sin(this.seed * 0.093 + 1) + Math.sin(this.seed * 0.151)) * 0.5 + this.kickY * this.shakeScale;
    const k = Math.pow(0.0005, dt / 1000);
    this.kickX *= k;
    this.kickY *= k;
  }
  get vx() {
    return Math.round(this.x + this.ox);
  }
  get vy() {
    return Math.round(this.y + this.oy);
  }
}
