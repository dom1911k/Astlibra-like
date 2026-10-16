import { MOVESETS } from '../data/movesets';
import type { Boss } from '../sim/boss';
import type { Enemy } from '../sim/enemy';
import type { Player } from '../sim/player';
import { glowSprite, shade, withAlpha } from './outline';

type G = CanvasRenderingContext2D;
const TAU = Math.PI * 2;

function ease(t: number) {
  return t < 0 ? 0 : t > 1 ? 1 : 1 - (1 - t) * (1 - t);
}
function easeInOut(t: number) {
  t = Math.max(0, Math.min(1, t));
  return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
}

/** Rest angle of the weapon per class (radians, 0 = forward). */
const REST: Record<string, number> = { fang: 2.3, maul: -2.3, glaive: -1.2, rod: -1.0, pendulum: 2.0 };

export interface WeaponPose {
  angle: number;
  ext: number; // thrust extension px
  trailFrom: number | null;
  trailTo: number;
  glow: number;
  lean: number;
  crouch: number;
}

export function weaponPose(p: Player): WeaponPose {
  const cls = p.moveset.cls;
  const rest = REST[cls];
  const pose: WeaponPose = { angle: rest, ext: 0, trailFrom: null, trailTo: rest, glow: 0, lean: 0, crouch: 0 };
  if (p.state === 'guard') {
    pose.angle = -0.6;
    pose.crouch = 2;
    return pose;
  }
  if (p.state === 'cast') {
    pose.angle = -1.4;
    pose.glow = 1;
    return pose;
  }
  if (p.state !== 'attack' || !p.atk) return pose;
  const a = p.atk;
  const d = a.def;
  const sw = d.swing;
  const t = a.t;
  const s0 = d.startup;
  const s1 = d.startup + d.active;
  const s2 = s1 + d.recovery;
  if (d.charge && !a.released) pose.glow = a.charge / d.charge.maxTicks;
  if (sw.style === 'thrust') {
    pose.angle = sw.from;
    const reach = sw.reach ?? 10;
    if (t < s0) pose.ext = -4 * ease(t / s0);
    else if (t < s1 || (d.plunge && !a.landed)) pose.ext = reach * ease((t - s0) / Math.max(1, Math.min(3, d.active)));
    else pose.ext = reach * (1 - ease((t - s1) / d.recovery));
    if (t >= s0 && t < s1 + 3) pose.trailFrom = sw.from;
    pose.lean = t >= s0 && t < s1 ? 0.25 : 0;
    return pose;
  }
  if (sw.style === 'cast') {
    pose.angle = t < s0 ? sw.from : sw.to;
    pose.glow = t < s1 ? 1 : 0.4;
    return pose;
  }
  const windAngle = sw.from + (sw.to > sw.from ? -0.35 : 0.35);
  if (t < s0) {
    pose.angle = rest + (windAngle - rest) * ease(t / s0);
    pose.lean = -0.12 * ease(t / s0);
    pose.crouch = sw.style === 'slam' ? 2 * ease(t / s0) : 0;
  } else if (t < s1) {
    const k = easeInOut((t - s0) / Math.max(1, d.active));
    pose.angle = windAngle + (sw.to - windAngle) * k;
    pose.trailFrom = windAngle;
    pose.lean = 0.2;
    pose.crouch = sw.style === 'slam' ? 3 : 1;
  } else {
    const k = ease((t - s1) / Math.max(1, d.recovery));
    pose.angle = sw.to + (rest - sw.to) * k * k;
    if (t < s1 + 4) pose.trailFrom = windAngle + (sw.to - windAngle) * Math.min(1, (t - s1) / 4);
    pose.lean = 0.2 * (1 - k);
    pose.crouch = sw.style === 'slam' ? 3 * (1 - k) : 0;
  }
  void s2;
  return pose;
}


// ─────────────────────────────── weapons ───────────────────────────────

