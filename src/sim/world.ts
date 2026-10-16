import { Rng } from '../core/rng';
import type { InputSource } from '../core/input';
import { overlaps, union, clamp } from '../core/math';
import { TimeController } from '../core/time';
import { Tuning, type HitStopKind } from '../core/tuning';
import type { EnemyAttack } from '../data/enemies';
import type { AttackDef, Box, Element, ProcDef, ProjectileSpec, StatusType, Trigger, AttackKind, Sfx } from './types';
import { computeDamage, isAfflicted } from './damage';
import { Enemy, type SpawnOpts } from './enemy';
import type { SimEvent } from './events';
import type { Loadout } from './loadout';
import { Player, type AtkState } from './player';
import { Room } from './room';
import type { SpellDef } from '../data/spells';
import { Boss } from './boss';

export interface HitInfo {
  motion: number;
  kind: AttackKind;
  element: Element;
  scaling: 'atk' | 'magic' | 'hybrid';
  status?: { type: StatusType; amount: number };
  kb: [number, number];
  dir: number;
  launch?: boolean;
  spike?: boolean;
  poise: number;
  stun?: number;
  hitstop?: HitStopKind | null;
  hitstopMult?: number;
  forceCrit?: boolean;
  depth: number;
  finisher?: boolean;
  sfx?: Sfx;
  heavy?: boolean;
  airborne?: boolean;
  noCombo?: boolean;
}

export interface EnemyHit {
  power: number;
  kb: [number, number];
  dir: number;
  unblockable: boolean;
  status?: { type: StatusType; amount: number };
  element: Element;
  source: Enemy | null;
  projectile?: Projectile;
}

export interface Projectile {
  id: number;
  team: 'player' | 'enemy';
  spec: ProjectileSpec;
  x: number;
  y: number;
  px: number;
  py: number;
  vx: number;
  vy: number;
  w: number;
  h: number;
  t: number;
  life: number;
  delay: number;
  pierce: number;
  reg: Map<number, number>;
  info: HitInfo | null; // player projectiles
  power: number; // enemy projectiles
  dead: boolean;
  reflected?: boolean;
  owner?: Enemy;
}

export interface Hazard {
  x: number;
  y: number;
  r: number;
  t: number;
  delay: number;
  team: 'player' | 'enemy' | 'all';
  power: number;
  info?: HitInfo;
  element: Element;
  status?: { type: StatusType; amount: number };
  done: boolean;
  color: string;
  unblockable?: boolean;
}

export interface Blade {
  angle: number;
  t: number;
  dur: number;
  motion: number;
  reg: Map<number, number>;
  x: number;
  y: number;
}

export interface Pickup {
  uid: number;
  x: number;
  y: number;
  vy: number;
  kind: 'item' | 'heal' | 'relic' | 'gilt';
  color: string;
  label: string;
  t: number;
  taken: boolean;
  payload: unknown;
}

export interface WorldStats {
  dmgDealt: number;
  dmgTaken: number;
  kills: number;
  hits: number;
  parries: number;
  perfectDodges: number;
  crits: number;
  maxHit: number;
}

let PID = 1;

export class World {
  room: Room;
  rng: Rng;
  time: TimeController;
  events: SimEvent[] = [];
  player: Player;
  enemies: Enemy[] = [];
  projectiles: Projectile[] = [];
  hazards: Hazard[] = [];
  blades: Blade[] = [];
  pickups: Pickup[] = [];
  tick = 0;
  loadout: Loadout;
  input: InputSource;
  waves: { id: string; x: number; y: number; opts: SpawnOpts; boss?: boolean }[][] = [];
  waveDelay = 0;
  cleared = true;
  peaceful = false;
  exitOpen = false;
  depthTier = 1;
  procIcd = new Map<ProcDef, number>();
  procBudget = 0;
  comboProcCounters = new Map<ProcDef, number>();
  hitAccum: { kind: HitStopKind; mult: number; n: number } | null = null;
  stats: WorldStats = { dmgDealt: 0, dmgTaken: 0, kills: 0, hits: 0, parries: 0, perfectDodges: 0, crits: 0, maxHit: 0 };
  boss: Boss | null = null;
  difficulty = { enemyDmg: 1, aggression: 1 };
  /** analytics: per-enemy time-to-kill */
  ttk: { id: string; ticks: number }[] = [];
  private enemyBorn = new Map<number, number>();
  exitCooldown = 0;

  constructor(room: Room, loadout: Loadout, input: InputSource, seed: number, time?: TimeController) {
    this.room = room;
    this.loadout = loadout;
    this.input = input;
    this.rng = new Rng(seed);
    this.time = time ?? new TimeController();
    this.player = new Player(this, room.player.x, room.player.y);
  }

  emit(e: SimEvent): void {
    if (this.events.length < 600) this.events.push(e);
  }
  kbScale(): number {
    return Tuning.knockbackScale * (1 + (this.player.stats.knockbackPct ?? 0));
  }

  setLoadout(l: Loadout): void {
    this.loadout = l;
    this.player.applyLoadout(this);
    this.procIcd.clear();
    this.comboProcCounters.clear();
  }

  // ─────────────────────────────── spawning ───────────────────────────────
  spawnEnemy(id: string, x: number, y: number, opts: SpawnOpts = {}): Enemy {
    const e = new Enemy(id, x, y, opts);
    e.depthTier = this.depthTier;
    if (!e.def.flying) e.y = this.room.floorBelow(x, y - 4);
    this.enemies.push(e);
    this.enemyBorn.set(e.id, this.tick);
    if (!opts.noSpawnAnim) {
      this.emit({ t: 'burst', x: e.x, y: e.y - e.h / 2, kind: 'smoke', color: '#40304a', count: 10 });
      this.emit({ t: 'ring', x: e.x, y: e.y - e.h / 2, r: 18, color: '#b080ff', dur: 18 });
    }
    return e;
  }

  spawnBoss(id: string, x: number, y: number, opts: SpawnOpts = {}): Boss {
    const b = new Boss(id, x, y, opts);
    b.y = this.room.floorBelow(x, y - 4);
    this.enemies.push(b);
    this.enemyBorn.set(b.id, this.tick);
    this.boss = b;
    return b;
  }

  startWaves(waves: World['waves']): void {
    this.waves = waves;
    this.cleared = waves.length === 0;
    this.exitOpen = this.cleared;
    this.waveDelay = 30;
  }

  // ─────────────────────────────── main step ───────────────────────────────
  step(): void {
    this.tick++;
    this.procBudget = 40;
    this.hitAccum = null;
    const p = this.player;
    p.update(this, this.input);
    for (const e of this.enemies) e.update(this);
    this.updateProjectiles();
    this.updateHazards();
    this.updateBlades();
    this.updatePickups();
    this.enemies = this.enemies.filter((e) => !(e.state === 'dead' && e.deathT > 45));
    if (p.statsDirty) p.recompute();
    // waves & clear
    if (!this.cleared) {
      const alive = this.enemies.some((e) => e.alive && e.def.ai !== 'dummy');
      if (!alive) {
        if (this.waves.length) {
          if (--this.waveDelay <= 0) {
            const wave = this.waves.shift()!;
            for (const s of wave) {
              if (s.boss) this.spawnBoss(s.id, s.x, s.y, s.opts);
              else this.spawnEnemy(s.id, s.x, s.y, s.opts);
            }
            this.waveDelay = 50;
          }
        } else {
          this.cleared = true;
          this.exitOpen = true;
          this.emit({ t: 'cleared' });
          this.emit({ t: 'sfx', id: 'door' });
        }
      }
    }
    // exit
    if (this.exitCooldown > 0) this.exitCooldown--;
    if (this.exitOpen && !p.dead && this.exitCooldown <= 0) {
      for (const ex of this.room.exits) {
        if (Math.abs(p.x - ex.x) < 12 && Math.abs(p.y - ex.y) < 20) {
          this.emit({ t: 'exit' });
          this.exitCooldown = 60;
        }
      }
    }
    // consolidated hit stop for this tick
    const h = this.hitAccum as World['hitAccum'];
    if (h) {
      const multi = Math.min(Tuning.hitstop.multiTargetCap, 1 + Tuning.hitstop.multiTargetBonus * (h.n - 1));
      this.time.request(h.kind, h.mult * multi);
    }
  }

