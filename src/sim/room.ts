import { TILE } from '../core/constants';
import type { RoomTemplate } from '../data/rooms';

export const T_EMPTY = 0;
export const T_SOLID = 1;
export const T_ONEWAY = 2;
export const T_SPIKE = 3;

export interface Marker {
  x: number; // px, center
  y: number; // px, feet (top of the floor below)
}

export class Room {
  w: number; // tiles
  h: number;
  tiles: Uint8Array;
  player: Marker = { x: 40, y: 200 };
  exits: Marker[] = [];
  ground: Marker[] = [];
  flying: Marker[] = [];
  boss: Marker | null = null;
  rewards: Marker[] = [];
  stations: Record<string, Marker> = {};
  template: RoomTemplate;

  constructor(t: RoomTemplate) {
    this.template = t;
    const rows = t.rows;
    this.h = rows.length;
    this.w = Math.max(...rows.map((r) => r.length));
    this.tiles = new Uint8Array(this.w * this.h);
    const marks: { ch: string; tx: number; ty: number }[] = [];
    for (let y = 0; y < this.h; y++) {
      for (let x = 0; x < this.w; x++) {
        const ch = rows[y][x] ?? '.';
        let t = T_EMPTY;
        if (ch === '#') t = T_SOLID;
        else if (ch === '=') t = T_ONEWAY;
        else if (ch === '^') t = T_SPIKE;
        else if (ch !== '.') marks.push({ ch, tx: x, ty: y });
        if (x === 0 || y === 0 || x === this.w - 1 || y === this.h - 1) t = T_SOLID;
        this.tiles[y * this.w + x] = t;
      }
    }
    for (const m of marks) {
      const fx = m.tx * TILE + TILE / 2;
      if (m.ch === 'F') {
        this.flying.push({ x: fx, y: m.ty * TILE + TILE });
        continue;
      }
      // drop markers onto the floor below
      let ty = m.ty;
      while (ty < this.h - 1 && !this.isFloor(m.tx, ty + 1)) ty++;
      const mk = { x: fx, y: (ty + 1) * TILE };
      switch (m.ch) {
        case 'P': this.player = mk; break;
        case 'X': this.exits.push(mk); break;
        case 'E': this.ground.push(mk); break;
        case 'B': this.boss = mk; break;
        case 'R': this.rewards.push(mk); break;
        default:
          if (m.ch >= '1' && m.ch <= '9') this.stations[m.ch] = mk;
      }
    }
  }
  get pxW() {
    return this.w * TILE;
  }
  get pxH() {
    return this.h * TILE;
  }
  at(tx: number, ty: number): number {
    if (tx < 0 || ty < 0 || tx >= this.w || ty >= this.h) return T_SOLID;
    return this.tiles[ty * this.w + tx];
  }
  isFloor(tx: number, ty: number) {
    const t = this.at(tx, ty);
    return t === T_SOLID || t === T_ONEWAY || t === T_SPIKE;
  }
  solidAt(px: number, py: number): boolean {
    return this.at(Math.floor(px / TILE), Math.floor(py / TILE)) === T_SOLID;
  }
  /** Is there solid ground directly beneath px at feet height py? */
  groundBelow(px: number, py: number): boolean {
    const t = this.at(Math.floor(px / TILE), Math.floor((py + 1) / TILE));
    return t !== T_EMPTY;
  }
  /** First floor surface y at or below py for column px (for dropping things to the ground). */
  floorBelow(px: number, py: number): number {
    const tx = Math.floor(px / TILE);
    for (let ty = Math.max(0, Math.floor(py / TILE)); ty < this.h; ty++) if (this.isFloor(tx, ty)) return ty * TILE;
    return this.pxH - TILE;
  }
  /** Line of sight between two points (solid tiles only). */
  los(ax: number, ay: number, bx: number, by: number): boolean {
    const d = Math.hypot(bx - ax, by - ay);
    const steps = Math.ceil(d / 8);
    for (let i = 1; i < steps; i++) {
      const t = i / steps;
      if (this.solidAt(ax + (bx - ax) * t, ay + (by - ay) * t)) return false;
    }
    return true;
  }
}

export interface Body {
  x: number; // center
  y: number; // feet
  w: number;
  h: number;
  vx: number;
  vy: number;
  onGround: boolean;
  dropT?: number; // ticks of ignoring one-way platforms
}

export interface MoveResult {
  hitWall: boolean;
  hitCeil: boolean;
  landed: boolean;
  onSpike: boolean;
}

/**
 * Tile collision. Moves X then Y in sub-steps no larger than a few px so fast bodies
 * (knockback, dashes, plunges) can never tunnel through one-tile walls.
 */
