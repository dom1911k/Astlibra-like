import { UI_W } from '../core/constants';
import { BOSSES, ELITE_MODS, ENEMIES, type EliteMod } from '../data/enemies';
import { MOVESETS, type WeaponClass } from '../data/movesets';
import { RELICS } from '../data/relics';
import { ROOMS } from '../data/rooms';
import type { Game } from '../game';
import { buildLoadout } from '../meta/build';
import type { SimEvent } from '../sim/events';
import { Room } from '../sim/room';
import { addStats } from '../sim/stats';
import { World } from '../sim/world';
import { CharacterPanel } from '../ui/panels/character';
import { MenuPanel, MessagePanel } from '../ui/panels/common';
import { DebugPanel, type DebugRow } from '../ui/panels/debug';
import { SettingsPanel } from '../ui/panels/settings';
import { C, textShadow, type Ctx } from '../ui/ui';
import { controlsText } from './expedition';
import type { PlaytestAction, PlaytestHost } from '../ui/panels/playtest';
import { HubScene } from './hub';
import { PlayScene } from './play';

const CLASSES: WeaponClass[] = ['fang', 'maul', 'glaive', 'rod', 'pendulum'];
const ENEMY_IDS = Object.keys(ENEMIES).filter((k) => k !== 'dummy');
const BOSS_IDS = Object.keys(BOSSES);
const ELITES: (EliteMod | 'none')[] = ['none', ...(Object.keys(ELITE_MODS) as EliteMod[])];

/**
 * Training Grounds: the dedicated combat-feel test arena. F1 opens live tuning of hit stop,
 * knockback, shake, buffers, windows; spawn any enemy/boss; swap weapon classes; try a late-game build.
 */
export class ArenaScene extends PlayScene implements PlaytestHost {
  name = 'arena';
  cls: WeaponClass;
  enemyIdx = 0;
  bossIdx = 0;
  eliteIdx = 0;
  lateGame = false;
  infMp = false;
  dmgLog: { t: number; v: number }[] = [];
  totalDmg = 0;
  lastTtk = 0;

  constructor(game: Game) {
    super(game);
    const b = buildLoadout(game.profile, null);
    this.cls = b.loadout.weaponCls;
  }

  enter(g: Game): void {
    this.reset(g);
    g.audio.setMusic('hub');
    this.roomBanner = { text: 'Training Grounds', sub: 'F1 — combat tuning & spawns · Esc — menu', t: 0 };
  }

  private loadout() {
    const b = buildLoadout(this.game.profile, null);
    const l = b.loadout;
    l.weaponCls = this.cls;
    l.weaponColor = MOVESETS[this.cls].color;
    l.spells = ['ember_lance', 'arc_nova'];
    if (this.lateGame) {
      addStats(l.stats, { atk: 90, magic: 90, critChance: 0.35, critDmg: 1.2, atkSpeed: 0.3, maxHp: 400, maxMp: 100, mpOnHit: 2, airJumps: 1, airDash: 1, dmgPct: 0.5, statusPower: 0.6, fireConv: 0.2, shockConv: 0.2 });
      for (const id of ['prism', 'stormglass', 'hydra_coil', 'crown_cinders', 'warhorn', 'ember_heart', 'grave_candle']) if (RELICS[id].procs) l.procs.push(...RELICS[id].procs!);
    }
    return l;
  }

  private reset(g: Game): void {
    const room = new Room(ROOMS.arena);
    this.world = new World(room, this.loadout(), g.input, 99);
    this.world.peaceful = true;
    this.world.startWaves([]);
    for (const m of room.ground) this.world.spawnEnemy('dummy', m.x, m.y, { noSpawnAnim: true });
    this.renderer.setRoom(room, 'hub', 3, this.world);
    this.world.player.mp = this.world.player.derived.maxMp;
  }

  private applyLoadout(): void {
    this.world.setLoadout(this.loadout());
    this.world.player.hp = this.world.player.derived.maxHp;
  }

  protected hotkeys(g: Game): boolean {
    const inp = g.input;
    if (inp.take('debug')) {
      g.push(new DebugPanel(this.debugRows(g)));
      return true;
    }
    if (inp.take('pause')) {
      const m: MenuPanel = new MenuPanel('Training Grounds', [
        { label: 'Resume', action: () => (m.closed = true) },
        { label: 'Combat Tuning & Spawns (F1)', action: () => { m.closed = true; g.push(new DebugPanel(this.debugRows(g))); } },
        { label: 'Character', action: () => g.push(new CharacterPanel({ profile: g.profile, run: null, onChange: () => this.applyLoadout() })) },
        { label: 'Controls', action: () => g.push(new MessagePanel('Controls', controlsText(g), undefined, 640)) },
        { label: 'Settings', action: () => g.push(new SettingsPanel(g)) },
        { label: 'Return to Lamplight', action: () => g.setScene(new HubScene(g)) },
      ]);
      g.push(m);
      return true;
    }
    if (inp.take('inventory')) {
      g.push(new CharacterPanel({ profile: g.profile, run: null, onChange: () => this.applyLoadout() }));
      return true;
    }
    return false;
  }

