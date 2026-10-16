import { GRAVITY, MAX_FALL } from '../core/constants';
import type { Action, InputSource } from '../core/input';
import { approach, clamp, overlaps } from '../core/math';
import { Tuning } from '../core/tuning';
import { ATTACKS, MOVESETS, type Moveset } from '../data/movesets';
import { SPELLS, type SpellDef } from '../data/spells';
import { moveBody, type Body } from './room';
import { addStats, derive, type Derived, type Stats } from './stats';
import type { AttackDef, Box } from './types';
import type { World } from './world';

export type PState = 'free' | 'attack' | 'dodge' | 'guard' | 'hurt' | 'cast' | 'potion' | 'dead';

export interface Buff {
  id: string;
  name: string;
  stats: Partial<Stats>;
  t: number;
  dur: number;
  stacks: number;
  maxStacks: number;
  consumeOn?: 'heavy' | 'hit' | 'art' | 'spell';
}

export interface AtkState {
  def: AttackDef;
  t: number;
  charge: number;
  released: boolean;
  chargedFull: boolean;
  reg: Map<number, { n: number; last: number }>;
  projDone: boolean;
  prevBox: Box | null;
  hitConfirm: boolean;
  landed: boolean;
  plungeT: number;
  airStart: boolean;
}

const RUN = 2.35;
const JUMP_V = -7.2;
const AIR_JUMP_V = -6.4;

export class Player implements Body {
  x: number;
  y: number;
  w = 10;
  h = 22;
  vx = 0;
  vy = 0;
  px: number;
  py: number;
  onGround = false;
  dropT = 0;
  facing = 1;
  hp: number;
  mp: number;
  barrier = 0;
  barrierT = 0;
  state: PState = 'free';
  st = 0;
  atk: AtkState | null = null;
  buffer: Partial<Record<Action, number>> = {};
  coyote = 0;
  airJumpsUsed = 0;
  airDodged = false;
  jumpRising = false;
  iframes = 0;
  invuln = 0;
  dodgeDir = 1;
  dodgeCd = 0;
  perfectUsed = false;
  dashWindow = 0;
  parryT = 0; // remaining parry-active ticks
  parryLockout = 0;
  guardT = 0;
  riposte = 0;
  hurtT = 0;
  combo = 0;
  comboTimer = 0;
  maxCombo = 0;
  spellCd: number[] = [0, 0];
  casting: { spell: SpellDef; slot: number; done: boolean } | null = null;
  potions = 3;
  buffs: Buff[] = [];
  base: Stats;
  derived!: Derived;
  moveset!: Moveset;
  airHits = 0;
  flash = 0;
  shakeT = 0;
  runPhase = 0;
  landT = 0;
  dead = false;
  shield: World['loadout']['shield'] = null;
  statsDirty = true;
  // per-room analytics
  lastAttackId = '';

  constructor(w: World, x: number, y: number) {
    this.x = this.px = x;
    this.y = this.py = y;
    this.base = w.loadout.stats;
    this.applyLoadout(w);
    this.hp = this.derived.maxHp;
    this.mp = Math.round(this.derived.maxMp * 0.5);
    this.potions = Math.max(0, Math.round(this.base.potions));
  }

  applyLoadout(w: World): void {
    this.base = w.loadout.stats;
    this.moveset = MOVESETS[w.loadout.weaponCls];
    this.shield = w.loadout.shield;
    this.recompute();
  }

  recompute(): void {
    const s = { ...this.base } as Stats;
    for (const b of this.buffs) addStats(s, b.stats, b.stacks);
    this.derived = derive(s);
    this.statsDirty = false;
    if (this.hp > this.derived.maxHp) this.hp = this.derived.maxHp;
    if (this.mp > this.derived.maxMp) this.mp = this.derived.maxMp;
  }

