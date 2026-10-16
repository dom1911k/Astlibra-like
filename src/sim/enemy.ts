import { GRAVITY, MAX_FALL } from '../core/constants';
import { clamp } from '../core/math';
import { ELITE_MODS, ENEMIES, type EliteMod, type EnemyAttack, type EnemyDef } from '../data/enemies';
import { statusThreshold } from './damage';
import { moveBody, type Body } from './room';
import { emptyStatus, type Box, type StatusState, type StatusType } from './types';
import type { World } from './world';

export type EnemyState = 'spawn' | 'idle' | 'move' | 'windup' | 'active' | 'recover' | 'hurt' | 'stagger' | 'air' | 'down' | 'guard' | 'dead';

export interface SpawnOpts {
  hpMult?: number;
  atkMult?: number;
  defAdd?: number;
  elite?: EliteMod[];
  noSpawnAnim?: boolean;
  summoned?: boolean;
}

let NEXT_ID = 1;

export class Enemy implements Body {
  id = NEXT_ID++;
  def: EnemyDef;
  x: number;
  y: number;
  w: number;
  h: number;
  vx = 0;
  vy = 0;
  px: number;
  py: number;
  onGround = false;
  dropT = 0;
  facing = -1;
  hp: number;
  maxHp: number;
  atk: number;
  defense: number;
  poiseMax: number;
  poiseDmg = 0;
  poiseTimer = 0;
  state: EnemyState = 'spawn';
  st = 0;
  attack: EnemyAttack | null = null;
  attackHit = false;
  cooldowns: Record<string, number> = {};
  hitstun = 0;
  juggle = 0;
  status: StatusState = emptyStatus();
  statusCounts: Record<StatusType, number> = { burn: 0, shock: 0, frost: 0, bleed: 0 };
  burnSrcPower = 0;
  elite: EliteMod[] = [];
  barrier = 0; // ticks of 50% damage reduction (shepherd ward)
  ward = false; // warded elite
  wardRegen = 0;
  flash = 0; // render: white flash ticks
  shakeT = 0; // render: hit-stop shake
  deathT = 0;
  speedMult = 1;
  lightHits: number[] = [];
  summonerId = 0;
  isBoss = false;
  targetX = 0;
  targetY = 0;
  thinkT = 0;
  telegraph = 0; // render: telegraph intensity
  unblockableTele = false;
  lastHitTick = -999;
  scale = 1;
  depthTier = 1;
  aiSeed: number;

  constructor(defId: string | EnemyDef, x: number, y: number, opts: SpawnOpts = {}) {
    const def = typeof defId === 'string' ? ENEMIES[defId] : defId;
    if (!def) throw new Error('Unknown enemy ' + defId);
    this.def = def;
    this.x = this.px = x;
    this.y = this.py = y;
    this.w = def.w;
    this.h = def.h;
    this.maxHp = Math.round(def.hp * (opts.hpMult ?? 1));
    this.atk = def.atk * (opts.atkMult ?? 1);
    this.defense = def.def + (opts.defAdd ?? 0);
    this.poiseMax = def.poise;
    this.st = opts.noSpawnAnim ? 999 : 0;
    if (opts.noSpawnAnim) this.state = 'idle';
    this.aiSeed = (this.id * 2654435761) >>> 0;
    if (opts.elite?.length) {
      this.elite = opts.elite;
      this.maxHp = Math.round(this.maxHp * 2.4);
      this.atk *= 1.25;
      this.poiseMax *= 1.4;
      for (const m of opts.elite) {
        if (m === 'hasted') this.speedMult = 1.35;
        if (m === 'colossal') {
          this.maxHp = Math.round(this.maxHp * 1.8);
          this.poiseMax *= 1.5;
          this.scale = 1.3;
          this.w = Math.round(this.w * 1.3);
          this.h = Math.round(this.h * 1.3);
        }
        if (m === 'warded') this.ward = true;
      }
    }
    this.hp = this.maxHp;
  }