  private accumulateHitStop(kind: HitStopKind, mult: number): void {
    const prio = (k: HitStopKind) => Tuning.hitstop[k];
    if (!this.hitAccum) this.hitAccum = { kind, mult, n: 1 };
    else {
      this.hitAccum.n++;
      if (prio(kind) * mult > prio(this.hitAccum.kind) * this.hitAccum.mult) {
        this.hitAccum.kind = kind;
        this.hitAccum.mult = mult;
      }
    }
  }

  // ─────────────────────────────── player offense ───────────────────────────────
  playerPower(scaling: HitInfo['scaling']): number {
    const d = this.player.derived;
    if (scaling === 'magic') return d.magic;
    if (scaling === 'hybrid') return d.atk * 0.5 + d.magic * 0.65;
    return d.atk;
  }

  attackHitInfo(p: Player, d: AttackDef, a: AtkState | null, depth = 0): HitInfo {
    const chargeK = a && d.charge ? a.charge / d.charge.maxTicks : 0;
    const full = !!a?.chargedFull;
    const motion = d.charge ? d.motion + (d.charge.motionAt - d.motion) * chargeK : d.motion;
    return {
      motion,
      kind: d.kind === 'riposte' ? 'riposte' : !p.onGround && d.kind !== 'art' && d.kind !== 'heavy' ? 'air' : d.kind,
      element: d.element ?? 'phys',
      scaling: d.scaling ?? (p.moveset.cls === 'rod' ? 'hybrid' : 'atk'),
      status: d.status,
      kb: d.kb,
      dir: p.facing,
      launch: d.launch || (full && !!d.charge?.launchAt),
      spike: d.spike,
      poise: d.poise * (1 + chargeK),
      stun: d.stun,
      hitstop: full && d.charge?.chargedHitstop ? d.charge.chargedHitstop : d.hitstop,
      hitstopMult: (d.hitstopMult ?? 1) * (1 + chargeK * 0.3),
      forceCrit: d.kind === 'riposte',
      depth,
      finisher: d.finisher || full,
      sfx: d.sfx,
      heavy: d.kind === 'heavy' || d.kind === 'riposte' || !!p.moveset.heavyWeapon || full,
      airborne: !p.onGround,
    };
  }

  /** Resolve the active hitbox of the current player attack (swept between frames). */
  playerAttackHits(p: Player, a: AtkState, plunging: boolean): void {
    const d = a.def;
    if (!d.hitbox) return;
    let hb = d.hitbox;
    if (d.hitbox2) {
      const k = clamp((a.t - d.startup) / d.active, 0, 1);
      hb = {
        x: d.hitbox.x + (d.hitbox2.x - d.hitbox.x) * k, y: d.hitbox.y + (d.hitbox2.y - d.hitbox.y) * k,
        w: d.hitbox.w + (d.hitbox2.w - d.hitbox.w) * k, h: d.hitbox.h + (d.hitbox2.h - d.hitbox.h) * k,
      };
    }
    const cur = p.boxFor(hb);
    const box = a.prevBox ? union(a.prevBox, cur) : cur;
    a.prevBox = cur;
    if (Tuning.showHitboxes) this.emit({ t: 'line', x1: box.x, y1: box.y, x2: box.x + box.w, y2: box.y + box.h, color: '#f00' });
    const maxHits = d.hits ?? 1;
    const rehit = d.rehit ?? 999;
    for (const e of this.enemies) {
      if (!e.hurtable) continue;
      if (!overlaps(box, e.hurtBox())) continue;
      const r = a.reg.get(e.id);
      if (r && (r.n >= maxHits || this.tick - r.last < rehit)) continue;
      a.reg.set(e.id, { n: (r?.n ?? 0) + 1, last: this.tick });
      const info = this.attackHitInfo(p, d, a);
      if (d.flurry) info.hitstopMult = 0.4;
      const res = this.damageEnemy(e, info, p.x, p.cy);
      if (res) {
        a.hitConfirm = true;
        if (plunging && d.pogo) {
          // pogo: bounce off the target and regain air options
          p.vy = -6.6;
          p.airJumpsUsed = 0;
          p.airDodged = false;
          p.setState('free');
          p.jumpRising = false;
          return;
        }
        if (!p.onGround && (d.kind === 'air' || d.kind === 'light') && p.airHits < 6 && !plunging) {
          // aerial hit hover — keeps air combos alive, with a limit
          p.airHits++;
          p.vy = Math.min(p.vy, -0.4 - (p.airHits < 3 ? 1.2 : 0));
        }
      }
    }
    // reflect/parry enemy projectiles by striking them
    for (const pr of this.projectiles) {
      if (pr.team !== 'enemy' || pr.dead || pr.spec.ground) continue;
      if (overlaps(box, { x: pr.x - pr.w / 2, y: pr.y - pr.h / 2, w: pr.w, h: pr.h })) {
        pr.dead = true;
        this.emit({ t: 'burst', x: pr.x, y: pr.y, kind: 'spark', color: '#fff', count: 6 });
        this.emit({ t: 'sfx', id: 'clank', vol: 0.5 });
      }
    }
  }

  playerLanding(p: Player, d: AttackDef, landing: NonNullable<NonNullable<AttackDef['plunge']>['landing']>): void {
    const box = p.boxFor(landing.box);
    const info = this.attackHitInfo(p, d, null);
    info.motion = landing.motion;
    info.kb = [3, -4];
    info.launch = true;
    info.hitstop = 'heavy';
    for (const e of this.enemies) if (e.hurtable && overlaps(box, e.hurtBox())) this.damageEnemy(e, { ...info, dir: Math.sign(e.x - p.x) || p.facing }, p.x, p.y);
    if (landing.projectile) {
      const spec = landing.projectile;
      for (const dir of [1, -1]) this.spawnProjectile('player', spec, p.x + dir * 10, p.y - (spec.h / 2), dir * spec.speed, 0, this.projInfo(spec, d.kind === 'art' ? 'art' : 'heavy', dir, 0));
    }
  }

  projInfo(spec: ProjectileSpec, kind: AttackKind, dir: number, depth: number, scaling: HitInfo['scaling'] = 'atk'): HitInfo {
    return {
      motion: spec.motion, kind, element: spec.element ?? 'phys', scaling, status: spec.status, kb: [2.2, spec.launch ? -7 : -1.5], dir,
      launch: spec.launch, poise: 14, stun: 18, hitstop: kind === 'proc' ? null : spec.kind === 'wave' ? 'heavy' : 'magic', hitstopMult: 0.6, depth,
      sfx: spec.element === 'fire' ? 'fire' : spec.element === 'shock' ? 'shock' : spec.element === 'frost' ? 'frost' : 'magic',
    };
  }

