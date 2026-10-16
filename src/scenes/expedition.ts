import { UI_W } from '../core/constants';
import { Rng } from '../core/rng';
import { ITEMS, RARITY_COLOR, type ItemInst, type Rarity } from '../data/items';
import { LORE } from '../data/lore';
import { CURSES, RELICS, type RelicDef } from '../data/relics';
import { ROOMS } from '../data/rooms';
import type { Game } from '../game';
import { buildLoadout } from '../meta/build';
import { buildEncounter, NODE_INFO, type MapNode } from '../meta/expedition';
import { describeItem, itemName, makeItem, rarityIndex } from '../meta/items';
import { DIFFICULTIES } from '../meta/profile';
import { addCurse, bankRun, cinderReward, dropItem, gainXp, nextDepth, relicOffers, resolveDeath, type RunState } from '../meta/run';
import { THEMES } from '../render/theme';
import type { SimEvent } from '../sim/events';
import { Room } from '../sim/room';
import { World } from '../sim/world';
import { CharacterPanel } from '../ui/panels/character';
import { ChoicePanel, MenuPanel, MessagePanel } from '../ui/panels/common';
import { ForgePanel } from '../ui/panels/forge';
import { MapPanel } from '../ui/panels/map';
import { SettingsPanel } from '../ui/panels/settings';
import { ShopPanel, type Offer } from '../ui/panels/shop';
import { C, textShadow, type Card, type Ctx } from '../ui/ui';
import { applyMastery } from './meta-events';
import { PlayScene } from './play';
import { drawStation, type Station, type StationKind } from './stations';
import { SummaryScene, type Summary } from './summary';
import { HubScene } from './hub';

const BOSS_DROPS: Record<string, string> = { rootmaw: 'rootmaw_fang', matriarch: 'moth_veil', vessel: 'starheart' };

export class ExpeditionScene extends PlayScene {
  name = 'expedition';
  r: RunState;
  node!: MapNode;
  rng: Rng;
  stations: Station[] = [];
  pickupItems = new Map<number, { item?: ItemInst; relic?: string }>();
  pickupUid = 1;
  deathT = -1;
  checkpointT = -1;
  challengeT = 0;
  challengeLimit = 75;
  roomStartTime = 0;
  bossKilled: string | null = null;
  nearStation: Station | null = null;
  firstRoomHint = false;

  constructor(game: Game) {
    super(game);
    this.r = game.profile.run!;
    this.rng = new Rng(this.r.seed ^ 0x5eed);
  }

  enter(g: Game): void {
    this.enterNode(g, this.r.map.nodes[this.r.node]);
    if (!g.profile.flags.controlsShown) {
      g.profile.flags.controlsShown = true;
      g.push(new MessagePanel('How to fight', controlsText(g), undefined, 640));
    }
  }

  protected run(): RunState {
    return this.r;
  }

  private rebuild(keepHp = true): void {
    const b = buildLoadout(this.game.profile, this.r);
    const p = this.world.player;
    const hpF = p.hp / p.derived.maxHp;
    this.world.setLoadout(b.loadout);
    if (keepHp) p.hp = Math.max(1, hpF * p.derived.maxHp);
  }

  enterNode(g: Game, node: MapNode): void {
    const r = this.r;
    this.node = node;
    r.node = node.id;
    if (!r.visited.includes(node.id)) r.visited.push(node.id);
    const room = new Room(ROOMS[node.template]);
    const b = buildLoadout(g.profile, r);
    const world = new World(room, b.loadout, g.input, node.seed);
    world.depthTier = r.depth;
    const diff = DIFFICULTIES[r.difficulty];
    world.difficulty.enemyDmg = 1;
    this.world = world;
    const p = world.player;
    if (r.potions < 0) r.potions = Math.round(p.stats.potions);
    p.hp = Math.max(1, Math.round(r.hp * p.derived.maxHp));
    p.mp = r.mp * p.derived.maxMp;
    p.potions = Math.min(r.potions, Math.round(p.stats.potions));
    this.renderer.setRoom(room, 'depth' + r.depth, node.seed, world);
    this.stations = [];
    this.pickupItems.clear();
    this.deathT = -1;
    this.checkpointT = -1;
    this.bossKilled = null;
    this.challengeT = 0;
    this.roomStartTime = r.stats.time;
    const info = NODE_INFO[node.type];
    const combat = node.type === 'combat' || node.type === 'start' || node.type === 'elite' || node.type === 'challenge' || node.type === 'boss';
    if (combat) {
      const waves = buildEncounter(room, node, r.depth, r.difficulty, diff);
      world.startWaves(waves);
      r.roomCleared = false;
    } else {
      world.startWaves([]);
      world.peaceful = true;
      r.roomCleared = true;
      this.setupUtility(node, room);
    }
    this.roomBanner = { text: info.name, sub: `Depth ${r.depth} · ${THEMES['depth' + r.depth].name}`, t: 0 };
    if (node.type === 'boss') {
      g.audio.setMusic('boss');
      g.sfx('boss');
    } else g.audio.setMusic(('depth' + r.depth) as any);
    g.profile.run = r;
    g.save();
  }

