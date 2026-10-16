/**
 * Headless playtest simulator. Runs the real simulation (src/sim) with a scripted bot to produce
 * repeatable balance metrics:
 *   A) time-to-kill / damage-taken matrix per weapon class vs every enemy archetype (depth 1)
 *   B) full expeditions per weapon class: progress, deaths, upgrade frequency, and the power
 *      curve (bot DPS vs a training dummy at the start of each depth vs. the very start).
 *
 *   npm run sim            (fast)
 *   npm run sim -- --runs 6
 */
import { TICK_MS } from '../src/core/constants';
import { Rng } from '../src/core/rng';
import { BOSSES, ENEMIES } from '../src/data/enemies';
import { ITEMS, type ItemInst } from '../src/data/items';
import { MOVESETS, type WeaponClass } from '../src/data/movesets';
import { ROOMS } from '../src/data/rooms';
import { BOARD_LIST } from '../src/data/starboard';
import { buildLoadout } from '../src/meta/build';
import { buildEncounter, scaling } from '../src/meta/expedition';
import { baseOf, itemScore, newUid } from '../src/meta/items';
import { DIFFICULTIES, newProfile, type Profile } from '../src/meta/profile';
import { cinderReward, dropItem, gainXp, nextDepth, relicOffers, startRun, type RunState } from '../src/meta/run';
import { Room } from '../src/sim/room';
import { World } from '../src/sim/world';
import { Bot } from './bot';

const args = process.argv.slice(2);
const RUNS = Number(args[args.indexOf('--runs') + 1]) || 3;
const CLASSES: WeaponClass[] = ['fang', 'maul', 'glaive', 'rod', 'pendulum'];
const START_WEAPON: Record<WeaponClass, string> = { fang: 'twin_fangs', maul: 'mining_maul', glaive: 'wick_glaive', rod: 'ashwood_rod', pendulum: 'bellblade' };

function profileFor(cls: WeaponClass): Profile {
  const p = newProfile();
  p.board = ['core', 'u_glaive', 'm1', 'm2', 'm2b', 'm3', 'm4b', 'a1', 'u_rod'];
  const w: ItemInst = { uid: newUid(), baseId: START_WEAPON[cls], rarity: 'common', plus: 0, affixes: [], ilvl: 1 };
  p.stash.push(w);
  p.equipped.weapon = w.uid;
  return p;
}

function step(w: World, bot: Bot) {
  bot.tick(w);
  w.time.advance(TICK_MS, () => w.step());
  w.events.length = 0;
}

// ───────────────────────── A) TTK matrix ─────────────────────────
function ttkMatrix() {
  const rows: string[] = [];
  const enemyIds = Object.keys(ENEMIES).filter((k) => k !== 'dummy');
  rows.push(['class'.padEnd(10), ...enemyIds.map((e) => e.slice(0, 11).padStart(12))].join(''));
  for (const cls of CLASSES) {
    const cells: string[] = [];
    for (const id of enemyIds) {
      const prof = profileFor(cls);
      const bot = new Bot(0.6);
      const w = new World(new Room(ROOMS.arena), buildLoadout(prof, null).loadout, bot.input, 42);
      const sc = scaling(Math.max(1, ENEMIES[id].minDepth), 2, DIFFICULTIES[0]);
      const e = w.spawnEnemy(id, w.player.x + 90, ENEMIES[id].flying ? w.player.y - 50 : w.player.y, { hpMult: sc.hpMult, atkMult: sc.atkMult, defAdd: sc.defAdd, noSpawnAnim: true });
      let t = 0;
      const hp0 = w.player.hp;
      while (e.alive && !w.player.dead && t < 60 * 60) {
        step(w, bot);
        t++;
      }
      const taken = hp0 - Math.max(0, w.player.hp);
      cells.push((w.player.dead ? 'DIED' : e.alive ? 'T/O' : `${(t / 60).toFixed(1)}s/${Math.round(taken)}`).padStart(12));
    }
    rows.push([cls.padEnd(10), ...cells].join(''));
  }
  console.log('\n=== A) Time-to-kill (seconds) / damage taken — bot vs single enemy, depth-appropriate scaling ===');
  console.log(rows.join('\n'));
}

// ───────────────────────── B) expeditions ─────────────────────────
function measureDps(prof: Profile, run: RunState | null): number {
  const bot = new Bot(0.6);
  const w = new World(new Room(ROOMS.arena), buildLoadout(prof, run).loadout, bot.input, 7);
  w.spawnEnemy('dummy', w.player.x + 30, w.player.y, { noSpawnAnim: true });
  w.player.mp = 0;
  const t0 = w.stats.dmgDealt;
  // dummy is ignored by bot.nearest → drive attacks manually
  for (let t = 0; t < 600; t++) {
    if (t % 6 === 0) bot.input.press(t % 36 === 0 ? 'heavy' : 'light');
    if (w.player.mp >= w.player.artCost() && t % 60 === 0) bot.input.press('art');
    w.time.advance(TICK_MS, () => w.step());
    w.events.length = 0;
  }
  return (w.stats.dmgDealt - t0) / 10;
}