function drawWeapon(g: G, cls: string, color: string, len: number, glow: number) {
  const hi = shade(color, 0.45);
  const lo = shade(color, -0.35);
  switch (cls) {
    case 'fang':
      g.fillStyle = '#3a2a1e';
      g.fillRect(-1, -1, 4, 2);
      g.fillStyle = '#c8a050';
      g.fillRect(3, -2, 1, 4);
      g.fillStyle = lo;
      g.beginPath();
      g.moveTo(4, -1.5);
      g.lineTo(4 + len, 0);
      g.lineTo(4, 1.5);
      g.fill();
      g.fillStyle = hi;
      g.fillRect(4, -1, len - 3, 1);
      break;
    case 'maul':
      g.fillStyle = '#4a3020';
      g.fillRect(-2, -1, len, 2);
      g.fillStyle = '#8a6a40';
      g.fillRect(-2, -1, len, 1);
      g.fillStyle = lo;
      g.fillRect(len - 5, -6, 10, 12);
      g.fillStyle = color;
      g.fillRect(len - 5, -6, 10, 8);
      g.fillStyle = hi;
      g.fillRect(len - 5, -6, 10, 1);
      g.fillRect(len - 5, -6, 1, 8);
      g.fillStyle = '#2a2020';
      g.fillRect(len - 1, -6, 2, 12);
      break;
    case 'glaive':
      g.fillStyle = '#5a4030';
      g.fillRect(-6, -1, len, 2);
      g.fillStyle = '#8a6a48';
      g.fillRect(-6, -1, len, 1);
      g.fillStyle = lo;
      g.beginPath();
      g.moveTo(len - 6, -3);
      g.lineTo(len + 6, 0);
      g.lineTo(len - 6, 3);
      g.fill();
      g.fillStyle = hi;
      g.beginPath();
      g.moveTo(len - 6, -3);
      g.lineTo(len + 6, 0);
      g.lineTo(len - 6, 0);
      g.fill();
      g.fillStyle = '#b8343e';
      g.fillRect(len - 9, -2, 2, 6);
      break;
    case 'rod':
      g.fillStyle = '#6a4a34';
      g.fillRect(-3, -1, len, 2);
      g.fillStyle = '#9a7a54';
      g.fillRect(-3, -1, len, 1);
      g.fillStyle = '#c8a050';
      g.fillRect(len - 5, -3, 2, 6);
      g.fillStyle = color;
      g.beginPath();
      g.arc(len, 0, 2.5 + glow * 1.2, 0, TAU);
      g.fill();
      g.fillStyle = '#ffffff';
      g.fillRect(len - 1, -1, 1, 1);
      break;
    case 'pendulum':
      g.fillStyle = '#3a2a24';
      g.fillRect(-1, -1, 6, 2);
      g.strokeStyle = '#9a9aa8';
      g.lineWidth = 1;
      g.beginPath();
      for (let k = 5; k < len - 6; k += 2) {
        g.moveTo(k, -0.5);
        g.lineTo(k + 1, 0.5);
      }
      g.stroke();
      g.fillStyle = lo;
      g.beginPath();
      g.moveTo(len - 7, -6);
      g.quadraticCurveTo(len + 5, 0, len - 7, 6);
      g.quadraticCurveTo(len - 2, 0, len - 7, -6);
      g.fill();
      g.fillStyle = hi;
      g.beginPath();
      g.moveTo(len - 7, -6);
      g.quadraticCurveTo(len + 4, -1, len, 0);
      g.quadraticCurveTo(len - 3, -2, len - 7, -6);
      g.fill();
      break;
  }
}

// ─────────────────────────────── player ───────────────────────────────

interface BodyPose {
  rot: number;
  squashY: number;
  lean: number;
  crouch: number;
  air: boolean;
  run: boolean;
}

function bodyPose(p: Player, pose: WeaponPose): BodyPose {
  const air = !p.onGround;
  let rot = 0;
  let squashY = 1;
  if (p.state === 'dodge') {
    if (!air) {
      rot = (p.st / 18) * TAU;
      squashY = 0.75;
    } else rot = 0.45;
  }
  if (p.state === 'dead') rot = -Math.PI / 2;
  if (p.landT > 0) squashY = 1 - p.landT * 0.025;
  const run = p.state === 'free' && p.onGround && Math.abs(p.vx) > 0.3;
  const lean = pose.lean + (p.state === 'hurt' ? -0.35 : 0) + (run ? Math.min(0.18, Math.abs(p.vx) * 0.06) : 0) + (air && p.state === 'free' ? Math.max(-0.12, Math.min(0.12, -p.vy * 0.03)) : 0);
  return { rot, squashY, lean, crouch: pose.crouch, air, run };
}