  private setupUtility(node: MapNode, room: Room): void {
    const s1 = room.stations['1'] ?? room.player;
    const s2 = room.stations['2'];
    const add = (kind: StationKind, m: { x: number; y: number }, label: string) => this.stations.push({ kind, x: m.x, y: m.y, label });
    switch (node.type) {
      case 'treasure': add('chest', s1, 'Open Cache'); break;
      case 'shop': add('shop', s1, 'Merchant'); if (s2) add('campfire', s2, 'Rest (once)'); break;
      case 'forge': add('anvil', s1, 'Forge'); break;
      case 'shrine': add('altar', s1, 'Shrine of Vows'); break;
      case 'rest': add('campfire', s1, 'Campfire'); break;
      case 'lore': add('tablet', s1, 'Echo Tablet'); break;
      case 'secret': add('chest', s1, 'Vault Cache'); if (s2) add('tablet', s2, 'Vault Echo'); break;
    }
  }

  // ─────────────────────────────── input ───────────────────────────────
  protected hotkeys(g: Game): boolean {
    const inp = g.input;
    if (this.deathT >= 0) return false;
    if (inp.take('pause')) {
      this.openPause(g);
      return true;
    }
    if (inp.take('inventory')) {
      g.push(this.characterPanel(g));
      return true;
    }
    if (inp.take('map')) {
      g.push(new MapPanel(this.r, null));
      return true;
    }
    // interact with stations
    const p = this.world.player;
    this.nearStation = null;
    for (const s of this.stations) if (Math.abs(p.x - s.x) < 20 && Math.abs(p.y - s.y) < 24) this.nearStation = s;
    if (this.nearStation && p.state === 'free' && p.onGround && (inp.take('interact') || inp.take('up'))) {
      this.interact(g, this.nearStation);
      return true;
    }
    return false;
  }

  private characterPanel(g: Game): CharacterPanel {
    return new CharacterPanel({ profile: g.profile, run: this.r, onChange: () => this.rebuild() });
  }

  private openPause(g: Game): void {
    const menu: MenuPanel = new MenuPanel('Paused', [
      { label: 'Resume', action: () => (menu.closed = true) },
      { label: 'Character', action: () => g.push(this.characterPanel(g)) },
      { label: 'Expedition Map', action: () => g.push(new MapPanel(this.r, null)) },
      { label: 'Controls', action: () => g.push(new MessagePanel('Controls', controlsText(g), undefined, 640)) },
      { label: 'Settings', action: () => g.push(new SettingsPanel(g)) },
      {
        label: 'Save & Quit to Lamplight', sub: 'resume later', action: () => {
          menu.closed = true;
          this.saveRunState();
          g.save();
          g.setScene(new HubScene(g));
        },
      },
      {
        label: 'Abandon Expedition', sub: 'counts as death', action: () => {
          menu.closed = true;
          this.die(g);
        },
      },
    ]);
    g.push(menu);
  }

  private saveRunState(): void {
    const p = this.world.player;
    this.r.hp = Math.max(0.05, p.hp / p.derived.maxHp);
    this.r.mp = p.mp / p.derived.maxMp;
    this.r.potions = p.potions;
  }