  get alive() {
    return this.state !== 'dead';
  }
  get hurtable() {
    return this.state !== 'dead' && !(this.state === 'spawn' && this.st < 20);
  }
  get staggered() {
    return this.state === 'stagger';
  }
  get airborne() {
    return !this.onGround && !this.def.flying;
  }
  get cx() {
    return this.x;
  }
  get cy() {
    return this.y - this.h / 2;
  }
  hurtBox(): Box {
    return { x: this.x - this.w / 2, y: this.y - this.h, w: this.w, h: this.h };
  }
  boxFor(b: Box): Box {
    const x = this.facing === 1 ? this.x + b.x * this.scale : this.x - (b.x + b.w) * this.scale;
    return { x, y: this.y + b.y * this.scale, w: b.w * this.scale, h: b.h * this.scale };
  }
  displayName(): string {
    if (!this.elite.length) return this.def.name;
    return this.elite.map((m) => ELITE_MODS[m].name).join(' ') + ' ' + this.def.name;
  }

  // ─────────────────────────────── per-tick update ───────────────────────────────
  update(w: World): void {
    this.px = this.x;
    this.py = this.y;
    if (this.flash > 0) this.flash--;
    if (this.state === 'dead') {
      this.deathT++;
      this.vx *= 0.9;
      this.physics(w);
      return;
    }
    this.st++;
    for (const k in this.cooldowns) if (this.cooldowns[k] > 0) this.cooldowns[k] -= this.speedMult;
    if (this.barrier > 0) this.barrier--;
    if (this.poiseTimer > 0) this.poiseTimer--;
    else this.poiseDmg = Math.max(0, this.poiseDmg - this.poiseMax * 0.01);
    if (this.ward === false && this.elite.includes('warded')) {
      if (++this.wardRegen > 420) {
        this.ward = true;
        this.wardRegen = 0;
      }
    }
    this.tickStatus(w);
    if ((this.state as EnemyState) === 'dead') return;
    this.telegraph = 0;

    if (this.state === 'spawn') {
      if (this.st >= 30) this.setState('idle');
      this.physics(w);
      return;
    }
    if (this.status.frozen > 0) {
      this.status.frozen--;
      this.vx *= 0.8;
      this.physics(w);
      return;
    }
    switch (this.state) {
      case 'hurt':
      case 'stagger':
      case 'air':
        this.updateHitstun(w);
        break;
      case 'down':
        this.vx *= 0.8;
        if (this.st > 26) this.setState('idle');
        break;
      default:
        this.think(w);
    }
    this.physics(w);
  }

  protected physics(w: World): void {
    if (this.def.ai === 'dummy') {
      this.vx = 0;
      if (this.state === 'air') this.vy = Math.min(this.vy, 0) * 0.5;
    }
    if (this.def.flying && this.state !== 'dead' && !(this.state === 'stagger')) {
      // flying: no gravity, damped
      const r = moveBody(w.room, this, true);
      if (r.hitWall) this.vx = 0;
      return;
    }
    const g = this.state === 'air' && this.hitstun > 0 ? GRAVITY * (0.55 + Math.min(0.9, this.juggle * 0.06)) : GRAVITY;
    this.vy = Math.min(MAX_FALL, this.vy + g);
    const res = moveBody(w.room, this);
    if (res.onSpike && this.state !== 'dead' && w.tick % 30 === 0) w.envDamageEnemy(this, 0.08);
    if (this.onGround && (this.state === 'air') && this.vy >= 0) {
      this.juggle = 0;
      if (this.hitstun > 0) {
        this.setState('down');
        w.emit({ t: 'burst', x: this.x, y: this.y, kind: 'dust', color: '#a99', count: 6 });
        w.emit({ t: 'sfx', id: 'land', vol: 0.5 });
      } else this.setState('idle');
    }
    if (this.onGround && this.state !== 'active' && this.state !== 'air') this.vx *= this.state === 'hurt' || this.state === 'stagger' ? 0.86 : 0.75;
  }