  spawnPlayerProjectiles(p: Player, d: AttackDef, spec: ProjectileSpec, a: AtkState): void {
    const count = spec.count ?? 1;
    const scaling = d.scaling ?? (p.moveset.cls === 'rod' ? 'magic' : 'atk');
    const chargeK = a && d.charge ? a.charge / d.charge.maxTicks : 0;
    for (let i = 0; i < count; i++) {
      const spread = count > 1 ? ((i - (count - 1) / 2) * (spec.spread ?? 0.15)) : 0;
      const ang = (spec.angle ?? 0) + spread;
      const ox = (spec.offset?.[0] ?? 12) * p.facing;
      const oy = spec.offset?.[1] ?? -12;
      const kind: AttackKind = d.kind === 'art' ? 'art' : d.kind === 'riposte' ? 'riposte' : d.kind === 'heavy' ? 'heavy' : 'light';
      const info = this.projInfo(spec, kind, p.facing, 0, scaling);
      if (d.charge) info.motion = spec.motion * (1 + chargeK * (d.charge.motionAt / d.motion - 1));
      let x = p.x + ox;
      if (spec.kind === 'star') x = p.x + p.facing * (20 + i * 26) + (spec.offset?.[0] ?? 0) * p.facing;
      const vx = Math.cos(ang) * spec.speed * p.facing;
      const vy = Math.sin(ang) * spec.speed;
      const pr = this.spawnProjectile('player', spec, x, p.y + oy, vx, vy, info);
      pr.delay = (spec.delay ?? 0) * i;
      if (spec.kind === 'orb' && chargeK > 0) {
        pr.w *= 1 + chargeK;
        pr.h *= 1 + chargeK;
      }
      if (spec.ground) {
        pr.y = this.room.floorBelow(pr.x, p.y - 4) - pr.h / 2;
        if (count === 2) pr.vx = (i === 0 ? 1 : -1) * spec.speed;
      }
    }
  }

  spawnProjectile(team: 'player' | 'enemy', spec: ProjectileSpec, x: number, y: number, vx: number, vy: number, info: HitInfo | null, power = 0): Projectile {
    const pr: Projectile = {
      id: PID++, team, spec, x, y, px: x, py: y, vx, vy, w: spec.w, h: spec.h, t: 0, life: spec.life, delay: 0,
      pierce: spec.pierce ?? 1, reg: new Map(), info, power, dead: false,
    };
    this.projectiles.push(pr);
    return pr;
  }

  spawnEnemyProjectile(e: Enemy, spec: ProjectileSpec, x: number, y: number, vx: number, vy: number): void {
    const pr = this.spawnProjectile('enemy', spec, x, y, vx, vy, null, e.atk * spec.motion);
    pr.owner = e;
    if (spec.ground) pr.y = this.room.floorBelow(x, e.y - 4) - pr.h / 2;
  }

  /**
   * Central damage application for anything the player side does to an enemy:
   * melee, projectiles, procs, DoT. Handles guards, status, reactions, procs, feedback.
   */
  damageEnemy(e: Enemy, info: HitInfo, sx: number, sy: number): ReturnType<typeof computeDamage> | null {
    if (!e.hurtable) return null;
    const p = this.player;
    const fromFront = Math.sign(sx - e.x) === e.facing || Math.abs(sx - e.x) < 2;
    // frontal guards (Husk Knight shield, Duelist guard)
    const guardKinds = info.kind === 'light' || info.kind === 'air' || info.kind === 'proc';
    let guarded = false;
    if (info.depth === 0 && e.duelistGuardCheck(this, info.kind, fromFront)) guarded = true;
    if (e.state === 'guard' && fromFront) guarded = true;
    if (!guarded && e.def.frontGuard && fromFront && guardKinds && e.state !== 'stagger' && e.state !== 'windup' && e.state !== 'active' && e.status.frozen <= 0) guarded = true;
    const res = computeDamage({
      power: this.playerPower(info.scaling), motion: info.motion, kind: info.kind, element: info.element, stats: p.stats,
      critChance: p.derived.critChance, critMult: p.derived.critMult, forceCrit: info.forceCrit, defense: e.defense, resist: e.def.resist,
      targetAfflicted: isAfflicted(e.status), targetStaggered: e.staggered, targetFrozen: e.status.frozen > 0, targetShocked: e.status.shock > 0,
      attackerLowHp: p.hp < p.derived.maxHp * 0.5, combo: p.combo,
    }, this.rng);
    let dmg = res.total;
    if (guarded) {
      dmg = Math.max(1, Math.round(dmg * 0.15));
      res.crit = false;
    }
    if (e.barrier > 0) dmg = Math.round(dmg * 0.5);
    if (e.ward) dmg = Math.round(dmg * 0.6);
    if (e.isBoss) dmg = (e as Boss).modifyDamage(dmg);
    e.hp -= dmg;
    e.lastHitTick = this.tick;
    e.flash = 5;
    e.shakeT = 1;
    this.stats.dmgDealt += dmg;
    if (dmg > this.stats.maxHit) this.stats.maxHit = dmg;
    if (res.crit) this.stats.crits++;
    const dir = info.dir || Math.sign(e.x - sx) || 1;

    // feedback
    this.emit({ t: 'num', x: e.x + (this.rng.next() - 0.5) * 8, y: e.y - e.h - 4, value: dmg, crit: res.crit, element: res.element });
    if (guarded) {
      this.emit({ t: 'hit', x: e.x - e.facing * -e.w / 2, y: e.cy, element: 'phys', crit: false, heavy: false, dir, blocked: true, power: 0.3 });
      this.emit({ t: 'sfx', id: 'clank', vol: 0.7 });
      if (info.depth === 0) {
        this.accumulateHitStop('light', 0.8);
        if (!info.heavy) p.vx = -dir * 2.2; // recoil
      }
      e.poiseDmg += info.poise * (info.heavy ? 1.6 : 0.5);
      if (e.poiseDmg >= e.poiseMax) e.react(this, dir, info.kb, 0, info.stun ?? 20, false, false, true);
    } else {
      const heavyHit = !!info.heavy || info.kind === 'heavy';
      const power = Math.min(1, dmg / Math.max(1, e.maxHp) * 4) + (res.crit ? 0.4 : 0) + (heavyHit ? 0.3 : 0);
      this.emit({ t: 'hit', x: e.x - (dir * e.w) / 4, y: e.cy, element: res.element, crit: res.crit, heavy: heavyHit, dir, power });
      if (info.sfx && info.depth === 0) this.emit({ t: 'sfx', id: info.sfx, vol: heavyHit ? 0.9 : 0.6, pitch: res.crit ? 1.15 : 1 });
      else if (info.depth > 0) this.emit({ t: 'sfx', id: info.sfx ?? (res.element === 'phys' ? 'slash' : res.element), vol: 0.35, pitch: 1.2 });
      const poise = info.poise * (1 + p.stats.poiseDmg) * (res.crit ? 1.3 : 1);
      const stun = info.stun ?? (info.kind === 'heavy' ? 24 : 16);
      const reaction = e.react(this, dir, info.kb, poise, stun, !!info.launch, !!info.spike, heavyHit);
      // hit stop (direct hits only; procs stay snappy)
      if (info.hitstop && info.depth === 0) {
        let kind = info.hitstop;
        let mult = info.hitstopMult ?? 1;
        if (res.crit && Tuning.hitstop.crit * 1 > Tuning.hitstop[kind] * mult) {
          kind = 'crit';
          mult = info.kind === 'light' || info.kind === 'air' ? 0.8 : 1;
        }
        if (reaction === 'stagger') {
          kind = 'guardBreak';
          mult = 1;
        }
        this.accumulateHitStop(kind, mult);
      } else if (info.depth > 0 && (info.kind === 'proc') && dmg > e.maxHp * 0.25) this.accumulateHitStop('magic', 0.5);
      if (reaction === 'stagger') {
        this.emit({ t: 'shake', amt: 4, dur: 10 });
        this.emit({ t: 'rumble', strong: 0.6, weak: 0.4, dur: 120 });
      }
      if (heavyHit && info.depth === 0) {
        this.emit({ t: 'rumble', strong: 0.35, weak: 0.25, dur: 80 });
      }
      // status buildup
      const sp = 1 + p.stats.statusPower;
      if (info.status) this.applyStatus(e, info.status.type, info.status.amount * sp * (info.status.type === 'bleed' ? 1 + p.stats.bleedPower : 1));
      if (res.parts.fire > 0 && info.element !== 'fire') this.applyStatus(e, 'burn', (res.parts.fire / Math.max(1, res.total)) * 30 * sp);
      if (res.parts.shock > 0 && info.element !== 'shock') this.applyStatus(e, 'shock', (res.parts.shock / Math.max(1, res.total)) * 30 * sp);
      if (res.parts.frost > 0 && info.element !== 'frost') this.applyStatus(e, 'frost', (res.parts.frost / Math.max(1, res.total)) * 30 * sp);
    }

    // resources
    if (info.depth === 0 && !info.noCombo) {
      p.noteHit(this);
      this.stats.hits++;
      const mpGain = (p.moveset.cls === 'rod' ? 2.2 : 1.2) + p.stats.mpOnHit;
      p.mp = Math.min(p.derived.maxMp, p.mp + mpGain);
      this.emit({ t: 'mastery', kind: 'hit', amount: 1 });
    }
    if (p.stats.lifesteal > 0) this.healPlayer(dmg * p.stats.lifesteal * (info.depth > 0 ? 0.5 : 1), true);
    if (p.stats.thorns > 0 && info.depth === 0) {
      /* thorns only on being hit */
    }

    // procs
    const ctx = { target: e, depth: info.depth };
    const wasAfflicted = isAfflicted(e.status);
    if (!guarded && info.depth === 0) {
      this.fireProcs('hit', ctx);
      if (res.crit) this.fireProcs('crit', ctx);
      if (info.heavy || info.kind === 'heavy') this.fireProcs('heavyHit', ctx);
      if (info.airborne || info.kind === 'air') this.fireProcs('airHit', ctx);
      if (info.finisher) this.fireProcs('finisher', ctx);
      if (info.kind === 'riposte') this.fireProcs('riposte', ctx);
      this.comboProcs(ctx);
    } else if (!guarded && info.depth === 1 && res.crit) {
      this.fireProcs('crit', { target: e, depth: 2 });
    }
    if (e.hp <= 0) this.killEnemy(e, { depth: info.depth, wasAfflicted });
    return res;
  }