/** Player sprite at origin (feet), outlined by the caller. */
export function drawPlayerBody(g: G, p: Player, t: number, armorColor: string, weaponColor: string): void {
  const cls = p.moveset.cls;
  const len = MOVESETS[cls].length;
  const pose = weaponPose(p);
  const bp = bodyPose(p, pose);
  const coat = armorColor;
  const coatHi = shade(coat, 0.22);
  const coatLo = shade(coat, -0.32);
  g.save();
  g.scale(p.facing, 1);
  if (bp.rot) {
    g.translate(0, -10);
    g.rotate(bp.rot);
    g.translate(0, 10);
  }
  g.scale(1, bp.squashY);
  g.translate(0, bp.crouch);
  const ph = p.runPhase;
  const swing = bp.run ? Math.sin(ph) : 0;
  const wind = -Math.min(5, Math.abs(p.vx) * 1.6) - (bp.air ? 2 : 0);
  // ── back leg ──
  const legY = bp.air ? -7 : -8;
  g.fillStyle = '#20202a';
  g.fillRect(-2 - swing * 2.5, legY, 3, bp.air ? 5 : 7);
  g.fillStyle = '#2a1e18';
  g.fillRect(-3 - swing * 2.5, -2 + (bp.air ? -1 : 0), 4, 2);
  // ── scarf (back, trailing) ──
  g.save();
  g.translate(0, -8);
  g.rotate(bp.lean);
  const sw = (k: number) => Math.sin(t / 110 + k * 1.3) * (1.2 + k * 0.4);
  g.fillStyle = '#8a2430';
  g.beginPath();
  g.moveTo(0, -13);
  for (let k = 1; k <= 4; k++) g.lineTo(-k * 2.8 + wind * k * 0.35, -13 + sw(k) + k * 0.6);
  for (let k = 4; k >= 1; k--) g.lineTo(-k * 2.8 + wind * k * 0.35, -11 + sw(k) + k * 0.9);
  g.lineTo(0, -11);
  g.fill();
  g.fillStyle = '#c8404a';
  g.beginPath();
  g.moveTo(0, -13);
  for (let k = 1; k <= 4; k++) g.lineTo(-k * 2.8 + wind * k * 0.35, -13 + sw(k) + k * 0.6);
  g.lineTo(-11 + wind, -12);
  g.lineTo(0, -12);
  g.fill();
  // ── back arm (off hand / shield) ──
  const guarding = p.state === 'guard';
  if (guarding || p.shield) {
    const sx = guarding ? 4 : -4;
    const sy = guarding ? -14 : -11;
    g.fillStyle = '#5a4a30';
    g.fillRect(sx - 1, sy, 4, 11);
    g.fillStyle = guarding ? '#e0d098' : '#a08a5a';
    g.fillRect(sx, sy + 1, 3, 9);
    g.fillStyle = '#c8a050';
    g.fillRect(sx + 1, sy + 4, 1, 3);
  } else {
    g.fillStyle = coatLo;
    g.fillRect(-4 - swing, -12, 2, 6);
  }
  // ── coat tail ──
  const flare = bp.run ? Math.abs(swing) * 1.5 : bp.air ? 2 : 0;
  g.fillStyle = coatLo;
  g.beginPath();
  g.moveTo(-4, -8);
  g.lineTo(-5 - flare + wind * 0.3, -1 + Math.sin(t / 140) * 0.5);
  g.lineTo(2, -2);
  g.lineTo(3, -8);
  g.fill();
  // ── front leg ──
  g.fillStyle = '#2c2c38';
  g.fillRect(0 + swing * 2.5, legY, 3, bp.air ? 4 : 7);
  g.fillStyle = '#3a2a20';
  g.fillRect(0 + swing * 2.5, -2 + (bp.air ? -2 : 0), 4, 2);
  g.fillStyle = '#5a4030';
  g.fillRect(0 + swing * 2.5, -2 + (bp.air ? -2 : 0), 4, 1);
  g.restore();
  // ── torso / head (lean around hips) ──
  g.save();
  g.translate(0, -8);
  g.rotate(bp.lean);
  const bob = p.state === 'free' && p.onGround && !bp.run ? Math.sin(t / 320) * 0.5 : bp.run ? -Math.abs(Math.sin(ph)) : 0;
  g.translate(0, bob);
  // coat body
  g.fillStyle = coat;
  g.fillRect(-4, -12, 8, 12);
  g.fillStyle = coatHi;
  g.fillRect(2, -11, 2, 10);
  g.fillStyle = coatLo;
  g.fillRect(-4, -11, 1, 11);
  // lapel & belt
  g.fillStyle = shade(coat, -0.15);
  g.fillRect(0, -12, 1, 7);
  g.fillStyle = '#2a1e18';
  g.fillRect(-4, -4, 8, 2);
  g.fillStyle = '#d8b060';
  g.fillRect(0, -4, 2, 2);
  // lantern
  const lsw = Math.sin(t / 180) * 0.8;
  g.fillStyle = '#4a3420';
  g.fillRect(-6 + lsw, -6, 4, 1);
  g.fillStyle = '#ffd27a';
  g.fillRect(-6 + lsw, -5, 4, 4);
  g.fillStyle = '#fff6d0';
  g.fillRect(-5 + lsw, -4, 2, 2);
  g.fillStyle = '#4a3420';
  g.fillRect(-6 + lsw, -1, 4, 1);
  // head
  g.fillStyle = '#e8c8a0';
  g.fillRect(-1, -17, 5, 5);
  g.fillStyle = '#c8a07a';
  g.fillRect(-1, -13, 5, 1);
  g.fillStyle = '#1a1422';
  g.fillRect(2, -15, 1, 1);
  // hood
  g.fillStyle = '#2a2440';
  g.fillRect(-3, -19, 7, 3);
  g.fillRect(-3, -17, 2, 5);
  g.fillRect(4, -18, 1, 2);
  g.fillStyle = '#3e3660';
  g.fillRect(-2, -19, 5, 1);
  g.fillStyle = '#1a1630';
  g.beginPath();
  g.moveTo(-3, -19);
  g.lineTo(-6 + wind * 0.2, -16);
  g.lineTo(-3, -16);
  g.fill();
  // ── weapon arm ──
  g.save();
  g.translate(1, -10);
  g.rotate(pose.angle);
  g.fillStyle = coat;
  g.fillRect(0, -1, 5, 2);
  g.fillStyle = '#e8c8a0';
  g.fillRect(4, -1, 2, 2);
  g.translate(4 + pose.ext, 0);
  drawWeapon(g, cls, weaponColor, len, pose.glow);
  if (cls === 'fang') {
    g.rotate(0.5);
    g.translate(-2, 2);
    drawWeapon(g, cls, shade(weaponColor, -0.2), len - 2, 0);
  }
  g.restore();
  g.restore();
  g.restore();
}

/** Weapon smear trails & glows, drawn additively in screen space (not outlined). */
export function drawPlayerFx(g: G, p: Player, x: number, y: number, weaponColor: string): void {
  const cls = p.moveset.cls;
  const len = MOVESETS[cls].length;
  const pose = weaponPose(p);
  if (pose.trailFrom === null && pose.glow <= 0) return;
  const bp = bodyPose(p, pose);
  g.save();
  g.translate(x, y);
  g.scale(p.facing, 1);
  g.scale(1, bp.squashY);
  g.translate(0, bp.crouch - 8);
  g.rotate(bp.lean);
  g.translate(1, -10);
  if (pose.trailFrom !== null) drawTrail(g, pose.trailFrom, pose.angle, 5, 6 + len + pose.ext + (cls === 'maul' ? 5 : 0), weaponColor, p.atk?.def.swing.style ?? 'arc', p.atk?.def.kind === 'heavy' || !!p.moveset.heavyWeapon);
  if (pose.glow > 0) {
    g.rotate(pose.angle);
    g.globalCompositeOperation = 'lighter';
    g.globalAlpha = 0.3 + pose.glow * 0.5;
    g.drawImage(glowSprite(cls === 'rod' ? '#9fe8ff' : '#ffd27a', 14), 4 + len - 14, -14);
    g.globalAlpha = 1;
    g.globalCompositeOperation = 'source-over';
  }
  g.restore();
}

