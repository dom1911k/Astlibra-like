import { clamp } from '../core/math';
import { BOSSES, type BossDef, type EnemyDef } from '../data/enemies';
import { Enemy, type SpawnOpts } from './enemy';
import { moveBody } from './room';
import type { Box, ProjectileSpec } from './types';
import type { World } from './world';

interface BossMove {
  id: string;
  windup: number;
  active: number;
  recover: number;
  cooldown: number;
  minPhase?: number;
  maxPhase?: number;
  range?: [number, number];
  weight: number;
  unblockable?: boolean;
  hitbox?: Box;
  motion?: number;
  kb?: [number, number];
  start?(b: Boss, w: World): void;
  windupTick?(b: Boss, w: World, t: number): void;
  activeTick?(b: Boss, w: World, t: number): void;
  recoverTick?(b: Boss, w: World, t: number): void;
}

const SPORE: ProjectileSpec = { kind: 'spore', speed: 0, w: 9, h: 9, life: 160, gravity: 0.1, motion: 0.8, explode: { radius: 20, motion: 0.8 } };
const BOLT: ProjectileSpec = { kind: 'bolt', speed: 2.6, w: 8, h: 8, life: 160, motion: 0.75 };
const WAVE: ProjectileSpec = { kind: 'wave', speed: 3.6, w: 14, h: 20, life: 60, motion: 0.9, ground: true, pierce: 99 };
const SHARD: ProjectileSpec = { kind: 'shard', speed: 4.4, w: 16, h: 6, life: 90, motion: 0.8 };

function rootHazards(b: Boss, w: World, t: number) {
  // root spikes erupt in a line toward the player, telegraphed by the hazard delay
  if (t % 6 === 0 && t <= 36) {
    const i = t / 6;
    const x = b.x + b.facing * (40 + i * 34);
    if (x < 20 || x > w.room.pxW - 20) return;
    const fy = w.room.floorBelow(x, b.y - 8);
    w.hazards.push({ x, y: fy - 12, r: 16, t: 0, delay: 22, team: 'enemy', power: b.atk * 0.9, element: 'phys', done: false, color: '#c86a3a', status: { type: 'bleed', amount: 30 } });
  }
}