  // ─────────────────────────────── events ───────────────────────────────
  protected onEvent(g: Game, e: SimEvent): void {
    const r = this.r;
    const prof = g.profile;
    const p = this.world.player;
    switch (e.t) {
      case 'kill': {
        r.stats.kills++;
        if (e.elite) r.stats.elites++;
        prof.records.totalKills++;
        prof.codex.enemies[e.enemyId] = (prof.codex.enemies[e.enemyId] ?? 0) + 1;
        const lv = gainXp(r, Math.round(e.xp * (1 + p.stats.xpGain)));
        if (lv > 0) {
          g.sfx('levelup');
          g.toast(`Level ${r.level}!${r.pendingChoices ? ' A relic choice awaits when the room is clear.' : ''}`, '#d8b0ff');
          this.rebuild();
          this.world.healPlayer(p.derived.maxHp * 0.12);
          this.world.emit({ t: 'ring', x: p.x, y: p.cy, r: 26, color: '#d8b0ff', dur: 20 });
        }
        const gilt = Math.round(e.gilt * (1 + p.stats.goldFind) * (0.8 + this.rng.next() * 0.4));
        r.gilt += gilt;
        this.renderer.particles.burst(e.x, e.y - 8, 'coin', '#ffd23c', Math.min(8, 2 + Math.floor(gilt / 4)));
        const cin = cinderReward(e.boss ? 'boss' : e.elite ? 'elite' : 'kill', r.depth, r.difficulty);
        this.addCinders(cin);
        if (this.rng.chance(e.elite ? 1 : 0.3)) r.slag += e.elite ? 5 : this.rng.int(1, 2);
        if (!e.boss && !e.elite && this.rng.chance(0.05 + p.stats.lootLuck * 0.03)) this.spawnItemPickup(e.x, e.y - 10, dropItem(prof, r, this.rng, p.stats.lootLuck));
        break;
      }
      case 'mastery':
        applyMastery(g, prof, r, e);
        break;
      case 'pickup': {
        const pk = this.pickupItems.get(e.uid);
        if (pk?.item) this.takeItem(g, pk.item);
        if (pk?.relic) this.takeRelic(g, pk.relic);
        break;
      }
      case 'cleared':
        this.onCleared(g);
        break;
      case 'exit':
        if (r.pendingChoices > 0) {
          this.offerLevelRelic(g);
          break;
        }
        this.saveRunState();
        g.push(new MapPanel(r, (n) => {
          r.stats.rooms++;
          this.enterNode(g, n);
        }));
        break;
      case 'playerDead':
        this.deathT = 0;
        break;
      case 'bossDefeated':
        this.bossKilled = e.id;
        this.checkpointT = 0;
        prof.records.bossKills[e.id] = (prof.records.bossKills[e.id] ?? 0) + 1;
        r.stats.bosses.push(e.id);
        break;
      case 'perfectDodge':
        r.stats.perfectDodges++;
        break;
      case 'parry':
        r.stats.parries++;
        break;
    }
  }

  private addCinders(n: number): void {
    const prof = this.game.profile;
    prof.cinders += n;
    prof.records.cindersEarned += n;
    this.r.stats.cinders += n;
  }

  private spawnItemPickup(x: number, y: number, item: ItemInst): void {
    const uid = this.pickupUid++;
    this.pickupItems.set(uid, { item });
    this.world.dropPickup({ uid, x, y, kind: 'item', color: RARITY_COLOR[item.rarity], label: itemName(item), payload: item });
    if (rarityIndex(item.rarity) >= 3) this.game.sfx(item.rarity === 'legendary' ? 'legendary' : 'rare');
  }
  private spawnRelicPickup(x: number, y: number, relic: string): void {
    const uid = this.pickupUid++;
    this.pickupItems.set(uid, { relic });
    this.world.dropPickup({ uid, x, y, kind: 'relic', color: RARITY_COLOR[RELICS[relic].rarity], label: RELICS[relic].name, payload: relic });
  }

  private takeItem(g: Game, it: ItemInst): void {
    const r = this.r;
    r.items.push(it);
    r.stats.itemsFound++;
    const prof = g.profile;
    if (!prof.codex.items.includes(it.baseId)) prof.codex.items.push(it.baseId);
    g.toast(`Found ${it.rarity} ${itemName(it)} — ${ITEMS[it.baseId].passive.name}`, RARITY_COLOR[it.rarity], 3200);
    if (rarityIndex(it.rarity) >= 3) g.sfx(it.rarity === 'legendary' ? 'legendary' : 'rare');
  }
  private takeRelic(g: Game, id: string): void {
    const r = this.r;
    if (r.relics.includes(id)) return;
    r.relics.push(id);
    r.stats.relicsFound++;
    if (!g.profile.codex.relics.includes(id)) g.profile.codex.relics.push(id);
    g.toast(`Relic: ${RELICS[id].name} — ${RELICS[id].text}`, RARITY_COLOR[RELICS[id].rarity], 3600);
    g.sfx('rare');
    this.rebuild();
  }