  get stats(): Stats {
    return this.derived.s;
  }
  get cy() {
    return this.y - this.h / 2;
  }
  hurtBox(): Box {
    return { x: this.x - this.w / 2 + 1, y: this.y - this.h + 2, w: this.w - 2, h: this.h - 2 };
  }
  overlapsHurt(b: Box): boolean {
    return !this.dead && overlaps(this.hurtBox(), b);
  }
  boxFor(b: Box): Box {
    const x = this.facing === 1 ? this.x + b.x : this.x - b.x - b.w;
    return { x, y: this.y + b.y, w: b.w, h: b.h };
  }

  // ─────────────────────────────── input buffer ───────────────────────────────
  private has(a: Action): boolean {
    return this.buffer[a] !== undefined;
  }
  private take(a: Action): boolean {
    if (this.buffer[a] === undefined) return false;
    delete this.buffer[a];
    return true;
  }

  addBuff(b: Omit<Buff, 't' | 'stacks'>): void {
    const ex = this.buffs.find((x) => x.id === b.id);
    if (ex) {
      ex.t = 0;
      ex.dur = b.dur;
      ex.stacks = Math.min(ex.maxStacks, ex.stacks + 1);
    } else this.buffs.push({ ...b, t: 0, stacks: 1 });
    this.statsDirty = true;
  }
  consumeBuffs(on: Buff['consumeOn']): void {
    const before = this.buffs.length;
    this.buffs = this.buffs.filter((b) => b.consumeOn !== on);
    if (this.buffs.length !== before) this.statsDirty = true;
  }

  // ─────────────────────────────── main update ───────────────────────────────
  update(w: World, input: InputSource): void {
    this.px = this.x;
    this.py = this.y;
    for (const a of input.drainPresses()) this.buffer[a] = 0;
    for (const k in this.buffer) {
      const a = k as Action;
      this.buffer[a]!++;
      if (this.buffer[a]! > Tuning.inputBufferTicks) delete this.buffer[a];
    }
    if (this.statsDirty) this.recompute();
    if (this.dead) {
      this.vx *= 0.9;
      this.physics(w, 1);
      return;
    }
    this.st++;
    this.timers(w);
    const dirX = (input.held('right') ? 1 : 0) - (input.held('left') ? 1 : 0);

    switch (this.state) {
      case 'free': this.updateFree(w, input, dirX); break;
      case 'attack': this.updateAttack(w, input, dirX); break;
      case 'dodge': this.updateDodge(w, input, dirX); break;
      case 'guard': this.updateGuard(w, input, dirX); break;
      case 'hurt':
        this.vx *= this.onGround ? 0.85 : 0.97;
        if (this.st >= this.hurtT) this.setState('free');
        this.physics(w, 1);
        break;
      case 'cast': this.updateCast(w); break;
      case 'potion': this.updatePotion(w, dirX); break;
    }
    if (this.y > w.room.pxH - 4) this.hp = 0;
    if (this.hp <= 0 && !this.dead) {
      if (Tuning.godMode) this.hp = 1;
      else w.playerDied();
    }
  }

  private timers(w: World): void {
    if (this.iframes > 0) this.iframes--;
    if (this.invuln > 0) this.invuln--;
    if (this.parryLockout > 0) this.parryLockout--;
    if (this.riposte > 0) this.riposte--;
    if (this.dashWindow > 0) this.dashWindow--;
    if (this.dodgeCd > 0) this.dodgeCd--;
    if (this.flash > 0) this.flash--;
    if (this.landT > 0) this.landT--;
    if (this.comboTimer > 0 && --this.comboTimer === 0) this.combo = 0;
    const cdr = 1 + Math.max(0, this.stats.cdr);
    for (let i = 0; i < this.spellCd.length; i++) if (this.spellCd[i] > 0) this.spellCd[i] = Math.max(0, this.spellCd[i] - cdr);
    if (this.barrierT > 0 && --this.barrierT === 0) this.barrier = 0;
    if (this.stats.mpRegen > 0) this.mp = Math.min(this.derived.maxMp, this.mp + this.stats.mpRegen / 60);
    let changed = false;
    for (const b of this.buffs) b.t++;
    const n = this.buffs.length;
    this.buffs = this.buffs.filter((b) => b.t < b.dur);
    if (this.buffs.length !== n) changed = true;
    if (changed) this.recompute();
    if (this.onGround) this.coyote = Tuning.coyoteTicks;
    else if (this.coyote > 0) this.coyote--;
  }

