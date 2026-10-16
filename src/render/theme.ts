import { TILE, VIEW_H, VIEW_W } from '../core/constants';
import { Rng } from '../core/rng';
import { T_ONEWAY, T_SOLID, T_SPIKE, type Room } from '../sim/room';

export interface Theme {
  name: string;
  sky: [string, string];
  far: string;
  mid: string;
  rock: string;
  rockDark: string;
  rockLight: string;
  rim: string; // top edge highlight (moss / rust / starlight)
  plank: string;
  spike: string;
  fog: string;
  mote: string;
  darkness: number; // base darkness multiplier
}

export const THEMES: Record<string, Theme> = {
  hub: { name: 'Lamplight', sky: ['#2a1c2c', '#4a2c2a'], far: '#2a1a26', mid: '#382430', rock: '#4a3a3a', rockDark: '#2c2026', rockLight: '#6a5048', rim: '#c89050', plank: '#8a6040', spike: '#ccc', fog: 'rgba(255,170,90,0.06)', mote: '#ffc880', darkness: 0.25 },
  depth1: { name: 'Gloomroot Caverns', sky: ['#0d0f14', '#1a1c1a'], far: '#14181a', mid: '#1c2222', rock: '#3a3428', rockDark: '#221e18', rockLight: '#56503a', rim: '#6a8a3a', plank: '#6a5030', spike: '#c8c0a8', fog: 'rgba(120,160,90,0.05)', mote: '#b8e070', darkness: 1 },
  depth2: { name: 'Drowned Foundry', sky: ['#0a1018', '#14202a'], far: '#101a22', mid: '#16222c', rock: '#34404a', rockDark: '#1c242c', rockLight: '#50606a', rim: '#b06a3a', plank: '#5a4a40', spike: '#d0d8e0', fog: 'rgba(80,140,170,0.06)', mote: '#80d0e0', darkness: 1 },
  depth3: { name: 'Starfall Sanctum', sky: ['#0c0a1c', '#1c1838'], far: '#141030', mid: '#1c1840', rock: '#3a3858', rockDark: '#222040', rockLight: '#5a5a88', rim: '#a8c8ff', plank: '#4a4870', spike: '#e8f0ff', fog: 'rgba(140,140,255,0.06)', mote: '#c8d8ff', darkness: 0.9 },
};

/** Pre-render a room's tiles into an offscreen canvas once (cheap per-frame blit). */
export function renderRoomTiles(room: Room, theme: Theme, seed: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = room.pxW;
  c.height = room.pxH;
  const g = c.getContext('2d')!;
  const rng = new Rng(seed);
  for (let ty = 0; ty < room.h; ty++) {
    for (let tx = 0; tx < room.w; tx++) {
      const t = room.at(tx, ty);
      const x = tx * TILE;
      const y = ty * TILE;
      if (t === T_SOLID) {
        const exposedTop = room.at(tx, ty - 1) !== T_SOLID && room.at(tx, ty - 1) !== T_SPIKE;
        const depth = exposedTop ? 0 : room.at(tx, ty - 2) !== T_SOLID ? 1 : 2;
        g.fillStyle = depth === 0 ? theme.rock : depth === 1 ? theme.rock : theme.rockDark;
        g.fillRect(x, y, TILE, TILE);
        // stone texture
        for (let i = 0; i < 3; i++) {
          g.fillStyle = rng.chance(0.5) ? theme.rockDark : theme.rockLight;
          g.globalAlpha = depth === 2 ? 0.25 : 0.5;
          g.fillRect(x + rng.int(0, 13), y + rng.int(2, 13), rng.int(1, 3), 1);
        }
        g.globalAlpha = 1;
        if (room.at(tx - 1, ty) !== T_SOLID) {
          g.fillStyle = theme.rockLight;
          g.globalAlpha = 0.35;
          g.fillRect(x, y, 1, TILE);
          g.globalAlpha = 1;
        }
        if (room.at(tx + 1, ty) !== T_SOLID) {
          g.fillStyle = theme.rockDark;
          g.fillRect(x + TILE - 1, y, 1, TILE);
        }
        if (exposedTop) {
          g.fillStyle = theme.rockLight;
          g.fillRect(x, y, TILE, 2);
          g.fillStyle = theme.rim;
          g.fillRect(x, y, TILE, 1);
          for (let i = 0; i < 3; i++) if (rng.chance(0.6)) g.fillRect(x + rng.int(0, 14), y - rng.int(1, 3), 1, 3);
        }
        if (room.at(tx, ty + 1) !== T_SOLID && room.at(tx, ty + 1) !== undefined) {
          g.fillStyle = theme.rockDark;
          g.fillRect(x, y + TILE - 2, TILE, 2);
          if (rng.chance(0.3)) {
            g.fillStyle = theme.rock;
            g.fillRect(x + rng.int(2, 12), y + TILE, 2, rng.int(2, 6));
          }
        }
      } else if (t === T_ONEWAY) {
        g.fillStyle = theme.plank;
        g.fillRect(x, y, TILE, 4);
        g.fillStyle = 'rgba(255,255,255,0.18)';
        g.fillRect(x, y, TILE, 1);
        g.fillStyle = 'rgba(0,0,0,0.35)';
        g.fillRect(x, y + 4, TILE, 1);
        g.fillRect(x + 7, y, 1, 4);
        if (room.at(tx - 1, ty) !== T_ONEWAY || room.at(tx + 1, ty) !== T_ONEWAY) {
          g.fillStyle = theme.plank;
          g.fillRect(x + (room.at(tx - 1, ty) !== T_ONEWAY ? 2 : 12), y + 4, 2, 6);
        }
      } else if (t === T_SPIKE) {
        g.fillStyle = theme.rockDark;
        g.fillRect(x, y + 12, TILE, 4);
        g.fillStyle = theme.spike;
        for (let i = 0; i < 4; i++) {
          g.beginPath();
          g.moveTo(x + i * 4, y + 13);
          g.lineTo(x + i * 4 + 2, y + 3);
          g.lineTo(x + i * 4 + 4, y + 13);
          g.fill();
        }
        g.fillStyle = 'rgba(160,30,30,0.5)';
        g.fillRect(x, y + 3, TILE, 1);
      }
    }
  }
  return c;
}

