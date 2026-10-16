import { UI_H, UI_W } from '../../core/constants';
import { Rng } from '../../core/rng';
import { ITEMS, MAX_PLUS, RARITY_COLOR, type ItemInst } from '../../data/items';
import type { Game, Panel } from '../../game';
import { canEvolve, craft, evolve, recipeCost, refine, refineCost, reroll, rerollCost, salvageValue, upgrade, upgradeCost, type Wallet } from '../../meta/forge';
import { affixText, itemName, itemScore } from '../../meta/items';
import { EQUIP_SLOTS, unlocks, type Profile } from '../../meta/profile';
import type { RunState } from '../../meta/run';
import { C, ListNav, dim, hints, panel, para, scrollbar, selRow, tabs, text, type Ctx } from '../ui';
import { itemTooltip } from './character';
import { ConfirmPanel } from './common';

type Mode = 'hub' | 'run';

export class ForgePanel implements Panel {
  closed = false;
  tab = 0;
  nav = new ListNav(11);
  affNav = 0;
  sacrifice: ItemInst | null = null;
  rng = new Rng(Date.now() & 0xffffff);
  tabNames: string[];
  constructor(public profile: Profile, public run: RunState | null, public mode: Mode, public onChange: () => void) {
    this.tabNames = mode === 'hub' ? ['Upgrade', 'Refine', 'Reroll', 'Salvage', 'Evolve', 'Craft'] : ['Temper (free)', 'Sacrifice', 'Upgrade'];
  }
  private wallet(): Wallet {
    return this.mode === 'run' && this.run ? this.run : this.profile;
  }
  private equippedUids(): string[] {
    const eq = this.run ? this.run.equipped : this.profile.equipped;
    return EQUIP_SLOTS.map((s) => eq[s]).filter(Boolean) as string[];
  }
  private items(): ItemInst[] {
    const eq = this.equippedUids();
    const all = [...this.profile.stash, ...(this.run?.items ?? [])];
    const tab = this.tabNames[this.tab];
    let list = all;
    if (tab === 'Salvage') list = all.filter((i) => !eq.includes(i.uid) && !i.locked);
    if (tab === 'Sacrifice' && !this.sacrifice) list = all.filter((i) => !eq.includes(i.uid));
    if (tab === 'Sacrifice' && this.sacrifice) list = all.filter((i) => i !== this.sacrifice);
    if (tab === 'Evolve') list = all.filter((i) => ITEMS[i.baseId].evolvesTo);
    return list.sort((a, b) => Number(eq.includes(b.uid)) - Number(eq.includes(a.uid)) || itemScore(b) - itemScore(a));
  }
  private recipes(): string[] {
    return this.profile.recipes.filter((r) => ITEMS[r]);
  }

  update(g: Game): void {
    const inp = g.input;
    if (inp.take('tabL')) {
      this.tab = (this.tab - 1 + this.tabNames.length) % this.tabNames.length;
      this.sacrifice = null;
      g.sfx('menu');
    }
    if (inp.take('tabR')) {
      this.tab = (this.tab + 1) % this.tabNames.length;
      this.sacrifice = null;
      g.sfx('menu');
    }
    const tab = this.tabNames[this.tab];
    if (tab === 'Craft') {
      const rs = this.recipes();
      if (this.nav.update(inp, rs.length)) g.sfx('menu');
      if (inp.take('confirm') && rs.length) {
        const it = craft(this.rng, this.profile, rs[this.nav.i]);
        if (it) {
          g.sfx('rare');
          g.toast(`Crafted ${itemName(it)}`, RARITY_COLOR[it.rarity]);
          this.onChange();
        } else g.sfx('cancel');
      }
    } else {
      const list = this.items();
      if (this.nav.update(inp, list.length)) {
        this.affNav = 0;
        g.sfx('menu');
      }
      const it = list[this.nav.i];
      if ((tab === 'Refine' || tab === 'Reroll') && it?.affixes.length) {
        if (inp.take('left')) this.affNav = (this.affNav - 1 + it.affixes.length) % it.affixes.length;
        if (inp.take('right')) this.affNav = (this.affNav + 1) % it.affixes.length;
      }
      if (inp.take('confirm') && it) this.act(g, tab, it);
    }
    if (inp.take('back') || inp.take('pause')) {
      if (this.sacrifice) this.sacrifice = null;
      else this.closed = true;
      g.sfx('cancel');
    }
  }