export function moveBody(room: Room, b: Body, noClipOneWay = false): MoveResult {
  const res: MoveResult = { hitWall: false, hitCeil: false, landed: false, onSpike: false };
  const wasGround = b.onGround;
  // ---- X ----
  let dx = b.vx;
  const stepsX = Math.ceil(Math.abs(dx) / 4);
  for (let i = 0; i < stepsX && dx !== 0; i++) {
    const s = Math.abs(dx) > 4 ? Math.sign(dx) * 4 : dx;
    const nx = b.x + s;
    if (collidesSolid(room, nx - b.w / 2, b.y - b.h, b.w, b.h)) {
      // snap to wall
      if (s > 0) b.x = Math.floor((nx + b.w / 2) / TILE) * TILE - b.w / 2 - 0.001;
      else b.x = Math.floor((nx - b.w / 2) / TILE) * TILE + TILE + b.w / 2 + 0.001;
      if (collidesSolid(room, b.x - b.w / 2, b.y - b.h, b.w, b.h)) b.x -= s; // safety
      b.vx = 0;
      res.hitWall = true;
      break;
    }
    b.x = nx;
    dx -= s;
  }
  // ---- Y ----
  let dy = b.vy;
  b.onGround = false;
  const stepsY = Math.max(1, Math.ceil(Math.abs(dy) / 4));
  for (let i = 0; i < stepsY; i++) {
    const s = Math.abs(dy) > 4 ? Math.sign(dy) * 4 : dy;
    const ny = b.y + s;
    if (s > 0) {
      const top = ny - b.h;
      const ignoreOneWay = noClipOneWay || (b.dropT ?? 0) > 0;
      const floorTy = Math.floor(ny / TILE);
      if (collidesSolid(room, b.x - b.w / 2, top, b.w, b.h) || (!ignoreOneWay && crossesOneWay(room, b, b.y, ny))) {
        b.y = floorTy * TILE;
        b.vy = 0;
        b.onGround = true;
        res.landed = !wasGround;
        break;
      }
    } else if (s < 0) {
      if (collidesSolid(room, b.x - b.w / 2, ny - b.h, b.w, b.h)) {
        b.y = (Math.floor((ny - b.h) / TILE) + 1) * TILE + b.h + 0.001;
        b.vy = 0;
        res.hitCeil = true;
        break;
      }
    }
    b.y = ny;
    dy -= s;
    if (dy === 0) break;
  }
  if (!b.onGround && b.vy >= 0) {
    // resting contact check
    if (collidesSolid(room, b.x - b.w / 2, b.y - b.h + 1, b.w, b.h) || (!noClipOneWay && !(b.dropT! > 0) && restingOnOneWay(room, b))) {
      b.onGround = true;
    }
  }
  if (b.dropT) b.dropT--;
  // spikes
  const l = Math.floor((b.x - b.w / 2 + 1) / TILE);
  const r = Math.floor((b.x + b.w / 2 - 1) / TILE);
  const fy = Math.floor((b.y + 1) / TILE);
  for (let tx = l; tx <= r; tx++) if (room.at(tx, fy) === T_SPIKE || room.at(tx, Math.floor((b.y - 1) / TILE)) === T_SPIKE) res.onSpike = true;
  // world bounds safety
  if (b.x < TILE) b.x = TILE + b.w / 2;
  if (b.x > room.pxW - TILE) b.x = room.pxW - TILE - b.w / 2;
  if (b.y > room.pxH) {
    b.y = room.floorBelow(b.x, 0);
    b.vy = 0;
  }
  return res;
}

export function collidesSolid(room: Room, x: number, y: number, w: number, h: number): boolean {
  const l = Math.floor(x / TILE);
  const r = Math.floor((x + w - 0.01) / TILE);
  const t = Math.floor(y / TILE);
  const btm = Math.floor((y + h - 0.01) / TILE);
  for (let ty = t; ty <= btm; ty++) for (let tx = l; tx <= r; tx++) {
    const v = room.at(tx, ty);
    if (v === T_SOLID || v === T_SPIKE) return true;
  }
  return false;
}

function crossesOneWay(room: Room, b: Body, oldY: number, newY: number): boolean {
  const ty = Math.floor(newY / TILE);
  const surface = ty * TILE;
  if (oldY > surface + 0.01) return false;
  const l = Math.floor((b.x - b.w / 2) / TILE);
  const r = Math.floor((b.x + b.w / 2 - 0.01) / TILE);
  for (let tx = l; tx <= r; tx++) if (room.at(tx, ty) === T_ONEWAY) return true;
  return false;
}
function restingOnOneWay(room: Room, b: Body): boolean {
  if (Math.abs(b.y - Math.round(b.y / TILE) * TILE) > 0.01) return false;
  const ty = Math.round(b.y / TILE);
  const l = Math.floor((b.x - b.w / 2) / TILE);
  const r = Math.floor((b.x + b.w / 2 - 0.01) / TILE);
  for (let tx = l; tx <= r; tx++) if (room.at(tx, ty) === T_ONEWAY) return true;
  return false;
}