  setState(s: PState): void {
    this.state = s;
    this.st = 0;
    if (s !== 'attack') this.atk = null;
    if (s !== 'cast') this.casting = null;
  }

  private physics(w: World, gScale: number, noOneWay = false): void {
    this.vy = Math.min(MAX_FALL, this.vy + GRAVITY * gScale);
    const wasGround = this.onGround;
    const r = moveBody(w.room, this, noOneWay);
    if (r.landed || (!wasGround && this.onGround)) {
      this.airJumpsUsed = 0;
      this.airDodged = false;
      this.airHits = 0;
      this.jumpRising = false;
      this.landT = 6;
      w.emit({ t: 'sfx', id: 'land', vol: 0.35 });
      w.emit({ t: 'burst', x: this.x, y: this.y, kind: 'dust', color: '#b8a890', count: 4 });
    }
    if (r.onSpike && this.invuln <= 0 && this.iframes <= 0) w.spikePlayer();
  }

  private horizontal(dirX: number, mult = 1): void {
    const max = RUN * this.derived.moveMult * mult;
    if (dirX !== 0) {
      const accel = this.onGround ? 0.6 : 0.42;
      if (Math.abs(this.vx) > max && Math.sign(this.vx) === dirX) this.vx = approach(this.vx, dirX * max, 0.12);
      else this.vx = approach(this.vx, dirX * max, accel);
    } else {
      this.vx = approach(this.vx, 0, this.onGround ? 0.75 : 0.22);
    }
  }

  private tryJump(w: World, input: InputSource): boolean {
    if (!this.has('jump')) return false;
    if (this.onGround && input.held('down') && w.room.groundBelow(this.x, this.y) && this.onOneWay(w)) {
      this.take('jump');
      this.dropT = 12;
      this.onGround = false;
      this.y += 1;
      return true;
    }
    if (this.onGround || this.coyote > 0) {
      this.take('jump');
      this.vy = JUMP_V;
      this.onGround = false;
      this.coyote = 0;
      this.jumpRising = true;
      w.emit({ t: 'sfx', id: 'jump', vol: 0.4 });
      w.emit({ t: 'burst', x: this.x, y: this.y, kind: 'dust', color: '#b8a890', count: 3 });
      return true;
    }
    if (this.airJumpsUsed < Math.round(this.stats.airJumps)) {
      this.take('jump');
      this.airJumpsUsed++;
      this.vy = AIR_JUMP_V;
      this.jumpRising = true;
      w.emit({ t: 'sfx', id: 'jump', vol: 0.4, pitch: 1.3 });
      w.emit({ t: 'ring', x: this.x, y: this.y, r: 10, color: '#ffe2a8', dur: 12 });
      return true;
    }
    return false; // stays buffered → fires on landing (jump buffering)
  }

  private onOneWay(w: World): boolean {
    const ty = Math.round(this.y / 16);
    return w.room.at(Math.floor(this.x / 16), ty) === 2;
  }

