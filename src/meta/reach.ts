import { TILE } from '../core/constants';
import { T_EMPTY, T_ONEWAY, T_SOLID, type Room } from '../sim/room';

/**
 * Conservative reachability check for handcrafted rooms (no double jump assumed):
 * walk, fall, drop through planks, and jump up to 3 tiles high / 4 tiles across.
 * Every ground marker (enemies, exits, stations, boss) must be reachable from the spawn.
 */
export function standable(room: Room, tx: number, ty: number): boolean {
  const here = room.at(tx, ty);
  const above = room.at(tx, ty - 1);
  const below = room.at(tx, ty + 1);
  return here === T_EMPTY && above === T_EMPTY && (below === T_SOLID || below === T_ONEWAY);
}

export function reachableCells(room: Room): Set<number> {
  const key = (x: number, y: number) => y * room.w + x;
  const start = { x: Math.floor(room.player.x / TILE), y: Math.floor(room.player.y / TILE) - 1 };
  const seen = new Set<number>();
  const stack = [start];
  const fallFrom = (x: number, y: number) => {
    for (let yy = y; yy < room.h - 1; yy++) {
      if (room.at(x, yy) === T_SOLID) return null;
      if (standable(room, x, yy)) return { x, y: yy };
    }
    return null;
  };
  while (stack.length) {
    const c = stack.pop()!;
    const k = key(c.x, c.y);
    if (seen.has(k) || !standable(room, c.x, c.y)) continue;
    seen.add(k);
    // walk / step off ledges
    for (const dx of [-1, 1]) {
      const nx = c.x + dx;
      if (room.at(nx, c.y) === T_SOLID) continue;
      const f = fallFrom(nx, c.y);
      if (f) stack.push(f);
    }
    // drop through a one-way plank
    if (room.at(c.x, c.y + 1) === T_ONEWAY) {
      const f = fallFrom(c.x, c.y + 2);
      if (f) stack.push(f);
    }
    // jumps
    for (let dy = 1; dy <= 3; dy++) {
      if (room.at(c.x, c.y - dy - 1) === T_SOLID) break; // ceiling
      for (let dx = -4; dx <= 4; dx++) {
        const nx = c.x + dx;
        const ny = c.y - dy;
        if (standable(room, nx, ny)) stack.push({ x: nx, y: ny });
      }
    }
    // jump across gaps at the same level or falling
    for (let dx = -5; dx <= 5; dx++) {
      if (Math.abs(dx) < 2) continue;
      const f = fallFrom(c.x + dx, c.y - 1);
      if (f) stack.push(f);
    }
  }
  return seen;
}

export function unreachableMarkers(room: Room): string[] {
  const cells = reachableCells(room);
  const out: string[] = [];
  const check = (name: string, m: { x: number; y: number }) => {
    const tx = Math.floor(m.x / TILE);
    const ty = Math.floor(m.y / TILE) - 1;
    if (!cells.has(ty * room.w + tx) && !cells.has(ty * room.w + tx - 1) && !cells.has(ty * room.w + tx + 1)) out.push(`${name}@${tx},${ty}`);
  };
  room.ground.forEach((m, i) => check('E' + i, m));
  room.exits.forEach((m, i) => check('X' + i, m));
  if (room.boss) check('B', room.boss);
  for (const k in room.stations) check('S' + k, room.stations[k]);
  return out;
}
