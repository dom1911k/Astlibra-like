import { TILE, VIEW_H, VIEW_W } from '../core/constants';
import { Rng } from '../core/rng';
import { T_EMPTY, T_ONEWAY, T_SOLID, T_SPIKE, type Room } from '../sim/room';
import { mix, shade, withAlpha } from './outline';

export type Decor = 'roots' | 'foundry' | 'stars' | 'town';

export interface Theme {
  name: string;
  decor: Decor;
  sky: [string, string, string];
  far: string;
  mid: string;
  near: string;
  rock: string;
  rockDark: string;
  rockLight: string;
  wall: string;
  rim: string; // top-surface colour (moss / rust / starlight / worn wood)
  rim2: string;
  plank: string;
  spike: string;
  fog: string;
  mote: string;
  glow: string; // decorative light colour
  grade: string; // colour grade overlay
  shaft: string; // light shaft colour
  darkness: number;
}

export const THEMES: Record<string, Theme> = {
  hub: {
    name: 'Lamplight', decor: 'town', sky: ['#1a1018', '#3a1e1c', '#5a2a1c'], far: '#2a1820', mid: '#341c22', near: '#1a0e12',
    rock: '#4e3a34', rockDark: '#2a1c1c', rockLight: '#7a5a48', wall: '#2e1e1e', rim: '#d89a58', rim2: '#8a5a30', plank: '#8a5a36', spike: '#d8d0c0',
    fog: 'rgba(255,160,90,0.05)', mote: '#ffc880', glow: '#ffb050', grade: '#ff9050', shaft: 'rgba(255,190,120,0.06)', darkness: 0.3,
  },
  depth1: {
    name: 'Gloomroot Caverns', decor: 'roots', sky: ['#05070a', '#0c1410', '#142018'], far: '#0e1612', mid: '#14201a', near: '#070b09',
    rock: '#3c3a2c', rockDark: '#1e1d16', rockLight: '#5e5a40', wall: '#141812', rim: '#7aa04a', rim2: '#3e5a26', plank: '#6a4e30', spike: '#cfc8b0',
    fog: 'rgba(110,170,90,0.05)', mote: '#c0f080', glow: '#9fffb0', grade: '#4a8040', shaft: 'rgba(170,230,140,0.05)', darkness: 1,
  },
  depth2: {
    name: 'Drowned Foundry', decor: 'foundry', sky: ['#04080e', '#0a1620', '#10222c'], far: '#0c161e', mid: '#122028', near: '#060a0e',
    rock: '#38424a', rockDark: '#1a2026', rockLight: '#5a6670', wall: '#141b20', rim: '#c07040', rim2: '#6a3a22', plank: '#5a463a', spike: '#d8e0e8',
    fog: 'rgba(70,140,170,0.06)', mote: '#80d8e8', glow: '#ff8a40', grade: '#3070a0', shaft: 'rgba(120,200,230,0.05)', darkness: 1,
  },
  depth3: {
    name: 'Starfall Sanctum', decor: 'stars', sky: ['#06051a', '#100c2e', '#1e1846'], far: '#120f30', mid: '#1a1640', near: '#08071a',
    rock: '#3e3c60', rockDark: '#201e3c', rockLight: '#64649a', wall: '#16142c', rim: '#b8d0ff', rim2: '#6a78b8', plank: '#4e4a78', spike: '#eef2ff',
    fog: 'rgba(140,140,255,0.06)', mote: '#d0dcff', glow: '#9fd8ff', grade: '#6050c0', shaft: 'rgba(180,200,255,0.07)', darkness: 0.9,
  },
};

export interface RoomLight {
  x: number;
  y: number;
  r: number;
  color: string;
  flicker?: boolean;
}

export interface RoomArt {
  canvas: HTMLCanvasElement;
  lights: RoomLight[];
}

const isSolid = (t: number) => t === T_SOLID;

