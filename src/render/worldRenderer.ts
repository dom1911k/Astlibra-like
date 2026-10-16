import type { Audio } from '../core/audio';
import { VIEW_H, VIEW_W } from '../core/constants';
import { fmt } from '../core/math';
import type { Settings } from '../core/settings';
import { Tuning } from '../core/tuning';
import { Boss } from '../sim/boss';
import type { SimEvent } from '../sim/events';
import type { Room } from '../sim/room';
import type { World } from '../sim/world';
import { Camera, Particles, elemHex, type Bolt, type FloatNum, type Ring } from './fx';
import { drawBoss, drawEnemy, drawPlayer } from './rigs';
import { THEMES, renderBackground, renderRoomTiles, type Theme } from './theme';

export class WorldRenderer {
  canvas: HTMLCanvasElement;
  g: CanvasRenderingContext2D;
  dark: HTMLCanvasElement;
  dg: CanvasRenderingContext2D;
  theme: Theme;
  tiles!: HTMLCanvasElement;
  bg0!: HTMLCanvasElement;
  bg1!: HTMLCanvasElement;
  cam = new Camera();
  particles = new Particles();
  rings: Ring[] = [];
  bolts: Bolt[] = [];
  nums: FloatNum[] = [];
  flash = { color: '#fff', t: 0, dur: 0, alpha: 0 };
  after: { x: number; y: number; f: number; t: number }[] = [];
  motes: { x: number; y: number; v: number; p: number }[] = [];
  time = 0;
  settings: Settings;
  doorLabels: string[] = [];

  constructor(settings: Settings) {
    this.settings = settings;
    this.canvas = document.createElement('canvas');
    this.canvas.width = VIEW_W;
    this.canvas.height = VIEW_H;
    this.g = this.canvas.getContext('2d')!;
    this.dark = document.createElement('canvas');
    this.dark.width = VIEW_W;
    this.dark.height = VIEW_H;
    this.dg = this.dark.getContext('2d')!;
    this.theme = THEMES.depth1;
    for (let i = 0; i < 40; i++) this.motes.push({ x: Math.random() * VIEW_W, y: Math.random() * VIEW_H, v: 0.1 + Math.random() * 0.3, p: Math.random() * 6 });
  }

  setRoom(room: Room, themeKey: string, seed: number, w?: World): void {
    this.theme = THEMES[themeKey] ?? THEMES.depth1;
    this.tiles = renderRoomTiles(room, this.theme, seed);
    this.bg0 = renderBackground(this.theme, seed, 0);
    this.bg1 = renderBackground(this.theme, seed, 1);
    this.particles.list = [];
    this.rings = [];
    this.bolts = [];
    this.nums = [];
    this.after = [];
    if (w) this.cam.follow(w.player.x, w.player.y, room.pxW, room.pxH, 16, true);
  }