  setState(s: EnemyState): void {
    this.state = s;
    this.st = 0;
  }

  private updateHitstun(w: World): void {
    this.hitstun -= 1;
    if (this.hitstun <= 0) {
      if (this.state === 'air' && !this.onGround) return; // keep falling
      if (this.def.flying && this.state === 'stagger') this.vy = 0;
      this.setState('idle');
      this.cooldowns.__react = 20;
    }
  }

  // ─────────────────────────────── statuses ───────────────────────────────
  tickStatus(w: World): void {
    const s = this.status;
    for (const k of ['burn', 'shock', 'frost', 'bleed'] as StatusType[]) if (s.build[k] > 0 && w.tick - this.lastHitTick > 60) s.build[k] = Math.max(0, s.build[k] - 0.25);
    if (s.burn > 0) {
      s.burn--;
      if (s.burn % 30 === 0) w.dotDamage(this, s.burnPower, 'fire');
    }
    if (s.shock > 0) s.shock--;
    if (s.frost > 0) s.frost--;
    if (s.bleedTimer > 0) s.bleedTimer--;
    else s.bleed = 0;
  }

  /** Add status buildup; returns true if the status triggered. */
  addBuildup(w: World, type: StatusType, amount: number, power: number): boolean {
    const s = this.status;
    if (this.def.resist && type === 'burn' && (this.def.resist.fire ?? 0) >= 1) return false;
    s.build[type] += amount;
    const thr = statusThreshold(this.statusCounts[type], this.isBoss);
    if (s.build[type] < thr) return false;
    s.build[type] = 0;
    this.statusCounts[type]++;
    switch (type) {
      case 'burn':
        s.burn = 300;
        s.burnPower = Math.max(s.burnPower, power * 0.32);
        w.emit({ t: 'text', x: this.x, y: this.y - this.h - 6, text: 'BURN', color: '#ff8a3d' });
        break;
      case 'shock':
        s.shock = 360;
        w.dotDamage(this, power * 0.6, 'shock');
        w.emit({ t: 'text', x: this.x, y: this.y - this.h - 6, text: 'SHOCK', color: '#ffe86a' });
        break;
      case 'frost':
        s.frost = 240;
        if (!this.isBoss) {
          s.frozen = 100;
          this.attack = null;
          if (this.state === 'windup' || this.state === 'active') this.setState('idle');
        }
        w.emit({ t: 'text', x: this.x, y: this.y - this.h - 6, text: this.isBoss ? 'CHILL' : 'FROZEN', color: '#8fe0ff' });
        break;
      case 'bleed': {
        const burst = Math.min(this.maxHp * (this.isBoss ? 0.035 : 0.14), power * 7);
        w.dotDamage(this, burst + power * 0.8, 'phys', true);
        s.bleed = 1;
        s.bleedTimer = 180;
        w.emit({ t: 'text', x: this.x, y: this.y - this.h - 6, text: 'HEMORRHAGE', color: '#ff3048' });
        w.emit({ t: 'burst', x: this.x, y: this.cy, kind: 'blood', color: '#d01830', count: 14 });
        break;
      }
    }
    return true;
  }