/** Pre-render a room's tiles, back wall and decorations into one canvas (cheap per-frame blit). */
export function renderRoomTiles(room: Room, th: Theme, seed: number): RoomArt {
  const c = document.createElement('canvas');
  c.width = room.pxW;
  c.height = room.pxH;
  const g = c.getContext('2d')!;
  const rng = new Rng(seed);
  const lights: RoomLight[] = [];
  const W = room.w;
  const H = room.h;
  const at = (x: number, y: number) => room.at(x, y);

  // ── distance field to the nearest solid tile (for back-wall framing) ──
  const dist = new Uint8Array(W * H).fill(255);
  const q: number[] = [];
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (isSolid(at(x, y))) {
    dist[y * W + x] = 0;
    q.push(y * W + x);
  }
  for (let i = 0; i < q.length; i++) {
    const k = q[i];
    const x = k % W;
    const y = (k - x) / W;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
      const nk = ny * W + nx;
      if (dist[nk] > dist[k] + 1) {
        dist[nk] = dist[k] + 1;
        q.push(nk);
      }
    }
  }

  // ── back wall ──
  const wallAlpha = [1, 0.85, 0.55, 0.32, 0.17, 0.08, 0.03];
  for (let ty = 0; ty < H; ty++) for (let tx = 0; tx < W; tx++) {
    if (isSolid(at(tx, ty))) continue;
    g.globalAlpha = wallAlpha[Math.min(6, dist[ty * W + tx])];
    drawWallTile(g, th, tx * TILE, ty * TILE, tx, ty, rng);
  }
  g.globalAlpha = 1;

  // ── decorations on the back wall (behind solids) ──
  decorate(g, room, th, rng, lights);

  // ── ambient occlusion next to solids ──
  for (let ty = 0; ty < H; ty++) for (let tx = 0; tx < W; tx++) {
    if (isSolid(at(tx, ty))) continue;
    const x = tx * TILE;
    const y = ty * TILE;
    const ao = (x0: number, y0: number, x1: number, y1: number) => {
      const grad = g.createLinearGradient(x0, y0, x1, y1);
      grad.addColorStop(0, 'rgba(0,0,0,0.45)');
      grad.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = grad;
      g.fillRect(Math.min(x0, x1), Math.min(y0, y1), Math.abs(x1 - x0) || TILE, Math.abs(y1 - y0) || TILE);
    };
    if (isSolid(at(tx, ty - 1))) ao(x, y, x, y + 8);
    if (isSolid(at(tx - 1, ty))) ao(x, y, x + 6, y);
    if (isSolid(at(tx + 1, ty))) ao(x + TILE, y, x + TILE - 6, y);
    if (isSolid(at(tx, ty + 1))) ao(x, y + TILE, x, y + TILE - 4);
  }

  // ── solid rock ──
  for (let ty = 0; ty < H; ty++) for (let tx = 0; tx < W; tx++) {
    if (!isSolid(at(tx, ty))) continue;
    drawRockTile(g, room, th, tx, ty, Math.min(6, depthInto(room, tx, ty)), rng);
  }
  // ── surfaces, undersides, planks, spikes ──
  for (let ty = 0; ty < H; ty++) for (let tx = 0; tx < W; tx++) {
    const t = at(tx, ty);
    const x = tx * TILE;
    const y = ty * TILE;
    if (t === T_SOLID) {
      const open = (v: number) => v === T_EMPTY || v === T_ONEWAY;
      if (open(at(tx, ty - 1))) drawSurface(g, th, x, y, open(at(tx - 1, ty - 1)) && open(at(tx - 1, ty)), open(at(tx + 1, ty - 1)) && open(at(tx + 1, ty)), rng, lights);
      if (open(at(tx, ty + 1)) && ty < H - 1) drawUnderside(g, th, x, y, rng);
    } else if (t === T_ONEWAY) drawPlank(g, th, x, y, at(tx - 1, ty) !== T_ONEWAY, at(tx + 1, ty) !== T_ONEWAY, rng);
    else if (t === T_SPIKE) drawSpikes(g, th, x, y);
  }
  return { canvas: c, lights };
}

function depthInto(room: Room, tx: number, ty: number): number {
  let d = 0;
  while (d < 6 && room.at(tx, ty - d - 1) === T_SOLID) d++;
  let s = 0;
  while (s < 4 && room.at(tx - s - 1, ty) === T_SOLID && room.at(tx + s + 1, ty) === T_SOLID) s++;
  return Math.min(d, s + 1, 6);
}