  applyStatus(e: Enemy, type: StatusType, amount: number): void {
    if (amount <= 0 || !e.alive) return;
    const triggered = e.addBuildup(this, type, amount, this.playerPower('hybrid') * (1 + (type === 'burn' ? this.player.stats.firePct : type === 'shock' ? this.player.stats.shockPct : type === 'frost' ? this.player.stats.frostPct : 0)));
    if (triggered) this.fireProcs('statusApplied', { target: e, depth: 1 });
  }

  /** Damage over time / status bursts (no hit stop, no procs except kill). */
  dotDamage(e: Enemy, amount: number, element: Element, big = false): void {
    if (!e.alive) return;
    const dmg = Math.max(1, Math.round(amount * (e.ward ? 0.6 : 1) * (e.isBoss ? (e as Boss).dotMult() : 1)));
    e.hp -= dmg;
    e.flash = 2;
    this.stats.dmgDealt += dmg;
    this.emit({ t: 'num', x: e.x + (this.rng.next() - 0.5) * 10, y: e.y - e.h, value: dmg, crit: big, element });
    if (e.hp <= 0) this.killEnemy(e, { depth: 1, wasAfflicted: true });
  }

  envDamageEnemy(e: Enemy, pct: number): void {
    this.dotDamage(e, e.maxHp * pct, 'phys');
  }

  killEnemy(e: Enemy, ctx: { depth: number; wasAfflicted: boolean } | null): void {
    if (e.state === 'dead') return;
    const st = { ...e.status };
    e.hp = 0;
    e.setState('dead');
    e.attack = null;
    e.deathT = 0;
    e.vy = -2.5;
    const p = this.player;
    this.stats.kills++;
    const born = this.enemyBorn.get(e.id);
    if (born !== undefined) this.ttk.push({ id: e.def.id, ticks: this.tick - born });
    const isBoss = e.isBoss;
    this.emit({ t: 'kill', x: e.x, y: e.y, enemyId: isBoss ? (e as Boss).bossDef.id : e.def.id, elite: e.elite.length > 0, boss: isBoss, xp: isBoss ? (e as Boss).bossDef.xp : e.def.xp * (e.elite.length ? 3 : 1), gilt: isBoss ? (e as Boss).bossDef.gilt : e.def.gilt * (e.elite.length ? 3 : 1), depthTier: this.depthTier });
    this.emit({ t: 'burst', x: e.x, y: e.cy, kind: 'ember', color: e.def.accent, count: 18 });
    this.emit({ t: 'burst', x: e.x, y: e.cy, kind: 'smoke', color: '#302838', count: 10 });
    this.emit({ t: 'sfx', id: 'kill', vol: 0.7 });
    this.emit({ t: 'mastery', kind: 'kill', amount: e.elite.length ? 15 : 5 });
    if (e.def.ai !== 'tick') this.accumulateHitStop('kill', 1);
    if (p.stats.lifeOnKill > 0) this.healPlayer(p.stats.lifeOnKill);
    if (e.elite.includes('volatile')) this.hazards.push({ x: e.x, y: e.cy, r: 44, t: 0, delay: 40, team: 'all', power: e.atk * 1.5, element: 'fire', done: false, color: '#ff8030', status: { type: 'burn', amount: 50 } });
    if (e.def.ai === 'tick' && e.attack === null && e.st > 0) {
      /* killed before bursting: fizzles */
    }
    // last enemy → dramatic slow-mo
    const remaining = this.enemies.some((x) => x.alive && x.def.ai !== 'dummy');
    if (!remaining && this.waves.length === 0 && !this.peaceful) {
      this.time.slowMo(0.35, 380);
      this.emit({ t: 'shake', amt: 3, dur: 12 });
    }
    if (isBoss) {
      this.time.slowMo(0.25, 1200);
      this.emit({ t: 'flash', color: '#fff', dur: 20, alpha: 0.7 });
      this.emit({ t: 'shake', amt: 8, dur: 40 });
      this.emit({ t: 'bossDefeated', id: (e as Boss).bossDef.id });
      for (const o of this.enemies) if (o !== e && o.alive) this.killEnemy(o, null);
      this.projectiles = this.projectiles.filter((x) => x.team === 'player');
    }
    if (ctx && ctx.depth <= 2) {
      const fake = { target: e, depth: ctx.depth, deadStatus: st, wasAfflicted: ctx.wasAfflicted };
      this.fireProcs('kill', fake);
    }
  }