  // ─────────────────────────────── reactions ───────────────────────────────
  /**
   * React to a hit. Poise decides between flinch and armor; launchers send light foes airborne.
   * Returns 'stagger' when poise broke this hit.
   */
  react(w: World, dir: number, kb: [number, number], poise: number, stun: number, launch: boolean, spike: boolean, heavy: boolean): 'flinch' | 'armor' | 'stagger' | 'launch' {
    this.poiseDmg += poise;
    this.poiseTimer = 90;
    const kbs = (heavy ? 1 : 0.85) * w.kbScale();
    if (this.poiseDmg >= this.poiseMax && this.state !== 'stagger') {
      this.poiseDmg = 0;
      this.ward = false;
      this.wardRegen = 0;
      this.attack = null;
      this.setState('stagger');
      this.hitstun = this.isBoss ? 150 : 80;
      this.vx = dir * Math.abs(kb[0]) * 0.6 * kbs;
      if (this.def.flying) this.vy = 1.5;
      w.emit({ t: 'text', x: this.x, y: this.y - this.h - 8, text: 'BREAK!', color: '#ffd23c', big: true });
      w.emit({ t: 'sfx', id: 'stagger' });
      return 'stagger';
    }
    const light = this.poiseMax <= 14;
    const armored = !light && (this.state === 'windup' || this.state === 'active' || this.state === 'guard' || this.isBoss) && this.state !== 'stagger';
    if (armored) {
      this.vx += dir * kb[0] * 0.15 * kbs;
      return 'armor';
    }
    const canLaunch = launch && !this.def.heavy && !this.isBoss;
    this.attack = null;
    this.vx = dir * Math.abs(kb[0]) * kbs * (this.def.heavy ? 0.4 : 1);
    if (this.state === 'stagger') {
      this.hitstun = Math.max(this.hitstun, 20);
      if (canLaunch || (!this.onGround && !this.def.flying)) this.vy = Math.min(this.vy, kb[1]);
      return 'stagger';
    }
    if (this.def.flying) {
      this.vy = kb[1] * 0.4;
      this.setState('hurt');
      this.hitstun = stun;
      return 'flinch';
    }
    if (canLaunch) {
      this.vy = kb[1];
      this.juggle = 0;
      this.setState('air');
      this.hitstun = stun + 10;
      this.onGround = false;
      return 'launch';
    }
    if (!this.onGround || this.state === 'air') {
      // juggle: keep them up, with decay
      this.juggle++;
      const lift = spike ? Math.abs(kb[1]) + 2 : Math.min(-1.2, kb[1] * 0.6 + this.juggle * 0.22);
      this.vy = spike ? lift : Math.min(this.vy, lift);
      this.setState('air');
      this.hitstun = Math.max(stun, 18);
      return 'flinch';
    }
    this.setState('hurt');
    this.hitstun = stun;
    this.vy = Math.min(0, kb[1] * 0.25);
    return 'flinch';
  }

  // ─────────────────────────────── AI ───────────────────────────────
  protected think(w: World): void {
    const p = w.player;
    const dx = p.x - this.x;
    const dy = p.y - this.y;
    const adx = Math.abs(dx);
    const ai = this.def.ai;
    if (ai === 'dummy') {
      this.vx = 0;
      if (w.tick - this.lastHitTick > 180) this.hp = this.maxHp;
      return;
    }
    if (this.state === 'windup' || this.state === 'active' || this.state === 'recover') {
      this.runAttack(w);
      return;
    }
    if (this.state === 'guard') {
      this.vx *= 0.7;
      this.telegraph = 0.5;
      if (this.st > 34) {
        this.setState('idle');
        this.startAttack(w, this.def.attacks.find((a) => a.id === 'flurry')!, 0.4);
      }
      return;
    }
    const aware = adx < this.def.aggro && Math.abs(dy) < 160;
    const speed = this.def.speed * this.speedMult * (this.status.frost > 0 ? 0.6 : 1);
    if (!aware || p.dead) {
      // idle wander
      if (this.def.flying) {
        this.vy = Math.sin((w.tick + this.id * 40) / 30) * 0.3;
        this.vx *= 0.9;
      } else if (this.st % 120 < 50) this.walk(w, ((this.aiSeed >> (Math.floor(this.st / 120) % 16)) & 1 ? 1 : -1) * speed * 0.4);
      return;
    }
    if ((this.cooldowns.__react ?? 0) > 0) {
      // brief pause after recovering from hits so foes don't instantly retaliate
      this.vx *= 0.8;
      return;
    }
    switch (ai) {
      case 'skitter': return this.aiSkitter(w, dx, adx, speed);
      case 'knight': return this.aiKnight(w, dx, adx, speed);
      case 'spitter': return this.aiSpitter(w, dx, adx, speed);
      case 'moth': return this.aiMoth(w, dx, dy, speed);
      case 'tick': return this.aiTick(w, dx, adx, speed);
      case 'shepherd': return this.aiShepherd(w, dx, adx, speed);
      case 'duelist': return this.aiDuelist(w, dx, adx, speed);
    }
  }