interface RunResult {
  cls: WeaponClass;
  depth: number;
  died: boolean;
  diedAt: string;
  rooms: number;
  level: number;
  relics: number;
  items: number;
  equips: number;
  time: number;
  dps: number[];
  bossTimes: number[];
  firstUpgradeAt: number;
  assists: number;
}

function simulateRun(cls: WeaponClass, seed: number): RunResult {
  const prof = profileFor(cls);
  const run = startRun(prof, seed);
  const rng = new Rng(seed);
  const res: RunResult = { cls, depth: 1, died: false, diedAt: '', rooms: 0, level: 1, relics: 0, items: 0, equips: 0, time: 0, dps: [measureDps(prof, run)], bossTimes: [], firstUpgradeAt: -1, assists: 0 };
  let hpFrac = 1;
  let potions = -1;
  const equipIfBetter = (it: ItemInst) => {
    res.items++;
    run.items.push(it);
    const b = baseOf(it);
    const slot = b.slot === 'charm' ? (run.equipped.charm1 ? 'charm2' : 'charm1') : b.slot;
    if (b.slot === 'weapon' && b.cls !== cls) return;
    const cur = [...prof.stash, ...run.items].find((x) => x.uid === run.equipped[slot as keyof RunState['equipped']]);
    if (!cur || itemScore(it) > itemScore(cur)) {
      run.equipped[slot as keyof RunState['equipped']] = it.uid;
      res.equips++;
      if (res.firstUpgradeAt < 0) res.firstUpgradeAt = res.time;
    }
  };
  const takeRelic = (lvl = false) => {
    const o = relicOffers(rng, run, 3, lvl ? 'common' : 'uncommon');
    if (o.length) {
      run.relics.push(o[0].id);
      if (res.firstUpgradeAt < 0) res.firstUpgradeAt = res.time;
    }
  };
  for (let guard = 0; guard < 40; guard++) {
    const node = run.map.nodes[run.node];
    const room = new Room(ROOMS[node.template]);
    const bot = new Bot(0.6);
    const w = new World(room, buildLoadout(prof, run).loadout, bot.input, node.seed);
    if (potions < 0) potions = Math.round(w.player.stats.potions);
    w.player.hp = Math.max(1, hpFrac * w.player.derived.maxHp);
    w.player.potions = potions;
    const combat = ['combat', 'start', 'elite', 'challenge', 'boss'].includes(node.type);
    if (combat) w.startWaves(buildEncounter(room, node, run.depth, run.difficulty, DIFFICULTIES[run.difficulty]));
    else w.startWaves([]);
    let t = 0;
    let exited = false;
    let bossDown = false;
    let lastDmg = 0;
    let lastProgress = 0;
    while (t < 60 * 240) {
      // bot navigation assist: the bot can't path-find over every platform; if it makes no progress
      // for 20s, teleport it next to the nearest enemy (counted, so it is visible in the report).
      if (w.stats.dmgDealt !== lastDmg) {
        lastDmg = w.stats.dmgDealt;
        lastProgress = t;
      } else if (t - lastProgress > 1200) {
        const e = w.enemies.find((x) => x.alive);
        if (e) {
          w.player.x = e.x - 20;
          w.player.y = e.def.flying ? w.room.floorBelow(e.x, e.y) : e.y;
          w.player.vy = 0;
          res.assists++;
        }
        lastProgress = t;
      }
      bot.tick(w);
      w.time.advance(TICK_MS, () => w.step());
      for (const e of w.events) {
        if (e.t === 'kill') {
          const lv = gainXp(run, e.xp);
          if (lv) w.setLoadout(buildLoadout(prof, run).loadout);
          run.gilt += e.gilt;
          prof.cinders += cinderReward(e.boss ? 'boss' : e.elite ? 'elite' : 'kill', run.depth, 0);
        }
        if (e.t === 'exit') exited = true;
        if (e.t === 'bossDefeated') bossDown = true;
      }
      w.events.length = 0;
      t++;
      if (w.player.dead || exited || (bossDown && t > 0)) break;
      if (!combat && t > 30) break; // utility rooms: interact instantly
    }
    res.time += t / 60;
    if (w.player.dead) {
      if (process.env.SIM_DEBUG) console.log('  died in', node.template, node.type, 'enemies', w.enemies.filter((e) => e.alive).map((e) => e.def.id + (e.elite.length ? '*' : '')).join(','), 'dmgTaken', w.stats.dmgTaken, 'kills', w.stats.kills);
      res.died = true;
      res.diedAt = `D${run.depth} ${node.type}${node.type === 'boss' ? ' (' + Object.keys(BOSSES)[run.depth - 1] + ')' : ''}`;
      break;
    }
    if (combat && !w.cleared && !bossDown) {
      res.diedAt = `SOFTLOCK/timeout D${run.depth} ${node.template}`;
      if (process.env.SIM_DEBUG) console.log('  timeout:', node.template, 'player', Math.round(w.player.x), Math.round(w.player.y), 'enemies', w.enemies.filter((e) => e.alive).map((e) => `${e.def.id}@${Math.round(e.x)},${Math.round(e.y)} ${e.state}`).join(' | '), 'waves left', w.waves.length);
      res.died = true;
      break;
    }
    res.rooms++;
    hpFrac = w.player.hp / w.player.derived.maxHp;
    potions = w.player.potions;
    while (run.pendingChoices > 0) {
      run.pendingChoices--;
      takeRelic(true);
    }
    // rewards (mirrors ExpeditionScene)
    const luck = w.player.stats.lootLuck;
    switch (node.type) {
      case 'combat': case 'start': if (rng.chance(0.32)) equipIfBetter(dropItem(prof, run, rng, luck)); break;
      case 'elite': equipIfBetter(dropItem(prof, run, rng, luck, 'rare')); takeRelic(); break;
      case 'challenge': equipIfBetter(dropItem(prof, run, rng, luck, 'uncommon')); break;
      case 'treasure': case 'secret': equipIfBetter(dropItem(prof, run, rng, luck, 'uncommon')); break;
      case 'shrine': takeRelic(); break;
      case 'rest': hpFrac = Math.min(1, hpFrac + 0.6); potions = Math.round(w.player.stats.potions); break;
      case 'shop': if (run.gilt >= 60) { run.gilt -= 60; takeRelic(true); } break;
      case 'forge': { const wpn = [...prof.stash, ...run.items].find((x) => x.uid === run.equipped.weapon); if (wpn) wpn.plus++; break; }
    }
    if (bossDown) {
      res.bossTimes.push(t / 60);
      equipIfBetter(dropItem(prof, run, rng, luck + 0.5, 'epic'));
      if (run.depth >= 3) break;
      nextDepth(prof, run);
      res.depth = run.depth;
      hpFrac = Math.min(1, hpFrac + 0.5);
      res.dps.push(measureDps(prof, run));
      continue;
    }
    // choose next node: random edge, prefer non-shortcut
    const edges = node.edges;
    if (!edges.length) {
      res.died = true;
      res.diedAt = `NO EDGES at ${node.type} ${node.id} cleared=${w.cleared}`;
      break;
    }
    run.node = edges[rng.int(0, edges.length - 1)];
    run.visited.push(run.node);
  }
  res.level = run.level;
  res.relics = run.relics.length;
  res.dps.push(measureDps(prof, run));
  return res;
}