  /** Common action dispatch from neutral (free) — also used by cancels. */
  private tryActions(w: World, input: InputSource, dirX: number, allow: { dodge?: boolean; attack?: boolean; jump?: boolean; guard?: boolean; skill?: boolean }): boolean {
    if (allow.dodge !== false && this.has('dodge') && this.dodgeCd <= 0 && (this.onGround || !this.airDodged)) {
      this.take('dodge');
      this.startDodge(w, dirX);
      return true;
    }
    if (allow.skill !== false) {
      if (this.has('art')) {
        const cost = this.artCost();
        if (this.mp >= cost) {
          this.take('art');
          this.mp -= cost;
          this.startAttack(w, ATTACKS[this.moveset.art]);
          w.fireProcs('art', {});
          w.fireProcs('cast', {});
          this.consumeBuffs('art');
          return true;
        }
        this.take('art');
        w.emit({ t: 'text', x: this.x, y: this.y - 30, text: 'Not enough Aether', color: '#8fb8ff' });
      }
      for (let i = 0; i < 2; i++) {
        const a: Action = i === 0 ? 'spell1' : 'spell2';
        if (!this.has(a)) continue;
        this.take(a);
        const id = w.loadout.spells[i];
        const sp = id ? SPELLS[id] : null;
        if (!sp) {
          w.emit({ t: 'text', x: this.x, y: this.y - 30, text: 'No spell equipped', color: '#aaa' });
          continue;
        }
        if (this.spellCd[i] > 0) continue;
        if (this.mp < sp.mp) {
          w.emit({ t: 'text', x: this.x, y: this.y - 30, text: 'Not enough Aether', color: '#8fb8ff' });
          continue;
        }
        this.mp -= sp.mp;
        this.spellCd[i] = sp.cooldown;
        this.setState('cast');
        this.casting = { spell: sp, slot: i, done: false };
        w.emit({ t: 'sfx', id: 'cast' });
        return true;
      }
    }
    if (allow.attack !== false) {
      if (this.has('light') || this.has('heavy')) {
        const heavy = this.has('heavy') && !this.has('light') ? true : this.has('light') ? false : true;
        this.take(heavy ? 'heavy' : 'light');
        const ms = this.moveset;
        let id: string;
        if (this.riposte > 0) {
          id = ms.riposte;
          this.riposte = 0;
        } else if (!this.onGround) id = heavy ? ms.airHeavy : ms.air;
        else if (input.held('up')) id = ms.launcher;
        else if (this.dashWindow > 0 || (this.state === 'dodge' && this.st >= 6)) id = heavy ? ms.heavy : ms.dash;
        else id = heavy ? ms.heavy : ms.light;
        if (this.state === 'dodge' && !heavy) id = this.riposte > 0 ? ms.riposte : this.onGround ? ms.dash : ms.air;
        this.startAttack(w, ATTACKS[id]);
        return true;
      }
    }
    if (allow.jump !== false && this.tryJump(w, input)) {
      if (this.state !== 'free') this.setState('free');
      return true;
    }
    if (allow.guard !== false && input.held('guard') && this.onGround) {
      this.startGuard(w);
      return true;
    }
    if (this.has('potion') && this.onGround) {
      this.take('potion');
      if (this.potions > 0 && this.hp < this.derived.maxHp) {
        this.potions--;
        this.setState('potion');
        w.emit({ t: 'sfx', id: 'potion' });
        return true;
      }
      w.emit({ t: 'text', x: this.x, y: this.y - 30, text: this.potions > 0 ? 'HP full' : 'No Lamp Oil', color: '#aaa' });
    }
    return false;
  }

  artCost(): number {
    return Math.max(5, Math.round(this.moveset.artCost * (1 + this.stats.artCost)));
  }

  private updateFree(w: World, input: InputSource, dirX: number): void {
    if (this.tryActions(w, input, dirX, {})) {
      if (this.state !== 'free') return;
    }
    this.horizontal(dirX);
    if (dirX !== 0) this.facing = dirX;
    if (this.jumpRising && !input.held('jump') && this.vy < -2) {
      this.vy *= 0.45;
      this.jumpRising = false;
    }
    if (this.vy >= 0) this.jumpRising = false;
    this.runPhase += Math.abs(this.vx) * 0.18;
    this.physics(w, 1);
  }

  // ─────────────────────────────── dodge ───────────────────────────────
  private startDodge(w: World, dirX: number): void {
    this.setState('dodge');
    this.dodgeDir = dirX !== 0 ? dirX : this.facing;
    this.facing = this.dodgeDir;
    this.iframes = Tuning.dodgeIframes + Math.round(this.stats.iframes);
    this.perfectUsed = false;
    if (!this.onGround) {
      this.airDodged = true;
      this.vy = Math.min(this.vy, 0) * 0.2;
    }
    w.emit({ t: 'sfx', id: 'dodge', vol: 0.5 });
    w.emit({ t: 'burst', x: this.x, y: this.y, kind: 'dust', color: '#c8b8a0', count: 5, dir: -this.dodgeDir });
    w.fireProcs('dodge', {});
    w.emit({ t: 'mastery', kind: 'dodge', amount: 1 });
  }