const MOVES: Record<string, BossMove[]> = {
  rootmaw: [
    {
      id: 'swipe', windup: 22, active: 8, recover: 26, cooldown: 60, weight: 3, range: [0, 70], hitbox: { x: 0, y: -40, w: 58, h: 40 }, motion: 1, kb: [4, -2],
      activeTick: (b, w, t) => { if (t === 1) b.vx = b.facing * 2; },
    },
    {
      id: 'charge', windup: 34, active: 55, recover: 30, cooldown: 160, weight: 2, range: [60, 999], hitbox: { x: 0, y: -36, w: 30, h: 36 }, motion: 1.3, kb: [6, -3],
      windupTick: (b, w, t) => { b.vx = -b.facing * 0.4; if (t % 8 === 0) w.emit({ t: 'burst', x: b.x, y: b.y, kind: 'dust', color: '#a98', count: 3 }); },
      activeTick: (b, w, t) => {
        b.vx = b.facing * 6.2 * b.speedMult;
        if (b.wallHit) {
          // crashed into a wall: dazed — big punish window
          w.emit({ t: 'shake', amt: 7, dur: 16 });
          w.emit({ t: 'sfx', id: 'explode' });
          w.emit({ t: 'text', x: b.x, y: b.y - b.h - 8, text: 'DAZED', color: '#ffd23c', big: true });
          b.vx = -b.facing * 2;
          b.vy = -3;
          b.setState('stagger');
          b.hitstun = 110;
          b.move = null;
        }
      },
    },
    {
      id: 'leap', windup: 26, active: 70, recover: 34, cooldown: 140, weight: 2, range: [40, 999], unblockable: true,
      start: (b, w) => { b.targetX = w.player.x; },
      activeTick: (b, w, t) => {
        if (t === 1) {
          b.vy = -8.2;
          b.vx = clamp((b.targetX - b.x) / 38, -6, 6);
          b.onGround = false;
        }
        if (t > 3 && b.onGround) {
          w.emit({ t: 'shake', amt: 6, dur: 14 });
          w.emit({ t: 'burst', x: b.x, y: b.y, kind: 'dust', color: '#a98', count: 16 });
          w.emit({ t: 'sfx', id: 'explode' });
          w.hazards.push({ x: b.x, y: b.y - 12, r: 46, t: 0, delay: 0, team: 'enemy', power: b.atk * 1.4, element: 'phys', done: false, color: '#c8a070' });
          for (const d of [1, -1]) w.spawnEnemyProjectile(b, WAVE, b.x + d * 26, b.y - 10, d * WAVE.speed, 0);
          b.endActive();
        }
      },
    },
    { id: 'roots', windup: 30, active: 40, recover: 30, cooldown: 150, weight: 2, range: [0, 999], activeTick: rootHazards, windupTick: (b, w, t) => { if (t === 1) w.emit({ t: 'sfx', id: 'boss' }); } },
    {
      id: 'sporerain', windup: 30, active: 50, recover: 30, cooldown: 260, weight: 2, minPhase: 2,
      activeTick: (b, w, t) => {
        if (t % 6 === 0) {
          const x = clamp(w.player.x + (w.rng.next() - 0.5) * 220, 30, w.room.pxW - 30);
          w.spawnEnemyProjectile(b, SPORE, x, 24, 0, 0.5);
        }
      },
    },
    { id: 'summon', windup: 30, active: 2, recover: 20, cooldown: 400, weight: 1.5, minPhase: 2, start: (b, w) => w.emit({ t: 'sfx', id: 'boss' }), activeTick: (b, w, t) => { if (t === 1) for (const d of [-60, 60]) w.spawnEnemy('gloomling', clamp(b.x + d, 30, w.room.pxW - 30), b.y, { hpMult: 1.5 * b.depthHp, atkMult: b.depthAtk }); } },
  ],
  matriarch: [
    {
      id: 'dive', windup: 30, active: 36, recover: 30, cooldown: 90, weight: 3, hitbox: { x: -20, y: -26, w: 40, h: 26 }, motion: 1.1, kb: [5, -2], range: [0, 999],
      windupTick: (b, w) => { b.vy = -0.6; b.vx *= 0.9; b.targetX = w.player.x; b.targetY = w.player.y - 8; },
      activeTick: (b, w, t) => {
        if (t === 1) {
          const ang = Math.atan2(b.targetY - b.cy, b.targetX - b.x);
          b.vx = Math.cos(ang) * 6.5 * b.speedMult;
          b.vy = Math.sin(ang) * 6.5 * b.speedMult;
        }
        b.vx *= 0.98;
        b.vy *= 0.97;
      },
      recoverTick: (b) => { b.vy -= 0.12; b.vx *= 0.94; },
    },
    {
      id: 'fan', windup: 26, active: 20, recover: 30, cooldown: 110, weight: 2.5, range: [0, 999],
      activeTick: (b, w, t) => {
        if (t === 1 || t === 12) {
          const n = b.phase >= 3 ? 9 : 7;
          const base = Math.atan2(w.player.cy - b.cy, w.player.x - b.x);
          for (let i = 0; i < n; i++) {
            const a = base + (i - (n - 1) / 2) * 0.22 + (t === 12 ? 0.11 : 0);
            w.spawnEnemyProjectile(b, BOLT, b.x, b.cy, Math.cos(a) * 2.8, Math.sin(a) * 2.8);
          }
        }
      },
    },
    {
      id: 'dust', windup: 30, active: 30, recover: 24, cooldown: 160, weight: 2, range: [0, 999],
      activeTick: (b, w, t) => {
        if (t % 10 === 1) {
          const x = clamp(w.player.x + (w.rng.next() - 0.5) * 80, 30, w.room.pxW - 30);
          const fy = w.room.floorBelow(x, w.player.y - 30);
          w.hazards.push({ x, y: fy - 16, r: 24, t: 0, delay: 34, team: 'enemy', power: b.atk * 0.9, element: 'fire', done: false, color: '#ffb050', status: { type: 'burn', amount: 40 } });
        }
      },
    },
    {
      id: 'gust', windup: 24, active: 30, recover: 30, cooldown: 140, weight: 1.5, range: [0, 999],
      activeTick: (b, w, t) => {
        if (t === 1 || t === 16) {
          const d = Math.sign(w.player.x - b.x) || 1;
          w.spawnEnemyProjectile(b, { ...WAVE, speed: 4.2 }, b.x, w.room.floorBelow(b.x, b.y) - 10, d * 4.2, 0);
        }
      },
    },
    { id: 'brood', windup: 30, active: 2, recover: 20, cooldown: 420, weight: 1.5, minPhase: 2, activeTick: (b, w, t) => { if (t === 1) for (const d of [-50, 50]) w.spawnEnemy('moth_wraith', clamp(b.x + d, 30, w.room.pxW - 30), b.y - 20, { hpMult: 1.6 * b.depthHp, atkMult: b.depthAtk }); } },
    {
      id: 'eclipse', windup: 40, active: 40, recover: 40, cooldown: 300, weight: 2, minPhase: 3,
      activeTick: (b, w, t) => {
        if (t % 10 === 1) for (let i = 0; i < 14; i++) {
          const a = (i / 14) * Math.PI * 2 + t * 0.05;
          w.spawnEnemyProjectile(b, BOLT, b.x, b.cy, Math.cos(a) * 2.2, Math.sin(a) * 2.2);
        }
      },
    },
  ],
  vessel: [
    {
      id: 'string', windup: 16, active: 42, recover: 26, cooldown: 70, weight: 3, range: [0, 70], hitbox: { x: 0, y: -30, w: 38, h: 26 }, motion: 0.8, kb: [3, -1.5],
      activeTick: (b, w, t) => {
        // three parryable strikes: re-arm the hitbox at each beat
        if (t === 1 || t === 15 || t === 29) {
          b.attackHit = false;
          b.vx = b.facing * 2.6;
          b.strikeOn = 7;
          w.emit({ t: 'sfx', id: 'swing', vol: 0.6 });
        }
        if (b.strikeOn > 0) b.strikeOn--;
      },
    },
    {
      id: 'lunge', windup: 22, active: 12, recover: 30, cooldown: 90, weight: 2, range: [60, 220], hitbox: { x: -6, y: -28, w: 34, h: 24 }, motion: 1.2, kb: [5, -2],
      activeTick: (b, w, t) => { b.vx = b.facing * 8.5; b.strikeOn = 1; },
    },
    {
      id: 'blink', windup: 20, active: 20, recover: 24, cooldown: 140, weight: 2, range: [0, 999], hitbox: { x: -4, y: -32, w: 40, h: 30 }, motion: 1.3, kb: [5, -2],
      windupTick: (b, w, t) => { b.fade = t / 20; },
      activeTick: (b, w, t) => {
        if (t === 1) {
          const side = -w.player.facing;
          b.x = clamp(w.player.x + side * 34, 24, w.room.pxW - 24);
          b.y = w.room.floorBelow(b.x, w.player.y - 20);
          b.facing = Math.sign(w.player.x - b.x) || 1;
          b.fade = 0;
          w.emit({ t: 'burst', x: b.x, y: b.cy, kind: 'star', color: '#8fd8ff', count: 12 });
          w.emit({ t: 'sfx', id: 'telegraph' });
        }
        b.telegraph = t < 12 ? t / 12 : 0;
        b.strikeOn = t >= 12 && t < 18 ? 1 : 0;
      },
      recoverTick: (b) => { b.fade = 0; },
    },
    {
      id: 'lances', windup: 26, active: 24, recover: 26, cooldown: 120, weight: 2, range: [80, 999],
      activeTick: (b, w, t) => {
        if (t % 6 === 1) {
          const a = Math.atan2(w.player.cy - b.cy, w.player.x - b.x) + (w.rng.next() - 0.5) * 0.3;
          w.spawnEnemyProjectile(b, SHARD, b.x, b.cy - 6, Math.cos(a) * 4.6, Math.sin(a) * 4.6);
        }
      },
    },
    {
      id: 'starfall', windup: 30, active: 60, recover: 30, cooldown: 240, weight: 2, minPhase: 2,
      activeTick: (b, w, t) => {
        if (t % 6 === 1) {
          const x = clamp(w.player.x + (w.rng.next() - 0.5) * 160, 30, w.room.pxW - 30);
          const fy = w.room.floorBelow(x, 30);
          w.hazards.push({ x, y: fy - 14, r: 20, t: 0, delay: 30, team: 'enemy', power: b.atk * 0.9, element: 'shock', done: false, color: '#8fd8ff' });
        }
      },
    },
    {
      id: 'judgment', windup: 70, active: 10, recover: 90, cooldown: 600, weight: 4, minPhase: 3, unblockable: true,
      start: (b, w) => {
        w.emit({ t: 'text', x: b.x, y: b.y - b.h - 16, text: 'JUDGMENT', color: '#ff4040', big: true });
        w.emit({ t: 'sfx', id: 'boss' });
      },
      windupTick: (b, w, t) => { if (t % 14 === 0) w.emit({ t: 'flash', color: '#ff0000', dur: 4, alpha: 0.12 }); },
      activeTick: (b, w, t) => {
        if (t === 1) {
          w.emit({ t: 'flash', color: '#fff', dur: 10, alpha: 0.8 });
          w.emit({ t: 'shake', amt: 9, dur: 20 });
          w.emit({ t: 'sfx', id: 'explode' });
          // screen-wide slash: only i-frames save you
          w.hazards.push({ x: w.player.x, y: w.player.cy, r: 40, t: 0, delay: 0, team: 'enemy', power: b.atk * 2.2, element: 'shock', done: false, color: '#ffffff', unblockable: true });
          for (let x = 40; x < w.room.pxW; x += 60) w.emit({ t: 'burst', x, y: w.player.cy, kind: 'star', color: '#ffffff', count: 3 });
        }
      },
    },
  ],
};