function drawWallTile(g: CanvasRenderingContext2D, th: Theme, x: number, y: number, tx: number, ty: number, rng: Rng): void {
  const base = th.wall;
  const dark = shade(base, -0.3);
  const light = shade(base, 0.07);
  g.fillStyle = base;
  g.fillRect(x, y, TILE, TILE);
  switch (th.decor) {
    case 'foundry': {
      // brick courses
      g.fillStyle = dark;
      for (let r = 0; r < 4; r++) {
        g.fillRect(x, y + r * 4 + 3, TILE, 1);
        const off = (ty * 4 + r) % 2 ? 4 : 0;
        g.fillRect(x + off, y + r * 4, 1, 3);
        g.fillRect(x + off + 8, y + r * 4, 1, 3);
      }
      g.fillStyle = light;
      g.fillRect(x + rng.int(0, 12), y + rng.int(0, 3) * 4, 3, 1);
      if (rng.chance(0.06)) {
        g.fillStyle = withAlpha('#c06a3a', 0.25);
        g.fillRect(x + rng.int(2, 12), y, 2, TILE);
      }
      break;
    }
    case 'stars': {
      // large carved ashlar
      g.fillStyle = dark;
      g.fillRect(x, y + (ty % 2 ? 7 : 15), TILE, 1);
      g.fillRect(x + (tx % 2 ? 0 : 15), y, 1, TILE);
      g.fillStyle = light;
      g.fillRect(x + 1, y + (ty % 2 ? 8 : 0), TILE - 2, 1);
      if (rng.chance(0.08)) {
        g.fillStyle = withAlpha(th.glow, 0.25);
        g.fillRect(x + rng.int(2, 13), y + rng.int(2, 13), 1, 1);
      }
      break;
    }
    case 'town': {
      g.fillStyle = dark;
      for (let i = 0; i < 4; i++) g.fillRect(x + i * 4 + 3, y, 1, TILE);
      g.fillStyle = light;
      g.fillRect(x + rng.int(0, 3) * 4, y + rng.int(0, 12), 1, 3);
      if (ty % 4 === 0) {
        g.fillStyle = shade(base, -0.5);
        g.fillRect(x, y, TILE, 2);
      }
      break;
    }
    default: {
      // irregular cave stones
      for (let i = 0; i < 2; i++) {
        const w = rng.int(4, 8);
        const h = rng.int(3, 6);
        const sx = x + rng.int(0, TILE - w);
        const sy = y + rng.int(0, TILE - h);
        g.fillStyle = rng.chance(0.5) ? light : shade(base, 0.05);
        g.fillRect(sx + 1, sy, w - 2, h);
        g.fillRect(sx, sy + 1, w, h - 2);
        g.fillStyle = dark;
        g.fillRect(sx + 1, sy + h, w - 2, 1);
      }
    }
  }
}

function drawRockTile(g: CanvasRenderingContext2D, room: Room, th: Theme, tx: number, ty: number, depth: number, rng: Rng): void {
  const x = tx * TILE;
  const y = ty * TILE;
  const deepT = Math.min(1, depth / 5);
  const base = mix(th.rock, th.rockDark, deepT * 0.85);
  g.fillStyle = base;
  g.fillRect(x, y, TILE, TILE);
  if (depth >= 5) {
    g.fillStyle = shade(base, -0.25);
    if (rng.chance(0.4)) g.fillRect(x + rng.int(0, 13), y + rng.int(0, 13), 2, 2);
    return;
  }
  // slabs: split the tile into 2-3 stones with mortar, highlight and shadow
  const split = rng.int(5, 11);
  const vertical = (tx + ty) % 2 === 0;
  const slabs = vertical ? [[0, 0, split, TILE], [split, 0, TILE - split, TILE]] : [[0, 0, TILE, split], [0, split, TILE, TILE - split]];
  for (const [sx, sy, sw, sh] of slabs) {
    const tone = shade(base, rng.range(-0.08, 0.1) * (1 - deepT));
    g.fillStyle = tone;
    g.fillRect(x + sx, y + sy, sw, sh);
    g.fillStyle = shade(tone, 0.18 * (1 - deepT));
    g.fillRect(x + sx + 1, y + sy, sw - 2, 1);
    g.fillRect(x + sx, y + sy + 1, 1, sh - 2);
    g.fillStyle = shade(tone, -0.3);
    g.fillRect(x + sx + 1, y + sy + sh - 1, sw - 1, 1);
    g.fillRect(x + sx + sw - 1, y + sy + 1, 1, sh - 1);
  }
  // cracks & grit
  if (rng.chance(0.25)) {
    g.strokeStyle = shade(base, -0.4);
    g.lineWidth = 1;
    g.beginPath();
    const cx = x + rng.int(3, 12);
    g.moveTo(cx, y + rng.int(1, 5));
    g.lineTo(cx + rng.int(-3, 3), y + rng.int(6, 10));
    g.lineTo(cx + rng.int(-3, 3), y + rng.int(11, 15));
    g.stroke();
  }
  for (let i = 0; i < 3; i++) {
    g.fillStyle = withAlpha(rng.chance(0.5) ? th.rockLight : '#000000', 0.25);
    g.fillRect(x + rng.int(0, 15), y + rng.int(0, 15), 1, 1);
  }
  if (th.decor === 'foundry' && depth <= 2 && rng.chance(0.18)) {
    // riveted metal plate
    g.fillStyle = '#4a5560';
    g.fillRect(x + 2, y + 2, 12, 12);
    g.fillStyle = '#6a7884';
    g.fillRect(x + 2, y + 2, 12, 1);
    g.fillStyle = '#2a3036';
    g.fillRect(x + 2, y + 13, 12, 1);
    g.fillStyle = '#8a98a4';
    for (const [rx, ry] of [[3, 3], [12, 3], [3, 12], [12, 12]]) g.fillRect(x + rx, y + ry, 1, 1);
    g.fillStyle = withAlpha('#c06a3a', 0.5);
    g.fillRect(x + 5, y + 13, 1, 3);
  }
  if (th.decor === 'stars' && depth <= 2 && rng.chance(0.08)) {
    g.fillStyle = withAlpha(th.glow, 0.6);
    g.fillRect(x + 6, y + 4, 4, 8);
    g.fillStyle = withAlpha('#ffffff', 0.7);
    g.fillRect(x + 7, y + 5, 1, 4);
  }
  // left/right exposed edges
  if (room.at(tx - 1, ty) !== T_SOLID) {
    g.fillStyle = withAlpha(th.rockLight, 0.5);
    g.fillRect(x, y, 1, TILE);
  }
  if (room.at(tx + 1, ty) !== T_SOLID) {
    g.fillStyle = withAlpha('#000000', 0.45);
    g.fillRect(x + TILE - 1, y, 1, TILE);
  }
}

