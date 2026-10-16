import { UI_H, UI_W } from '../../core/constants';
import { fmt } from '../../core/math';
import { ITEMS, RARITY_COLOR, type ItemInst } from '../../data/items';
import { MOVESETS } from '../../data/movesets';
import { CURSES, RELICS } from '../../data/relics';
import { SPELLS } from '../../data/spells';
import type { Game, Panel } from '../../game';
import { buildLoadout } from '../../meta/build';
import { baseOf, describeItem, itemName, itemScore } from '../../meta/items';
import { LEARN_LEVEL, MASTERY_REWARDS, masteryLevel, masteryProgress } from '../../meta/mastery';
import { EQUIP_SLOTS, passiveSlots, unlockedSpells, type EquipSlot, type Profile } from '../../meta/profile';
import type { RunState } from '../../meta/run';
import { derive, STAT_INFO, STAT_KEYS, type Derived, type StatKey } from '../../sim/stats';
import { C, ListNav, bar, dim, hints, panel, para, scrollbar, selRow, tabs, text, type Ctx } from '../ui';

export interface BuildCtx {
  profile: Profile;
  run: RunState | null;
  onChange: () => void;
}

const SLOT_LABEL: Record<EquipSlot, string> = { weapon: 'Weapon', shield: 'Shield', armor: 'Armor', charm1: 'Charm I', charm2: 'Charm II' };

export function itemTooltip(g: Ctx, it: ItemInst, profile: Profile, x: number, y: number, w: number): number {
  const d = describeItem(it);
  const b = baseOf(it);
  text(g, d.title, x, y, RARITY_COLOR[it.rarity], 17, 'left', true);
  y += 24;
  for (const l of d.lines) y = para(g, l.text, x, y, w, l.color ?? C.text, 13) + 2;
  const mp = masteryProgress(profile.mastery[b.id] ?? 0);
  y += 4;
  text(g, `Mastery Lv ${mp.level}/5`, x, y, '#ffb86a', 13, 'left', true);
  bar(g, x + 120, y + 4, w - 120, 6, mp.cur / mp.need, '#ffb86a');
  y += 18;
  if (mp.level < 5) y = para(g, `Next: ${MASTERY_REWARDS[mp.level + 1]}`, x, y, w, C.dim, 12) + 2;
  if (mp.level >= LEARN_LEVEL) y = para(g, `✓ Passive learned — can be slotted in Passives.`, x, y, w, C.good, 12);
  return y;
}

export class CharacterPanel implements Panel {
  closed = false;
  tab = 0;
  slotNav = new ListNav(5);
  itemNav = new ListNav(11);
  passNav = new ListNav(12);
  spellSlot = 0;
  spellNav = new ListNav(8);
  statNav = new ListNav(18);
  relNav = new ListNav(10);
  focus: 'slots' | 'items' = 'slots';
  tabNames: string[];
  constructor(public ctx: BuildCtx) {
    this.tabNames = ctx.run ? ['Equipment', 'Passives', 'Spells', 'Stats', 'Relics'] : ['Equipment', 'Passives', 'Spells', 'Stats'];
  }

  private equippedMap(): Record<EquipSlot, string | null> {
    return this.ctx.run ? this.ctx.run.equipped : this.ctx.profile.equipped;
  }
  private allItems(): ItemInst[] {
    return [...this.ctx.profile.stash, ...(this.ctx.run?.items ?? [])];
  }
  private candidates(slot: EquipSlot): (ItemInst | null)[] {
    const kind = slot.startsWith('charm') ? 'charm' : slot;
    const eq = this.equippedMap();
    const other = slot === 'charm1' ? eq.charm2 : slot === 'charm2' ? eq.charm1 : null;
    const list = this.allItems().filter((i) => baseOf(i).slot === kind && i.uid !== other).sort((a, b) => itemScore(b) - itemScore(a));
    return slot === 'weapon' ? list : [null, ...list];
  }
  private derivedWith(override?: Partial<Record<EquipSlot, string | null>>): { d: Derived; passives: string[] } {
    const b = buildLoadout(this.ctx.profile, this.ctx.run, override);
    return { d: derive(b.loadout.stats), passives: b.activePassives };
  }