  // ─────────────────────────────── enemy offense ───────────────────────────────
  /** Apply an enemy attack to the player. Resolves i-frames, counters, parries, guards. */
  hurtPlayer(h: EnemyHit): 'hit' | 'blocked' | 'parried' | 'dodged' | 'countered' | 'immune' {
    const p = this.player;
    if (p.dead) return 'immune';
    if (p.iframes > 0 && p.state === 'dodge') {
      if (!p.perfectUsed && p.st <= 10) {
        p.perfectUsed = true;
        this.stats.perfectDodges++;
        this.emit({ t: 'perfectDodge' });
        this.emit({ t: 'text', x: p.x, y: p.y - 34, text: 'PERFECT', color: '#9ff', big: false });
        this.emit({ t: 'sfx', id: 'dodge', pitch: 1.6 });
        this.time.slowMo(0.4, 260);
        p.mp = Math.min(p.derived.maxMp, p.mp + 8);
        this.fireProcs('perfectDodge', { depth: 0 });
      }
      return 'dodged';
    }
    if (p.invuln > 0 || p.iframes > 0) return 'immune';
    if (p.tryCounter(this)) {
      this.emit({ t: 'text', x: p.x, y: p.y - 34, text: 'COUNTER!', color: '#ffd23c', big: true });
      this.emit({ t: 'sfx', id: 'parry' });
      this.emit({ t: 'flash', color: '#fff6c0', dur: 5, alpha: 0.35 });
      this.time.request('parry', 0.8);
      p.mp = Math.min(p.derived.maxMp, p.mp + 10);
      if (h.source && !h.source.isBoss) h.source.react(this, -h.dir, [2, -1], 999, 60, false, false, true);
      else if (h.source) h.source.poiseDmg += h.source.poiseMax * 0.3;
      if (h.projectile) h.projectile.dead = true;
      this.fireProcs('parry', { depth: 0, target: h.source ?? undefined });
      this.emit({ t: 'mastery', kind: 'guard', amount: 6 });
      return 'countered';
    }
    const facingSrc = h.source ? Math.sign(h.source.x - p.x) === p.facing || Math.abs(h.source.x - p.x) < 4 : true;
    if (p.guarding && !h.unblockable && (facingSrc || h.projectile)) {
      if (p.parryT > 0) {
        // PARRY
        p.parryT = 0;
        p.parryLockout = 0;
        p.riposte = 70;
        this.stats.parries++;
        this.time.request('parry');
        this.emit({ t: 'parry' });
        this.emit({ t: 'text', x: p.x + p.facing * 10, y: p.y - 34, text: 'PARRY!', color: '#fff2a0', big: true });
        this.emit({ t: 'sfx', id: 'parry' });
        this.emit({ t: 'flash', color: '#fff6c0', dur: 5, alpha: 0.4 });
        this.emit({ t: 'burst', x: p.x + p.facing * 8, y: p.cy, kind: 'spark', color: '#fff2a0', count: 18 });
        this.emit({ t: 'shake', amt: 3, dur: 8 });
        this.emit({ t: 'rumble', strong: 0.8, weak: 0.5, dur: 120 });
        p.mp = Math.min(p.derived.maxMp, p.mp + 10);
        if (h.projectile) {
          // reflect it back
          const pr = h.projectile;
          pr.team = 'player';
          pr.reflected = true;
          pr.vx = -pr.vx * 1.4;
          pr.vy = -Math.abs(pr.vy) * 0.3;
          pr.info = this.projInfo(pr.spec, 'riposte', p.facing, 0);
          pr.info.motion = 2.5;
          pr.info.forceCrit = true;
          pr.reg.clear();
          pr.life = 90;
          pr.t = 0;
        } else if (h.source) {
          const src = h.source;
          if (src.isBoss) (src as Boss).onParried(this);
          else {
            src.poiseDmg = src.poiseMax; // guaranteed stagger
            src.react(this, -h.dir, [2.5, -1], 0, 60, false, false, true);
          }
        }
        this.fireProcs('parry', { depth: 0, target: h.source ?? undefined });
        this.emit({ t: 'mastery', kind: 'guard', amount: 8 });
        return 'parried';
      }
      // BLOCK
      const guardPct = clamp((p.shield?.guardPct ?? p.stats.guardPct) + (p.shield ? p.stats.guardPct - 0.55 : 0), 0.2, 0.95);
      const dmg = Math.max(1, Math.round(this.playerDamage(h.power) * (1 - guardPct)));
      this.applyPlayerDamage(dmg, h.element, true);
      p.vx = h.dir * 2.2;
      this.time.request('light', 0.7);
      this.emit({ t: 'hit', x: p.x + p.facing * 6, y: p.cy, element: 'phys', crit: false, heavy: false, dir: h.dir, onPlayer: true, blocked: true, power: 0.4 });
      this.emit({ t: 'sfx', id: 'block' });
      this.fireProcs('block', { depth: 0, target: h.source ?? undefined });
      if (p.stats.thorns > 0 && h.source) this.retaliate(h.source, p.stats.thorns);
      this.emit({ t: 'mastery', kind: 'guard', amount: 2 });
      if (h.projectile) h.projectile.dead = true;
      if (p.hp <= 0) this.playerDied();
      return 'blocked';
    }
    // HIT
    let dmg = this.playerDamage(h.power);
    if (p.barrier > 0) {
      const absorbed = Math.min(p.barrier, dmg);
      p.barrier -= absorbed;
      dmg -= absorbed;
      this.emit({ t: 'burst', x: p.x, y: p.cy, kind: 'shard', color: '#8fe0ff', count: 8 });
      if (h.source) h.source.addBuildup(this, 'frost', 35, 1);
    }
    if (dmg > 0) {
      this.applyPlayerDamage(dmg, h.element, false);
      p.hurt(this, 0, h.kb, h.dir);
    } else p.invuln = 20;
    this.time.request('hurt');
    this.emit({ t: 'hit', x: p.x, y: p.cy, element: h.element, crit: false, heavy: true, dir: h.dir, onPlayer: true, power: 0.7 });
    this.emit({ t: 'sfx', id: 'hurt' });
    this.emit({ t: 'shake', amt: 4, dur: 10 });
    this.emit({ t: 'flash', color: '#ff2020', dur: 6, alpha: 0.18 });
    this.emit({ t: 'rumble', strong: 0.9, weak: 0.6, dur: 160 });
    if (h.status && h.status.type === 'burn') p.addBuff({ id: 'burning', name: 'Burning', stats: {}, dur: 1, maxStacks: 1 });
    if (h.status?.type === 'frost') p.addBuff({ id: 'chilled', name: 'Chilled', stats: { moveSpeed: -0.25, atkSpeed: -0.15 }, dur: 150, maxStacks: 1 });
    this.fireProcs('hurt', { depth: 0, target: h.source ?? undefined });
    if (p.stats.thorns > 0 && h.source) this.retaliate(h.source, p.stats.thorns);
    if (h.projectile && h.projectile.pierce <= 1) h.projectile.dead = true;
    if (p.hp <= 0) this.playerDied();
    return 'hit';
  }

  playerDamage(power: number): number {
    const p = this.player;
    const res = computeDamage({ power, motion: 1, kind: 'enemy', element: 'phys', stats: null, critChance: 0, critMult: 1, canCrit: false, defense: p.derived.def, targetDmgTaken: p.stats.dmgTaken }, this.rng);
    return Math.max(1, Math.round(res.total * this.difficulty.enemyDmg));
  }

  private applyPlayerDamage(dmg: number, element: Element, blocked: boolean): void {
    const p = this.player;
    p.hp -= dmg;
    p.flash = 6;
    this.stats.dmgTaken += dmg;
    this.emit({ t: 'num', x: p.x, y: p.y - p.h - 4, value: dmg, crit: false, element, onPlayer: true });
    if (!blocked) {
      p.combo = 0;
      p.comboTimer = 0;
    }
  }

  private retaliate(e: Enemy, mult: number): void {
    const info: HitInfo = { motion: mult, kind: 'proc', element: 'phys', scaling: 'atk', kb: [1, -0.5], dir: Math.sign(e.x - this.player.x) || 1, poise: 5, depth: 1, hitstop: null };
    this.damageEnemy(e, info, this.player.x, this.player.cy);
  }