function drawTrail(g: G, from: number, to: number, r0: number, r1: number, color: string, style: string, heavy: boolean) {
  g.save();
  g.globalCompositeOperation = 'lighter';
  if (style === 'thrust') {
    g.rotate(from);
    const grad = g.createLinearGradient(r0, 0, r1 + 6, 0);
    grad.addColorStop(0, withAlpha(color, 0));
    grad.addColorStop(1, withAlpha('#ffffff', 0.85));
    g.fillStyle = grad;
    g.beginPath();
    g.moveTo(r0, -3);
    g.lineTo(r1 + 6, 0);
    g.lineTo(r0, 3);
    g.fill();
    g.restore();
    return;
  }
  // crescent smear: thick at the leading edge, tapering behind
  const steps = 14;
  const span = to - from;
  const width = heavy ? 0.55 : 0.4;
  g.beginPath();
  for (let i = 0; i <= steps; i++) {
    const a = from + (span * i) / steps;
    g.lineTo(Math.cos(a) * r1, Math.sin(a) * r1);
  }
  for (let i = steps; i >= 0; i--) {
    const k = i / steps;
    const a = from + span * k;
    const rr = r1 - (r1 - r0) * width * k;
    g.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
  }
  g.closePath();
  const ga = g.createRadialGradient(0, 0, r0, 0, 0, r1);
  ga.addColorStop(0, withAlpha(color, 0.05));
  ga.addColorStop(0.7, withAlpha(color, 0.45));
  ga.addColorStop(1, withAlpha('#ffffff', 0.9));
  g.fillStyle = ga;
  g.fill();
  // bright leading edge
  g.strokeStyle = 'rgba(255,255,255,0.9)';
  g.lineWidth = 1;
  g.beginPath();
  const a1 = to;
  const a0 = to - span * 0.35;
  g.arc(0, 0, r1 - 0.5, Math.min(a0, a1), Math.max(a0, a1));
  g.stroke();
  g.restore();
}

// ─────────────────────────────── enemies ───────────────────────────────