export class Boss extends Enemy {
  bossDef: BossDef;
  phase = 1;
  move: BossMove | null = null;
  moveT = 0;
  movePhase: 'windup' | 'active' | 'recover' = 'windup';
  moveCd: Record<string, number> = {};
  wallHit = false;
  strikeOn = 0;
  fade = 0;
  roar = 0;
  depthHp = 1;
  depthAtk = 1;
  idleT = 0;
  thresholds: number[];

  constructor(id: string, x: number, y: number, opts: SpawnOpts = {}) {
    const bd = BOSSES[id];
    const def: EnemyDef = {
      id: bd.id, name: bd.name, desc: bd.desc, role: 'Boss', ai: 'dummy', hp: bd.hp, atk: bd.atk, def: bd.def, poise: bd.poise, speed: 1.2,
      w: bd.w, h: bd.h, heavy: true, flying: id === 'matriarch', xp: bd.xp, gilt: bd.gilt, color: bd.color, accent: bd.accent, attacks: [], aggro: 9999, minDepth: 99, cost: 0,
    };
    super(def, x, y, { ...opts, noSpawnAnim: true });
    this.bossDef = bd;
    this.isBoss = true;
    this.depthHp = opts.hpMult ?? 1;
    this.depthAtk = opts.atkMult ?? 1;
    this.thresholds = id === 'rootmaw' ? [0.5] : [0.6, 0.3];
    this.state = 'idle';
    this.idleT = 40;
  }

