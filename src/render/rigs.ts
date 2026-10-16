import { MOVESETS } from '../data/movesets';
import type { Boss } from '../sim/boss';
import type { Enemy } from '../sim/enemy';
import type { Player } from '../sim/player';

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

function drawWeapon(g: G, cls: string, color: string, len: number, glow: number) {
  switch (cls) {
    case 'fang':
      g.fillStyle = '#4a3a2a';
      g.fillRect(-1, -1, 4, 2);
      g.fillStyle = '#9a8a6a';
      g.fillRect(3, -2, 1, 4);
      g.fillStyle = color;
      g.beginPath();
      g.moveTo(4, -1.5);
      g.lineTo(4 + len, 0);
      g.lineTo(4, 1.5);
      g.fill();
      break;
    case 'maul':
      g.fillStyle = '#5a4030';
      g.fillRect(-2, -1, len, 2);
      g.fillStyle = color;
      g.fillRect(len - 4, -6, 9, 12);
      g.fillStyle = 'rgba(0,0,0,0.25)';
      g.fillRect(len - 4, 2, 9, 4);
      g.fillStyle = 'rgba(255,255,255,0.35)';
      g.fillRect(len - 4, -6, 9, 1);
      break;
    case 'glaive':
      g.fillStyle = '#6a5038';
      g.fillRect(-6, -1, len, 2);
      g.fillStyle = color;
      g.beginPath();
      g.moveTo(len - 6, -3);
      g.lineTo(len + 5, 0);
      g.lineTo(len - 6, 3);
      g.fill();
      g.fillStyle = '#c0404a';
      g.fillRect(len - 8, -2, 2, 4);
      break;
    case 'rod':
      g.fillStyle = '#7a5a40';
      g.fillRect(-3, -1, len, 2);
      g.fillStyle = color;
      g.globalAlpha = 0.5 + glow * 0.5;
      g.beginPath();
      g.arc(len - 1, 0, 3 + glow * 1.5, 0, TAU);
      g.fill();
      g.globalAlpha = 1;
      g.fillStyle = '#fff';
      g.fillRect(len - 2, -1, 2, 2);
      break;
    case 'pendulum':
      g.fillStyle = '#4a3a30';
      g.fillRect(-1, -1, 6, 2);
      g.strokeStyle = '#9a9aa8';
      g.lineWidth = 1;
      g.beginPath();
      g.moveTo(5, 0);
      g.lineTo(len - 6, 0);
      g.stroke();
      g.fillStyle = color;
      g.beginPath();
      g.moveTo(len - 7, -5);
      g.quadraticCurveTo(len + 4, 0, len - 7, 5);
      g.quadraticCurveTo(len - 2, 0, len - 7, -5);
      g.fill();
      break;
  }
}