  private relicCards(list: RelicDef[]): Card[] {
    return list.map((x) => ({ title: x.name, color: RARITY_COLOR[x.rarity], sub: `${x.rarity} relic`, body: x.text }));
  }

  private offerLevelRelic(g: Game): void {
    const r = this.r;
    if (r.pendingChoices <= 0) return;
    const offers = relicOffers(this.rng, r, 3, 'common', 'rare');
    if (!offers.length) {
      r.pendingChoices = 0;
      return;
    }
    r.pendingChoices--;
    g.push(new ChoicePanel(`Level ${r.level} — Resonance`, 'Your lantern flares. Choose a relic for this expedition.', this.relicCards(offers), (i) => {
      this.takeRelic(g, offers[i].id);
      if (r.pendingChoices > 0) this.offerLevelRelic(g);
    }, { label: 'Skip (+25 Gilt)', action: () => (r.gilt += 25) }));
  }

  private onCleared(g: Game): void {
    const r = this.r;
    const n = this.node;
    const p = this.world.player;
    r.roomCleared = true;
    const center = { x: p.x + p.facing * 30, y: p.y - 20 };
    const luck = p.stats.lootLuck;
    if (n.type === 'combat' || n.type === 'start') {
      if (this.rng.chance(0.32 + luck * 0.2)) this.spawnItemPickup(center.x, center.y, dropItem(g.profile, r, this.rng, luck));
    } else if (n.type === 'elite') {
      this.spawnItemPickup(center.x, center.y, dropItem(g.profile, r, this.rng, luck, 'rare'));
      const offers = relicOffers(this.rng, r, 3, 'uncommon');
      if (offers.length) g.push(new ChoicePanel('Elite Vanquished', 'Claim a relic from its remains.', this.relicCards(offers), (i) => this.takeRelic(g, offers[i].id)));
    } else if (n.type === 'challenge') {
      const secs = r.stats.time - this.roomStartTime;
      const fast = secs <= this.challengeLimit;
      g.toast(fast ? `Gauntlet cleared in ${Math.round(secs)}s — superior reward!` : `Gauntlet cleared (${Math.round(secs)}s)`, fast ? C.good : C.text);
      this.spawnItemPickup(center.x, center.y, dropItem(g.profile, r, this.rng, luck + (fast ? 0.5 : 0), fast ? 'epic' : 'uncommon'));
      if (fast) r.starglass += 1;
    } else if (n.type === 'boss') {
      // handled by checkpoint
    }
    if (r.pendingChoices > 0 && n.type !== 'elite' && n.type !== 'boss') this.offerLevelRelic(g);
  }

