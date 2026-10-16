import { UI_W } from '../core/constants';
import { Rng } from '../core/rng';
import { RARITY_COLOR, type Rarity } from '../data/items';
import { MOVESETS } from '../data/movesets';
import { RELICS } from '../data/relics';
import { ROOMS } from '../data/rooms';
import type { Game } from '../game';
import { buildLoadout } from '../meta/build';
import { baseOf, itemName, rarityIndex, rollItem } from '../meta/items';
import { DIFFICULTIES, findItem, unlocks } from '../meta/profile';
import { relicOffers, resolveDeath, startRun } from '../meta/run';
import type { SimEvent } from '../sim/events';
import { Room } from '../sim/room';
import { World } from '../sim/world';
import { BoardPanel } from '../ui/panels/board';
import { CharacterPanel } from '../ui/panels/character';
import { CodexPanel } from '../ui/panels/codex';
import { ChoicePanel, ConfirmPanel, MenuPanel, MessagePanel } from '../ui/panels/common';
import { ForgePanel } from '../ui/panels/forge';
import { SettingsPanel } from '../ui/panels/settings';
import { ShopPanel, type Offer } from '../ui/panels/shop';
import { C, textShadow, type Ctx } from '../ui/ui';
import { ArenaScene } from './arena';
import { ExpeditionScene, controlsText } from './expedition';
import { PlayScene } from './play';
import { drawStation, type Station, type StationKind } from './stations';
import { TitleScene } from './title';

const HUB_STATIONS: [string, StationKind, string][] = [
  ['1', 'gate', 'Expedition Gate'],
  ['2', 'armory', 'Armory (equipment)'],
  ['3', 'forge', 'Forge'],
  ['4', 'board', 'Starboard'],
  ['5', 'merchant', 'Merchant'],
  ['6', 'archive', 'Archive (codex)'],
  ['7', 'training', 'Training Grounds'],
  ['8', 'notice', 'Notice Board (settings & help)'],
];

export class HubScene extends PlayScene {
  name = 'hub';
  stations: Station[] = [];
  near: Station | null = null;
  shop: Offer[] | null = null;

  constructor(game: Game) {
    super(game);
  }

  enter(g: Game): void {
    const room = new Room(ROOMS.hub);
    const b = buildLoadout(g.profile, null);
    this.world = new World(room, b.loadout, g.input, 1);
    this.world.peaceful = true;
    this.world.startWaves([]);
    this.world.exitOpen = false;
    this.renderer.setRoom(room, 'hub', 7, this.world);
    this.stations = HUB_STATIONS.map(([k, kind, label]) => ({ kind, label, x: room.stations[k].x, y: room.stations[k].y }));
    g.audio.setMusic('hub');
    this.roomBanner = { text: 'Lamplight', sub: 'The last town above the Cinderdeep', t: 0 };
    if (!g.profile.flags.welcome) {
      g.profile.flags.welcome = true;
      g.push(new MessagePanel('Welcome, Wick', 'Lamplight sits above the Cinderdeep. Walk between the stations and press Up (or E) to use them.\n\n• Expedition Gate — descend. Enemies, loot and relics await.\n• Armory — change equipment. Every item has a passive; master items to learn them forever.\n• Starboard — spend Cinders on permanent upgrades, new weapons and spells.\n• Forge — upgrade, refine and evolve gear.\n• Training Grounds — test weapons and tune combat feel (F1).\n\nDeath keeps your Cinders, mastery and the gear you brought. Defeat a depth guardian to bank everything you found.', undefined, 640));
    }
    if (g.saveNotice) {
      g.toast(g.saveNotice, C.bad, 6000);
      g.saveNotice = '';
    }
    g.save();
  }

  private rebuild(): void {
    this.world.setLoadout(buildLoadout(this.game.profile, null).loadout);
    this.world.player.hp = this.world.player.derived.maxHp;
  }

  protected hotkeys(g: Game): boolean {
    const inp = g.input;
    if (inp.take('pause')) {
      const m: MenuPanel = new MenuPanel('Lamplight', [
        { label: 'Resume', action: () => (m.closed = true) },
        { label: 'Character', action: () => g.push(this.charPanel(g)) },
        { label: 'Controls', action: () => g.push(new MessagePanel('Controls', controlsText(g), undefined, 640)) },
        { label: 'Settings', action: () => g.push(new SettingsPanel(g, () => g.setScene(new TitleScene(g)))) },
        { label: 'Quit to Title', action: () => g.setScene(new TitleScene(g)) },
      ]);
      g.push(m);
      return true;
    }
    if (inp.take('inventory')) {
      g.push(this.charPanel(g));
      return true;
    }
    const p = this.world.player;
    this.near = null;
    for (const s of this.stations) if (Math.abs(p.x - s.x) < 22) this.near = s;
    if (this.near && p.onGround && p.state === 'free' && (inp.take('up') || inp.take('interact'))) {
      this.use(g, this.near);
      return true;
    }
    return false;
  }