function drawSurface(g: CanvasRenderingContext2D, th: Theme, x: number, y: number, leftOpen: boolean, rightOpen: boolean, rng: Rng, lights: RoomLight[]): void {
  // rounded outer corners
  if (leftOpen) g.clearRect(x, y, 2, 1), g.clearRect(x, y + 1, 1, 1);
  if (rightOpen) g.clearRect(x + TILE - 2, y, 2, 1), g.clearRect(x + TILE - 1, y + 1, 1, 1);
  const l = leftOpen ? 2 : 0;
  const r = rightOpen ? 2 : 0;
  switch (th.decor) {
    case 'foundry':
      g.fillStyle = '#5a646c';
      g.fillRect(x + l, y, TILE - l - r, 3);
      g.fillStyle = '#8a96a0';
      g.fillRect(x + l, y, TILE - l - r, 1);
      g.fillStyle = '#2a3036';
      for (let i = 2; i < TILE; i += 4) g.fillRect(x + i, y + 1, 1, 2);
      if (rng.chance(0.25)) {
        g.fillStyle = withAlpha(th.rim, 0.6);
        g.fillRect(x + rng.int(2, 13), y + 3, 1, rng.int(2, 5));
      }
      break;
    case 'stars':
      g.fillStyle = th.rim2;
      g.fillRect(x + l, y, TILE - l - r, 2);
      g.fillStyle = th.rim;
      g.fillRect(x + l, y, TILE - l - r, 1);
      if (rng.chance(0.12)) {
        // crystal sprout
        const cx = x + rng.int(3, 12);
        g.fillStyle = withAlpha(th.glow, 0.85);
        g.beginPath();
        g.moveTo(cx - 2, y);
        g.lineTo(cx, y - rng.int(4, 8));
        g.lineTo(cx + 2, y);
        g.fill();
        g.fillStyle = '#ffffff';
        g.fillRect(cx, y - 3, 1, 2);
        lights.push({ x: cx, y: y - 3, r: 18, color: th.glow });
      }
      break;
    case 'town':
      g.fillStyle = th.rim2;
      g.fillRect(x + l, y, TILE - l - r, 3);
      g.fillStyle = th.rim;
      g.fillRect(x + l, y, TILE - l - r, 1);
      g.fillStyle = withAlpha('#000000', 0.3);
      g.fillRect(x + 7, y + 1, 1, 2);
      break;
    default: {
      // moss with grass tufts
      g.fillStyle = th.rim2;
      g.fillRect(x + l, y, TILE - l - r, 3);
      g.fillStyle = th.rim;
      g.fillRect(x + l, y, TILE - l - r, 1);
      for (let i = 0; i < 5; i++) {
        const gx = x + rng.int(l, TILE - 1 - r);
        const h = rng.int(1, 4);
        g.fillStyle = rng.chance(0.5) ? th.rim : shade(th.rim, -0.25);
        g.fillRect(gx, y - h, 1, h);
      }
      g.fillStyle = th.rim2;
      if (rng.chance(0.5)) g.fillRect(x + rng.int(2, 12), y + 3, 2, rng.int(1, 3));
      if (rng.chance(0.07)) {
        // glowing cave mushroom
        const mx = x + rng.int(3, 12);
        g.fillStyle = '#3a4a3a';
        g.fillRect(mx, y - 3, 1, 3);
        g.fillStyle = th.glow;
        g.fillRect(mx - 2, y - 5, 5, 2);
        g.fillStyle = '#ffffff';
        g.fillRect(mx - 1, y - 5, 1, 1);
        lights.push({ x: mx, y: y - 4, r: 22, color: th.glow, flicker: true });
      }
    }
  }
}