  /** Turn simulation events into sound, particles, shake, numbers, rumble. */
  consume(events: SimEvent[], audio: Audio | null): SimEvent[] {
    const s = this.settings;
    this.particles.intensity = s.effects;
    this.cam.shakeScale = s.screenShake * Tuning.shakeScale;
    const passthrough: SimEvent[] = [];
    for (const e of events) {
      switch (e.t) {
        case 'sfx': audio?.play(e.id, e.vol ?? 1, e.pitch ?? 1); break;
        case 'hit': {
          const col = e.blocked ? '#c8c8d0' : elemHex(e.element);
          const n = e.blocked ? 5 : Math.round(5 + e.power * 10 + (e.crit ? 6 : 0));
          this.particles.burst(e.x, e.y, 'spark', col, n, e.dir);
          if (!e.onPlayer && !e.blocked) this.particles.burst(e.x, e.y, e.element === 'phys' ? 'shard' : 'ember', e.element === 'phys' ? '#e8e0d0' : col, Math.round(2 + e.power * 4), e.dir);
          if (e.crit) {
            this.rings.push({ x: e.x, y: e.y, r: 16, color: '#ffffff', t: 0, dur: 10 });
            this.particles.burst(e.x, e.y, 'star', '#fff6c0', 6);
          }
          if (e.heavy || e.crit) this.cam.kick(e.dir * (e.crit ? 2.5 : 1.8), e.onPlayer ? 0 : 0.8);
          else this.cam.kick(e.dir * 0.8, 0);
          if (e.heavy && !e.onPlayer) this.cam.shake(e.crit ? 2.5 : 1.6);
          break;
        }
        case 'num':
          if (!s.damageNumbers && !e.heal) break;
          this.nums.push({
            x: e.x, y: e.y, text: (e.heal ? '+' : '') + fmt(e.value), t: 0, dur: e.crit ? 900 : 650, vy: -0.035, crit: e.crit, big: false,
            color: e.heal ? '#7cff8a' : e.onPlayer ? '#ff5050' : e.crit ? '#ffd23c' : elemHex(e.element), scale: e.crit ? 1.6 : 1,
          });
          if (this.nums.length > 120) this.nums.shift();
          break;
        case 'text':
          this.nums.push({ x: e.x, y: e.y, text: e.text, color: e.color, t: 0, dur: 900, vy: -0.02, crit: false, big: !!e.big, scale: e.big ? 1.4 : 1 });
          break;
        case 'shake': this.cam.shake(e.amt); break;
        case 'flash':
          if (s.flashes) this.flash = { color: e.color, t: 0, dur: e.dur * 16.7, alpha: e.alpha ?? 0.5 };
          break;
        case 'burst': this.particles.burst(e.x, e.y, e.kind, e.color, e.count, e.dir, e.r); break;
        case 'ring': this.rings.push({ x: e.x, y: e.y, r: e.r, color: e.color, t: 0, dur: (e.dur ?? 14) * 16.7 }); break;
        case 'line': {
          if (e.color === '#f00') break;
          const pts: [number, number][] = [];
          const n = 6;
          for (let i = 0; i <= n; i++) {
            const k = i / n;
            const j = i === 0 || i === n ? 0 : (Math.random() - 0.5) * 10;
            pts.push([e.x1 + (e.x2 - e.x1) * k + j * 0.3, e.y1 + (e.y2 - e.y1) * k + j]);
          }
          this.bolts.push({ pts, color: e.color, t: 0, dur: 160 });
          break;
        }
        case 'rumble':
          if (s.rumble) rumble(e.strong, e.weak, e.dur);
          break;
        default:
          passthrough.push(e);
      }
    }
    return passthrough;
  }

  update(dt: number, w: World): void {
    this.time += dt;
    this.particles.update(dt);
    for (const r of this.rings) r.t += dt;
    this.rings = this.rings.filter((r) => r.t < r.dur);
    for (const b of this.bolts) b.t += dt;
    this.bolts = this.bolts.filter((b) => b.t < b.dur);
    for (const n of this.nums) {
      n.t += dt;
      n.y += n.vy * dt * (n.t < 150 ? 1 : 0.3);
    }
    this.nums = this.nums.filter((n) => n.t < n.dur);
    if (this.flash.t < this.flash.dur) this.flash.t += dt;
    const p = w.player;
    this.cam.follow(p.x + p.facing * 24 + p.vx * 6, p.y - 10, w.room.pxW, w.room.pxH, dt);
    this.cam.update(dt);
    if (p.state === 'dodge' || (p.state === 'attack' && p.atk && (p.atk.def.moveActive?.[0] ?? 0) > 4)) {
      this.after.push({ x: p.x, y: p.y, f: p.facing, t: 0 });
    }
    for (const a of this.after) a.t += dt;
    this.after = this.after.filter((a) => a.t < 160).slice(-8);
    for (const m of this.motes) {
      m.y -= m.v * dt * 0.03;
      m.x += Math.sin(this.time / 900 + m.p) * 0.05 * dt * 0.06;
      if (m.y < -4) {
        m.y = VIEW_H + 4;
        m.x = Math.random() * VIEW_W;
      }
    }
  }