/** Enemy sprite at origin (feet). Facing/scale applied here. */
export function drawEnemyBody(g: G, e: Enemy, t: number): void {
  const def = e.def;
  const tele = e.telegraph;
  const accent = e.unblockableTele && tele > 0 ? '#ff3030' : def.accent;
  const glow = tele > 0 ? (Math.floor(t / 60) % 2 === 0 ? 1 : 0.6) * tele : 0;
  const dead = e.state === 'dead';
  const col = def.color;
  const hi = shade(col, 0.25);
  const lo = shade(col, -0.35);
  g.save();
  g.scale(e.facing * e.scale, e.scale);
  if (e.state === 'stagger' || dead) g.rotate(dead ? -0.4 : Math.sin(t / 50) * 0.08);
  switch (def.ai) {
    case 'skitter': {
      const sq = e.state === 'windup' ? 1 - tele * 0.3 : e.state === 'active' ? 1.25 : 1 + Math.sin(t / 90 + e.id) * 0.04;
      g.scale(1 / sq, sq);
      const lp = Math.sin(t / 50 + e.id) * 2;
      g.fillStyle = lo;
      for (const [lx, d] of [[-5, lp], [-2, -lp], [2, lp], [5, -lp]]) g.fillRect(lx + d * 0.5, -3, 1, 3);
      g.fillStyle = col;
      g.beginPath();
      g.ellipse(0, -6, 7, 5.5, 0, 0, TAU);
      g.fill();
      g.fillStyle = hi;
      g.beginPath();
      g.ellipse(-1, -8, 5, 2.5, 0, 0, TAU);
      g.fill();
      g.fillStyle = lo;
      for (let i = 0; i < 6; i++) {
        const a = -Math.PI * 0.95 + i * 0.36 + Math.sin(t / 100 + i) * 0.1;
        g.beginPath();
        g.moveTo(Math.cos(a) * 5, -6 + Math.sin(a) * 4.5);
        g.lineTo(Math.cos(a) * 9.5, -6 + Math.sin(a) * 8);
        g.lineTo(Math.cos(a + 0.2) * 5, -6 + Math.sin(a + 0.2) * 4.5);
        g.fill();
      }
      g.fillStyle = accent;
      g.fillRect(3, -8, 2, 2);
      g.fillRect(6, -7, 1, 2);
      if (glow) {
        g.fillStyle = '#ffffff';
        g.fillRect(3, -8, 1, 1);
      }
      break;
    }
    case 'knight': {
      const golem = def.id === 'cinder_golem';
      const bw = golem ? 18 : 12;
      const bh = golem ? 30 : 26;
      const step = e.state === 'move' || Math.abs(e.vx) > 0.2 ? Math.sin(t / 120) * 1.5 : 0;
      // legs
      g.fillStyle = '#22222c';
      g.fillRect(-bw / 2 + 1 + step, -8, 4, 8);
      g.fillRect(bw / 2 - 5 - step, -8, 4, 8);
      // torso armor
      g.fillStyle = col;
      g.fillRect(-bw / 2, -bh + 6, bw, bh - 14);
      g.fillStyle = hi;
      g.fillRect(-bw / 2 + 1, -bh + 6, bw - 2, 2);
      g.fillRect(bw / 2 - 3, -bh + 8, 2, bh - 18);
      g.fillStyle = lo;
      g.fillRect(-bw / 2, -10, bw, 2);
      g.fillRect(-bw / 2, -bh + 8, 2, bh - 16);
      if (golem) {
        // molten seams
        g.fillStyle = accent;
        g.globalAlpha *= 0.7 + glow * 0.3;
        g.fillRect(-4, -bh + 13, 8, 6);
        g.fillRect(-7, -bh + 22, 3, 1);
        g.fillRect(3, -bh + 25, 5, 1);
        g.globalAlpha = dead ? Math.max(0, 1 - e.deathT / 45) : 1;
      }
      // helm with plume
      g.fillStyle = golem ? '#3a2a26' : '#6a7480';
      g.fillRect(-5, -bh, 10, 8);
      g.fillStyle = golem ? '#5a4036' : '#8a96a2';
      g.fillRect(-5, -bh, 10, 2);
      g.fillStyle = '#14141a';
      g.fillRect(-1, -bh + 3, 6, 2);
      g.fillStyle = accent;
      g.fillRect(1, -bh + 3, 3, 1 + (glow > 0.5 ? 1 : 0));
      if (!golem) {
        g.fillStyle = '#8a2a2a';
        g.fillRect(-6, -bh - 2, 6, 3);
        g.fillRect(-8, -bh - 1, 2, 4);
      }
      // weapon arm
      const atk = e.attack?.id;
      const heavySwing = atk === 'overhead' || atk === 'slam';
      let ang = 0.6;
      if (e.state === 'windup') ang = heavySwing ? 0.6 - 2.6 * tele : 0.6 - 0.6 * tele;
      else if (e.state === 'active') ang = heavySwing ? 1.1 : 0;
      g.save();
      g.translate(3, -bh + 10);
      g.rotate(ang);
      g.fillStyle = col;
      g.fillRect(0, -2, 5, 4);
      if (golem) {
        g.fillStyle = lo;
        g.fillRect(4, -4, 12, 8);
        g.fillStyle = hi;
        g.fillRect(4, -4, 12, 2);
      } else {
        g.fillStyle = '#d0d8e0';
        g.fillRect(5, -1, 18, 2);
        g.fillStyle = '#ffffff';
        g.fillRect(5, -1, 17, 1);
        g.fillStyle = '#a08040';
        g.fillRect(4, -3, 2, 6);
      }
      g.restore();
      if (def.frontGuard && e.state !== 'stagger') {
        g.fillStyle = '#5a4a34';
        g.fillRect(bw / 2 - 1, -bh + 7, 5, 16);
        g.fillStyle = '#8a7650';
        g.fillRect(bw / 2, -bh + 8, 3, 14);
        g.fillStyle = accent;
        g.fillRect(bw / 2 + 1, -bh + 13, 1, 4);
      }
      break;
    }
    case 'spitter': {
      const open = e.state === 'windup' ? tele : 0;
      g.fillStyle = '#2a3e22';
      g.fillRect(-1, -10, 3, 10);
      g.fillStyle = '#3e5a2e';
      g.fillRect(0, -10, 1, 10);
      for (let i = 0; i < 5; i++) {
        g.save();
        g.translate(0, -13);
        g.rotate(i * 1.257 + Math.sin(t / 220 + i) * 0.15 + open * 0.6);
        g.fillStyle = i % 2 ? '#4e7034' : '#5e8a3e';
        g.beginPath();
        g.ellipse(7, 0, 5, 2.5, 0, 0, TAU);
        g.fill();
        g.restore();
      }
      g.fillStyle = col;
      g.beginPath();
      g.ellipse(0, -13, 6, 5 + open * 2, 0, 0, TAU);
      g.fill();
      g.fillStyle = hi;
      g.fillRect(-3, -17 - open, 4, 2);
      g.fillStyle = '#1a2a10';
      g.fillRect(2, -14 - open, 4, 2 + open * 3);
      g.fillStyle = accent;
      g.fillRect(3, -13 - open, 2, 1 + open * 2);
      break;
    }
    case 'moth': {
      const flap = Math.sin(t / 38 + e.id) * (e.state === 'active' ? 0.25 : 1);
      g.save();
      g.translate(0, -7);
      g.scale(1, Math.abs(flap) * 0.8 + 0.2);
      for (const s of [-1, 1]) {
        g.fillStyle = shade('#7a68a0', s > 0 ? 0.1 : -0.1);
        g.beginPath();
        g.ellipse(s * 4, -5, 7, 6, s * 0.45, 0, TAU);
        g.fill();
        g.fillStyle = withAlpha(accent, 0.7);
        g.beginPath();
        g.arc(s * 5, -6, 1.6, 0, TAU);
        g.fill();
      }
      g.restore();
      g.fillStyle = col;
      g.fillRect(-2, -11, 5, 9);
      g.fillStyle = hi;
      g.fillRect(-1, -11, 3, 2);
      g.fillStyle = lo;
      for (let k = 0; k < 3; k++) g.fillRect(-2, -8 + k * 2, 5, 1);
      g.strokeStyle = '#8a7a9a';
      g.lineWidth = 1;
      g.beginPath();
      g.moveTo(1, -11);
      g.lineTo(4, -15);
      g.moveTo(0, -11);
      g.lineTo(-2, -15);
      g.stroke();
      g.fillStyle = accent;
      g.fillRect(2, -10, 2, 2);
      break;
    }
    case 'tick': {
      const pulse = e.state === 'windup' ? 1 + Math.sin(t / Math.max(8, 30 - tele * 22)) * 0.25 * tele : 1;
      const lp = Math.sin(t / 35 + e.id) * 1.5;
      g.fillStyle = '#2a120c';
      for (const lx of [-4, -1, 2, 4]) g.fillRect(lx + (lx % 2 ? lp : -lp) * 0.5, -2, 1, 2);
      g.fillStyle = col;
      g.beginPath();
      g.ellipse(0, -5, 6 * pulse, 5 * pulse, 0, 0, TAU);
      g.fill();
      g.fillStyle = accent;
      g.globalAlpha *= 0.55 + tele * 0.45;
      g.beginPath();
      g.ellipse(-1, -6, 3.5 * pulse, 2.8 * pulse, 0, 0, TAU);
      g.fill();
      g.fillStyle = '#ffffff';
      g.fillRect(-2, -7, 1, 1);
      g.globalAlpha = dead ? Math.max(0, 1 - e.deathT / 45) : 1;
      g.fillStyle = '#2a120c';
      g.fillRect(4, -5, 2, 2);
      break;
    }
    case 'shepherd': {
      const lift = e.state === 'windup' ? tele * 4 : 0;
      g.fillStyle = lo;
      g.beginPath();
      g.moveTo(-7, 0);
      g.lineTo(-4, -20);
      g.lineTo(5, -20);
      g.lineTo(8, 0);
      g.fill();
      g.fillStyle = col;
      g.beginPath();
      g.moveTo(-4, 0);
      g.lineTo(-2, -20);
      g.lineTo(5, -20);
      g.lineTo(7, 0);
      g.fill();
      g.fillStyle = hi;
      g.fillRect(3, -19, 2, 17);
      g.fillStyle = '#9a8a5a';
      g.fillRect(-4, -11, 10, 1);
      // hood
      g.fillStyle = '#241a12';
      g.beginPath();
      g.moveTo(-5, -19);
      g.lineTo(0, -29);
      g.lineTo(5, -19);
      g.fill();
      g.fillStyle = '#0c0806';
      g.fillRect(-1, -25, 5, 5);
      g.fillStyle = accent;
      g.fillRect(1, -24, 2, 1);
      // staff
      g.fillStyle = '#6a5034';
      g.fillRect(6, -29 - lift, 1, 29);
      g.fillStyle = '#c8a050';
      g.fillRect(5, -29 - lift, 3, 1);
      g.fillStyle = accent;
      g.beginPath();
      g.arc(6.5, -31 - lift, 2 + glow * 1.5, 0, TAU);
      g.fill();
      break;
    }
    case 'duelist': {
      const lunge = e.state === 'active' ? 3 : 0;
      g.fillStyle = '#221c1e';
      g.fillRect(-3, -8, 2, 8);
      g.fillRect(1 + lunge, -8, 2, 8);
      g.fillStyle = '#3a2a24';
      g.fillRect(-3, -1, 3, 1);
      g.fillRect(1 + lunge, -1, 3, 1);
      // tattered cape
      g.fillStyle = shade(accent, -0.5);
      g.beginPath();
      g.moveTo(-2, -19);
      g.lineTo(-7 + Math.sin(t / 130) * 1.5, -5);
      g.lineTo(-3, -7);
      g.fill();
      g.fillStyle = col;
      g.fillRect(-3, -19, 7, 11);
      g.fillStyle = hi;
      g.fillRect(2, -18, 2, 9);
      g.fillStyle = '#c8b0a0';
      g.fillRect(-2, -25, 6, 6);
      g.fillStyle = '#5a4a44';
      g.fillRect(-3, -26, 7, 2);
      g.fillStyle = accent;
      g.fillRect(2, -23, 2, 1);
      const ang = e.state === 'guard' ? -1.2 : e.state === 'windup' ? -0.5 - tele * 0.6 : e.state === 'active' ? Math.sin(t / 25) * 0.4 : 0.4;
      g.save();
      g.translate(3, -16);
      g.rotate(ang);
      g.fillStyle = '#e0e0f0';
      g.fillRect(0, -0.5, 21, 1);
      g.fillStyle = '#c8a050';
      g.fillRect(0, -2, 2, 4);
      g.restore();
      break;
    }
    case 'dummy': {
      g.fillStyle = '#5a3a1e';
      g.fillRect(-1, -26, 3, 26);
      g.fillStyle = col;
      g.fillRect(-6, -22, 13, 12);
      g.fillRect(-8, -19, 17, 3);
      g.fillStyle = hi;
      g.fillRect(-6, -22, 13, 2);
      g.fillStyle = lo;
      for (let k = 0; k < 4; k++) g.fillRect(-5 + k * 3, -20, 1, 9);
      g.fillStyle = '#4a3018';
      g.fillRect(-3, -27, 7, 6);
      g.fillStyle = '#c04040';
      g.beginPath();
      g.arc(0.5, -15, 2, 0, TAU);
      g.fill();
      break;
    }
  }
  g.restore();
}