/** Draw the player. (x,y) = feet in screen px. */
export function drawPlayer(g: G, p: Player, x: number, y: number, t: number, armorColor: string, weaponColor: string, flashWhite: boolean): void {
  const cls = p.moveset.cls;
  const len = MOVESETS[cls].length;
  const pose = weaponPose(p);
  const f = p.facing;
  g.save();
  g.translate(x, y);
  // shadow
  g.fillStyle = 'rgba(0,0,0,0.35)';
  g.fillRect(-6, 0, 12, 1);
  g.scale(f, 1);
  const W = (c: string) => (flashWhite ? '#ffffff' : c);
  let rot = 0;
  let squashY = 1;
  const air = !p.onGround;
  if (p.state === 'dodge') {
    if (!air) {
      rot = (p.st / 18) * TAU;
      squashY = 0.7;
    } else rot = 0.5;
  }
  if (p.state === 'dead') rot = -Math.PI / 2;
  if (p.landT > 0) squashY = 1 - p.landT * 0.03;
  const lean = pose.lean + (p.state === 'hurt' ? -0.35 : 0) + (p.state === 'free' && p.onGround ? Math.max(-0.15, Math.min(0.15, Math.abs(p.vx) * 0.05)) : 0);
  const crouch = pose.crouch;
  if (rot) {
    g.translate(0, -10);
    g.rotate(rot);
    g.translate(0, 10);
  }
  g.scale(1, squashY);
  g.translate(0, crouch);
  // legs
  const run = p.state === 'free' && p.onGround && Math.abs(p.vx) > 0.3;
  const ph = p.runPhase;
  const l1 = run ? Math.sin(ph) * 3 : air ? 2 : 0;
  const l2 = run ? -Math.sin(ph) * 3 : air ? -1 : 0;
  g.fillStyle = W('#2a2430');
  g.fillRect(-3 + l1, -8, 3, air ? 6 : 8);
  g.fillStyle = W('#3a3240');
  g.fillRect(0 + l2, -8, 3, air ? 5 : 8);
  // body (rotated by lean around hips)
  g.save();
  g.translate(0, -8);
  g.rotate(lean);
  const bob = p.state === 'free' && p.onGround && !run ? Math.sin(t / 300) * 0.5 : run ? Math.abs(Math.sin(ph)) * -1 : 0;
  g.translate(0, bob);
  // scarf/cape trailing
  const wind = Math.sin(t / 120) * 1.5 - Math.min(4, Math.abs(p.vx));
  g.fillStyle = W('#b8343e');
  g.beginPath();
  g.moveTo(-1, -12);
  g.lineTo(-7 + wind, -10 + Math.sin(t / 90));
  g.lineTo(-6 + wind, -7 + Math.sin(t / 70));
  g.lineTo(-1, -9);
  g.fill();
  // torso
  g.fillStyle = W(armorColor);
  g.fillRect(-4, -12, 8, 12);
  g.fillStyle = W('rgba(0,0,0,0.25)');
  g.fillRect(-4, -4, 8, 1);
  // lantern at hip
  g.fillStyle = W('#ffd27a');
  g.fillRect(-5, -5, 3, 4);
  g.fillStyle = W('#7a5a30');
  g.fillRect(-5, -6, 3, 1);
  // head + hood
  g.fillStyle = W('#e8c8a0');
  g.fillRect(-2, -17, 6, 5);
  g.fillStyle = W('#2e2840');
  g.fillRect(-3, -19, 7, 3);
  g.fillRect(-3, -17, 2, 4);
  g.fillStyle = W('#1a1422');
  g.fillRect(2, -15, 1, 1);
  // off-hand: shield or second fang
  if (p.state === 'guard' || (p.shield && cls !== 'fang')) {
    g.fillStyle = W(p.state === 'guard' ? '#d8c890' : '#8a7a5a');
    const sx = p.state === 'guard' ? 4 : -5;
    g.fillRect(sx, -12, 3, 10);
    if (p.state === 'guard' && p.parryT > 0) {
      g.fillStyle = 'rgba(255,255,200,0.8)';
      g.fillRect(sx + 3, -13, 1, 12);
    }
  }
  // weapon arm
  g.save();
  g.translate(1, -10);
  // smear trail
  if (pose.trailFrom !== null && !flashWhite) {
    drawTrail(g, pose.trailFrom, pose.angle, 5, 5 + len + pose.ext, weaponColor, p.atk?.def.swing.style ?? 'arc');
  }
  g.rotate(pose.angle);
  g.fillStyle = W(armorColor);
  g.fillRect(0, -1, 5, 2);
  g.translate(4 + pose.ext, 0);
  drawWeapon(g, cls, W(weaponColor), len, pose.glow);
  if (cls === 'fang') {
    g.rotate(0.5);
    g.translate(-2, 2);
    g.globalAlpha = 0.85;
    drawWeapon(g, cls, W('#9fb3cf'), len - 2, 0);
    g.globalAlpha = 1;
  }
  g.restore();
  g.restore();
  g.restore();
}

function drawTrail(g: G, from: number, to: number, r0: number, r1: number, color: string, style: string) {
  g.save();
  if (style === 'thrust') {
    g.globalAlpha = 0.45;
    g.fillStyle = '#ffffff';
    g.rotate(from);
    g.fillRect(r0, -1.5, r1 - r0 + 4, 3);
    g.globalAlpha = 0.25;
    g.fillStyle = color;
    g.fillRect(r0, -3, r1 - r0, 6);
    g.restore();
    return;
  }
  const steps = 10;
  g.globalCompositeOperation = 'lighter';
  for (let i = 0; i < steps; i++) {
    const a0 = from + ((to - from) * i) / steps;
    const a1 = from + ((to - from) * (i + 1)) / steps;
    g.globalAlpha = 0.06 + (i / steps) * 0.4;
    g.fillStyle = i > steps - 3 ? '#ffffff' : color;
    g.beginPath();
    g.moveTo(Math.cos(a0) * r0, Math.sin(a0) * r0);
    g.lineTo(Math.cos(a0) * r1, Math.sin(a0) * r1);
    g.lineTo(Math.cos(a1) * r1, Math.sin(a1) * r1);
    g.lineTo(Math.cos(a1) * r0, Math.sin(a1) * r0);
    g.fill();
  }
  g.restore();
}