  private updateDodge(w: World, input: InputSource, dirX: number): void {
    const air = this.airDodged && !this.onGround;
    const dash = air && this.stats.airDash >= 1;
    const dur = air ? (dash ? 14 : 13) : 18;
    const t = this.st / dur;
    const spd = dash ? 5.4 : air ? 3.6 : 4.8;
    this.vx = this.dodgeDir * spd * (1 - t * 0.75) * this.derived.moveMult;
    // dash attack out of dodge
    if (this.st >= 6 && (this.has('light') || this.has('heavy'))) {
      if (this.tryActions(w, input, dirX, { dodge: false, jump: false, guard: false, skill: false })) return;
    }
    if (this.st >= 8 && this.has('jump') && (this.onGround || this.coyote > 0 || this.airJumpsUsed < this.stats.airJumps)) {
      this.setState('free');
      this.tryJump(w, input);
      return;
    }
    this.physics(w, dash ? 0 : air ? 0.4 : 1);
    if (this.st >= dur) {
      this.setState('free');
      this.dashWindow = 10;
      this.dodgeCd = 4;
    }
  }

  // ─────────────────────────────── guard / parry ───────────────────────────────
  private startGuard(w: World): void {
    this.setState('guard');
    this.guardT = 0;
    if (this.parryLockout <= 0) {
      this.parryT = Tuning.parryWindowTicks + Math.round(this.stats.parryWindow) + (this.shield?.parryBonus ?? 0);
      this.parryLockout = 28;
    } else this.parryT = 0;
  }
  private updateGuard(w: World, input: InputSource, dirX: number): void {
    this.guardT++;
    if (this.parryT > 0) this.parryT--;
    if (!input.held('guard') || !this.onGround) {
      this.setState('free');
      return;
    }
    if (this.has('dodge') || this.has('jump') || this.has('light') || this.has('heavy') || this.has('art') || this.has('spell1') || this.has('spell2')) {
      if (this.tryActions(w, input, dirX, { guard: false })) return;
    }
    this.horizontal(dirX, this.shield?.guardMove ?? 0.35);
    this.physics(w, 1);
  }
  get guarding(): boolean {
    return this.state === 'guard';
  }

  // ─────────────────────────────── attacks ───────────────────────────────
  startAttack(w: World, def: AttackDef): void {
    this.setState('attack');
    this.atk = {
      def, t: 0, charge: 0, released: false, chargedFull: false, reg: new Map(), projDone: false, prevBox: null,
      hitConfirm: false, landed: false, plungeT: 0, airStart: !this.onGround,
    };
    this.lastAttackId = def.id;
    if (def.kind === 'heavy') this.consumeBuffs('heavy');
    if (def.mpCost) {
      if (this.mp >= def.mpCost) this.mp -= def.mpCost;
    }
    w.emit({ t: 'sfx', id: this.moveset.heavyWeapon || def.kind === 'heavy' ? 'swingHeavy' : 'swing', vol: 0.35, pitch: 0.9 + Math.random() * 0.2 });
  }

  attackSpeed(): number {
    const d = this.atk!.def;
    if (d.kind === 'riposte' || d.kind === 'art') return 1;
    return this.derived.speedMult;
  }