/** Status overlays, telegraphs and wards drawn after the outlined body. */
export function drawEnemyOverlay(g: G, e: Enemy, x: number, y: number, t: number): void {
  const dead = e.state === 'dead';
  if (dead) return;
  if (e.status.frozen > 0) {
    g.fillStyle = 'rgba(170,235,255,0.5)';
    g.fillRect(x - e.w / 2 - 2, y - e.h - 2, e.w + 4, e.h + 2);
    g.fillStyle = 'rgba(255,255,255,0.75)';
    g.fillRect(x - e.w / 2 - 2, y - e.h - 2, e.w + 4, 1);
    g.fillRect(x - e.w / 2 - 2, y - e.h - 2, 1, e.h + 2);
  }
  if (e.barrier > 0 || e.ward) {
    g.strokeStyle = e.ward ? 'rgba(156,242,255,0.75)' : 'rgba(156,242,255,0.45)';
    g.lineWidth = 1;
    g.beginPath();
    g.ellipse(x, y - e.h / 2, e.w * 0.8 + Math.sin(t / 200), e.h * 0.7, 0, 0, TAU);
    g.stroke();
  }
  if (e.elite.length) {
    // elite aura
    g.globalCompositeOperation = 'lighter';
    g.globalAlpha = 0.25 + Math.sin(t / 220) * 0.08;
    g.drawImage(glowSprite('#ff7a3c', 18), x - 18, y - e.h / 2 - 18);
    g.globalAlpha = 1;
    g.globalCompositeOperation = 'source-over';
  }
  if (e.state === 'guard') {
    g.fillStyle = '#ffd0d0';
    g.fillRect(x + e.facing * (e.w / 2 + 2), y - e.h, 2, e.h - 4);
  }
  if (e.telegraph > 0.05) telegraphMark(g, x, y - e.h * e.scale - 8, e.telegraph, e.unblockableTele, t);
}