  protected face(dx: number) {
    if (Math.abs(dx) > 2) this.facing = dx > 0 ? 1 : -1;
  }

  /** Walk without falling off ledges or into spikes. */
  protected walk(w: World, vx: number, turn = true): void {
    if (vx === 0) return;
    const ahead = this.x + Math.sign(vx) * (this.w / 2 + 4);
    if (this.onGround && !w.room.groundBelow(ahead, this.y)) {
      this.vx = 0;
      return;
    }
    if (this.onGround && w.room.solidAt(ahead, this.y - 4) && !w.room.solidAt(ahead, this.y - 20)) {
      // small step: hop
      this.vy = -4.5;
    }
    this.vx = vx;
    if (turn) this.face(vx);
  }

  protected ready(a: EnemyAttack): boolean {
    return (this.cooldowns[a.id] ?? 0) <= 0;
  }

  protected chooseAttack(adx: number): EnemyAttack | null {
    const opts = this.def.attacks.filter((a) => (a.weight ?? 1) > 0 && this.ready(a) && adx >= a.range[0] && adx <= a.range[1]);
    if (!opts.length) return null;
    let total = 0;
    for (const a of opts) total += a.weight ?? 1;
    let r = ((this.aiSeed = (this.aiSeed * 1103515245 + 12345) >>> 0) / 4294967296) * total;
    for (const a of opts) {
      r -= a.weight ?? 1;
      if (r <= 0) return a;
    }
    return opts[0];
  }

  startAttack(w: World, a: EnemyAttack, windupScale = 1): void {
    this.attack = a;
    this.attackHit = false;
    this.setState('windup');
    this.st = Math.round(a.windup * (1 - windupScale));
    this.cooldowns[a.id] = a.cooldown;
    this.face(w.player.x - this.x);
    this.unblockableTele = !!a.unblockable;
    if (a.unblockable) w.emit({ t: 'sfx', id: 'telegraph', vol: 0.6 });
  }

  protected runAttack(w: World): void {
    const a = this.attack;
    if (!a) {
      this.setState('idle');
      return;
    }
    const sp = this.speedMult;
    const windup = a.windup / sp;
    const active = a.active / sp;
    const recovery = a.recovery / sp;
    if (this.state === 'windup') {
      this.telegraph = Math.min(1, this.st / windup);
      if (a.windupMove) this.vx = a.windupMove[0] * this.facing;
      else if (this.onGround) this.vx *= 0.7;
      if (this.def.ai === 'moth') {
        this.vy = -0.4;
        this.vx *= 0.9;
        this.face(w.player.x - this.x);
        this.targetX = w.player.x;
        this.targetY = w.player.y - 10;
      }
      if (this.st >= windup) {
        this.setState('active');
        this.onActiveStart(w, a);
      }
      return;
    }
    if (this.state === 'active') {
      this.telegraph = 0;
      if (a.move && this.def.ai !== 'moth') {
        this.vx = a.move[0] * this.facing * sp;
        if (this.st === 1 && a.move[1]) this.vy = a.move[1];
      }
      if (this.def.ai === 'moth') {
        const ang = Math.atan2(this.targetY - this.cy, this.targetX - this.x);
        if (this.st < 4) {
          this.vx = Math.cos(ang) * 4.6 * sp;
          this.vy = Math.sin(ang) * 4.6 * sp;
        }
        this.vx *= 0.985;
        this.vy = this.vy * 0.97 - 0.05;
      }
      if (a.hitbox && !this.attackHit) {
        const box = this.boxFor(a.hitbox);
        if (w.player.overlapsHurt(box)) {
          this.attackHit = true;
          const res = w.hurtPlayer({ power: this.atk * a.motion, kb: a.kb, dir: this.facing, unblockable: !!a.unblockable, status: a.status, element: a.status?.type === 'burn' ? 'fire' : 'phys', source: this });
          if (res === 'hit' && this.elite.includes('vampiric')) this.hp = Math.min(this.maxHp, this.hp + this.atk * a.motion * 0.6);
        }
      }
      if (this.st >= active) {
        this.setState('recover');
        if (a.special === 'explode') {
          this.hp = 0;
          w.killEnemy(this, null);
        }
      }
      return;
    }
    if (this.state === 'recover') {
      if (this.onGround) this.vx *= 0.8;
      if (this.def.ai === 'moth') {
        this.vx *= 0.92;
        this.vy = this.vy * 0.9 - 0.08;
      }
      if (this.st >= recovery) {
        this.attack = null;
        this.setState('idle');
      }
    }
  }