  update(g: Game): void {
    const inp = g.input;
    if (inp.take('tabL')) {
      this.tab = (this.tab - 1 + this.tabNames.length) % this.tabNames.length;
      g.sfx('menu');
    }
    if (inp.take('tabR')) {
      this.tab = (this.tab + 1) % this.tabNames.length;
      g.sfx('menu');
    }
    const name = this.tabNames[this.tab];
    if (name === 'Equipment') this.updateEquip(g);
    else if (name === 'Passives') this.updatePassives(g);
    else if (name === 'Spells') this.updateSpells(g);
    else if (name === 'Stats') this.statNav.update(inp, STAT_KEYS.length);
    else if (name === 'Relics') this.relNav.update(inp, (this.ctx.run?.relics.length ?? 0) + (this.ctx.run?.curses.length ?? 0));
    if (inp.take('inventory') || inp.take('pause') || (inp.take('back') && (name !== 'Equipment' || this.focus === 'slots'))) {
      this.closed = true;
      g.sfx('cancel');
    }
  }

  private updateEquip(g: Game): void {
    const inp = g.input;
    if (this.focus === 'slots') {
      if (this.slotNav.update(inp, EQUIP_SLOTS.length)) g.sfx('menu');
      if (inp.take('confirm') || inp.take('right')) {
        this.focus = 'items';
        const slot = EQUIP_SLOTS[this.slotNav.i];
        const cands = this.candidates(slot);
        const cur = this.equippedMap()[slot];
        this.itemNav.i = Math.max(0, cands.findIndex((c) => (c?.uid ?? null) === cur));
        this.itemNav.scroll = Math.max(0, this.itemNav.i - 5);
        g.sfx('menu');
      }
    } else {
      const slot = EQUIP_SLOTS[this.slotNav.i];
      const cands = this.candidates(slot);
      if (this.itemNav.update(inp, cands.length)) g.sfx('menu');
      const it = cands[this.itemNav.i];
      if (it?.isNew) it.isNew = false;
      if (inp.take('confirm')) {
        this.equippedMap()[slot] = it?.uid ?? null;
        g.sfx('confirm');
        this.ctx.onChange();
        this.focus = 'slots';
      } else if (inp.take('back') || inp.take('left')) {
        this.focus = 'slots';
        g.sfx('cancel');
      }
    }
  }

  private learned(): string[] {
    const p = this.ctx.profile;
    return Object.keys(p.mastery).filter((id) => ITEMS[id] && masteryLevel(p.mastery[id]) >= LEARN_LEVEL);
  }
  private updatePassives(g: Game): void {
    const list = this.learned();
    if (this.passNav.update(g.input, list.length)) g.sfx('menu');
    if (g.input.take('confirm') && list.length) {
      const id = list[this.passNav.i];
      const p = this.ctx.profile;
      if (p.slotted.includes(id)) p.slotted = p.slotted.filter((x) => x !== id);
      else if (p.slotted.length < passiveSlots(p)) p.slotted.push(id);
      else {
        g.toast('All passive slots are full', C.bad);
        return;
      }
      g.sfx('confirm');
      this.ctx.onChange();
    }
  }
  private updateSpells(g: Game): void {
    const opts = [null, ...unlockedSpells(this.ctx.profile)];
    if (g.input.take('tabL') || g.input.take('left')) this.spellSlot = 0;
    if (g.input.take('right')) this.spellSlot = 1;
    if (this.spellNav.update(g.input, opts.length)) g.sfx('menu');
    if (g.input.take('confirm')) {
      const s = opts[this.spellNav.i];
      const p = this.ctx.profile;
      const other = 1 - this.spellSlot;
      if (s && p.spells[other] === s) p.spells[other] = null;
      p.spells[this.spellSlot] = s;
      g.sfx('confirm');
      this.ctx.onChange();
    }
  }