  private charPanel(g: Game): CharacterPanel {
    return new CharacterPanel({ profile: g.profile, run: null, onChange: () => { this.rebuild(); g.save(); } });
  }

  private use(g: Game, s: Station): void {
    const prof = g.profile;
    g.sfx('confirm');
    switch (s.kind) {
      case 'gate': return this.gate(g);
      case 'armory': return g.push(this.charPanel(g));
      case 'forge': return g.push(new ForgePanel(prof, null, 'hub', () => { this.rebuild(); g.save(); }));
      case 'board': return g.push(new BoardPanel(prof, () => { this.rebuild(); g.save(); }));
      case 'archive': return g.push(new CodexPanel(prof));
      case 'training': return g.setScene(new ArenaScene(g));
      case 'notice': {
        const m: MenuPanel = new MenuPanel('Notice Board', [
          { label: 'How to Play', action: () => g.push(new MessagePanel('How to Play', HOW_TO_PLAY, undefined, 680)) },
          { label: 'Controls', action: () => g.push(new MessagePanel('Controls', controlsText(g), undefined, 640)) },
          { label: 'Settings', action: () => g.push(new SettingsPanel(g, () => g.setScene(new TitleScene(g)))) },
          { label: 'Close', action: () => (m.closed = true) },
        ]);
        return g.push(m);
      }
      case 'merchant': {
        if (!this.shop) this.shop = this.hubShop(g);
        return g.push(new ShopPanel('Lamplight Merchant', this.shop, prof, prof, (o) => {
          if (o.item) {
            prof.stash.push(o.item);
            if (!prof.codex.items.includes(o.item.baseId)) prof.codex.items.push(o.item.baseId);
            g.toast(`Bought ${itemName(o.item)}`, RARITY_COLOR[o.item.rarity]);
          }
          if (o.kind === 'slag') prof.slag += 10;
          if (o.kind === 'echoes') prof.echoes += 2;
          if (o.kind === 'starglass') prof.starglass += 1;
          g.save();
        }));
      }
    }
  }

  private hubShop(g: Game): Offer[] {
    const prof = g.profile;
    const rng = new Rng((prof.records.runs + 1) * 7777);
    const depth = Math.max(1, Math.min(3, prof.records.bestDepth));
    const offers: Offer[] = [];
    const price = (r: Rarity) => [30, 60, 110, 200, 400][rarityIndex(r)] * (1 + (depth - 1) * 0.5);
    for (let i = 0; i < 5; i++) {
      const it = rollItem(rng, { depth, luck: 0.2, unlocks: unlocks(prof), minRarity: i < 2 ? 'uncommon' : 'common' });
      offers.push({ kind: 'item', label: itemName(it), price: Math.round(price(it.rarity)), item: it });
    }
    offers.push({ kind: 'slag', label: '10 Slag', price: 40, desc: 'Common forge material for upgrades.', repeat: true });
    offers.push({ kind: 'echoes', label: '2 Echoes', price: 60, desc: 'Used to reroll affixes (requires Reforging).', repeat: true });
    if (prof.records.bestDepth >= 1) offers.push({ kind: 'starglass', label: '1 Starglass', price: 150, desc: 'Rare guardian material for high upgrades, refining and evolution.', repeat: true });
    return offers;
  }

  private gate(g: Game): void {
    const prof = g.profile;
    if (prof.run) {
      const m: MenuPanel = new MenuPanel('Expedition Gate', [
        { label: `Resume Expedition (Depth ${prof.run.depth})`, action: () => { m.closed = true; g.setScene(new ExpeditionScene(g)); } },
        {
          label: 'Abandon Expedition', sub: 'treated as death', action: () => g.push(new ConfirmPanel('Abandon the saved expedition? Unbanked finds will be lost as if you died.', () => {
            m.closed = true;
            resolveDeath(prof, prof.run!);
            prof.records.deaths++;
            prof.records.runs++;
            prof.run = null;
            g.save();
            this.rebuild();
          })),
        },
        { label: 'Close', action: () => (m.closed = true) },
      ], 420);
      g.push(m);
      return;
    }
    const weapon = findItem(prof, prof.equipped.weapon);
    const cls = weapon ? baseOf(weapon).cls! : 'fang';
    const items = DIFFICULTIES.slice(0, prof.difficultyUnlocked + 1).map((d, i) => ({
      label: `Descend — ${d.name}`,
      sub: i === 0 ? 'standard' : `+${Math.round(d.loot * 100)}% loot`,
      action: () => {
        menu.closed = true;
        prof.difficulty = i;
        this.begin(g);
      },
    }));
    items.push({ label: 'Not yet', sub: '', action: () => (menu.closed = true) });
    const menu = new MenuPanel(`Expedition Gate — wielding ${MOVESETS[cls].name}`, items, 480);
    g.push(menu);
  }