  draw(w: World, alpha: number, extra?: (g: CanvasRenderingContext2D, cx: number, cy: number) => void): void {
    const g = this.g;
    const cam = this.cam;
    const cx = cam.vx;
    const cy = cam.vy;
    const th = this.theme;
    const t = this.time;
    const lerp = (a: number, b: number) => a + (b - a) * alpha;
    // backgrounds
    const bw = this.bg0.width;
    const o0 = ((cx * 0.2) % bw + bw) % bw;
    g.drawImage(this.bg0, -o0, 0);
    g.drawImage(this.bg0, bw - o0, 0);
    const o1 = ((cx * 0.45) % bw + bw) % bw;
    g.globalAlpha = 0.9;
    g.drawImage(this.bg1, -o1, Math.round(-cy * 0.2) + 10);
    g.drawImage(this.bg1, bw - o1, Math.round(-cy * 0.2) + 10);
    g.globalAlpha = 1;
    g.fillStyle = th.fog;
    g.fillRect(0, 0, VIEW_W, VIEW_H);
    // tiles
    g.drawImage(this.tiles, -cx, -cy);
    // exits
    for (let i = 0; i < w.room.exits.length; i++) {
      const ex = w.room.exits[i];
      const x = ex.x - cx;
      const y = ex.y - cy;
      g.fillStyle = '#1a1418';
      g.fillRect(x - 10, y - 34, 20, 34);
      g.fillStyle = th.rockLight;
      g.fillRect(x - 12, y - 36, 24, 3);
      g.fillRect(x - 12, y - 36, 3, 36);
      g.fillRect(x + 9, y - 36, 3, 36);
      if (w.exitOpen) {
        const pulse = 0.5 + Math.sin(t / 250) * 0.2;
        const grad = g.createLinearGradient(0, y - 34, 0, y);
        grad.addColorStop(0, `rgba(255,210,120,${pulse * 0.2})`);
        grad.addColorStop(1, `rgba(255,210,120,${pulse})`);
        g.fillStyle = grad;
        g.fillRect(x - 9, y - 33, 18, 33);
        g.fillStyle = '#ffe6a0';
        const ay = y - 46 + Math.sin(t / 200) * 2;
        g.beginPath();
        g.moveTo(x - 4, ay);
        g.lineTo(x + 4, ay);
        g.lineTo(x, ay + 5);
        g.fill();
      } else {
        g.fillStyle = '#5a4a4a';
        for (let k = 0; k < 4; k++) g.fillRect(x - 8 + k * 5, y - 33, 2, 33);
      }
    }
    // pickups
    for (const pk of w.pickups) {
      const x = pk.x - cx;
      const y = pk.y - cy - 6 + Math.sin(t / 220 + pk.uid) * 2;
      g.globalAlpha = 0.25;
      g.fillStyle = pk.color;
      g.fillRect(x - 1, y - 40, 3, 40);
      g.globalAlpha = 1;
      g.save();
      g.translate(x, y);
      g.rotate(pk.kind === 'relic' ? t / 400 : Math.PI / 4);
      g.fillStyle = pk.color;
      g.fillRect(-4, -4, 8, 8);
      g.fillStyle = '#fff';
      g.fillRect(-2, -2, 3, 3);
      g.restore();
    }
    // hazard telegraphs
    for (const hz of w.hazards) {
      const k = hz.delay > 0 ? Math.min(1, hz.t / hz.delay) : 1;
      g.strokeStyle = hz.color;
      g.globalAlpha = 0.3 + k * 0.6;
      g.lineWidth = 1;
      g.beginPath();
      g.arc(hz.x - cx, hz.y - cy, hz.r, 0, Math.PI * 2);
      g.stroke();
      g.globalAlpha = 0.12 + k * 0.25;
      g.fillStyle = hz.color;
      g.beginPath();
      g.arc(hz.x - cx, hz.y - cy, hz.r * k, 0, Math.PI * 2);
      g.fill();
      g.globalAlpha = 1;
    }
    extra?.(g, cx, cy);
    // enemies
    const frozen = w.time.frozen;
    for (const e of w.enemies) {
      let x = Math.round(lerp(e.px, e.x) - cx);
      const y = Math.round(lerp(e.py, e.y) - cy);
      if (frozen && e.flash > 0) x += (Math.random() < 0.5 ? -1 : 1) * Tuning.victimShakePx;
      if (x < -60 || x > VIEW_W + 60) continue;
      const white = e.flash > 2 && e.state !== 'dead';
      if (e instanceof Boss) drawBoss(g, e, x, y, t, white);
      else drawEnemy(g, e, x, y, t, white);
      // status particles
      if (e.alive && Math.random() < 0.3 * this.settings.effects) {
        if (e.status.burn > 0) this.particles.burst(e.x + (Math.random() - 0.5) * e.w, e.y - Math.random() * e.h, 'ember', '#ff8a3d', 1);
        if (e.status.shock > 0 && Math.random() < 0.4) this.particles.burst(e.x + (Math.random() - 0.5) * e.w, e.y - Math.random() * e.h, 'spark', '#ffe86a', 1);
        if (e.status.bleedTimer > 0 && Math.random() < 0.3) this.particles.burst(e.x, e.y - e.h * 0.6, 'blood', '#c01830', 1);
      }
      // mini hp bar for damaged normal enemies
      if (!(e instanceof Boss) && e.alive && e.hp < e.maxHp && e.def.ai !== 'dummy') {
        const bw2 = Math.max(14, e.w + 4);
        const bx = x - bw2 / 2;
        const by = y - e.h * e.scale - 5;
        g.fillStyle = 'rgba(0,0,0,0.6)';
        g.fillRect(bx - 1, by - 1, bw2 + 2, 4);
        g.fillStyle = e.elite.length ? '#ff7a3c' : '#e04848';
        g.fillRect(bx, by, Math.max(0, (e.hp / e.maxHp) * bw2), 2);
        if (e.poiseDmg > 0 && e.poiseMax > 14) {
          g.fillStyle = '#ffd23c';
          g.fillRect(bx, by + 2, Math.min(1, e.poiseDmg / e.poiseMax) * bw2, 1);
        }
      }
    }
    // player afterimages
    const p = w.player;
    for (const a of this.after) {
      g.globalAlpha = 0.25 * (1 - a.t / 160);
      g.fillStyle = '#9fd8ff';
      g.fillRect(Math.round(a.x - cx) - 4, Math.round(a.y - cy) - 20, 8, 20);
    }
    g.globalAlpha = 1;
    // player
    {
      let x = Math.round(lerp(p.px, p.x) - cx);
      const y = Math.round(lerp(p.py, p.y) - cy);
      if (frozen && p.flash > 0) x += Math.random() < 0.5 ? -1 : 1;
      const blink = p.invuln > 0 && p.state !== 'hurt' && Math.floor(t / 60) % 2 === 0;
      if (!blink) drawPlayer(g, p, x, y, t, w.loadout.armorColor, w.loadout.weaponColor, p.flash > 3);
      if (p.barrier > 0) {
        g.strokeStyle = 'rgba(143,224,255,0.7)';
        g.beginPath();
        g.ellipse(x, y - 11, 10, 14, 0, 0, Math.PI * 2);
        g.stroke();
      }
      if (p.riposte > 0 && Math.floor(t / 80) % 2 === 0) {
        g.fillStyle = '#fff2a0';
        g.fillRect(x - 6, y - 30, 12, 2);
      }
      if (p.state === 'attack' && p.atk?.def.charge && !p.atk.released) {
        const k = p.atk.charge / p.atk.def.charge.maxTicks;
        g.strokeStyle = k >= 1 ? '#fff2b0' : '#ffb050';
        g.lineWidth = 1;
        g.beginPath();
        g.arc(x, y - 11, 16 - k * 6, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * k);
        g.stroke();
      }
    }
    // blades
    for (const b of w.blades) {
      g.save();
      g.translate(Math.round(b.x - cx), Math.round(b.y - cy));
      g.rotate(b.angle * 3);
      g.globalAlpha = 0.85;
      g.fillStyle = '#c7b8ff';
      g.fillRect(-6, -1, 12, 2);
      g.fillStyle = '#fff';
      g.fillRect(2, -1, 4, 2);
      g.restore();
    }
    g.globalAlpha = 1;
    // projectiles
    g.globalCompositeOperation = 'lighter';
    for (const pr of w.projectiles) {
      if (pr.delay > 0) continue;
      const x = Math.round(lerp(pr.px, pr.x) - cx);
      const y = Math.round(lerp(pr.py, pr.y) - cy);
      const enemy = pr.team === 'enemy';
      const col = pr.spec.element ? elemHex(pr.spec.element) : enemy ? (pr.spec.kind === 'spore' ? '#c8ff60' : '#ff70c0') : '#e8e0ff';
      g.fillStyle = col;
      const ang = Math.atan2(pr.vy, pr.vx);
      switch (pr.spec.kind) {
        case 'wave':
          g.globalAlpha = 0.8;
          g.beginPath();
          g.ellipse(x, y + pr.h / 2 - 2, pr.w / 2, pr.h, 0, Math.PI, 0);
          g.fill();
          if (Math.random() < 0.5) this.particles.burst(pr.x, pr.y + pr.h / 2, 'dust', '#c8b8a0', 1);
          break;
        case 'orb': {
          const r = pr.w / 2 + Math.sin(t / 60) * 1;
          g.globalAlpha = 0.35;
          g.beginPath();
          g.arc(x, y, r + 3, 0, Math.PI * 2);
          g.fill();
          g.globalAlpha = 0.9;
          g.beginPath();
          g.arc(x, y, r, 0, Math.PI * 2);
          g.fill();
          break;
        }
        case 'shard':
        case 'arrow':
        case 'star':
        case 'bolt':
        case 'blade':
        default: {
          g.save();
          g.translate(x, y);
          g.rotate(ang);
          g.globalAlpha = 0.4;
          g.fillRect(-pr.w - 6, -pr.h / 4, pr.w + 6, pr.h / 2);
          g.globalAlpha = 1;
          if (pr.spec.kind === 'shard' || pr.spec.kind === 'arrow') {
            g.beginPath();
            g.moveTo(pr.w / 2, 0);
            g.lineTo(-pr.w / 2, -pr.h / 2);
            g.lineTo(-pr.w / 2, pr.h / 2);
            g.fill();
          } else {
            g.beginPath();
            g.arc(0, 0, pr.w / 2, 0, Math.PI * 2);
            g.fill();
          }
          g.restore();
          if (enemy) {
            g.globalCompositeOperation = 'source-over';
            g.strokeStyle = 'rgba(255,40,80,0.8)';
            g.beginPath();
            g.arc(x, y, pr.w / 2 + 1.5, 0, Math.PI * 2);
            g.stroke();
            g.globalCompositeOperation = 'lighter';
          }
        }
      }
    }
    g.globalAlpha = 1;
    // rings & bolts
    for (const r of this.rings) {
      const k = r.t / r.dur;
      g.strokeStyle = r.color;
      g.globalAlpha = 1 - k;
      g.lineWidth = 2 - k;
      g.beginPath();
      g.arc(r.x - cx, r.y - cy, r.r * (0.3 + k * 0.7), 0, Math.PI * 2);
      g.stroke();
    }
    for (const b of this.bolts) {
      g.strokeStyle = b.color;
      g.globalAlpha = 1 - b.t / b.dur;
      g.lineWidth = 1;
      g.beginPath();
      b.pts.forEach(([x, y], i) => (i ? g.lineTo(x - cx, y - cy) : g.moveTo(x - cx, y - cy)));
      g.stroke();
    }
    g.globalAlpha = 1;
    g.globalCompositeOperation = 'source-over';
    this.particles.draw(g, cx, cy);
    // motes
    g.fillStyle = th.mote;
    for (const m of this.motes) {
      g.globalAlpha = 0.25 + Math.sin(t / 500 + m.p) * 0.15;
      g.fillRect(Math.round(m.x), Math.round(m.y), 1, 1);
    }
    g.globalAlpha = 1;
    // lantern lighting
    this.drawLighting(w, cx, cy, alpha);
    // debug hitboxes
    if (Tuning.showHitboxes) this.drawHitboxes(w, cx, cy);
    // screen flash
    if (this.flash.t < this.flash.dur) {
      g.globalAlpha = this.flash.alpha * (1 - this.flash.t / this.flash.dur);
      g.fillStyle = this.flash.color;
      g.fillRect(0, 0, VIEW_W, VIEW_H);
      g.globalAlpha = 1;
    }
  }