function main() {
  const t0 = Date.now();
  ttkMatrix();
  console.log(`\n=== B) Full expeditions — ${RUNS} runs per class (bot skill 0.6, Ember I) ===`);
  console.log('class     depth  died-at                         rooms lvl relics items equips  time   1st-upgrade assist DPS start→end (×)');
  const all: RunResult[] = [];
  for (const cls of CLASSES) {
    for (let i = 0; i < RUNS; i++) {
      const r = simulateRun(cls, 1000 + i * 31 + CLASSES.indexOf(cls) * 7);
      all.push(r);
      const mult = r.dps[r.dps.length - 1] / Math.max(1, r.dps[0]);
      console.log(
        `${cls.padEnd(9)} ${String(r.depth).padStart(5)}  ${(r.died ? r.diedAt : 'VICTORY').padEnd(30)} ${String(r.rooms).padStart(5)} ${String(r.level).padStart(3)} ${String(r.relics).padStart(6)} ${String(r.items).padStart(5)} ${String(r.equips).padStart(6)} ${(r.time / 60).toFixed(1).padStart(5)}m ${(r.firstUpgradeAt / 60).toFixed(1).padStart(10)}m ${String(r.assists).padStart(6)} ${r.dps.map((d) => Math.round(d)).join('→')} (×${mult.toFixed(1)})`,
      );
    }
  }
  const wins = all.filter((r) => !r.died).length;
  const bossKills = all.reduce((s, r) => s + r.bossTimes.length, 0);
  const softlocks = all.filter((r) => r.diedAt.startsWith('SOFTLOCK')).length;
  console.log(`\nSummary: ${wins}/${all.length} full clears · ${bossKills} guardian kills · ${softlocks} softlocks/timeouts · avg power multiplier ×${(all.reduce((s, r) => s + r.dps[r.dps.length - 1] / Math.max(1, r.dps[0]), 0) / all.length).toFixed(2)}`);
  console.log(`(sim took ${((Date.now() - t0) / 1000).toFixed(1)}s)`);
  void ITEMS;
  void MOVESETS;
  void BOARD_LIST;
}

main();