// ─────────────────────────────── enemies ───────────────────────────────

export function drawEnemy(g: G, e: Enemy, x: number, y: number, t: number, white: boolean): void {
  const W = (c: string) => (white ? '#ffffff' : c);
  const def = e.def;
  const tele = e.telegraph;
  const accent = e.unblockableTele && tele > 0 ? '#ff3030' : def.accent;
  const glow = tele > 0 ? (Math.floor(t / 60) % 2 === 0 ? 1 : 0.6) * tele : 0;
  const dead = e.state === 'dead';
  g.save();
  g.translate(x, y);
  if (dead) {
    g.globalAlpha = Math.max(0, 1 - e.deathT / 45);
  }
  g.fillStyle = 'rgba(0,0,0,0.35)';
  if (!def.flying) g.fillRect(-e.w / 2, 0, e.w, 1);
  g.scale(e.facing * e.scale, e.scale);
  if (e.state === 'stagger' || dead) g.rotate(dead ? -0.4 : Math.sin(t / 50) * 0.08);
  if (e.status.frozen > 0) {
    // frozen: drawn normally then an ice block on top
  }
  switch (def.ai) {
    case 'skitter': {
      const sq = e.state === 'windup' ? 1 - tele * 0.3 : e.state === 'active' ? 1.2 : 1;
      g.scale(1 / sq, sq);
      g.fillStyle = W(def.color);
      g.beginPath();
      g.ellipse(0, -6, 7, 6, 0, 0, TAU);
      g.fill();
      for (let i = 0; i < 5; i++) {
        const a = -Math.PI * 0.9 + i * 0.4 + Math.sin(t / 100 + i) * 0.1;
        g.fillRect(Math.cos(a) * 7 - 1, -6 + Math.sin(a) * 6 - 1, 2, 2);
      }
      const lp = Math.sin(t / 60 + e.id) * 2;
      g.fillRect(-5 + lp, -2, 2, 2);
      g.fillRect(3 - lp, -2, 2, 2);
      g.fillStyle = W(accent);
      g.globalAlpha *= 0.7 + glow * 0.3;
      g.fillRect(2, -8, 2, 2);
      g.fillRect(5, -8, 2, 2);
      g.globalAlpha = dead ? Math.max(0, 1 - e.deathT / 45) : 1;
      break;
    }
    case 'knight': {
      const golem = def.id === 'cinder_golem';
      const bw = golem ? 18 : 12;
      const bh = golem ? 30 : 26;
      g.fillStyle = W(def.color);
      g.fillRect(-bw / 2, -bh + 6, bw, bh - 14);
      g.fillStyle = W('#2a2a34');
      g.fillRect(-bw / 2 + 1, -8, 4, 8);
      g.fillRect(bw / 2 - 5, -8, 4, 8);
      // helm
      g.fillStyle = W(golem ? '#3a2a26' : '#6a7480');
      g.fillRect(-5, -bh, 10, 8);
      g.fillStyle = W(accent);
      g.globalAlpha *= 0.6 + glow * 0.4 + (golem ? 0.3 : 0);
      g.fillRect(0, -bh + 3, 5, 2);
      if (golem) g.fillRect(-3, -bh + 12, 6, 6);
      g.globalAlpha = dead ? Math.max(0, 1 - e.deathT / 45) : 1;
      // weapon arm
      const atk = e.attack?.id;
      let ang = 0.6;
      if (e.state === 'windup') ang = atk === 'overhead' || atk === 'slam' ? 0.6 - 2.6 * tele : 0.6 - 0.6 * tele;
      else if (e.state === 'active') ang = atk === 'overhead' || atk === 'slam' ? 1.1 : 0;
      g.save();
      g.translate(3, -bh + 10);
      g.rotate(ang);
      g.fillStyle = W('#c0c8d0');
      g.fillRect(0, -1, golem ? 18 : 22, golem ? 6 : 2);
      g.restore();
      if (def.frontGuard && e.state !== 'stagger') {
        g.fillStyle = W('#7a6a50');
        g.fillRect(bw / 2 - 1, -bh + 8, 4, 14);
        g.fillStyle = W(accent);
        g.fillRect(bw / 2, -bh + 13, 2, 3);
      }
      break;
    }
    case 'spitter': {
      const open = e.state === 'windup' ? tele : 0;
      g.fillStyle = W('#2e4a28');
      g.fillRect(-1, -10, 3, 10);
      g.fillStyle = W(def.color);
      g.beginPath();
      g.ellipse(0, -13, 7, 6 + open * 2, 0, 0, TAU);
      g.fill();
      for (let i = 0; i < 4; i++) {
        g.save();
        g.translate(0, -13);
        g.rotate(i * 1.57 + Math.sin(t / 200) * 0.2 + open);
        g.fillStyle = W('#5a7a3a');
        g.fillRect(5, -2, 5, 4);
        g.restore();
      }
      g.fillStyle = W(accent);
      g.fillRect(3, -14 - open, 3, 2 + open * 3);
      break;
    }
    case 'moth': {
      const flap = Math.sin(t / 40 + e.id) * (e.state === 'active' ? 0.3 : 1);
      g.fillStyle = W('#4a3a5e');
      g.save();
      g.translate(0, -6);
      g.scale(1, flap);
      g.beginPath();
      g.ellipse(-3, -6, 7, 6, -0.4, 0, TAU);
      g.ellipse(3, -6, 7, 6, 0.4, 0, TAU);
      g.fill();
      g.fillStyle = W(accent);
      g.globalAlpha *= 0.5;
      g.fillRect(-6, -8, 2, 2);
      g.fillRect(5, -8, 2, 2);
      g.restore();
      g.globalAlpha = dead ? Math.max(0, 1 - e.deathT / 45) : 1;
      g.fillStyle = W(def.color);
      g.fillRect(-2, -10, 5, 9);
      g.fillStyle = W(accent);
      g.fillRect(2, -9, 2, 2);
      break;
    }
    case 'tick': {
      const pulse = e.state === 'windup' ? 1 + Math.sin(t / (30 - tele * 22)) * 0.25 * tele : 1;
      g.fillStyle = W(def.color);
      g.beginPath();
      g.ellipse(0, -5, 6 * pulse, 5 * pulse, 0, 0, TAU);
      g.fill();
      g.fillStyle = W(accent);
      g.globalAlpha *= 0.5 + tele * 0.5;
      g.beginPath();
      g.ellipse(-1, -6, 3 * pulse, 2.5 * pulse, 0, 0, TAU);
      g.fill();
      g.globalAlpha = dead ? Math.max(0, 1 - e.deathT / 45) : 1;
      g.fillStyle = W('#3a1a10');
      const lp = Math.sin(t / 40 + e.id) * 1.5;
      g.fillRect(-4 + lp, -1, 1, 2);
      g.fillRect(3 - lp, -1, 1, 2);
      break;
    }
    case 'shepherd': {
      g.fillStyle = W(def.color);
      g.beginPath();
      g.moveTo(-6, 0);
      g.lineTo(-4, -20);
      g.lineTo(4, -20);
      g.lineTo(7, 0);
      g.fill();
      g.fillStyle = W('#2a2018');
      g.fillRect(-4, -26, 8, 7);
      g.fillStyle = W(accent);
      g.globalAlpha *= 0.6 + glow * 0.4;
      g.fillRect(0, -24, 3, 2);
      g.globalAlpha = dead ? Math.max(0, 1 - e.deathT / 45) : 1;
      g.fillStyle = W('#7a6040');
      g.fillRect(6, -28 - (e.state === 'windup' ? tele * 4 : 0), 1, 28);
      g.fillStyle = W(accent);
      g.beginPath();
      g.arc(6.5, -29 - (e.state === 'windup' ? tele * 4 : 0), 2 + glow * 2, 0, TAU);
      g.fill();
      break;
    }
    case 'duelist': {
      g.fillStyle = W('#2a2224');
      const st = e.state === 'active' ? 3 : 0;
      g.fillRect(-3, -8, 2, 8);
      g.fillRect(1 + st, -8, 2, 8);
      g.fillStyle = W(def.color);
      g.fillRect(-3, -19, 7, 11);
      g.fillStyle = W('#c8b0a0');
      g.fillRect(-2, -25, 6, 6);
      g.fillStyle = W(accent);
      g.fillRect(2, -23, 2, 1);
      const ang = e.state === 'guard' ? -1.2 : e.state === 'windup' ? -0.5 - tele * 0.6 : e.state === 'active' ? Math.sin(t / 25) * 0.4 : 0.4;
      g.save();
      g.translate(3, -16);
      g.rotate(ang);
      g.fillStyle = W('#e0e0f0');
      g.fillRect(0, -0.5, 20, 1);
      g.fillRect(0, -1.5, 2, 3);
      g.restore();
      break;
    }
    case 'dummy': {
      g.fillStyle = W('#6a4a2a');
      g.fillRect(-1, -26, 3, 26);
      g.fillStyle = W(def.color);
      g.fillRect(-6, -22, 13, 12);
      g.fillRect(-8, -19, 17, 3);
      g.fillStyle = W('#4a3018');
      g.fillRect(-3, -26, 7, 5);
      g.fillStyle = W('#c04040');
      g.fillRect(-1, -17, 3, 3);
      break;
    }
  }
  g.restore();
  if (e.status.frozen > 0 && !dead) {
    g.fillStyle = 'rgba(160,230,255,0.45)';
    g.fillRect(x - e.w / 2 - 2, y - e.h - 2, e.w + 4, e.h + 2);
    g.fillStyle = 'rgba(255,255,255,0.6)';
    g.fillRect(x - e.w / 2 - 2, y - e.h - 2, e.w + 4, 1);
  }
  if ((e.barrier > 0 || e.ward) && !dead) {
    g.strokeStyle = e.ward ? 'rgba(156,242,255,0.7)' : 'rgba(156,242,255,0.45)';
    g.lineWidth = 1;
    g.beginPath();
    g.ellipse(x, y - e.h / 2, e.w * 0.8, e.h * 0.7, 0, 0, TAU);
    g.stroke();
  }
  if (e.state === 'guard') {
    g.fillStyle = '#ffd0d0';
    g.fillRect(x + e.facing * (e.w / 2 + 2), y - e.h, 2, e.h - 4);
  }
  if (tele > 0.05 && !dead) {
    // telegraph marker
    const col = e.unblockableTele ? '#ff3030' : '#ffd23c';
    g.fillStyle = col;
    g.globalAlpha = 0.5 + tele * 0.5;
    const yy = y - e.h * e.scale - 8 - (Math.floor(t / 80) % 2);
    g.fillRect(x - 1, yy - 5, 2, 4);
    g.fillRect(x - 1, yy, 2, 1);
    g.globalAlpha = 1;
  }
}