  protected onActiveStart(w: World, a: EnemyAttack): void {
    if (a.projectile) {
      const p = a.projectile;
      if (this.def.ai === 'spitter') {
        // ballistic aim at the player
        const T = 46;
        const tx = w.player.x - this.x;
        const ty = w.player.y - 6 - (this.y - this.h);
        const g = p.gravity ?? 0.12;
        const vx = clamp(tx / T, -4.5, 4.5);
        const vy = ty / T - 0.5 * g * T;
        w.spawnEnemyProjectile(this, p, this.x, this.y - this.h, vx, vy);
      } else {
        const ox = (p.offset?.[0] ?? 8) * this.facing;
        const oy = p.offset?.[1] ?? -this.h * 0.6;
        const tx = w.player.x - this.x;
        const ty = w.player.y - 12 - (this.y + oy);
        const ang = p.ground ? (this.facing > 0 ? 0 : Math.PI) : Math.atan2(ty, tx);
        w.spawnEnemyProjectile(this, p, this.x + ox, this.y + oy, Math.cos(ang) * p.speed, Math.sin(ang) * p.speed);
        if (p.ground) w.spawnEnemyProjectile(this, p, this.x - ox, this.y + oy, -Math.cos(ang) * p.speed, 0);
      }
    }
    if (a.special === 'summon') w.shepherdSummon(this);
    if (a.special === 'barrier') w.shepherdBarrier(this);
    if (a.special === 'blink') w.enemyBlink(this);
    if (a.special === 'explode') w.tickExplode(this, a);
  }

  private aiSkitter(w: World, dx: number, adx: number, speed: number) {
    this.face(dx);
    const lunge = this.def.attacks[0];
    if (this.onGround && adx < lunge.range[1] && adx > lunge.range[0] && this.ready(lunge) && Math.abs(w.player.y - this.y) < 40) {
      this.startAttack(w, lunge);
      return;
    }
    // jittery approach with spacing
    const want = adx > 40 ? Math.sign(dx) : (this.id + Math.floor(w.tick / 40)) % 3 === 0 ? -Math.sign(dx) : 0;
    this.walk(w, want * speed);
    this.face(dx);
  }

  private aiKnight(w: World, dx: number, adx: number, speed: number) {
    // slow turning makes getting behind a knight a real tactic
    if (Math.sign(dx) !== this.facing && this.st % 22 === 0) this.face(dx);
    const a = this.onGround ? this.chooseAttack(adx) : null;
    if (a && Math.sign(dx) === this.facing && Math.abs(w.player.y - this.y) < 50) {
      this.startAttack(w, a);
      return;
    }
    if (adx > 30) this.walk(w, Math.sign(dx) * speed, false);
    else this.vx *= 0.7;
    if (Math.sign(dx) !== this.facing) this.vx *= 0.5;
  }