  // ─────────────────────────────── stations ───────────────────────────────
  private interact(g: Game, s: Station): void {
    const r = this.r;
    const prof = g.profile;
    const p = this.world.player;
    if (s.used && s.kind !== 'shop' && s.kind !== 'anvil') {
      g.toast('Already used.', C.dim);
      return;
    }
    switch (s.kind) {
      case 'chest': {
        s.used = true;
        g.sfx('rare');
        const secret = this.node.type === 'secret';
        if (secret) this.addCinders(cinderReward('secret', r.depth, r.difficulty));
        const a = dropItem(prof, r, this.rng, p.stats.lootLuck, secret ? 'rare' : 'uncommon');
        const b = dropItem(prof, r, this.rng, p.stats.lootLuck, secret ? 'rare' : 'common');
        const rel = relicOffers(this.rng, r, 1, secret ? 'rare' : 'common')[0];
        const cards: Card[] = [a, b].map((it) => ({ title: itemName(it), color: RARITY_COLOR[it.rarity], sub: `${it.rarity} ${ITEMS[it.baseId].slot}`, body: describeItem(it).lines.slice(1, -1).map((l) => l.text).join('\n') }));
        if (rel) cards.push({ title: rel.name, color: RARITY_COLOR[rel.rarity], sub: `${rel.rarity} relic`, body: rel.text });
        g.push(new ChoicePanel(secret ? 'Hidden Vault' : 'Sealed Cache', 'Take one.', cards, (i) => {
          if (i < 2) this.takeItem(g, i === 0 ? a : b);
          else this.takeRelic(g, rel!.id);
        }));
        break;
      }
      case 'shop': {
        const offers = this.shopOffers(g);
        g.push(new ShopPanel('Wandering Merchant', offers, r, prof, (o) => {
          if (o.item) this.takeItem(g, o.item);
          if (o.relic) this.takeRelic(g, o.relic.id);
          if (o.kind === 'potion') {
            p.potions = Math.round(p.stats.potions);
            g.toast('Lamp Oil refilled', '#ffd27a');
          }
          if (o.kind === 'heal') this.world.healPlayer(p.derived.maxHp * 0.5);
        }));
        break;
      }
      case 'anvil':
        g.push(new ForgePanel(prof, r, 'run', () => this.rebuild()));
        break;
      case 'altar':
        this.shrine(g, s);
        break;
      case 'campfire':
        s.used = true;
        this.world.healPlayer(p.derived.maxHp * 0.6);
        p.potions = Math.round(p.stats.potions);
        g.sfx('potion');
        g.toast('You rest by the fire. HP restored, Lamp Oil refilled.', '#ffd27a');
        break;
      case 'tablet': {
        s.used = true;
        const unseen = LORE.filter((l) => !prof.codex.lore.includes(l.id));
        const lore = unseen.length ? unseen[0] : this.rng.pick(LORE);
        if (!prof.codex.lore.includes(lore.id)) prof.codex.lore.push(lore.id);
        const c = cinderReward('lore', r.depth, r.difficulty);
        this.addCinders(c);
        g.push(new MessagePanel(`Echo — ${lore.title}`, `${lore.text}\n\n(+${Math.round(c)} Cinders)`));
        break;
      }
      default:
        break;
    }
  }

  private shopCache: Offer[] | null = null;
  private shopOffers(g: Game): Offer[] {
    if (this.shopCache) return this.shopCache;
    const r = this.r;
    const p = this.world.player;
    const price = (rar: Rarity) => [25, 45, 80, 140, 260][rarityIndex(rar)] * (1 + (r.depth - 1) * 0.4);
    const offers: Offer[] = [];
    for (let i = 0; i < 3; i++) {
      const it = dropItem(g.profile, r, this.rng, p.stats.lootLuck, i === 0 ? 'rare' : 'uncommon');
      offers.push({ kind: 'item', label: itemName(it), price: Math.round(price(it.rarity)), item: it });
    }
    for (const rel of relicOffers(this.rng, r, 2, 'common')) offers.push({ kind: 'relic', label: rel.name, price: Math.round(price(rel.rarity) * 0.9), relic: rel });
    offers.push({ kind: 'potion', label: 'Refill Lamp Oil', price: 30, desc: 'Refill all Lamp Oil charges.', repeat: true });
    offers.push({ kind: 'heal', label: 'Bandages (heal 50%)', price: 25, desc: 'Restore 50% of your Max HP.', repeat: true });
    this.shopCache = offers;
    return offers;
  }