  private updateAttack(w: World, input: InputSource, dirX: number): void {
    const a = this.atk!;
    const d = a.def;
    const sp = this.attackSpeed();
    // charge handling: hold heavy during startup
    if (d.charge && !a.released && a.t >= d.startup - 2 && input.held('heavy') && a.charge < d.charge.maxTicks) {
      a.charge++;
      if (a.charge === d.charge.maxTicks) {
        a.chargedFull = true;
        w.emit({ t: 'sfx', id: 'chargeFull' });
        w.emit({ t: 'ring', x: this.x, y: this.cy, r: 18, color: '#fff2b0', dur: 14 });
      } else if (a.charge % 10 === 0) w.emit({ t: 'sfx', id: 'charge', vol: 0.25, pitch: 0.8 + a.charge / d.charge.maxTicks });
      this.vx *= 0.8;
      this.physics(w, 1);
      return;
    }
    if (d.charge && a.t >= d.startup - 2) a.released = true;
    const prevT = a.t;
    a.t += sp;
    const activeStart = d.startup;
    const activeEnd = d.startup + d.active;
    const total = activeEnd + d.recovery;
    const inActive = a.t >= activeStart && (a.t < activeEnd || (d.plunge && !a.landed));
    const justActive = prevT < activeStart && a.t >= activeStart;

    // ---- movement ----
    let g = 1;
    if (!this.onGround && d.gravity !== undefined) g = d.gravity;
    if (a.t < activeStart) {
      if (d.moveStartup) this.vx = d.moveStartup[0] * this.facing;
      else this.vx = approach(this.vx, 0, this.onGround ? 0.5 : 0.1);
      if (!this.onGround && d.gravity !== undefined) this.vy *= 0.6;
    } else if (inActive) {
      if (d.moveActive) this.vx = d.moveActive[0] * this.facing;
      else this.vx = approach(this.vx, 0, this.onGround ? 0.5 : 0.1);
    } else this.vx = approach(this.vx, 0, this.onGround ? 0.6 : 0.12);
    if (!this.onGround && !d.plunge) this.horizontalAirDrift(dirX);

    if (justActive) this.onActiveStart(w, a);

    // ---- plunge ----
    if (d.plunge && a.t >= activeStart && !a.landed) {
      a.plungeT++;
      this.vx = d.plunge.vx * this.facing;
      this.vy = d.plunge.vy;
      a.t = Math.min(a.t, activeEnd - 0.01);
      const wasGround = this.onGround;
      moveBody(w.room, this);
      if (this.onGround || wasGround || a.plungeT > 120) {
        a.landed = true;
        a.t = activeEnd;
        this.vx = 0;
        this.airHits = 0;
        this.airJumpsUsed = 0;
        this.airDodged = false;
        if (d.plunge.landing) w.playerLanding(this, d, d.plunge.landing);
        w.emit({ t: 'burst', x: this.x, y: this.y, kind: 'dust', color: '#b8a890', count: 10 });
        w.emit({ t: 'shake', amt: d.shake ?? 3, dur: 10 });
      } else w.playerAttackHits(this, a, true);
      return;
    }

    if (inActive && d.hitbox) w.playerAttackHits(this, a, false);

    // ---- cancels ----
    const early = a.hitConfirm && !this.moveset.heavyWeapon && (d.kind === 'light' || d.kind === 'air');
    const cancelAt = early ? Math.min(d.cancel, activeEnd) : d.cancel;
    if (a.t >= cancelAt) {
      // combo links
      const wantL = this.has('light');
      const wantH = this.has('heavy');
      if ((wantL || wantH) && this.riposte > 0) {
        this.take(wantL ? 'light' : 'heavy');
        this.riposte = 0;
        this.startAttack(w, ATTACKS[this.moveset.riposte]);
        return;
      }
      if (wantL && d.links?.light && (this.onGround || d.kind === 'air')) {
        this.take('light');
        this.startAttack(w, ATTACKS[d.links.light]);
        return;
      }
      if (wantH && d.links?.heavy && this.onGround) {
        this.take('heavy');
        this.startAttack(w, ATTACKS[d.links.heavy]);
        return;
      }
      if (this.tryActions(w, input, dirX, { attack: a.t >= total - 2 })) return;
    } else if (a.t >= activeEnd && (this.has('art') || this.has('spell1') || this.has('spell2'))) {
      // skills may cancel recovery of any attack (combo → art)
      if (this.tryActions(w, input, dirX, { attack: false, jump: false, guard: false, dodge: false })) return;
    }
    this.physics(w, g);
    if (a.t >= total) {
      this.setState('free');
      if (this.onGround) this.vx *= 0.5;
    }
  }