  private aiSpitter(w: World, dx: number, adx: number, speed: number) {
    this.face(dx);
    const a = this.chooseAttack(adx);
    if (a && this.onGround) {
      this.startAttack(w, a);
      return;
    }
    if (adx < 90) this.walk(w, -Math.sign(dx) * speed);
    else if (adx > 220) this.walk(w, Math.sign(dx) * speed);
    else this.vx *= 0.7;
    this.face(dx);
  }

  private aiMoth(w: World, dx: number, dy: number, speed: number) {
    const p = w.player;
    const side = (this.id % 2 === 0 ? 1 : -1) * (Math.floor(w.tick / 200) % 2 === 0 ? 1 : -1);
    const tx = p.x + side * 60;
    const ty = p.y - 70 + Math.sin((w.tick + this.id * 17) / 22) * 10;
    this.vx += clamp((tx - this.x) * 0.01, -0.15, 0.15);
    this.vy += clamp((ty - this.cy) * 0.01, -0.15, 0.15);
    this.vx = clamp(this.vx, -speed, speed) * 0.97;
    this.vy = clamp(this.vy, -speed, speed) * 0.97;
    this.face(dx);
    const a = this.def.attacks[0];
    if (this.ready(a) && Math.hypot(dx, dy) < 150 && w.room.los(this.x, this.cy, p.x, p.y - 10)) this.startAttack(w, a);
  }

  private aiTick(w: World, dx: number, adx: number, speed: number) {
    const a = this.def.attacks[0];
    if (adx < a.range[1] && Math.abs(w.player.y - this.y) < 30) {
      this.startAttack(w, a);
      return;
    }
    this.walk(w, Math.sign(dx) * speed);
  }

  private aiShepherd(w: World, dx: number, adx: number, speed: number) {
    this.face(dx);
    const a = this.chooseAttack(adx);
    if (a) {
      if (a.special === 'summon' && w.enemies.filter((e) => e.summonerId === this.id && e.alive).length >= 3) this.cooldowns[a.id] = 60;
      else if (a.special === 'barrier' && w.enemies.filter((e) => e !== this && e.alive && Math.abs(e.x - this.x) < 160).length === 0) this.cooldowns[a.id] = 60;
      else {
        this.startAttack(w, a);
        return;
      }
    }
    if (adx < 110) this.walk(w, -Math.sign(dx) * speed);
    else if (adx > 220) this.walk(w, Math.sign(dx) * speed);
    else this.vx *= 0.7;
    this.face(dx);
  }

  private aiDuelist(w: World, dx: number, adx: number, speed: number) {
    this.face(dx);
    const a = this.chooseAttack(adx);
    if (a && this.onGround && Math.abs(w.player.y - this.y) < 40) {
      this.startAttack(w, a);
      return;
    }
    // keeps a fencing distance, stepping in and out
    const want = adx > 70 ? 1 : adx < 34 ? -1 : (Math.floor((w.tick + this.id * 13) / 30) % 2 === 0 ? 1 : -1);
    this.walk(w, Math.sign(dx) * want * speed * (want < 0 ? 0.7 : 1));
    this.face(dx);
  }

  /** Duelist: three light hits in quick succession trigger a guard + riposte. Returns true if blocked. */
  duelistGuardCheck(w: World, kind: string, fromFront: boolean): boolean {
    if (this.def.ai !== 'duelist') return false;
    if (this.state === 'guard') return fromFront;
    if (kind !== 'light' && kind !== 'air') {
      this.lightHits.length = 0;
      return false;
    }
    this.lightHits.push(w.tick);
    this.lightHits = this.lightHits.filter((t) => w.tick - t < 70);
    if (this.lightHits.length >= 3 && this.state !== 'stagger' && this.onGround && fromFront) {
      this.lightHits.length = 0;
      this.attack = null;
      this.setState('guard');
      this.vx = -this.facing * 2;
      w.emit({ t: 'text', x: this.x, y: this.y - this.h - 6, text: 'GUARD', color: '#ff5c5c' });
      return true;
    }
    return false;
  }
}