  spikePlayer(): void {
    const p = this.player;
    if (p.invuln > 0 || p.iframes > 0) return;
    const dmg = Math.max(1, Math.round(p.derived.maxHp * 0.12));
    this.applyPlayerDamage(dmg, 'phys', false);
    p.hurt(this, 0, [0, -6], -p.facing);
    p.vy = -6.5;
    this.emit({ t: 'sfx', id: 'hurt' });
    this.emit({ t: 'shake', amt: 3, dur: 8 });
    if (p.hp <= 0) this.playerDied();
  }

  healPlayer(amount: number, quiet = false): void {
    const p = this.player;
    if (p.dead || amount <= 0) return;
    const before = p.hp;
    p.hp = Math.min(p.derived.maxHp, p.hp + amount);
    const healed = p.hp - before;
    if (!quiet && healed >= 1) this.emit({ t: 'num', x: p.x, y: p.y - p.h - 6, value: Math.round(healed), crit: false, element: 'phys', heal: true });
  }

  playerDied(): void {
    const p = this.player;
    if (p.dead) return;
    p.dead = true;
    p.hp = 0;
    p.setState('dead');
    p.state = 'dead';
    this.time.slowMo(0.3, 900);
    this.emit({ t: 'sfx', id: 'death' });
    this.emit({ t: 'flash', color: '#000', dur: 30, alpha: 0.5 });
    this.emit({ t: 'shake', amt: 6, dur: 20 });
    this.emit({ t: 'playerDead' });
  }

  // ─────────────────────────────── projectiles ───────────────────────────────
  private updateProjectiles(): void {
    const p = this.player;
    for (const pr of this.projectiles) {
      if (pr.dead) continue;
      pr.px = pr.x;
      pr.py = pr.y;
      if (pr.delay > 0) {
        pr.delay--;
        pr.px = pr.x;
        continue;
      }
      pr.t++;
      const s = pr.spec;
      if (s.homing || (pr.team === 'player' && s.kind === 'blade')) {
        const k = s.homing ?? 0.15;
        let tx: number | null = null;
        let ty = 0;
        if (pr.team === 'player') {
          let best = 1e9;
          for (const e of this.enemies) {
            if (!e.hurtable || pr.reg.has(e.id)) continue;
            const d = (e.x - pr.x) ** 2 + (e.cy - pr.y) ** 2;
            if (d < best) {
              best = d;
              tx = e.x;
              ty = e.cy;
            }
          }
        } else {
          tx = p.x;
          ty = p.cy;
        }
        if (tx !== null && pr.t > 6) {
          const sp = Math.hypot(pr.vx, pr.vy) || s.speed;
          const ang = Math.atan2(ty - pr.y, tx - pr.x);
          const cur = Math.atan2(pr.vy, pr.vx);
          let dA = ang - cur;
          while (dA > Math.PI) dA -= Math.PI * 2;
          while (dA < -Math.PI) dA += Math.PI * 2;
          const na = cur + clamp(dA, -k * 2, k * 2);
          pr.vx = Math.cos(na) * sp;
          pr.vy = Math.sin(na) * sp;
        }
      }
      if (s.gravity) pr.vy += s.gravity;
      pr.x += pr.vx;
      pr.y += pr.vy;
      if (s.ground) {
        const fy = this.room.floorBelow(pr.x, pr.y);
        pr.y = fy - pr.h / 2;
        if (this.room.solidAt(pr.x + Math.sign(pr.vx) * pr.w / 2, pr.y)) pr.dead = true;
        else if (!this.room.groundBelow(pr.x, pr.y + pr.h / 2)) pr.dead = true;
      } else if (this.room.solidAt(pr.x, pr.y) && s.kind !== 'pillar') {
        this.projectileExpire(pr);
        continue;
      }
      if (pr.t >= pr.life) {
        this.projectileExpire(pr);
        continue;
      }
      const box: Box = { x: pr.x - pr.w / 2, y: pr.y - pr.h / 2, w: pr.w, h: pr.h };
      if (pr.team === 'player') {
        for (const e of this.enemies) {
          if (!e.hurtable || pr.dead) continue;
          if (!overlaps(box, e.hurtBox())) continue;
          const last = pr.reg.get(e.id);
          if (last !== undefined && (s.rehit === undefined || this.tick - last < s.rehit)) continue;
          pr.reg.set(e.id, this.tick);
          const info = { ...pr.info!, dir: Math.sign(pr.vx) || 1 };
          this.damageEnemy(e, info, pr.x - Math.sign(pr.vx) * 10, pr.y);
          if (s.explode && s.kind !== 'orb') {
            this.projectileExpire(pr);
            break;
          }
          if (--pr.pierce <= 0) {
            this.projectileExpire(pr);
            break;
          }
        }
      } else if (p.overlapsHurt(box)) {
        const res = this.hurtPlayer({ power: pr.power, kb: [2.5, -2], dir: Math.sign(pr.vx) || 1, unblockable: false, status: s.status, element: s.element ?? 'phys', source: pr.owner ?? null, projectile: pr });
        if (res === 'hit' || res === 'blocked') {
          if (s.explode) this.projectileExpire(pr);
          else if (!s.ground) pr.dead = true;
        }
      }
    }
    this.projectiles = this.projectiles.filter((x) => !x.dead);
  }

  private projectileExpire(pr: Projectile): void {
    if (pr.dead) return;
    pr.dead = true;
    const s = pr.spec;
    if (s.explode) {
      if (pr.team === 'player') {
        const info = { ...pr.info!, motion: s.explode.motion * (pr.info!.motion / s.motion), hitstop: 'magic' as HitStopKind, depth: pr.info!.depth };
        this.explodeAt(pr.x, pr.y, s.explode.radius, info, s.element ?? 'phys');
      } else {
        this.hazards.push({ x: pr.x, y: pr.y, r: s.explode.radius, t: 0, delay: 0, team: 'enemy', power: pr.power * s.explode.motion, element: s.element ?? 'phys', done: false, color: '#c8ff60', status: s.status });
      }
    } else {
      this.emit({ t: 'burst', x: pr.x, y: pr.y, kind: 'spark', color: elemColor(s.element ?? 'phys'), count: 4 });
    }
  }

  /** Player-side AoE explosion. */
  explodeAt(x: number, y: number, r: number, info: HitInfo, element: Element): void {
    this.emit({ t: 'ring', x, y, r, color: elemColor(element), dur: 16 });
    this.emit({ t: 'burst', x, y, kind: element === 'phys' ? 'spark' : 'ember', color: elemColor(element), count: 12, r });
    this.emit({ t: 'sfx', id: 'explode', vol: 0.5 });
    for (const e of this.enemies) {
      if (!e.hurtable) continue;
      const hb = e.hurtBox();
      const cx = clamp(x, hb.x, hb.x + hb.w);
      const cy = clamp(y, hb.y, hb.y + hb.h);
      if ((cx - x) ** 2 + (cy - y) ** 2 <= r * r) this.damageEnemy(e, { ...info, dir: Math.sign(e.x - x) || 1 }, x, y);
    }
  }