  private horizontalAirDrift(dirX: number) {
    if (dirX !== 0) this.vx = approach(this.vx, dirX * RUN * 0.8, 0.12);
  }

  private onActiveStart(w: World, a: AtkState): void {
    const d = a.def;
    if (d.selfLaunch && (this.buffer.jump !== undefined || w.input.held('jump'))) {
      delete this.buffer.jump;
      this.vy = d.selfLaunch;
      this.onGround = false;
      this.jumpRising = false;
    }
    if (!this.onGround && d.kind === 'air') this.vy = Math.min(this.vy, -0.6);
    const proj = a.chargedFull && d.charge?.projectileAt ? d.charge.projectileAt : d.projectile;
    if (proj && !a.projDone) {
      a.projDone = true;
      w.spawnPlayerProjectiles(this, d, proj, a);
    }
    if (d.kind === 'art' && d.flurry) w.emit({ t: 'flash', color: '#fff', dur: 4, alpha: 0.15 });
    w.emit({ t: 'sfx', id: d.kind === 'heavy' || this.moveset.heavyWeapon || d.finisher ? 'swingHeavy' : 'swing', vol: 0.5, pitch: 0.9 + Math.random() * 0.25 });
  }

  /** Counter stances (Pendulum): returns true if the incoming hit was converted. */
  tryCounter(w: World): boolean {
    if (this.state !== 'attack' || !this.atk?.def.counter) return false;
    const a = this.atk;
    if (a.t < a.def.startup || a.t > a.def.startup + a.def.counter!.window) return false;
    const next = ATTACKS[a.def.counter!.attack];
    this.startAttack(w, next);
    this.atk!.t = 0;
    this.invuln = Math.max(this.invuln, 20);
    return true;
  }

  // ─────────────────────────────── cast / potion ───────────────────────────────
  private updateCast(w: World): void {
    const c = this.casting!;
    this.vx = approach(this.vx, 0, 0.5);
    if (!c.done && this.st >= c.spell.cast) {
      c.done = true;
      w.castSpell(this, c.spell);
      w.fireProcs('cast', {});
      this.consumeBuffs('spell');
    }
    this.physics(w, this.onGround ? 1 : 0.3);
    if (this.st >= c.spell.cast + 10) this.setState('free');
  }

  private updatePotion(w: World, dirX: number): void {
    this.horizontal(dirX, 0.3);
    if (this.st === 18) {
      const heal = this.derived.maxHp * (0.4 + this.stats.potionPower - 0.4 + 0.0);
      w.healPlayer(Math.max(1, heal));
      w.emit({ t: 'burst', x: this.x, y: this.cy, kind: 'ember', color: '#ffd27a', count: 14 });
    }
    this.physics(w, 1);
    if (this.st >= 28) this.setState('free');
  }

  // ─────────────────────────────── damage taken ───────────────────────────────
  hurt(w: World, dmg: number, kb: [number, number], dir: number): void {
    this.hp -= dmg;
    this.flash = 6;
    this.combo = 0;
    this.comboTimer = 0;
    const armored = this.state === 'attack' && this.atk?.def.armor && this.atk.t < this.atk.def.startup + this.atk.def.active;
    if (armored) {
      this.invuln = 12;
      return;
    }
    this.setState('hurt');
    this.hurtT = 18;
    this.vx = dir * Math.abs(kb[0]) * 0.8;
    this.vy = Math.min(-1.5, kb[1] * 0.8);
    this.onGround = false;
    this.invuln = 50;
  }

  noteHit(w: World): void {
    this.combo++;
    this.comboTimer = 150;
    if (this.combo > this.maxCombo) this.maxCombo = this.combo;
  }

  clampResources(): void {
    this.hp = clamp(this.hp, 0, this.derived.maxHp);
    this.mp = clamp(this.mp, 0, this.derived.maxMp);
  }
}
