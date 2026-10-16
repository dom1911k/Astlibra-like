import { UI_H, UI_W } from '../../core/constants';
import { BOSSES, ENEMIES } from '../../data/enemies';
import { ITEM_LIST, RARITY_COLOR } from '../../data/items';
import { LORE } from '../../data/lore';
import { RELIC_LIST } from '../../data/relics';
import type { Game, Panel } from '../../game';
import { masteryLevel } from '../../meta/mastery';
import type { Profile } from '../../meta/profile';
import { C, ListNav, dim, hints, panel, para, scrollbar, selRow, tabs, text, type Ctx } from '../ui';

interface Entry {
  name: string;
  known: boolean;
  color: string;
  body: string;
  meta?: string;
}

export class CodexPanel implements Panel {
  closed = false;
  tab = 0;
  nav = new ListNav(13);
  names = ['Bestiary', 'Equipment', 'Relics', 'Echoes', 'Records'];
  constructor(public profile: Profile) {}
  private entries(): Entry[] {
    const p = this.profile;
    switch (this.names[this.tab]) {
      case 'Bestiary':
        return [
          ...Object.values(ENEMIES).filter((e) => e.ai !== 'dummy').map((e) => ({ name: e.name, known: (p.codex.enemies[e.id] ?? 0) > 0, color: e.accent, body: e.desc, meta: `${e.role} · defeated ${p.codex.enemies[e.id] ?? 0}` })),
          ...Object.values(BOSSES).map((b) => ({ name: b.name, known: (p.records.bossKills[b.id] ?? 0) > 0 || (p.codex.enemies[b.id] ?? 0) > 0, color: b.accent, body: b.desc, meta: `Guardian of Depth ${b.depth} · defeated ${p.records.bossKills[b.id] ?? 0}` })),
        ];
      case 'Equipment':
        return ITEM_LIST.map((b) => ({
          name: b.name, known: p.codex.items.includes(b.id), color: b.legendary ? RARITY_COLOR.legendary : '#d8d0c0',
          body: `${b.passive.name}: ${b.passive.text}\n\n${b.flavor}${b.evolvesTo ? `\n\nEvolves into another form when mastered.` : ''}`,
          meta: `${b.slot}${b.cls ? ' · ' + b.cls : ''} · Tier ${b.tier} · Mastery ${masteryLevel(p.mastery[b.id] ?? 0)}/5`,
        }));
      case 'Relics':
        return RELIC_LIST.map((r) => ({ name: r.name, known: p.codex.relics.includes(r.id), color: RARITY_COLOR[r.rarity], body: r.text, meta: `${r.rarity} relic · tags: ${r.tags.join(', ')}` }));
      case 'Echoes':
        return LORE.map((l) => ({ name: l.title, known: p.codex.lore.includes(l.id), color: '#9cf2ff', body: l.text }));
      default: {
        const r = p.records;
        const rows: [string, string][] = [
          ['Expeditions', `${r.runs}`], ['Deaths', `${r.deaths}`], ['Extractions', `${r.extractions}`], ['Victories', `${r.victories}`],
          ['Deepest depth', `${r.bestDepth}`], ['Total kills', `${r.totalKills}`], ['Biggest hit', `${r.maxHit}`], ['Longest combo', `${r.maxCombo}`],
          ['Cinders earned (all time)', `${Math.floor(r.cindersEarned)}`], ['Fastest victory', r.fastestVictory ? `${Math.floor(r.fastestVictory / 60)}m ${Math.floor(r.fastestVictory % 60)}s` : '—'],
          ['Highest Ember tier unlocked', `${p.difficultyUnlocked + 1}`],
        ];
        return rows.map(([a, b]) => ({ name: a, known: true, color: C.text, body: '', meta: b }));
      }
    }
  }
  update(g: Game): void {
    if (g.input.take('tabL')) {
      this.tab = (this.tab - 1 + this.names.length) % this.names.length;
      this.nav.i = 0;
      this.nav.scroll = 0;
    }
    if (g.input.take('tabR')) {
      this.tab = (this.tab + 1) % this.names.length;
      this.nav.i = 0;
      this.nav.scroll = 0;
    }
    if (this.nav.update(g.input, this.entries().length)) g.sfx('menu');
    if (g.input.take('back') || g.input.take('pause')) {
      this.closed = true;
      g.sfx('cancel');
    }
  }
  draw(g: Ctx, game: Game): void {
    dim(g, 0.75);
    panel(g, 20, 16, UI_W - 40, UI_H - 32);
    tabs(g, this.names, this.tab, 36, 26, game.input);
    const list = this.entries();
    const known = list.filter((e) => e.known).length;
    text(g, `${known}/${list.length} discovered`, UI_W - 40, 30, C.dim, 13, 'right');
    const records = this.names[this.tab] === 'Records';
    const nav = this.nav;
    for (let k = 0; k < nav.visible; k++) {
      const idx = nav.scroll + k;
      if (idx >= list.length) break;
      const e = list[idx];
      const y = 66 + k * 30;
      selRow(g, 36, y, records ? 600 : 340, 28, nav.i === idx, game.t);
      text(g, e.known ? e.name : '???', 48, y + 6, e.known ? e.color : '#555', 14, 'left', true);
      if (records) text(g, e.meta ?? '', 620, y + 6, C.title, 14, 'right', true);
    }
    scrollbar(g, 380, 66, nav.visible * 30, list.length, nav.visible, nav.scroll);
    const e = list[nav.i];
    if (e && !records) {
      if (e.known) {
        text(g, e.name, 400, 66, e.color, 18, 'left', true);
        if (e.meta) text(g, e.meta, 400, 92, C.dim, 12);
        para(g, e.body, 400, 116, 500, C.text, 14);
      } else para(g, 'Not yet discovered. Keep delving.', 400, 66, 500, C.dim, 14);
    }
    hints(g, game.input, [['up', 'Browse'], ['back', 'Close']], UI_W - 30, UI_H - 40);
  }
}