  private begin(g: Game): void {
    const prof = g.profile;
    const seed = (Date.now() ^ (prof.records.runs * 2654435761)) >>> 0;
    const run = startRun(prof, seed);
    prof.run = run;
    const go = () => {
      g.save();
      g.setScene(new ExpeditionScene(g));
    };
    if (unlocks(prof).has('start_relic')) {
      const offers = relicOffers(new Rng(seed), run, 3, 'common', 'rare');
      g.push(new ChoicePanel('Relic Hunter', 'Choose a starting relic for this expedition.', offers.map((x) => ({ title: x.name, color: RARITY_COLOR[x.rarity], sub: `${x.rarity} relic`, body: x.text })), (i) => {
        run.relics.push(offers[i].id);
        if (!prof.codex.relics.includes(offers[i].id)) prof.codex.relics.push(offers[i].id);
        go();
      }));
    } else go();
  }

  protected onEvent(_g: Game, _e: SimEvent): void {}

  protected extraDraw(g: CanvasRenderingContext2D, cx: number, cy: number): void {
    for (const s of this.stations) drawStation(g, s, s.x - cx, s.y - cy, this.renderer.time, s === this.near);
  }

  protected drawHud(ctx: Ctx, g: Game): void {
    const prof = g.profile;
    textShadow(ctx, `${Math.floor(prof.cinders)} Cinders`, UI_W - 16, 14, C.cinder, 16, 'right', true);
    textShadow(ctx, `${Math.floor(prof.gilt)} Gilt`, UI_W - 16, 36, C.gilt, 14, 'right', true);
    textShadow(ctx, `Slag ${prof.slag} · Starglass ${prof.starglass} · Echoes ${prof.echoes}`, UI_W - 16, 56, '#e8c8a0', 12, 'right');
    if (prof.run) textShadow(ctx, `Expedition in progress — Depth ${prof.run.depth}`, UI_W - 16, 76, C.good, 12, 'right');
    textShadow(ctx, `${g.input.keyName('inventory')} Character · Esc Menu`, 16, 16, C.dim, 12, 'left');
    if (this.near) textShadow(ctx, `${g.input.keyName('up')} / ${g.input.keyName('interact')}  ${this.near.label}`, UI_W / 2, 360, '#ffe9a8', 16, 'center', true);
    if (this.roomBanner) {
      const b = this.roomBanner;
      const a = b.t < 300 ? b.t / 300 : b.t > 2000 ? Math.max(0, 1 - (b.t - 2000) / 600) : 1;
      ctx.globalAlpha = a;
      textShadow(ctx, b.text, UI_W / 2, 118, C.title, 26, 'center', true);
      textShadow(ctx, b.sub, UI_W / 2, 150, C.dim, 14, 'center');
      ctx.globalAlpha = 1;
    }
    void RELICS;
  }
}

const HOW_TO_PLAY = `EXPEDITIONS — Each expedition has up to three Depths. A Depth is a branching map of rooms ending in a Guardian. Choose your path: elites guarantee strong loot, shrines trade curses for power, forges and merchants improve your build.

POWER — Kill foes to gain run levels; every second level offers a relic. Relics stack into synergies (crit → fire bursts, shock chains, combo buffs…). Equipment drops with affixes and a passive.

BANKING — Items, Gilt and materials found are "unbanked" until you defeat a Guardian. At each Guardian checkpoint you may extract safely or descend for better rewards.

DEATH — You keep: Cinders, equipment mastery, learned passives, recipes, codex, and all gear you brought. You lose unbanked finds except the single best item, plus half of unbanked Gilt/materials.

MASTERY — Every hit with a weapon (and every dodge, block and kill with armor/shields/charms) builds that item's mastery. Lv3 permanently teaches its passive; Lv5 unlocks evolution and a recipe.

STARBOARD — Spend Cinders on permanent stats, new weapon classes, double jump, air dash, spells, passive slots and forge upgrades. Respec is free.`;