  private debugRows(g: Game): DebugRow[] {
    const w = () => this.world;
    return [
      { label: 'Weapon class', get: () => MOVESETS[this.cls].name, adjust: (d) => { this.cls = CLASSES[(CLASSES.indexOf(this.cls) + d + CLASSES.length) % CLASSES.length]; this.applyLoadout(); } },
      { label: 'Late-game build (extreme)', get: () => (this.lateGame ? 'On' : 'Off'), adjust: () => { this.lateGame = !this.lateGame; this.applyLoadout(); } },
      { label: 'Infinite Aether', get: () => (this.infMp ? 'On' : 'Off'), adjust: () => (this.infMp = !this.infMp) },
      { label: 'Spawn enemy ▸', get: () => ENEMIES[ENEMY_IDS[this.enemyIdx]].name, adjust: (d) => (this.enemyIdx = (this.enemyIdx + d + ENEMY_IDS.length) % ENEMY_IDS.length), action: () => this.spawn(ENEMY_IDS[this.enemyIdx]) },
      { label: 'Elite modifier for spawns', get: () => ELITES[this.eliteIdx], adjust: (d) => (this.eliteIdx = (this.eliteIdx + d + ELITES.length) % ELITES.length) },
      { label: 'Spawn pack (5 mixed)', get: () => '', action: () => { for (let i = 0; i < 5; i++) this.spawn(ENEMY_IDS[(this.enemyIdx + i) % ENEMY_IDS.length], i * 18 - 36); } },
      { label: 'Spawn guardian ▸', get: () => BOSSES[BOSS_IDS[this.bossIdx]].name, adjust: (d) => (this.bossIdx = (this.bossIdx + d + BOSS_IDS.length) % BOSS_IDS.length), action: () => { const p = w().player; w().spawnBoss(BOSS_IDS[this.bossIdx], p.x + p.facing * 120, p.y); } },
      { label: 'Clear enemies (keep dummies)', get: () => '', action: () => { w().enemies = w().enemies.filter((e) => e.def.ai === 'dummy'); w().boss = null; w().projectiles = []; w().hazards = []; } },
      { label: 'Reset arena', get: () => '', action: () => this.reset(g) },
    ];
  }

  playtestContext(): string {
    return `Training Grounds · ${MOVESETS[this.cls].name}${this.lateGame ? ' · late-game build' : ''}`;
  }

  playtestActions(g: Game): PlaytestAction[] {
    return [{ label: 'Open combat tuning & spawns (F1)', action: () => g.push(new DebugPanel(this.debugRows(g))) }];
  }

  private spawn(id: string, dx = 0): void {
    const p = this.world.player;
    const e = this.eliteIdx === 0 ? undefined : [ELITES[this.eliteIdx] as EliteMod];
    this.world.spawnEnemy(id, p.x + p.facing * 90 + dx, ENEMIES[id].flying ? p.y - 60 : p.y, { elite: e });
  }

  protected onEvent(_g: Game, e: SimEvent): void {
    if (e.t === 'num' && !e.onPlayer && !e.heal) {
      this.dmgLog.push({ t: this.renderer.time, v: e.value });
      this.totalDmg += e.value;
    }
    if (e.t === 'kill') {
      const last = this.world.ttk[this.world.ttk.length - 1];
      if (last) this.lastTtk = last.ticks / 60;
    }
    if (e.t === 'playerDead') {
      setTimeout(() => this.reset(this.game), 1200);
    }
  }

  protected afterFrame(_g: Game, _dt: number, sim: boolean): void {
    if (!sim) return;
    const p = this.world.player;
    if (this.infMp) p.mp = p.derived.maxMp;
    if (p.hp < p.derived.maxHp && this.world.tick % 120 === 0 && !this.world.enemies.some((e) => e.def.ai !== 'dummy' && e.alive)) p.hp = p.derived.maxHp;
    const now = this.renderer.time;
    this.dmgLog = this.dmgLog.filter((d) => now - d.t < 5000);
  }

  protected drawExtraHud(ctx: Ctx, g: Game): void {
    const dps = this.dmgLog.reduce((s, d) => s + d.v, 0) / 5;
    const st = this.world.stats;
    const x = UI_W - 16;
    textShadow(ctx, `DPS (5s) ${Math.round(dps)}`, x, 14, C.title, 16, 'right', true);
    textShadow(ctx, `Total ${this.totalDmg} · Hits ${st.hits} · Crits ${st.crits}`, x, 36, C.text, 12, 'right');
    textShadow(ctx, `Biggest hit ${st.maxHit} · Last TTK ${this.lastTtk.toFixed(2)}s`, x, 52, C.text, 12, 'right');
    textShadow(ctx, `Parries ${st.parries} · Perfect dodges ${st.perfectDodges}`, x, 68, C.text, 12, 'right');
    textShadow(ctx, `${MOVESETS[this.cls].name}${this.lateGame ? ' · LATE-GAME BUILD' : ''}`, x, 88, this.lateGame ? C.cinder : C.dim, 12, 'right', true);
    textShadow(ctx, `F1 tuning · ${g.input.keyName('inventory')} character`, x, 104, C.dim, 11, 'right');
    const p = this.world.player;
    if (p.state === 'attack' && p.atk) {
      const a = p.atk;
      const phase = a.t < a.def.startup ? 'startup' : a.t < a.def.startup + a.def.active ? 'ACTIVE' : 'recovery';
      textShadow(ctx, `${a.def.name}  ${phase}  ${a.t.toFixed(0)}/${a.def.startup + a.def.active + a.def.recovery}f  cancel@${a.def.cancel}${a.hitConfirm ? ' (hit)' : ''}`, UI_W / 2, 84, phase === 'ACTIVE' ? '#ff8a8a' : C.dim, 13, 'center', true);
    }
    if (this.world.time.frozen) textShadow(ctx, 'HIT STOP', UI_W / 2, 102, '#ffd23c', 11, 'center', true);
  }
}