  private drawLighting(w: World, cx: number, cy: number, alpha: number): void {
    const darkness = this.settings.darkness * this.theme.darkness;
    if (darkness <= 0.01) return;
    const d = this.dg;
    d.globalCompositeOperation = 'source-over';
    d.clearRect(0, 0, VIEW_W, VIEW_H);
    d.fillStyle = `rgba(4,3,10,${0.82 * darkness})`;
    d.fillRect(0, 0, VIEW_W, VIEW_H);
    d.globalCompositeOperation = 'destination-out';
    const light = (x: number, y: number, r: number, a = 1) => {
      const grad = d.createRadialGradient(x, y, 0, x, y, r);
      grad.addColorStop(0, `rgba(0,0,0,${a})`);
      grad.addColorStop(0.6, `rgba(0,0,0,${a * 0.6})`);
      grad.addColorStop(1, 'rgba(0,0,0,0)');
      d.fillStyle = grad;
      d.fillRect(x - r, y - r, r * 2, r * 2);
    };
    const p = w.player;
    const flick = 1 + Math.sin(this.time / 90) * 0.03 + Math.sin(this.time / 37) * 0.02;
    light(p.px + (p.x - p.px) * alpha - cx, p.y - 10 - cy, 130 * flick);
    for (const pr of w.projectiles) light(pr.x - cx, pr.y - cy, 26, 0.7);
    for (const r of this.rings) light(r.x - cx, r.y - cy, r.r * 1.5, 0.8 * (1 - r.t / r.dur));
    for (const ex of w.room.exits) if (w.exitOpen) light(ex.x - cx, ex.y - 16 - cy, 50, 0.8);
    for (const pk of w.pickups) light(pk.x - cx, pk.y - 8 - cy, 34, 0.8);
    for (const e of w.enemies) if (e.alive) light(e.x - cx, e.y - e.h / 2 - cy, e.isBoss ? 70 : 18 + e.telegraph * 20, 0.35 + e.telegraph * 0.4);
    for (const hz of w.hazards) light(hz.x - cx, hz.y - cy, hz.r * 1.4, 0.6);
    this.g.drawImage(this.dark, 0, 0);
    // warm lantern tint
    this.g.globalCompositeOperation = 'soft-light';
    const lx = p.x - cx;
    const ly = p.y - 10 - cy;
    const grad = this.g.createRadialGradient(lx, ly, 0, lx, ly, 120);
    grad.addColorStop(0, 'rgba(255,190,110,0.35)');
    grad.addColorStop(1, 'rgba(255,190,110,0)');
    this.g.fillStyle = grad;
    this.g.fillRect(0, 0, VIEW_W, VIEW_H);
    this.g.globalCompositeOperation = 'source-over';
  }