  draw(g: Ctx, game: Game): void {
    dim(g, 0.7);
    panel(g, 20, 16, UI_W - 40, UI_H - 32);
    tabs(g, this.tabNames, this.tab, 36, 26, game.input);
    const name = this.tabNames[this.tab];
    if (name === 'Equipment') this.drawEquip(g, game);
    else if (name === 'Passives') this.drawPassives(g, game);
    else if (name === 'Spells') this.drawSpells(g, game);
    else if (name === 'Stats') this.drawStats(g, game);
    else this.drawRelics(g, game);
    hints(g, game.input, [['confirm', 'Select'], ['back', 'Back'], ['inventory', 'Close']], UI_W - 30, UI_H - 40);
  }

  private drawEquip(g: Ctx, game: Game): void {
    const eq = this.equippedMap();
    const all = this.allItems();
    const p = this.ctx.profile;
    text(g, 'EQUIPPED', 40, 66, C.dim, 12, 'left', true);
    EQUIP_SLOTS.forEach((s, i) => {
      const y = 84 + i * 52;
      const it = all.find((x) => x.uid === eq[s]) ?? null;
      selRow(g, 36, y, 280, 48, this.focus === 'slots' && this.slotNav.i === i, game.t);
      text(g, SLOT_LABEL[s], 48, y + 6, C.dim, 11);
      text(g, it ? itemName(it) : '— empty —', 48, y + 22, it ? RARITY_COLOR[it.rarity] : '#555', 15, 'left', true);
      if (it) {
        const lv = masteryLevel(p.mastery[it.baseId] ?? 0);
        text(g, `M${lv}`, 300, y + 22, '#ffb86a', 12, 'right', true);
      }
    });
    // current summary
    const cur = this.derivedWith();
    const weapon = all.find((x) => x.uid === eq.weapon);
    const cls = weapon ? baseOf(weapon).cls! : 'fang';
    text(g, MOVESETS[cls].name.toUpperCase() + ' STYLE', 40, 352, '#c8b8a0', 13, 'left', true);
    para(g, MOVESETS[cls].rhythm, 40, 370, 280, C.dim, 12);
    text(g, 'ACTIVE PASSIVES', 40, 420, C.dim, 12, 'left', true);
    para(g, cur.passives.join(' · ') || 'none', 40, 436, 280, '#ffd27a', 12);

    if (this.focus === 'items') {
      const slot = EQUIP_SLOTS[this.slotNav.i];
      const cands = this.candidates(slot);
      text(g, `CHOOSE ${SLOT_LABEL[slot].toUpperCase()} (${cands.filter(Boolean).length})`, 340, 66, C.dim, 12, 'left', true);
      const nav = this.itemNav;
      for (let k = 0; k < nav.visible; k++) {
        const idx = nav.scroll + k;
        const it = cands[idx];
        if (idx >= cands.length) break;
        const y = 84 + k * 34;
        selRow(g, 336, y, 250, 30, nav.i === idx, game.t);
        const isEq = (it?.uid ?? null) === eq[slot];
        text(g, it ? itemName(it) : '— none —', 348, y + 7, it ? RARITY_COLOR[it.rarity] : C.dim, 14, 'left', true);
        if (isEq) text(g, 'E', 576, y + 8, C.good, 12, 'right', true);
        else if (it?.isNew) text(g, 'NEW', 576, y + 8, '#ffd23c', 11, 'right', true);
        else if (it && this.ctx.run?.items.includes(it)) text(g, 'unbanked', 576, y + 9, C.cinder, 10, 'right');
      }
      scrollbar(g, 590, 84, nav.visible * 34, cands.length, nav.visible, nav.scroll);
      const it = cands[nav.i];
      // comparison
      const next = this.derivedWith({ [slot]: it?.uid ?? null });
      this.drawCompare(g, cur.d, next.d, 610, 66, cur.passives, next.passives);
      if (it) itemTooltip(g, it, p, 610, 250, 300);
    } else {
      const it = all.find((x) => x.uid === eq[EQUIP_SLOTS[this.slotNav.i]]);
      this.drawCompare(g, cur.d, cur.d, 610, 66, cur.passives, cur.passives);
      if (it) itemTooltip(g, it, p, 610, 250, 300);
      else text(g, 'Select a slot to change equipment.', 610, 260, C.dim, 13);
    }
  }