function drawUnderside(g: CanvasRenderingContext2D, th: Theme, x: number, y: number, rng: Rng): void {
  g.fillStyle = withAlpha('#000000', 0.4);
  g.fillRect(x, y + TILE - 2, TILE, 2);
  if (rng.chance(0.35)) {
    // drips / stalactites / roots
    const sx = x + rng.int(2, 12);
    const len = rng.int(2, 7);
    if (th.decor === 'roots' && rng.chance(0.5)) {
      g.strokeStyle = '#4a3a24';
      g.lineWidth = 1;
      g.beginPath();
      g.moveTo(sx, y + TILE);
      g.quadraticCurveTo(sx + rng.int(-3, 3), y + TILE + len, sx + rng.int(-2, 2), y + TILE + len * 2);
      g.stroke();
    } else {
      g.fillStyle = th.rockDark;
      g.beginPath();
      g.moveTo(sx - 2, y + TILE);
      g.lineTo(sx + 2, y + TILE);
      g.lineTo(sx, y + TILE + len);
      g.fill();
    }
  }
}

function drawPlank(g: CanvasRenderingContext2D, th: Theme, x: number, y: number, leftEnd: boolean, rightEnd: boolean, rng: Rng): void {
  const p = th.plank;
  g.fillStyle = shade(p, -0.35);
  g.fillRect(x, y + 1, TILE, 4);
  g.fillStyle = p;
  g.fillRect(x, y, TILE, 4);
  g.fillStyle = shade(p, 0.25);
  g.fillRect(x, y, TILE, 1);
  g.fillStyle = shade(p, -0.2);
  g.fillRect(x + rng.int(1, 5), y + 2, rng.int(3, 6), 1);
  g.fillRect(x + 7, y, 1, 4);
  g.fillStyle = withAlpha('#000000', 0.35);
  g.fillRect(x, y + 5, TILE, 1);
  if (leftEnd || rightEnd) {
    // iron bracket + rope
    const bx = x + (leftEnd ? 2 : 12);
    g.fillStyle = '#5a5a60';
    g.fillRect(bx, y + 4, 2, 5);
    g.fillRect(bx - 1, y + 3, 4, 1);
    g.strokeStyle = withAlpha('#b8a070', 0.6);
    g.beginPath();
    g.moveTo(bx + 1, y);
    g.lineTo(bx + 1 + (leftEnd ? -1 : 1), y - 14);
    g.stroke();
  }
}

function drawSpikes(g: CanvasRenderingContext2D, th: Theme, x: number, y: number): void {
  g.fillStyle = th.rockDark;
  g.fillRect(x, y + 12, TILE, 4);
  for (let i = 0; i < 4; i++) {
    const sx = x + i * 4;
    g.fillStyle = shade(th.spike, -0.35);
    g.beginPath();
    g.moveTo(sx, y + 13);
    g.lineTo(sx + 2, y + 2);
    g.lineTo(sx + 4, y + 13);
    g.fill();
    g.fillStyle = th.spike;
    g.beginPath();
    g.moveTo(sx + 1, y + 13);
    g.lineTo(sx + 2, y + 2);
    g.lineTo(sx + 2.5, y + 13);
    g.fill();
  }
  g.fillStyle = 'rgba(140,20,30,0.55)';
  g.fillRect(x, y + 11, TILE, 2);
}