  private act(g: Game, tab: string, it: ItemInst): void {
    const w = this.wallet();
    const ok = (msg: string) => {
      g.sfx('confirm');
      g.toast(msg, C.good);
      this.onChange();
    };
    switch (tab) {
      case 'Upgrade':
        if (upgrade(it, w)) ok(`${itemName(it)}`);
        else g.sfx('cancel');
        break;
      case 'Temper (free)':
        if (!this.run?.freeForge) return void g.toast('The forge has cooled — one free temper per forge.', C.bad);
        if (it.plus >= MAX_PLUS) return void g.sfx('cancel');
        it.plus++;
        this.run.freeForge = false;
        ok(`Tempered: ${itemName(it)}`);
        break;
      case 'Sacrifice':
        if (!this.sacrifice) {
          this.sacrifice = it;
          g.sfx('menu');
          this.nav.i = 0;
        } else {
          const victim = this.sacrifice;
          g.push(new ConfirmPanel(`Destroy ${itemName(victim)} to grant ${itemName(it)} +2?`, () => {
            this.removeItem(victim);
            it.plus = Math.min(MAX_PLUS, it.plus + 2);
            this.sacrifice = null;
            ok(`Empowered: ${itemName(it)}`);
          }));
        }
        break;
      case 'Refine':
        if (!it.affixes.length) return void g.sfx('cancel');
        if (refine(it, this.affNav, w)) ok('Affix refined');
        else g.sfx('cancel');
        break;
      case 'Reroll':
        if (!unlocks(this.profile).has('forge_reroll')) return void g.toast('Requires Starboard: Reforging', C.bad);
        if (!it.affixes.length) return void g.sfx('cancel');
        if (reroll(this.rng, it, this.affNav, w)) ok('Affix rerolled');
        else g.sfx('cancel');
        break;
      case 'Salvage': {
        const v = salvageValue(it);
        g.push(new ConfirmPanel(`Salvage ${itemName(it)} for ${v.slag} Slag${v.echoes ? `, ${v.echoes} Echoes` : ''}${v.starglass ? `, ${v.starglass} Starglass` : ''}?`, () => {
          this.removeItem(it);
          w.slag += v.slag;
          w.echoes += v.echoes;
          w.starglass += v.starglass;
          ok('Salvaged');
        }));
        break;
      }
      case 'Evolve': {
        const c = canEvolve(this.profile, it);
        if (!c.ok) return void g.toast(c.reason, C.bad);
        g.push(new ConfirmPanel(`${c.reason}? (3 Starglass)`, () => {
          evolve(this.profile, it);
          g.sfx('legendary');
          ok(`Evolved into ${itemName(it)}!`);
        }));
        break;
      }
    }
  }

  private removeItem(it: ItemInst): void {
    this.profile.stash = this.profile.stash.filter((x) => x !== it);
    if (this.run) this.run.items = this.run.items.filter((x) => x !== it);
  }