function telegraphMark(g: G, x: number, y: number, tele: number, red: boolean, t: number): void {
  const col = red ? '#ff3030' : '#ffd23c';
  const yy = y - (Math.floor(t / 80) % 2);
  g.globalCompositeOperation = 'lighter';
  g.globalAlpha = 0.4 * tele;
  g.drawImage(glowSprite(col, 10), x - 10, yy - 12);
  g.globalCompositeOperation = 'source-over';
  g.globalAlpha = 0.6 + tele * 0.4;
  g.fillStyle = '#000000';
  g.fillRect(x - 2, yy - 7, 4, 9);
  g.fillStyle = col;
  g.fillRect(x - 1, yy - 6, 2, 4);
  g.fillRect(x - 1, yy, 2, 1);
  g.globalAlpha = 1;
}

// ─────────────────────────────── guardians ───────────────────────────────

export function drawBossBody(g: G, b: Boss, t: number): void {
  const id = b.bossDef.id;
  const tele = b.telegraph;
  const accent = b.unblockableTele && tele > 0 ? '#ff3030' : b.bossDef.accent;
  const col = b.bossDef.color;
  const hi = shade(col, 0.25);
  const lo = shade(col, -0.4);
  g.save();
  g.scale(b.facing, 1);
  if (b.state === 'stagger') g.rotate(Math.sin(t / 60) * 0.06);
  if (id === 'rootmaw') {
    const crouch = b.state === 'windup' ? tele * 4 : 0;
    const charge = b.move?.id === 'charge' && b.state === 'active';
    g.translate(0, crouch);
    const lp = Math.sin(t / (charge ? 30 : 120)) * 3;
    // back legs
    g.fillStyle = shade(col, -0.55);
    g.fillRect(-18 - lp, -12, 7, 12);
    g.fillRect(8 + lp, -12, 7, 12);
    // body
    g.fillStyle = lo;
    g.beginPath();
    g.ellipse(-2, -21, 25, 16, charge ? 0.1 : 0, 0, TAU);
    g.fill();
    g.fillStyle = col;
    g.beginPath();
    g.ellipse(-2, -23, 23, 13, charge ? 0.1 : 0, 0, TAU);
    g.fill();
    g.fillStyle = hi;
    g.beginPath();
    g.ellipse(-5, -30, 14, 4, 0, 0, TAU);
    g.fill();
    // bark plates
    g.fillStyle = lo;
    for (let i = 0; i < 5; i++) g.fillRect(-18 + i * 7, -29 + (i % 2) * 2, 5, 2);
    // roots / antlers
    g.strokeStyle = '#6a4a2a';
    g.lineWidth = 2;
    for (let i = 0; i < 5; i++) {
      g.beginPath();
      g.moveTo(-14 + i * 6, -34);
      g.quadraticCurveTo(-18 + i * 6, -44 - (i % 2) * 6, -10 + i * 7 + Math.sin(t / 200 + i) * 2, -50 - (i % 3) * 4);
      g.stroke();
    }
    g.strokeStyle = '#8a6a3a';
    g.lineWidth = 1;
    for (let i = 0; i < 5; i++) {
      g.beginPath();
      g.moveTo(-14 + i * 6, -36);
      g.quadraticCurveTo(-17 + i * 6, -44 - (i % 2) * 6, -11 + i * 7 + Math.sin(t / 200 + i) * 2, -50 - (i % 3) * 4);
      g.stroke();
    }
    // front legs
    g.fillStyle = shade(col, -0.45);
    g.fillRect(-12 + lp, -12, 7, 12);
    g.fillRect(14 - lp, -12, 7, 12);
    g.fillStyle = '#d8ccb0';
    for (const lx of [-12 + lp, 14 - lp]) g.fillRect(lx + 4, -1, 3, 1);
    // head + jaw
    const jaw = b.state === 'windup' ? tele * 6 : b.state === 'active' ? 6 : 1;
    g.fillStyle = '#5a4634';
    g.fillRect(14, -34, 17, 13);
    g.fillStyle = '#7a6046';
    g.fillRect(14, -34, 17, 2);
    g.fillStyle = '#2e2018';
    g.fillRect(14, -21 + jaw * 0.3, 17, 5 + jaw * 0.5);
    g.fillStyle = '#e8dcc0';
    for (let i = 0; i < 4; i++) g.fillRect(16 + i * 4, -22, 2, 2 + jaw * 0.3);
    // glowing cracks
    g.fillStyle = accent;
    g.globalAlpha *= 0.7 + tele * 0.3;
    g.fillRect(23, -30, 4, 3);
    g.fillRect(-10, -25, 10, 1);
    g.fillRect(-4, -17, 8, 1);
    g.fillRect(0, -30, 1, 8);
    g.globalAlpha = 1;
  } else if (id === 'matriarch') {
    const flap = Math.sin(t / (b.state === 'active' ? 30 : 70));
    for (const s of [-1, 1]) {
      g.save();
      g.translate(0, -16);
      g.scale(1, 0.55 + flap * 0.45 * s);
      g.fillStyle = shade('#3a2e4a', s > 0 ? 0.08 : -0.1);
      g.beginPath();
      g.ellipse(-12 * s - 6, -10, 23, 15, 0.5 * s, 0, TAU);
      g.fill();
      g.fillStyle = shade('#3a2e4a', 0.2);
      g.beginPath();
      g.ellipse(-12 * s - 6, -13, 16, 7, 0.5 * s, 0, TAU);
      g.fill();
      g.fillStyle = accent;
      g.beginPath();
      g.arc(-15 * s - 6, -12, 4, 0, TAU);
      g.fill();
      g.fillStyle = '#1a1424';
      g.beginPath();
      g.arc(-15 * s - 6, -12, 2, 0, TAU);
      g.fill();
      g.restore();
    }
    g.fillStyle = lo;
    g.beginPath();
    g.ellipse(0, -13, 9, 15, 0, 0, TAU);
    g.fill();
    g.fillStyle = col;
    g.beginPath();
    g.ellipse(1, -14, 7, 13, 0, 0, TAU);
    g.fill();
    g.fillStyle = hi;
    for (let k = 0; k < 4; k++) g.fillRect(-4, -20 + k * 4, 9, 1);
    // fur collar
    g.fillStyle = '#d8c8a8';
    g.beginPath();
    g.ellipse(0, -26, 8, 3, 0, 0, TAU);
    g.fill();
    g.fillStyle = '#2a2234';
    g.fillRect(-4, -33, 9, 7);
    g.fillStyle = accent;
    g.fillRect(2, -31, 2, 2);
    g.fillRect(-2, -31, 2, 2);
    g.strokeStyle = '#a89ab8';
    g.lineWidth = 1;
    g.beginPath();
    g.moveTo(0, -33);
    g.quadraticCurveTo(6, -44, 11, -42);
    g.moveTo(0, -33);
    g.quadraticCurveTo(-6, -44, -11, -42);
    g.stroke();
  } else {
    // The Pale Vessel
    const st = b.state === 'active' ? 3 : 0;
    g.fillStyle = '#2a2840';
    g.fillRect(-4, -10, 3, 10);
    g.fillRect(1 + st, -10, 3, 10);
    // flowing robe
    g.fillStyle = shade(col, -0.35);
    g.beginPath();
    g.moveTo(-7, -9);
    g.lineTo(-10 + Math.sin(t / 150) * 2, 0);
    g.lineTo(-2, -4);
    g.fill();
    g.fillStyle = col;
    g.beginPath();
    g.moveTo(-6, -10);
    g.lineTo(-4, -25);
    g.lineTo(5, -25);
    g.lineTo(7, -10);
    g.fill();
    g.fillStyle = hi;
    g.fillRect(3, -24, 2, 14);
    g.fillStyle = shade(accent, -0.2);
    g.fillRect(-4, -18, 10, 1);
    // head: smooth porcelain mask with a crack of light
    g.fillStyle = '#f2eefa';
    g.fillRect(-3, -33, 7, 8);
    g.fillStyle = '#c8c0dc';
    g.fillRect(-3, -27, 7, 2);
    g.fillStyle = accent;
    g.fillRect(1, -30, 3, 1);
    g.fillRect(0, -32, 1, 5);
    const mv = b.move?.id;
    let ang = 0.5;
    if (b.state === 'windup') ang = 0.5 - tele * (mv === 'judgment' ? 2.6 : 1.6);
    else if (b.state === 'active') ang = mv === 'string' ? Math.sin(t / 30) * 1.4 : mv === 'judgment' ? 1.5 : 0;
    g.save();
    g.translate(4, -20);
    g.rotate(ang);
    const blade = mv === 'judgment' && b.state !== 'idle' ? 40 : 25;
    g.fillStyle = '#e8f6ff';
    g.fillRect(0, -1, blade, 2);
    g.fillStyle = '#ffffff';
    g.fillRect(0, -1, blade, 1);
    g.fillStyle = '#c8a050';
    g.fillRect(-1, -3, 2, 6);
    g.restore();
  }
  g.restore();
}