  private drawCompare(g: Ctx, a: Derived, b: Derived, x: number, y: number, pa: string[], pb: string[]): void {
    text(g, 'STATS', x, y, C.dim, 12, 'left', true);
    const rows: [string, number, number, boolean?][] = [
      ['Attack', a.atk, b.atk], ['Magic', a.magic, b.magic], ['Defense', a.def, b.def], ['Max HP', a.maxHp, b.maxHp],
      ['Crit', a.critChance * 100, b.critChance * 100, true], ['Crit Dmg', (a.critMult - 1) * 100, (b.critMult - 1) * 100, true],
      ['Atk Speed', (a.speedMult - 1) * 100, (b.speedMult - 1) * 100, true], ['Damage', a.s.dmgPct * 100, b.s.dmgPct * 100, true],
    ];
    rows.forEach(([n, va, vb, pct], i) => {
      const yy = y + 18 + (i % 4) * 18;
      const xx = x + (i >= 4 ? 160 : 0);
      text(g, n, xx, yy, C.dim, 13);
      text(g, `${Math.round(vb)}${pct ? '%' : ''}`, xx + 100, yy, C.text, 13, 'right', true);
      const dlt = vb - va;
      if (Math.abs(dlt) >= 0.5) text(g, `${dlt > 0 ? '▲' : '▼'}${Math.abs(Math.round(dlt))}`, xx + 106, yy, dlt > 0 ? C.good : C.bad, 12);
    });
    const gained = pb.filter((x) => !pa.includes(x));
    const lost = pa.filter((x) => !pb.includes(x));
    let yy = y + 98;
    if (gained.length) yy = para(g, '+ ' + gained.join(', '), x, yy, 300, C.good, 12);
    if (lost.length) para(g, '− ' + lost.join(', '), x, yy, 300, C.bad, 12);
  }

  private drawPassives(g: Ctx, game: Game): void {
    const p = this.ctx.profile;
    const list = this.learned();
    const slots = passiveSlots(p);
    text(g, `LEARNED PASSIVES — ${p.slotted.length}/${slots} slotted`, 40, 66, C.dim, 12, 'left', true);
    para(g, 'Reach Mastery Lv3 with any equipment to learn its passive permanently. Slotted passives work no matter what you wear. More slots: Starboard (Fortune branch).', 40, 84, 860, C.dim, 12);
    if (!list.length) text(g, 'Nothing learned yet. Fight with your gear to raise its mastery!', 40, 130, C.text, 14);
    const nav = this.passNav;
    for (let k = 0; k < nav.visible; k++) {
      const idx = nav.scroll + k;
      if (idx >= list.length) break;
      const b = ITEMS[list[idx]];
      const y = 122 + k * 30;
      selRow(g, 36, y, 420, 28, nav.i === idx, game.t);
      const on = p.slotted.includes(b.id);
      text(g, on ? '◆' : '◇', 48, y + 6, on ? C.title : C.dim, 14);
      text(g, b.passive.name, 70, y + 6, on ? C.title : C.text, 14, 'left', true);
      text(g, `from ${b.name}`, 440, y + 8, C.dim, 11, 'right');
    }
    const sel = list[nav.i];
    if (sel) {
      const b = ITEMS[sel];
      panel(g, 480, 122, 420, 160, b.passive.name);
      para(g, b.passive.text, 494, 166, 392, C.text, 14);
    }
  }