/** Parallax background layers (pre-rendered, tiled horizontally). */
export function renderBackground(theme: Theme, seed: number, layer: 0 | 1): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = VIEW_W * 2;
  c.height = VIEW_H;
  const g = c.getContext('2d')!;
  const rng = new Rng(seed + layer * 77);
  if (layer === 0) {
    const grad = g.createLinearGradient(0, 0, 0, VIEW_H);
    grad.addColorStop(0, theme.sky[0]);
    grad.addColorStop(1, theme.sky[1]);
    g.fillStyle = grad;
    g.fillRect(0, 0, c.width, c.height);
    // distant stalactites / pillars
    g.fillStyle = theme.far;
    for (let x = 0; x < c.width; x += rng.int(18, 40)) {
      const h = rng.int(20, 90);
      const w = rng.int(6, 18);
      g.beginPath();
      g.moveTo(x, 0);
      g.lineTo(x + w, 0);
      g.lineTo(x + w / 2, h);
      g.fill();
    }
    for (let x = 0; x < c.width; x += rng.int(30, 70)) {
      const h = rng.int(40, 120);
      g.fillRect(x, VIEW_H - h, rng.int(10, 30), h);
    }
    // stars / cinders far away
    for (let i = 0; i < 60; i++) {
      g.fillStyle = theme.mote;
      g.globalAlpha = rng.range(0.1, 0.5);
      g.fillRect(rng.int(0, c.width), rng.int(0, VIEW_H), 1, 1);
    }
    g.globalAlpha = 1;
  } else {
    g.fillStyle = theme.mid;
    for (let x = -20; x < c.width; x += rng.int(40, 90)) {
      const h = rng.int(60, 160);
      const w = rng.int(20, 50);
      g.beginPath();
      g.moveTo(x, VIEW_H);
      g.lineTo(x + w * 0.2, VIEW_H - h);
      g.lineTo(x + w * 0.8, VIEW_H - h + rng.int(0, 20));
      g.lineTo(x + w, VIEW_H);
      g.fill();
      if (rng.chance(0.5)) {
        g.beginPath();
        g.moveTo(x + 10, 0);
        g.lineTo(x + 10 + w * 0.6, 0);
        g.lineTo(x + 10 + w * 0.3, rng.int(30, 80));
        g.fill();
      }
    }
    // chains / roots
    g.strokeStyle = theme.mid;
    g.lineWidth = 1;
    for (let i = 0; i < 8; i++) {
      const x = rng.int(0, c.width);
      g.beginPath();
      g.moveTo(x, 0);
      g.quadraticCurveTo(x + rng.int(-20, 20), 40, x + rng.int(-10, 10), rng.int(40, 110));
      g.stroke();
    }
  }
  return c;
}