export function drawBoss(g: G, b: Boss, x: number, y: number, t: number, white: boolean): void {
  const W = (c: string) => (white ? '#ffffff' : c);
  const id = b.bossDef.id;
  const tele = b.telegraph;
  const accent = b.unblockableTele && tele > 0 ? '#ff3030' : b.bossDef.accent;
  const dead = b.state === 'dead';
  g.save();
  g.translate(x, y);
  if (dead) g.globalAlpha = Math.max(0, 1 - b.deathT / 45);
  if (b.fade > 0) g.globalAlpha = 1 - b.fade * 0.9;
  g.fillStyle = 'rgba(0,0,0,0.35)';
  g.fillRect(-b.w / 2, 0, b.w, 2);
  g.scale(b.facing, 1);
  if (b.state === 'stagger') g.rotate(Math.sin(t / 60) * 0.06);
  if (id === 'rootmaw') {
    const crouch = b.state === 'windup' ? tele * 4 : 0;
    const charge = b.move?.id === 'charge' && b.state === 'active';
    g.translate(0, crouch);
    // legs
    g.fillStyle = W('#2e241c');
    const lp = Math.sin(t / (charge ? 30 : 120)) * 3;
    g.fillRect(-16 + lp, -10, 6, 10);
    g.fillRect(10 - lp, -10, 6, 10);
    // body
    g.fillStyle = W(b.bossDef.color);
    g.beginPath();
    g.ellipse(-2, -22, 24, 15, charge ? 0.1 : 0, 0, TAU);
    g.fill();
    // roots
    g.strokeStyle = W('#6a4a2a');
    g.lineWidth = 2;
    for (let i = 0; i < 5; i++) {
      g.beginPath();
      g.moveTo(-14 + i * 6, -34);
      g.quadraticCurveTo(-18 + i * 6, -44 - (i % 2) * 6, -10 + i * 7 + Math.sin(t / 200 + i) * 2, -48 - (i % 3) * 4);
      g.stroke();
    }
    // head + jaw
    const jaw = b.state === 'windup' ? tele * 6 : b.state === 'active' ? 6 : 1;
    g.fillStyle = W('#5a4634');
    g.fillRect(14, -32, 16, 12);
    g.fillStyle = W('#3a2a20');
    g.fillRect(14, -20 + jaw * 0.3, 16, 5 + jaw * 0.5);
    g.fillStyle = W('#e8dcc0');
    for (let i = 0; i < 4; i++) g.fillRect(16 + i * 4, -21, 2, 2 + jaw * 0.3);
    // glowing cracks
    g.fillStyle = W(accent);
    g.globalAlpha *= 0.6 + tele * 0.4 + (b.phase > 1 ? 0.2 : 0);
    g.fillRect(22, -29, 4, 3);
    g.fillRect(-10, -26, 10, 1);
    g.fillRect(-4, -18, 8, 1);
    g.fillRect(0, -30, 1, 8);
  } else if (id === 'matriarch') {
    const flap = Math.sin(t / (b.state === 'active' ? 30 : 70));
    g.fillStyle = W('#3a2e4a');
    for (const s of [-1, 1]) {
      g.save();
      g.translate(0, -16);
      g.scale(1, 0.6 + flap * 0.4 * s);
      g.beginPath();
      g.ellipse(-12 * s - 6, -10, 22, 14, 0.5 * s, 0, TAU);
      g.fill();
      g.fillStyle = W(accent);
      g.globalAlpha = 0.6 * (dead ? Math.max(0, 1 - b.deathT / 45) : 1);
      g.beginPath();
      g.arc(-14 * s - 6, -12, 4, 0, TAU);
      g.fill();
      g.globalAlpha = dead ? Math.max(0, 1 - b.deathT / 45) : 1;
      g.fillStyle = W('#3a2e4a');
      g.restore();
    }
    g.fillStyle = W(b.bossDef.color);
    g.beginPath();
    g.ellipse(0, -14, 8, 14, 0, 0, TAU);
    g.fill();
    g.fillStyle = W('#2a2234');
    g.fillRect(-4, -30, 9, 7);
    g.fillStyle = W(accent);
    g.fillRect(2, -28, 2, 2);
    g.fillRect(-2, -28, 2, 2);
    g.strokeStyle = W('#8a7a9a');
    g.beginPath();
    g.moveTo(0, -30);
    g.quadraticCurveTo(6, -40, 10, -38);
    g.moveTo(0, -30);
    g.quadraticCurveTo(-6, -40, -10, -38);
    g.stroke();
  } else {
    // the Pale Vessel
    const st = b.state === 'active' ? 3 : 0;
    g.fillStyle = W('#3a3850');
    g.fillRect(-4, -10, 3, 10);
    g.fillRect(1 + st, -10, 3, 10);
    g.fillStyle = W(b.bossDef.color);
    g.beginPath();
    g.moveTo(-6, -10);
    g.lineTo(-4, -24);
    g.lineTo(5, -24);
    g.lineTo(7, -10);
    g.fill();
    g.fillStyle = W('#eeeaf8');
    g.fillRect(-3, -32, 7, 8);
    g.fillStyle = W(accent);
    g.fillRect(1, -29, 3, 1);
    // halo
    g.strokeStyle = W(accent);
    g.globalAlpha *= 0.7;
    g.beginPath();
    g.ellipse(0, -36, 7, 2, 0, 0, TAU);
    g.stroke();
    g.globalAlpha = dead ? Math.max(0, 1 - b.deathT / 45) : b.fade > 0 ? 1 - b.fade * 0.9 : 1;
    const mv = b.move?.id;
    let ang = 0.5;
    if (b.state === 'windup') ang = 0.5 - tele * (mv === 'judgment' ? 2.6 : 1.6);
    else if (b.state === 'active') ang = mv === 'string' ? Math.sin(t / 30) * 1.4 : mv === 'judgment' ? 1.5 : 0;
    g.save();
    g.translate(4, -20);
    g.rotate(ang);
    g.fillStyle = W('#d8f0ff');
    g.fillRect(0, -1, mv === 'judgment' && b.state !== 'idle' ? 40 : 24, 2);
    g.fillStyle = W(accent);
    g.globalAlpha *= 0.5;
    g.fillRect(0, -2, 24, 4);
    g.restore();
  }
  g.restore();
  if (tele > 0.05 && !dead) {
    const col = b.unblockableTele ? '#ff3030' : '#ffd23c';
    g.fillStyle = col;
    g.globalAlpha = 0.5 + tele * 0.5;
    const yy = y - b.h - 12 - (Math.floor(t / 80) % 2);
    g.fillRect(x - 1, yy - 6, 3, 5);
    g.fillRect(x - 1, yy + 1, 3, 2);
    g.globalAlpha = 1;
  }
}
