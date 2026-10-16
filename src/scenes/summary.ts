import { UI_H, UI_W } from '../core/constants';
import { BOSSES } from '../data/enemies';
import { ITEMS, RARITY_COLOR } from '../data/items';
import type { Game, Scene } from '../game';
import { itemName } from '../meta/items';
import { masteryLevel } from '../meta/mastery';
import type { DeathOutcome, RunState } from '../meta/run';
import { C, hints, panel, para, text, type Ctx } from '../ui/ui';
import { HubScene } from './hub';

export interface Summary {
  kind: 'death' | 'extracted' | 'victory';
  run: RunState;
  death?: DeathOutcome;
}

export class SummaryScene implements Scene {
  name = 'summary';
  t = 0;
  constructor(public game: Game, public s: Summary) {}
  enter(g: Game): void {
    g.audio.setMusic('title');
    g.sfx(this.s.kind === 'death' ? 'death' : 'legendary', 0.6);
  }
  frame(g: Game, dt: number): void {
    this.t += dt;
    if (this.t > 800 && (g.input.take('confirm') || g.input.take('back'))) {
      g.sfx('confirm');
      g.setScene(new HubScene(g));
    }
  }
  render(ctx: Ctx, g: Game): void {
    ctx.fillStyle = '#0a0810';
    ctx.fillRect(0, 0, UI_W, UI_H);
    const s = this.s;
    const r = s.run;
    const title = s.kind === 'death' ? 'Expedition Lost' : s.kind === 'victory' ? 'The Cinderdeep Is Quiet' : 'Safely Extracted';
    const col = s.kind === 'death' ? '#ff6a6a' : s.kind === 'victory' ? '#ffd27a' : C.good;
    text(ctx, title, UI_W / 2, 28, col, 30, 'center', true);
    const sub = s.kind === 'death' ? 'Your lantern went dark — but its light was not wasted.' : s.kind === 'victory' ? 'All three guardians have fallen. A new Ember tier awaits.' : 'Everything you found is now safe in your stash.';
    text(ctx, sub, UI_W / 2, 68, C.dim, 15, 'center');
    // left: run stats
    panel(ctx, 30, 100, 430, 380, 'This Expedition');
    const mins = Math.floor(r.stats.time / 60);
    const secs = Math.floor(r.stats.time % 60);
    const rows: [string, string][] = [
      ['Depth reached', `${r.depth}`], ['Time', `${mins}m ${secs}s`], ['Rooms cleared', `${r.stats.rooms}`], ['Run level', `${r.level}`],
      ['Enemies defeated', `${r.stats.kills} (${r.stats.elites} elite)`], ['Guardians defeated', r.stats.bosses.map((b) => BOSSES[b]?.name ?? b).join(', ') || '—'],
      ['Relics gathered', `${r.relics.length}`], ['Items found', `${r.stats.itemsFound}`], ['Longest combo', `${r.stats.maxCombo}`],
      ['Parries · Perfect dodges', `${r.stats.parries} · ${r.stats.perfectDodges}`],
    ];
    rows.forEach(([a, b], i) => {
      text(ctx, a, 46, 146 + i * 30, C.dim, 14);
      text(ctx, b, 444, 146 + i * 30, C.text, 14, 'right', true);
    });
    // right: permanent progress
    panel(ctx, 490, 100, 440, 380, 'Kept Forever', '#ffb86a');
    let y = 146;
    text(ctx, `+${Math.floor(r.stats.cinders)} Cinders`, 506, y, C.cinder, 18, 'left', true);
    text(ctx, '(spend on the Starboard)', 700, y + 3, C.dim, 12);
    y += 32;
    text(ctx, 'Mastery gained:', 506, y, C.text, 14, 'left', true);
    y += 22;
    const ms = Object.entries(r.stats.mastery).sort((a, b) => b[1] - a[1]).slice(0, 5);
    if (!ms.length) text(ctx, '—', 520, y, C.dim, 13);
    for (const [id, xp] of ms) {
      const lv = masteryLevel(g.profile.mastery[id] ?? 0);
      text(ctx, `${ITEMS[id]?.name ?? id}`, 520, y, C.text, 13);
      text(ctx, `+${xp} xp · Lv ${lv}`, 914, y, '#ffb86a', 13, 'right');
      y += 20;
    }
    y += 10;
    if (s.kind === 'death' && s.death) {
      const d = s.death;
      if (d.salvaged) {
        text(ctx, 'Salvaged from the dark:', 506, y, C.text, 14, 'left', true);
        text(ctx, itemName(d.salvaged), 700, y, RARITY_COLOR[d.salvaged.rarity], 14, 'left', true);
        y += 24;
      }
      y = para(ctx, `Lost: ${d.lostItems} unbanked item${d.lostItems === 1 ? '' : 's'}, ${d.giltLost} Gilt. Kept half of unbanked materials (${d.slagKept} Slag, ${d.starglassKept} Starglass, ${d.echoesKept} Echoes).`, 506, y, 410, C.bad, 13);
      y = para(ctx, 'Your equipped gear from Lamplight is never lost. Mastery, Cinders, recipes and codex entries are permanent.', 506, y + 6, 410, C.dim, 12);
    } else {
      y = para(ctx, `Banked: ${r.bankedThisRun.items} items and ${r.bankedThisRun.gilt} Gilt across checkpoints.`, 506, y, 410, C.good, 14);
    }
    if (this.t > 800) hints(ctx, g.input, [['confirm', 'Return to Lamplight']]);
  }
}