export function drawBossOverlay(g: G, b: Boss, x: number, y: number, t: number): void {
  if (b.state === 'dead') return;
  const id = b.bossDef.id;
  g.globalCompositeOperation = 'lighter';
  if (id === 'vessel') {
    // halo + star aura
    g.strokeStyle = withAlpha(b.bossDef.accent, 0.8);
    g.lineWidth = 1;
    g.beginPath();
    g.ellipse(x + b.facing, y - 37, 7, 2, 0, 0, TAU);
    g.stroke();
    g.globalAlpha = 0.35;
    g.drawImage(glowSprite('#8fd8ff', 30), x - 30, y - 50);
  } else if (id === 'rootmaw' && b.phase > 1) {
    g.globalAlpha = 0.3 + Math.sin(t / 150) * 0.1;
    g.drawImage(glowSprite('#ff7a30', 30), x - 30, y - 50);
  } else if (id === 'matriarch') {
    g.globalAlpha = 0.25;
    g.drawImage(glowSprite('#ffd36a', 34), x - 34, y - 50);
  }
  g.globalAlpha = 1;
  g.globalCompositeOperation = 'source-over';
  if (b.telegraph > 0.05) telegraphMark(g, x, y - b.h - 14, b.telegraph, b.unblockableTele, t);
}