  modifyDamage(dmg: number): number {
    if (this.roar > 0) return 0;
    dmg = Math.min(dmg, Math.round(this.maxHp * 0.1));
    // phase gate: a single hit can't skip a phase
    const next = this.thresholds[this.phase - 1];
    if (next !== undefined) {
      const floor = Math.ceil(this.maxHp * next);
      if (this.hp - dmg <= floor) dmg = Math.max(0, this.hp - floor);
    }
    return dmg;
  }
  dotMult(): number {
    return this.roar > 0 ? 0 : 1;
  }

  onParried(w: World): void {
    this.poiseDmg += this.poiseMax * 0.34;
    w.emit({ t: 'text', x: this.x, y: this.y - this.h - 8, text: 'REPELLED', color: '#fff2a0' });
    if (this.poiseDmg >= this.poiseMax) this.react(w, -this.facing, [2, -1], 0, 40, false, false, true);
    else if (this.move && this.movePhase === 'active') {
      this.movePhase = 'recover';
      this.moveT = 0;
      this.strikeOn = 0;
      this.state = 'recover';
      this.vx = -this.facing * 2;
    }
  }

  react(w: World, dir: number, kb: [number, number], poise: number, stun: number, launch: boolean, spike: boolean, heavy: boolean) {
    if (this.roar > 0) return 'armor' as const;
    const r = super.react(w, dir, kb, poise, stun, launch, spike, heavy);
    if (r === 'stagger') {
      this.move = null;
      this.strikeOn = 0;
      this.fade = 0;
      this.telegraph = 0;
    }
    return r;
  }

  endActive(): void {
    this.movePhase = 'recover';
    this.moveT = 0;
    this.state = 'recover';
  }

  protected physics(w: World): void {
    if (this.bossDef.id === 'matriarch' && this.state !== 'stagger' && this.state !== 'dead') {
      const r = moveBody(w.room, this, true);
      this.wallHit = r.hitWall;
      // keep the matriarch inside the arena, above the floor
      if (this.y > w.room.pxH - 40) this.vy -= 0.3;
      return;
    }
    const before = this.vx;
    super.physics(w);
    this.wallHit = Math.abs(before) > 3 && this.vx === 0;
  }