  private drawSpells(g: Ctx, game: Game): void {
    const p = this.ctx.profile;
    const opts = [null, ...unlockedSpells(p)];
    text(g, 'SPELL SLOTS — ←/→ choose slot, then pick a spell', 40, 66, C.dim, 12, 'left', true);
    [0, 1].forEach((i) => {
      const x = 40 + i * 230;
      selRow(g, x, 86, 220, 40, this.spellSlot === i, game.t);
      const s = p.spells[i];
      text(g, `${i === 0 ? 'Spell I' : 'Spell II'} [${game.input.keyName(i === 0 ? 'spell1' : 'spell2')}]`, x + 10, 90, C.dim, 11);
      text(g, s ? SPELLS[s].name : '— empty —', x + 10, 105, s ? SPELLS[s].color : '#555', 15, 'left', true);
    });
    if (opts.length === 1) para(g, 'No spells learned. Unlock spells on the Starboard (Arcana branch).', 40, 150, 500, C.text, 14);
    opts.forEach((s, i) => {
      const y = 150 + i * 32;
      selRow(g, 36, y, 420, 30, this.spellNav.i === i, game.t);
      text(g, s ? SPELLS[s].name : '(clear slot)', 48, y + 7, s ? SPELLS[s].color : C.dim, 14, 'left', true);
      if (s) text(g, `${SPELLS[s].mp} Aether · ${(SPELLS[s].cooldown / 60).toFixed(1)}s`, 444, y + 8, C.dim, 12, 'right');
    });
    const s = opts[this.spellNav.i];
    if (s) {
      panel(g, 480, 150, 420, 140, SPELLS[s].name);
      para(g, SPELLS[s].text, 494, 194, 392, C.text, 14);
    }
  }

  private drawStats(g: Ctx, game: Game): void {
    const d = this.derivedWith().d;
    const keys = STAT_KEYS.filter((k) => Math.abs(d.s[k]) > 1e-6);
    text(g, 'FULL STAT SHEET (all sources combined)', 40, 66, C.dim, 12, 'left', true);
    const col = Math.ceil(keys.length / 3);
    keys.forEach((k, i) => {
      const c = Math.floor(i / col);
      const r = i % col;
      const info = STAT_INFO[k as StatKey];
      const v = d.s[k];
      const x = 40 + c * 290;
      const y = 90 + r * 20;
      text(g, info.label, x, y, C.dim, 13);
      text(g, info.pct ? `${Math.round(v * 1000) / 10}%` : fmt(Math.round(v * 10) / 10), x + 260, y, C.text, 13, 'right', true);
    });
    void game;
  }

  private drawRelics(g: Ctx, game: Game): void {
    const r = this.ctx.run!;
    const items = [...r.relics.map((id) => ({ name: RELICS[id].name, text: RELICS[id].text, color: RARITY_COLOR[RELICS[id].rarity] })), ...r.curses.map((id) => {
      const c = CURSES.find((x) => x.id === id)!;
      return { name: 'CURSE: ' + c.name, text: c.text, color: C.bad };
    })];
    text(g, `RELICS & CURSES (this expedition only) — ${r.relics.length} relics`, 40, 66, C.dim, 12, 'left', true);
    if (!items.length) text(g, 'No relics yet. Elites, treasure, shrines and level-ups grant them.', 40, 96, C.text, 14);
    const nav = this.relNav;
    for (let k = 0; k < nav.visible; k++) {
      const idx = nav.scroll + k;
      if (idx >= items.length) break;
      const y = 90 + k * 40;
      selRow(g, 36, y, 860, 36, nav.i === idx, game.t);
      text(g, items[idx].name, 48, y + 4, items[idx].color, 14, 'left', true);
      text(g, items[idx].text, 48, y + 20, C.text, 12);
    }
  }
}