  draw(g: Ctx, game: Game): void {
    dim(g, 0.75);
    panel(g, 20, 16, UI_W - 40, UI_H - 32);
    tabs(g, this.tabNames, this.tab, 36, 26, game.input);
    const w = this.wallet();
    text(g, `Slag ${w.slag}  ·  Starglass ${w.starglass}  ·  Echoes ${w.echoes}${this.mode === 'run' ? '  (unbanked)' : ''}`, UI_W - 40, 30, '#e8c8a0', 13, 'right', true);
    const tab = this.tabNames[this.tab];
    const eq = this.equippedUids();
    if (tab === 'Craft') {
      const rs = this.recipes();
      text(g, 'RECIPES — unlocked by mastering gear and defeating guardians', 40, 66, C.dim, 12, 'left', true);
      if (!rs.length) para(g, 'No recipes yet. Reach Mastery Lv5 with an item or defeat a depth guardian.', 40, 90, 500, C.text, 14);
      rs.forEach((id, i) => {
        const y = 90 + i * 32;
        selRow(g, 36, y, 420, 30, this.nav.i === i, game.t);
        const b = ITEMS[id];
        const c = recipeCost(id);
        text(g, b.name, 48, y + 7, b.legendary ? RARITY_COLOR.legendary : RARITY_COLOR.rare, 14, 'left', true);
        text(g, `${c.slag} Slag${c.starglass ? ` · ${c.starglass} Starglass` : ''}`, 444, y + 9, C.dim, 12, 'right');
      });
      const id = rs[this.nav.i];
      if (id) para(g, `${ITEMS[id].passive.name}: ${ITEMS[id].passive.text}\n\n${ITEMS[id].flavor}`, 480, 90, 420, C.text, 13);
      hints(g, game.input, [['confirm', 'Craft'], ['back', 'Close']], UI_W - 30, UI_H - 40);
      return;
    }
    const list = this.items();
    const desc: Record<string, string> = {
      Upgrade: 'Raise an item\'s level: +10% base Attack/Defense/Magic/HP per level. Costs Slag (and Starglass past +6).',
      Refine: 'Strengthen one affix by 15%. ←/→ choose affix.',
      Reroll: 'Replace one affix with a new random one. ←/→ choose affix. Costs Echoes.',
      Salvage: 'Break down unequipped gear into materials.',
      Evolve: 'Mastered (Lv5) items at +5 can evolve into a stronger form, keeping affixes.',
      'Temper (free)': this.run?.freeForge ? 'The forge is hot: one free +1 upgrade.' : 'The forge has cooled — you already used the free temper.',
      Sacrifice: this.sacrifice ? `Sacrificing ${itemName(this.sacrifice)} — now choose the item to receive +2.` : 'Choose an item to destroy. Another item gains +2 levels.',
    };
    para(g, desc[tab], 40, 62, 560, C.dim, 12);
    const nav = this.nav;
    for (let k = 0; k < nav.visible; k++) {
      const idx = nav.scroll + k;
      if (idx >= list.length) break;
      const it = list[idx];
      const y = 96 + k * 34;
      selRow(g, 36, y, 420, 30, nav.i === idx, game.t);
      text(g, itemName(it), 48, y + 7, RARITY_COLOR[it.rarity], 14, 'left', true);
      let right = '';
      if (tab === 'Upgrade') {
        const c = upgradeCost(it);
        right = it.plus >= MAX_PLUS ? 'MAX' : `${c.slag} Slag${c.starglass ? ` +${c.starglass} SG` : ''}`;
      } else if (tab === 'Salvage') right = `→ ${salvageValue(it).slag} Slag`;
      else if (tab === 'Refine') right = `${refineCost(it).slag} Slag + 1 SG`;
      else if (tab === 'Reroll') right = `${rerollCost(it)} Echoes`;
      else if (tab === 'Evolve') right = canEvolve(this.profile, it).ok ? 'READY' : '';
      if (eq.includes(it.uid)) text(g, 'E', 300, y + 8, C.good, 12, 'left', true);
      text(g, right, 444, y + 9, C.dim, 12, 'right');
    }
    scrollbar(g, 460, 96, nav.visible * 34, list.length, nav.visible, nav.scroll);
    const it = list[nav.i];
    if (it) {
      const y = itemTooltip(g, it, this.profile, 480, 70, 420);
      if ((tab === 'Refine' || tab === 'Reroll') && it.affixes.length) {
        text(g, 'TARGET AFFIX', 480, y + 10, C.dim, 12, 'left', true);
        it.affixes.forEach((a, i) => {
          selRow(g, 480, y + 28 + i * 24, 420, 22, i === this.affNav, game.t);
          text(g, affixText(a), 490, y + 32 + i * 24, '#9fd0ff', 13);
        });
      }
      if (tab === 'Evolve') para(g, canEvolve(this.profile, it).reason, 480, y + 10, 420, canEvolve(this.profile, it).ok ? C.good : C.bad, 13);
    }
    hints(g, game.input, [['confirm', 'Apply'], ['back', 'Back']], UI_W - 30, UI_H - 40);
  }
}