  protected think(w: World): void {
    const p = w.player;
    const dx = p.x - this.x;
    if (this.roar > 0) {
      this.roar--;
      this.vx *= 0.8;
      if (this.roar === 0) this.idleT = 10;
      return;
    }
    // phase transitions
    const next = this.thresholds[this.phase - 1];
    if (next !== undefined && this.hp <= this.maxHp * next + 0.5) {
      this.phase++;
      this.roar = 70;
      this.move = null;
      this.speedMult = 1 + (this.phase - 1) * 0.15;
      this.state = 'idle';
      w.emit({ t: 'bossPhase', phase: this.phase });
      w.emit({ t: 'text', x: this.x, y: this.y - this.h - 14, text: this.phase === 2 ? 'ENRAGED' : 'FINAL FORM', color: '#ff5040', big: true });
      w.emit({ t: 'sfx', id: 'boss' });
      w.emit({ t: 'shake', amt: 6, dur: 30 });
      w.emit({ t: 'flash', color: '#ff4020', dur: 10, alpha: 0.3 });
      // shove the player away so the transition is readable
      if (Math.abs(dx) < 80) w.player.vx = Math.sign(dx || 1) * 5;
      return;
    }
    for (const k in this.moveCd) if (this.moveCd[k] > 0) this.moveCd[k]--;
    if (!this.move) {
      this.state = 'idle';
      this.telegraph = 0;
      if (Math.abs(dx) > 2) this.facing = dx > 0 ? 1 : -1;
      if (this.bossDef.id === 'matriarch') this.hover(w);
      else if (Math.abs(dx) > 80) this.vx = Math.sign(dx) * 1.1 * this.speedMult;
      else this.vx *= 0.8;
      if (--this.idleT > 0 || p.dead) return;
      const m = this.pickMove(w, Math.abs(dx));
      if (!m) return;
      this.move = m;
      this.moveT = 0;
      this.movePhase = 'windup';
      this.state = 'windup';
      this.attackHit = false;
      this.strikeOn = 0;
      this.unblockableTele = !!m.unblockable;
      this.moveCd[m.id] = m.cooldown;
      m.start?.(this, w);
      if (m.unblockable) w.emit({ t: 'sfx', id: 'telegraph' });
      return;
    }
    const m = this.move;
    this.moveT++;
    const sp = this.speedMult;
    if (this.movePhase === 'windup') {
      this.telegraph = Math.min(1, this.moveT / (m.windup / sp));
      if (this.bossDef.id !== 'matriarch' && this.onGround) this.vx *= 0.8;
      m.windupTick?.(this, w, this.moveT);
      if (this.moveT >= m.windup / sp) {
        this.movePhase = 'active';
        this.state = 'active';
        this.moveT = 0;
        this.telegraph = 0;
      }
      return;
    }
    if (this.movePhase === 'active') {
      m.activeTick?.(this, w, this.moveT);
      if (!this.move) return; // move cancelled (e.g. dazed)
      if (m.hitbox && !this.attackHit && (this.strikeOn > 0 || !['string', 'lunge', 'blink'].includes(m.id))) {
        const box = this.boxFor(m.hitbox);
        if (w.player.overlapsHurt(box)) {
          this.attackHit = true;
          w.hurtPlayer({ power: this.atk * (m.motion ?? 1), kb: m.kb ?? [4, -2], dir: this.facing, unblockable: !!m.unblockable, element: 'phys', source: this });
        }
      }
      if (this.movePhase === 'active' && this.moveT >= m.active) {
        this.movePhase = 'recover';
        this.state = 'recover';
        this.moveT = 0;
      }
      return;
    }
    if (this.onGround && this.bossDef.id !== 'matriarch') this.vx *= 0.8;
    m.recoverTick?.(this, w, this.moveT);
    if (this.moveT >= m.recover / sp) {
      this.move = null;
      this.state = 'idle';
      this.idleT = Math.round((this.phase === 1 ? 26 : 14) / sp);
    }
  }

  private hover(w: World): void {
    const p = w.player;
    const tx = p.x + Math.sin(w.tick / 90) * 90;
    const ty = p.y - 90 + Math.sin(w.tick / 25) * 8;
    this.vx += clamp((tx - this.x) * 0.006, -0.12, 0.12);
    this.vy += clamp((ty - this.cy) * 0.01, -0.15, 0.15);
    this.vx = clamp(this.vx, -2, 2) * 0.97;
    this.vy = clamp(this.vy, -2, 2) * 0.95;
  }

  private pickMove(w: World, adx: number): BossMove | null {
    const list = MOVES[this.bossDef.id].filter((m) => (m.minPhase ?? 1) <= this.phase && (this.moveCd[m.id] ?? 0) <= 0 && (!m.range || (adx >= m.range[0] && adx <= m.range[1])));
    if (!list.length) {
      this.idleT = 10;
      return null;
    }
    return w.rng.weighted(list, (m) => m.weight);
  }
}