  private updateHazards(): void {
    const p = this.player;
    for (const hz of this.hazards) {
      if (hz.done) continue;
      hz.t++;
      if (hz.t < hz.delay) continue;
      hz.done = true;
      this.emit({ t: 'ring', x: hz.x, y: hz.y, r: hz.r, color: hz.color, dur: 16 });
      this.emit({ t: 'burst', x: hz.x, y: hz.y, kind: 'ember', color: hz.color, count: 16, r: hz.r });
      this.emit({ t: 'sfx', id: 'explode' });
      this.emit({ t: 'shake', amt: 3, dur: 8 });
      if (hz.team !== 'player') {
        const hb = p.hurtBox();
        const cx = clamp(hz.x, hb.x, hb.x + hb.w);
        const cy = clamp(hz.y, hb.y, hb.y + hb.h);
        if ((cx - hz.x) ** 2 + (cy - hz.y) ** 2 <= hz.r * hz.r) this.hurtPlayer({ power: hz.power, kb: [4, -4], dir: Math.sign(p.x - hz.x) || 1, unblockable: hz.team === 'all' || !!hz.unblockable, status: hz.status, element: hz.element, source: null });
      }
      if (hz.team === 'all') {
        // friendly fire from volatile foes / ember ticks
        for (const e of this.enemies) {
          if (!e.hurtable) continue;
          if ((e.x - hz.x) ** 2 + (e.cy - hz.y) ** 2 <= hz.r * hz.r) {
            const info: HitInfo = { motion: 3, kind: 'proc', element: 'fire', scaling: 'atk', kb: [3, -4], dir: Math.sign(e.x - hz.x) || 1, poise: 30, depth: 1, hitstop: null, status: hz.status, launch: true };
            e.hp -= Math.round(hz.power * 3);
            e.flash = 4;
            this.emit({ t: 'num', x: e.x, y: e.y - e.h, value: Math.round(hz.power * 3), crit: false, element: 'fire' });
            e.react(this, info.dir, info.kb, 20, 20, true, false, true);
            if (e.hp <= 0) this.killEnemy(e, { depth: 1, wasAfflicted: true });
          }
        }
      }
    }
    this.hazards = this.hazards.filter((h) => !h.done);
  }

  private updateBlades(): void {
    const p = this.player;
    for (const b of this.blades) {
      b.t++;
      b.angle += 0.09;
    }
    this.blades = this.blades.filter((b) => b.t < b.dur);
    const n = this.blades.length;
    this.blades.forEach((b, i) => {
      const a = b.angle + (i / Math.max(1, n)) * Math.PI * 2;
      b.x = p.x + Math.cos(a) * 26;
      b.y = p.cy + Math.sin(a) * 18;
      const box: Box = { x: b.x - 6, y: b.y - 6, w: 12, h: 12 };
      for (const e of this.enemies) {
        if (!e.hurtable || !overlaps(box, e.hurtBox())) continue;
        const last = b.reg.get(e.id);
        if (last !== undefined && this.tick - last < 20) continue;
        b.reg.set(e.id, this.tick);
        this.damageEnemy(e, { motion: b.motion, kind: 'proc', element: 'phys', scaling: 'hybrid', kb: [1.2, -1], dir: Math.sign(e.x - p.x) || 1, poise: 6, depth: 1, hitstop: null, sfx: 'slash' }, b.x, b.y);
      }
    });
  }

  private updatePickups(): void {
    const p = this.player;
    for (const pk of this.pickups) {
      if (pk.taken) continue;
      pk.t++;
      pk.vy = Math.min(4, pk.vy + 0.2);
      pk.y += pk.vy;
      const fy = this.room.floorBelow(pk.x, pk.y - 8);
      if (pk.y > fy) {
        pk.y = fy;
        pk.vy = 0;
      }
      if (pk.t > 30 && Math.abs(p.x - pk.x) < 14 && Math.abs(p.cy - (pk.y - 6)) < 20) {
        pk.taken = true;
        this.emit({ t: 'pickup', uid: pk.uid });
        this.emit({ t: 'sfx', id: 'pickup' });
      }
    }
    this.pickups = this.pickups.filter((x) => !x.taken);
  }

  dropPickup(pk: Omit<Pickup, 't' | 'taken' | 'vy'>): void {
    this.pickups.push({ ...pk, t: 0, taken: false, vy: -4 });
  }

  // ─────────────────────────────── procs ───────────────────────────────
  fireProcs(trigger: Trigger, ctx: { target?: Enemy; depth?: number; deadStatus?: Enemy['status']; wasAfflicted?: boolean }): void {
    const p = this.player;
    for (const proc of this.loadout.procs) {
      if (proc.trigger !== trigger) continue;
      if (this.procBudget <= 0) return;
      if (proc.icd) {
        const last = this.procIcd.get(proc) ?? -9999;
        if (this.tick - last < proc.icd) continue;
      }
      if (proc.cond && !this.checkCond(proc.cond, ctx)) continue;
      if (proc.chance !== undefined && this.rng.next() >= proc.chance) continue;
      if (proc.icd) this.procIcd.set(proc, this.tick);
      this.procBudget--;
      this.runProc(proc, ctx);
    }
    void p;
  }

  private comboProcs(ctx: { target?: Enemy; depth?: number }): void {
    const combo = this.player.combo;
    for (const proc of this.loadout.procs) {
      if (proc.trigger !== 'combo' || !proc.every) continue;
      if (combo > 0 && combo % proc.every === 0) {
        if (this.procBudget-- <= 0) return;
        this.runProc(proc, ctx);
        this.emit({ t: 'text', x: this.player.x, y: this.player.y - 40, text: `${combo} HITS`, color: '#ffd23c' });
      }
    }
  }

  private checkCond(cond: NonNullable<ProcDef['cond']>, ctx: { target?: Enemy; deadStatus?: Enemy['status']; wasAfflicted?: boolean }): boolean {
    const p = this.player;
    const st = ctx.deadStatus ?? ctx.target?.status;
    switch (cond) {
      case 'targetAfflicted': return ctx.wasAfflicted ?? (st ? isAfflicted(st) : false);
      case 'targetBurning': return !!st && st.burn > 0;
      case 'targetShocked': return !!st && st.shock > 0;
      case 'targetFrozen': return !!st && (st.frozen > 0 || st.frost > 0);
      case 'targetBleeding': return !!st && st.bleed > 0;
      case 'lowHp': return p.hp < p.derived.maxHp * 0.5;
      case 'fullHp': return p.hp >= p.derived.maxHp;
      case 'airborne': return !p.onGround;
    }
  }