/** Back-wall props per theme. */
function decorate(g: CanvasRenderingContext2D, room: Room, th: Theme, rng: Rng, lights: RoomLight[]): void {
  const W = room.w;
  const H = room.h;
  const empty = (x: number, y: number) => room.at(x, y) === T_EMPTY;
  // ceiling anchor points (empty tile under a solid one)
  const ceilings: [number, number][] = [];
  for (let tx = 1; tx < W - 1; tx++) for (let ty = 1; ty < H - 2; ty++) if (room.at(tx, ty - 1) === T_SOLID && empty(tx, ty)) ceilings.push([tx, ty]);
  const pickCeil = () => ceilings[rng.int(0, ceilings.length - 1)];
  switch (th.decor) {
    case 'roots': {
      for (let i = 0; i < Math.floor(W / 3); i++) {
        if (!ceilings.length) break;
        const [tx, ty] = pickCeil();
        const x = tx * TILE + rng.int(0, 15);
        const y = ty * TILE;
        const len = rng.int(20, 70);
        g.strokeStyle = withAlpha('#3a2e1e', 0.9);
        g.lineWidth = rng.chance(0.3) ? 2 : 1;
        g.beginPath();
        g.moveTo(x, y);
        const sway = rng.int(-10, 10);
        g.bezierCurveTo(x + sway, y + len * 0.3, x - sway, y + len * 0.6, x + sway / 2, y + len);
        g.stroke();
        // leaves
        for (let k = 0; k < 4; k++) {
          const t = rng.next();
          g.fillStyle = withAlpha(th.rim2, 0.9);
          g.fillRect(x + sway * (t - 0.5) + rng.int(-2, 2), y + len * t, 2, 1);
        }
        if (rng.chance(0.25)) {
          // glowing spore pod at the tip
          g.fillStyle = th.glow;
          g.fillRect(x + sway / 2 - 1, y + len, 3, 3);
          lights.push({ x: x + sway / 2, y: y + len + 1, r: 20, color: th.glow, flicker: true });
        }
      }
      break;
    }
    case 'foundry': {
      // horizontal pipes
      for (let i = 0; i < 2 + rng.int(0, 2); i++) {
        const py = rng.int(3, H - 5) * TILE + 6;
        const r = rng.chance(0.5) ? 3 : 4;
        g.fillStyle = '#2a3238';
        g.fillRect(0, py - r, room.pxW, r * 2);
        g.fillStyle = '#4a5660';
        g.fillRect(0, py - r, room.pxW, 1);
        g.fillStyle = '#161c20';
        g.fillRect(0, py + r - 1, room.pxW, 1);
        for (let x = rng.int(10, 60); x < room.pxW; x += rng.int(50, 120)) {
          g.fillStyle = '#5a6670';
          g.fillRect(x, py - r - 1, 4, r * 2 + 2);
          if (rng.chance(0.3)) {
            g.fillStyle = withAlpha('#c06a3a', 0.6);
            g.fillRect(x + 1, py + r, 1, rng.int(4, 14));
          }
        }
      }
      // chains & furnace glows
      for (let i = 0; i < Math.floor(W / 6); i++) {
        if (!ceilings.length) break;
        const [tx, ty] = pickCeil();
        const x = tx * TILE + 8;
        const len = rng.int(3, 7) * 6;
        for (let k = 0; k < len; k += 3) {
          g.fillStyle = k % 6 ? '#3a4248' : '#5a6670';
          g.fillRect(x - (k % 6 ? 0 : 1), ty * TILE + k, k % 6 ? 1 : 3, 2);
        }
        if (rng.chance(0.4)) {
          // hanging work-lamp
          const ly = ty * TILE + len;
          g.fillStyle = '#2a3036';
          g.fillRect(x - 3, ly, 7, 3);
          g.fillStyle = th.glow;
          g.fillRect(x - 2, ly + 3, 5, 2);
          lights.push({ x, y: ly + 4, r: 34, color: th.glow, flicker: true });
        }
      }
      break;
    }
    case 'stars': {
      // tall arched windows full of starlight
      for (let i = 0; i < Math.floor(W / 10); i++) {
        const x = rng.int(2, W - 4) * TILE;
        const y = rng.int(2, 6) * TILE;
        const w = 20;
        const h = 44;
        const grad = g.createLinearGradient(0, y, 0, y + h);
        grad.addColorStop(0, withAlpha('#9fb8ff', 0.35));
        grad.addColorStop(1, withAlpha('#3a3a80', 0.15));
        g.fillStyle = grad;
        g.beginPath();
        g.moveTo(x, y + h);
        g.lineTo(x, y + 10);
        g.arc(x + w / 2, y + 10, w / 2, Math.PI, 0);
        g.lineTo(x + w, y + h);
        g.fill();
        g.fillStyle = withAlpha('#ffffff', 0.5);
        for (let s = 0; s < 4; s++) g.fillRect(x + rng.int(3, w - 3), y + rng.int(6, h - 4), 1, 1);
        g.fillStyle = withAlpha('#1c1a38', 0.9);
        g.fillRect(x + w / 2, y + 2, 1, h - 2);
        g.fillRect(x, y + 24, w, 1);
        lights.push({ x: x + w / 2, y: y + h / 2, r: 36, color: '#9fb8ff' });
      }
      // floating shards
      for (let i = 0; i < W / 4; i++) {
        g.fillStyle = withAlpha(th.glow, rng.range(0.2, 0.5));
        g.fillRect(rng.int(0, room.pxW), rng.int(16, room.pxH - 48), 1, rng.int(1, 3));
      }
      break;
    }
    case 'town': {
      // beams and hanging lantern strings
      for (let ty = 3; ty < H - 3; ty += 5) {
        g.fillStyle = '#2a1a14';
        g.fillRect(0, ty * TILE, room.pxW, 4);
        g.fillStyle = '#4a3020';
        g.fillRect(0, ty * TILE, room.pxW, 1);
      }
      for (let x = 30; x < room.pxW - 30; x += rng.int(60, 110)) {
        const y0 = 4 * TILE;
        const span = rng.int(40, 70);
        g.strokeStyle = withAlpha('#1a1010', 0.9);
        g.beginPath();
        g.moveTo(x, y0);
        g.quadraticCurveTo(x + span / 2, y0 + 18, x + span, y0);
        g.stroke();
        for (let k = 1; k < 4; k++) {
          const t = k / 4;
          const lx = x + span * t;
          const ly = y0 + 18 * 2 * t * (1 - t) + 2;
          const col = ['#ffb050', '#ff7a50', '#ffd27a'][k % 3];
          g.fillStyle = col;
          g.fillRect(lx - 1, ly, 3, 4);
          lights.push({ x: lx, y: ly + 2, r: 26, color: col, flicker: true });
        }
      }
      // banners
      for (let i = 0; i < 4; i++) {
        const x = rng.int(2, W - 3) * TILE;
        const y = 5 * TILE + 4;
        const col = ['#7a2a30', '#2a4a6a', '#5a4a20'][i % 3];
        g.fillStyle = col;
        g.fillRect(x, y, 10, 22);
        g.beginPath();
        g.moveTo(x, y + 22);
        g.lineTo(x + 5, y + 26);
        g.lineTo(x + 10, y + 22);
        g.fill();
        g.fillStyle = '#d8a050';
        g.fillRect(x + 4, y + 8, 2, 5);
        g.fillRect(x + 3, y + 9, 4, 1);
      }
      break;
    }
  }
}