  private shrine(g: Game, s: Station): void {
    const r = this.r;
    const p = this.world.player;
    const power = relicOffers(this.rng, r, 1, 'rare')[0];
    const cards: Card[] = [];
    const acts: (() => void)[] = [];
    if (power) {
      cards.push({ title: 'Vow of Power', color: '#c77dff', sub: 'boon & curse', body: `Gain ${power.name}: ${power.text}`, extra: 'Curse: a random affliction for this expedition.' });
      acts.push(() => {
        this.takeRelic(g, power.id);
        const c = addCurse(r, this.rng);
        g.toast(`Cursed: ${CURSES.find((x) => x.id === c)!.name}`, C.bad);
        this.rebuild();
      });
    }
    cards.push({ title: 'Vow of Blood', color: '#ff4060', sub: 'pay in HP', body: 'Your equipped weapon gains +2 levels.', extra: 'Lose 30% of your current HP.' });
    acts.push(() => {
      p.hp = Math.max(1, p.hp * 0.7);
      const w = [...g.profile.stash, ...r.items].find((i) => i.uid === r.equipped.weapon);
      if (w) {
        w.plus = Math.min(10, w.plus + 2);
        g.toast(`${itemName(w)}!`, C.good);
      }
      this.rebuild();
    });
    if (r.curses.length) {
      cards.push({ title: 'Vow of Cleansing', color: '#9cf2ff', sub: 'purify', body: 'Remove your most recent curse and restore all HP.' });
      acts.push(() => {
        r.curses.pop();
        this.rebuild();
        this.world.healPlayer(p.derived.maxHp);
      });
    } else {
      const grace = relicOffers(this.rng, r, 1, 'common', 'uncommon')[0];
      if (grace) {
        cards.push({ title: 'Vow of Grace', color: '#7cff8a', sub: 'humble boon', body: `Gain ${grace.name}: ${grace.text}` });
        acts.push(() => this.takeRelic(g, grace.id));
      }
    }
    g.push(new ChoicePanel('Shrine of Vows', 'Swear one vow. The shrine then falls silent.', cards, (i) => {
      s.used = true;
      acts[i]();
      g.sfx('cast');
    }, { label: 'Leave', action: () => {} }));
  }

  // ─────────────────────────────── per-frame ───────────────────────────────
  protected afterFrame(g: Game, dt: number, sim: boolean): void {
    const r = this.r;
    if (sim && this.deathT < 0) r.stats.time += dt / 1000;
    const p = this.world.player;
    r.stats.maxCombo = Math.max(r.stats.maxCombo, p.maxCombo);
    if (this.deathT >= 0) {
      this.deathT += dt;
      if (this.deathT > 1800 && !g.topPanel) this.die(g);
    }
    if (this.checkpointT >= 0 && sim) {
      this.checkpointT += dt;
      if (this.checkpointT > 2600) {
        this.checkpointT = -1;
        this.bossRewards(g);
      }
    }
  }

  private bossRewards(g: Game): void {
    const r = this.r;
    const prof = g.profile;
    const p = this.world.player;
    const id = this.bossKilled ?? 'rootmaw';
    r.starglass += 3;
    this.addCinders(cinderReward('depth', r.depth, r.difficulty));
    const special = BOSS_DROPS[id];
    if (special && !prof.recipes.includes(special)) {
      prof.recipes.push(special);
      g.toast(`Recipe unlocked: ${ITEMS[special].name}`, RARITY_COLOR.legendary, 4000);
    }
    const drop = this.rng.chance(0.35) && special ? makeItem(this.rng, special, 'legendary', r.depth) : dropItem(prof, r, this.rng, p.stats.lootLuck + 0.5, 'epic');
    this.takeItem(g, drop);
    prof.records.bestDepth = Math.max(prof.records.bestDepth, r.depth);
    this.saveRunState();
    const banked = bankRun(prof, r);
    g.save();
    const final = r.depth >= 3;
    if (final) {
      prof.records.victories++;
      if (!prof.records.fastestVictory || r.stats.time < prof.records.fastestVictory) prof.records.fastestVictory = r.stats.time;
      if (r.difficulty >= prof.difficultyUnlocked && prof.difficultyUnlocked < DIFFICULTIES.length - 1) {
        prof.difficultyUnlocked = r.difficulty + 1;
        g.toast(`New difficulty unlocked: ${DIFFICULTIES[prof.difficultyUnlocked].name}`, C.cinder, 5000);
      }
      this.finish(g, 'victory');
      return;
    }
    const menu: MenuPanel = new MenuPanel(`Guardian Defeated — Checkpoint`, [
      {
        label: `Descend to Depth ${r.depth + 1}`, sub: 'stronger foes, better loot', action: () => {
          menu.closed = true;
          nextDepth(prof, r);
          this.world.healPlayer(p.derived.maxHp * 0.5);
          this.saveRunState();
          this.enterNode(g, r.map.nodes[r.map.start]);
        },
      },
      {
        label: 'Return to Lamplight', sub: 'extract safely', action: () => {
          menu.closed = true;
          this.finish(g, 'extracted');
        },
      },
    ], 460, false);
    g.push(menu);
    g.toast(`Banked ${banked.items} items and ${banked.gilt} Gilt. Everything so far is safe.`, C.good, 4500);
  }