  private runProc(proc: ProcDef, ctx: { target?: Enemy; depth?: number; deadStatus?: Enemy['status'] }): void {
    const p = this.player;
    const a = proc.action;
    const depth = (ctx.depth ?? 0) + 1;
    const tgt = ctx.target;
    const tx = tgt ? tgt.x : p.x + p.facing * 20;
    const ty = tgt ? tgt.cy : p.cy;
    const procInfo = (motion: number, element: Element, status?: { type: StatusType; amount: number }): HitInfo => ({
      motion, kind: 'proc', element, scaling: 'hybrid', kb: [1.5, -1.5], dir: p.facing, poise: 8, stun: 14, depth, hitstop: null, status,
      sfx: element === 'phys' ? 'blunt' : element,
    });
    switch (a.type) {
      case 'explode':
        this.explodeAt(tx, ty, a.radius, procInfo(a.motion, a.element, a.status), a.element);
        break;
      case 'nova':
        this.explodeAt(p.x, p.cy, a.radius, procInfo(a.motion, a.element), a.element);
        break;
      case 'bolt':
        for (let i = 0; i < a.count; i++) {
          const ang = -Math.PI / 2 + (i - (a.count - 1) / 2) * 0.5;
          const spec: ProjectileSpec = { kind: 'bolt', speed: 4.5, w: 7, h: 7, life: 90, motion: a.motion, element: a.element, homing: a.homing ? 0.12 : 0 };
          this.spawnProjectile('player', spec, p.x, p.cy - 6, Math.cos(ang) * 4.5 * (p.facing || 1), Math.sin(ang) * 4.5, procInfo(a.motion, a.element));
        }
        break;
      case 'status':
        if (tgt) this.applyStatus(tgt, a.status, a.amount * (1 + p.stats.statusPower));
        break;
      case 'heal':
        this.healPlayer(p.derived.maxHp * a.pct);
        break;
      case 'mp':
        p.mp = Math.min(p.derived.maxMp, p.mp + a.amount);
        break;
      case 'buff':
        p.addBuff({ id: a.id, name: a.name, stats: a.stats, dur: a.dur, maxStacks: a.maxStacks ?? 1, consumeOn: a.consumeOn });
        break;
      case 'cdr':
        for (let i = 0; i < p.spellCd.length; i++) p.spellCd[i] = Math.max(0, p.spellCd[i] - a.ticks);
        break;
      case 'chain': {
        let from: { x: number; y: number } = { x: tx, y: ty };
        const hit = new Set<number>(tgt ? [tgt.id] : []);
        for (let j = 0; j < a.jumps; j++) {
          let best: Enemy | null = null;
          let bd = a.range * a.range;
          for (const e of this.enemies) {
            if (!e.hurtable || hit.has(e.id)) continue;
            const d = (e.x - from.x) ** 2 + (e.cy - from.y) ** 2;
            if (d < bd) {
              bd = d;
              best = e;
            }
          }
          if (!best) break;
          hit.add(best.id);
          this.emit({ t: 'line', x1: from.x, y1: from.y, x2: best.x, y2: best.cy, color: '#ffe86a' });
          this.damageEnemy(best, procInfo(a.motion, a.element, { type: 'shock', amount: 15 }), from.x, from.y);
          from = { x: best.x, y: best.cy };
        }
        break;
      }
      case 'spread': {
        const st = ctx.deadStatus;
        if (!st) break;
        for (const e of this.enemies) {
          if (!e.alive || e === tgt) continue;
          if (Math.abs(e.x - tx) > a.range || Math.abs(e.cy - ty) > a.range) continue;
          if (st.burn > 0) this.applyStatus(e, 'burn', 120);
          if (st.shock > 0) this.applyStatus(e, 'shock', 120);
          if (st.frost > 0 || st.frozen > 0) this.applyStatus(e, 'frost', 120);
          if (st.bleed > 0) this.applyStatus(e, 'bleed', 80);
          this.emit({ t: 'line', x1: tx, y1: ty, x2: e.x, y2: e.cy, color: '#d080ff' });
        }
        break;
      }
      case 'blade':
        if (this.blades.length < a.max) this.blades.push({ angle: this.rng.next() * 6.28, t: 0, dur: a.dur, motion: a.motion, reg: new Map(), x: p.x, y: p.cy });
        break;
      case 'shield':
        p.barrier = Math.max(p.barrier, p.derived.maxHp * a.pct);
        p.barrierT = a.dur;
        break;
    }
  }

  // ─────────────────────────────── spells ───────────────────────────────
  castSpell(p: Player, sp: SpellDef): void {
    const mk = (motion: number, element: Element, status?: { type: StatusType; amount: number }): HitInfo => ({
      motion, kind: 'spell', element, scaling: 'magic', kb: [2.5, -2], dir: p.facing, poise: 20, stun: 20, depth: 0, hitstop: 'magic', status, sfx: element === 'phys' ? 'magic' : element,
    });
    switch (sp.type) {
      case 'projectile': {
        const s = sp.projectile!;
        const info = mk(s.motion, sp.element, s.status);
        this.spawnProjectile('player', s, p.x + (s.offset?.[0] ?? 10) * p.facing, p.y + (s.offset?.[1] ?? -12), s.speed * p.facing, 0, info);
        break;
      }
      case 'nova': {
        const n = sp.nova!;
        const info = mk(n.motion, sp.element, { type: 'shock', amount: 50 });
        info.launch = n.launch;
        info.kb = [3, -7];
        info.hitstop = 'heavy';
        this.explodeAt(p.x, p.cy, n.radius, info, sp.element);
        this.emit({ t: 'flash', color: sp.color, dur: 5, alpha: 0.2 });
        break;
      }
      case 'ward':
        p.barrier = p.derived.maxHp * sp.ward!.pct;
        p.barrierT = sp.ward!.dur;
        this.emit({ t: 'ring', x: p.x, y: p.cy, r: 22, color: sp.color, dur: 20 });
        break;
      case 'blades':
        for (let i = 0; i < sp.blades!.count; i++) this.blades.push({ angle: (i / sp.blades!.count) * 6.28, t: 0, dur: sp.blades!.dur, motion: sp.blades!.motion * (1 + p.stats.spellPct), reg: new Map(), x: p.x, y: p.cy });
        break;
      case 'buff': {
        const b = sp.buff!;
        p.hp = Math.max(1, p.hp - p.hp * b.hpCost);
        p.addBuff({ id: sp.id, name: sp.name, stats: b.stats, dur: b.dur, maxStacks: 1 });
        this.emit({ t: 'burst', x: p.x, y: p.cy, kind: 'blood', color: '#ff4060', count: 16 });
        break;
      }
      case 'blink': {
        const bl = sp.blink!;
        const sx = p.x;
        let tx = p.x;
        for (let d = 0; d < bl.dist; d += 4) {
          const nx = p.x + p.facing * d;
          if (this.room.solidAt(nx + p.facing * 6, p.y - 10)) break;
          tx = nx;
        }
        p.x = tx;
        p.iframes = Math.max(p.iframes, 12);
        const box: Box = { x: Math.min(sx, tx) - 6, y: p.y - 30, w: Math.abs(tx - sx) + 12, h: 30 };
        this.emit({ t: 'line', x1: sx, y1: p.cy, x2: tx, y2: p.cy, color: sp.color });
        for (const e of this.enemies) if (e.hurtable && overlaps(box, e.hurtBox())) this.damageEnemy(e, mk(bl.motion, 'shock', { type: 'shock', amount: 40 }), sx, p.cy);
        break;
      }
    }
  }

  // ─────────────────────────────── enemy specials ───────────────────────────────
  shepherdSummon(e: Enemy): void {
    for (let i = 0; i < 2; i++) {
      const x = clamp(e.x + (i === 0 ? -30 : 30), 24, this.room.pxW - 24);
      const g = this.spawnEnemy('gloomling', x, e.y, { hpMult: e.maxHp / e.def.hp * 0.6, atkMult: e.atk / e.def.atk });
      g.summonerId = e.id;
    }
  }
  shepherdBarrier(e: Enemy): void {
    for (const o of this.enemies) {
      if (!o.alive || Math.abs(o.x - e.x) > 160) continue;
      o.barrier = 300;
      this.emit({ t: 'ring', x: o.x, y: o.cy, r: 14, color: '#9cf2ff', dur: 20 });
    }
  }
  enemyBlink(e: Enemy): void {
    const spots = [...this.room.ground].sort((a, b) => Math.abs(b.x - this.player.x) - Math.abs(a.x - this.player.x));
    const s = spots[Math.floor(this.rng.next() * Math.min(3, spots.length))];
    if (!s) return;
    this.emit({ t: 'burst', x: e.x, y: e.cy, kind: 'smoke', color: '#9cf2ff', count: 10 });
    e.x = s.x;
    e.y = s.y;
    this.emit({ t: 'burst', x: e.x, y: e.cy, kind: 'smoke', color: '#9cf2ff', count: 10 });
  }
  tickExplode(e: Enemy, a: EnemyAttack): void {
    this.hazards.push({ x: e.x, y: e.cy, r: 30, t: 0, delay: 0, team: 'all', power: e.atk * a.motion, element: 'fire', done: false, color: '#ffb030', status: a.status });
  }
}

export function elemColor(e: Element): string {
  return e === 'fire' ? '#ff8a3d' : e === 'shock' ? '#ffe86a' : e === 'frost' ? '#8fe0ff' : '#ffffff';
}