  private drawHitboxes(w: World, cx: number, cy: number): void {
    const g = this.g;
    g.lineWidth = 1;
    g.strokeStyle = '#0f0';
    const hb = w.player.hurtBox();
    g.strokeRect(hb.x - cx + 0.5, hb.y - cy + 0.5, hb.w, hb.h);
    g.strokeStyle = '#ff0';
    for (const e of w.enemies) {
      const b = e.hurtBox();
      g.strokeRect(b.x - cx + 0.5, b.y - cy + 0.5, b.w, b.h);
      if (e.state === 'active' && e.attack?.hitbox) {
        const a = e.boxFor(e.attack.hitbox);
        g.strokeStyle = '#f0f';
        g.strokeRect(a.x - cx + 0.5, a.y - cy + 0.5, a.w, a.h);
        g.strokeStyle = '#ff0';
      }
    }
    const a = w.player.atk;
    if (a?.prevBox && a.t >= a.def.startup && a.t < a.def.startup + a.def.active) {
      g.strokeStyle = '#f33';
      g.strokeRect(a.prevBox.x - cx + 0.5, a.prevBox.y - cy + 0.5, a.prevBox.w, a.prevBox.h);
    }
  }

  /** Damage numbers and popup texts in crisp UI space (UI = 2× world). */
  drawOverlay(ui: CanvasRenderingContext2D): void {
    const cx = this.cam.vx;
    const cy = this.cam.vy;
    ui.textAlign = 'center';
    ui.textBaseline = 'middle';
    for (const n of this.nums) {
      const k = n.t / n.dur;
      const pop = n.t < 90 ? 1 + (1 - n.t / 90) * (n.crit || n.big ? 0.8 : 0.35) : 1;
      const size = Math.round((n.big ? 15 : 12) * n.scale * pop);
      ui.font = `bold ${size}px "Trebuchet MS", "Segoe UI", sans-serif`;
      ui.globalAlpha = k > 0.7 ? 1 - (k - 0.7) / 0.3 : 1;
      const x = (n.x - cx) * 2;
      const y = (n.y - cy) * 2;
      ui.lineWidth = 3;
      ui.strokeStyle = 'rgba(0,0,0,0.85)';
      ui.strokeText(n.text, x, y);
      ui.fillStyle = n.color;
      ui.fillText(n.text, x, y);
    }
    ui.globalAlpha = 1;
  }
}

function rumble(strong: number, weak: number, dur: number): void {
  try {
    const pads = navigator.getGamepads?.() ?? [];
    for (const p of pads) {
      const act = (p as any)?.vibrationActuator;
      if (act?.playEffect) act.playEffect('dual-rumble', { duration: dur, strongMagnitude: strong, weakMagnitude: weak });
    }
  } catch {
    /* unsupported */
  }
}