// ─────────────────────────────── parallax backgrounds ───────────────────────────────

/** Parallax layers (pre-rendered, tiled horizontally). Layer 0 = sky+far, 1 = mid, 2 = near. */
export function renderBackground(th: Theme, seed: number, layer: 0 | 1 | 2): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = VIEW_W * 2;
  c.height = VIEW_H;
  const g = c.getContext('2d')!;
  const rng = new Rng(seed + layer * 977);
  const Wd = c.width;
  if (layer === 0) {
    const grad = g.createLinearGradient(0, 0, 0, VIEW_H);
    grad.addColorStop(0, th.sky[0]);
    grad.addColorStop(0.6, th.sky[1]);
    grad.addColorStop(1, th.sky[2]);
    g.fillStyle = grad;
    g.fillRect(0, 0, Wd, VIEW_H);
    // distant motes / stars
    for (let i = 0; i < (th.decor === 'stars' ? 220 : 90); i++) {
      g.fillStyle = withAlpha(th.mote, rng.range(0.08, th.decor === 'stars' ? 0.8 : 0.35));
      g.fillRect(rng.int(0, Wd), rng.int(0, VIEW_H * 0.8), 1, 1);
    }
    if (th.decor === 'stars') {
      // nebula wash + falling star streaks
      for (let i = 0; i < 5; i++) {
        const x = rng.int(0, Wd);
        const y = rng.int(20, 140);
        const r = rng.int(50, 110);
        const ng = g.createRadialGradient(x, y, 0, x, y, r);
        ng.addColorStop(0, withAlpha(rng.pick(['#5a4ac0', '#3a6ac0', '#8a4ab0']), 0.25));
        ng.addColorStop(1, 'rgba(0,0,0,0)');
        g.fillStyle = ng;
        g.fillRect(x - r, y - r, r * 2, r * 2);
      }
      for (let i = 0; i < 6; i++) {
        const x = rng.int(0, Wd);
        const y = rng.int(0, 120);
        const sg = g.createLinearGradient(x, y, x - 30, y - 18);
        sg.addColorStop(0, 'rgba(255,255,255,0.8)');
        sg.addColorStop(1, 'rgba(255,255,255,0)');
        g.strokeStyle = sg;
        g.beginPath();
        g.moveTo(x, y);
        g.lineTo(x - 30, y - 18);
        g.stroke();
      }
    }
    // far silhouettes, faded into the fog
    g.fillStyle = th.far;
    if (th.decor === 'foundry') {
      for (let x = 0; x < Wd; x += rng.int(40, 90)) {
        const h = rng.int(60, 150);
        const w = rng.int(24, 60);
        g.fillRect(x, VIEW_H - h, w, h);
        if (rng.chance(0.6)) g.fillRect(x + w / 3, VIEW_H - h - rng.int(20, 60), rng.int(4, 8), 60); // chimney
        for (let k = 0; k < 6; k++) {
          g.fillStyle = withAlpha(th.glow, rng.range(0.15, 0.4));
          g.fillRect(x + rng.int(2, w - 4), VIEW_H - h + rng.int(6, h - 10), 2, 2);
          g.fillStyle = th.far;
        }
      }
      // giant broken gear
      const gx = rng.int(100, Wd - 100);
      const gy = VIEW_H - 120;
      g.strokeStyle = th.far;
      g.lineWidth = 10;
      g.beginPath();
      g.arc(gx, gy, 46, 0.3, Math.PI * 1.7);
      g.stroke();
      for (let a = 0.3; a < Math.PI * 1.7; a += 0.45) g.fillRect(gx + Math.cos(a) * 52 - 5, gy + Math.sin(a) * 52 - 5, 10, 10);
      // waterline
      g.fillStyle = withAlpha('#4a9ab0', 0.12);
      g.fillRect(0, VIEW_H - 26, Wd, 26);
    } else if (th.decor === 'stars') {
      for (let x = 0; x < Wd; x += rng.int(60, 120)) {
        const h = rng.int(90, 200);
        const w = rng.int(14, 30);
        g.beginPath();
        g.moveTo(x, VIEW_H);
        g.lineTo(x, VIEW_H - h);
        g.lineTo(x + w / 2, VIEW_H - h - rng.int(16, 40));
        g.lineTo(x + w, VIEW_H - h);
        g.lineTo(x + w, VIEW_H);
        g.fill();
        g.fillStyle = withAlpha(th.glow, 0.4);
        g.fillRect(x + w / 2 - 1, VIEW_H - h + 10, 2, 6);
        g.fillStyle = th.far;
      }
    } else if (th.decor === 'town') {
      // the town's houses carved into the cavern
      for (let x = 0; x < Wd; x += rng.int(30, 56)) {
        const h = rng.int(50, 110);
        const w = rng.int(24, 44);
        g.fillStyle = th.far;
        g.fillRect(x, VIEW_H - h, w, h);
        g.beginPath();
        g.moveTo(x - 4, VIEW_H - h);
        g.lineTo(x + w / 2, VIEW_H - h - rng.int(12, 24));
        g.lineTo(x + w + 4, VIEW_H - h);
        g.fill();
        for (let k = 0; k < 4; k++) {
          if (rng.chance(0.6)) {
            g.fillStyle = withAlpha('#ffb050', rng.range(0.4, 0.8));
            g.fillRect(x + rng.int(3, w - 7), VIEW_H - h + rng.int(8, h - 12), 4, 5);
          }
        }
      }
    } else {
      // cavern arches and great hanging roots
      for (let x = -40; x < Wd; x += rng.int(70, 140)) {
        const w = rng.int(80, 160);
        const h = rng.int(100, 190);
        g.beginPath();
        g.moveTo(x, VIEW_H);
        g.quadraticCurveTo(x + w / 2, VIEW_H - h * 2, x + w, VIEW_H);
        g.lineTo(x + w - 18, VIEW_H);
        g.quadraticCurveTo(x + w / 2, VIEW_H - h * 1.5, x + 18, VIEW_H);
        g.fill();
      }
      for (let i = 0; i < 10; i++) {
        const x = rng.int(0, Wd);
        g.fillRect(x, 0, rng.int(3, 7), rng.int(40, 130));
      }
    }
    // fog band
    const fg = g.createLinearGradient(0, VIEW_H * 0.5, 0, VIEW_H);
    fg.addColorStop(0, 'rgba(0,0,0,0)');
    fg.addColorStop(1, withAlpha(th.sky[2], 0.7));
    g.fillStyle = fg;
    g.fillRect(0, 0, Wd, VIEW_H);
  } else if (layer === 1) {
    g.fillStyle = th.mid;
    for (let x = -20; x < Wd; x += rng.int(40, 80)) {
      const h = rng.int(70, 170);
      const w = rng.int(18, 44);
      g.beginPath();
      g.moveTo(x, VIEW_H);
      g.lineTo(x + w * 0.25, VIEW_H - h);
      g.lineTo(x + w * 0.7, VIEW_H - h + rng.int(0, 24));
      g.lineTo(x + w, VIEW_H);
      g.fill();
      if (rng.chance(0.6)) {
        g.beginPath();
        g.moveTo(x + 8, 0);
        g.lineTo(x + 8 + w * 0.7, 0);
        g.lineTo(x + 8 + w * 0.35, rng.int(30, 90));
        g.fill();
      }
    }
    if (th.decor === 'foundry') {
      g.strokeStyle = th.mid;
      g.lineWidth = 2;
      for (let x = 0; x < Wd; x += rng.int(50, 90)) {
        // scaffolding
        g.strokeRect(x, VIEW_H - 120, 30, 120);
        g.beginPath();
        g.moveTo(x, VIEW_H - 120);
        g.lineTo(x + 30, VIEW_H);
        g.stroke();
      }
    }
  } else {
    // near layer: dark framing silhouettes at top & bottom edges
    g.fillStyle = th.near;
    for (let x = 0; x < Wd; x += rng.int(10, 30)) {
      const h = rng.int(6, 28);
      g.beginPath();
      g.moveTo(x - 6, 0);
      g.lineTo(x + 6, 0);
      g.lineTo(x + rng.int(-2, 2), h);
      g.fill();
    }
    if (th.decor === 'roots' || th.decor === 'town') {
      for (let i = 0; i < 14; i++) {
        const x = rng.int(0, Wd);
        g.fillRect(x, 0, 1, rng.int(10, 40));
      }
    }
  }
  return c;
}