  private die(g: Game): void {
    if (this.deathT === -2) return;
    this.deathT = -2;
    const prof = g.profile;
    const r = this.r;
    prof.records.deaths++;
    const out = resolveDeath(prof, r);
    this.finish(g, 'death', out);
  }

  private finish(g: Game, kind: Summary['kind'], death?: ReturnType<typeof resolveDeath>): void {
    const prof = g.profile;
    const r = this.r;
    if (kind !== 'death') {
      bankRun(prof, r);
      prof.records.extractions += kind === 'extracted' ? 1 : 0;
    }
    prof.records.runs++;
    prof.records.maxCombo = Math.max(prof.records.maxCombo, r.stats.maxCombo);
    prof.records.maxHit = Math.max(prof.records.maxHit, this.world.stats.maxHit, r.stats.maxHit);
    prof.records.bestDepth = Math.max(prof.records.bestDepth, kind === 'death' ? r.depth - 1 : r.depth);
    prof.run = null;
    g.save();
    g.setScene(new SummaryScene(g, { kind, run: r, death }));
  }

  // ─────────────────────────────── drawing ───────────────────────────────
  protected extraDraw(g: CanvasRenderingContext2D, cx: number, cy: number): void {
    for (const s of this.stations) drawStation(g, s, s.x - cx, s.y - cy, this.renderer.time, s === this.nearStation);
  }

  protected drawExtraHud(ctx: Ctx, g: Game): void {
    this.drawRelics(ctx, this.r);
    if (this.nearStation) textShadow(ctx, `${g.input.keyName('up')} / ${g.input.keyName('interact')}  ${this.nearStation.label}`, UI_W / 2, 360, '#ffe9a8', 15, 'center', true);
    if (this.node.type === 'challenge' && !this.r.roomCleared) {
      const secs = this.r.stats.time - this.roomStartTime;
      const left = Math.max(0, this.challengeLimit - secs);
      textShadow(ctx, `GAUNTLET ${left.toFixed(1)}s`, UI_W / 2, 92, left > 0 ? '#5fa8ff' : C.dim, 18, 'center', true);
    }
    if (this.world.exitOpen && !this.world.peaceful && this.r.roomCleared && this.node.type !== 'boss') textShadow(ctx, 'Room clear — head to the exit ▶', UI_W / 2, 92, C.good, 14, 'center', true);
    if (this.world.peaceful && !this.nearStation && this.stations.length) textShadow(ctx, 'Approach a station and press Up to interact', UI_W / 2, 92, C.dim, 13, 'center');
    if (this.deathT >= 0) {
      ctx.fillStyle = `rgba(0,0,0,${Math.min(0.7, this.deathT / 1800)})`;
      ctx.fillRect(0, 0, UI_W, 540);
      textShadow(ctx, 'YOUR LANTERN GUTTERS OUT', UI_W / 2, 230, '#ff6a6a', 30, 'center', true);
    }
  }
}

export function controlsText(g: Game): string {
  const k = (a: Parameters<typeof g.input.keyName>[0]) => g.input.keyName(a);
  return [
    `Move ${k('left')}/${k('right')} · Jump ${k('jump')} (hold for height, ↓+Jump drops through planks)`,
    `Light ${k('light')} — chain combos · ↑+Light: launcher · Light in air: aerial chain`,
    `Heavy ${k('heavy')} — finisher/chargeable (hold) · Heavy in air: plunge`,
    `Dodge ${k('dodge')} — invulnerable roll; dodge at the last moment for a PERFECT dodge`,
    `Guard ${k('guard')} (hold) — tap right before a hit to PARRY: the foe staggers and your next attack is a critical Riposte. Red-flashing attacks cannot be blocked — dodge them!`,
    `Weapon Art ${k('art')} · Spells ${k('spell1')}/${k('spell2')} — cost Aether (gained by hitting)`,
    `Lamp Oil ${k('potion')} heals · ${k('inventory')} Character · ${k('map')} Map · Esc Pause`,
    '',
    'Hit-confirm: landing a hit lets you chain sooner. Attacks can be dodge-cancelled after their recovery begins. Arts can cancel any attack\'s recovery.',
  ].join('\n');
}
