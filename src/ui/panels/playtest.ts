import { UI_H, UI_W } from '../../core/constants';
import { Dev, Tuning } from '../../core/tuning';
import { RARITY_COLOR } from '../../data/items';
import { BOARD_LIST } from '../../data/starboard';
import type { Game, Panel } from '../../game';
import { itemName, rollItem } from '../../meta/items';
import { MASTERY_XP } from '../../meta/mastery';
import { downloadText } from '../../meta/playlog';
import { EQUIP_SLOTS, findItem, unlocks } from '../../meta/profile';
import { Rng } from '../../core/rng';
import { C, ListNav, dim, hints, panel, para, scrollbar, selRow, text, type Ctx } from '../ui';
import { ConfirmPanel } from './common';

export interface PlaytestAction {
  label: string;
  sub?: string;
  action: () => void;
}

/** Implemented by scenes that offer scene-specific playtest shortcuts. */
export interface PlaytestHost {
  playtestContext(): string;
  playtestActions(g: Game): PlaytestAction[];
}

export function isPlaytestHost(s: unknown): s is PlaytestHost {
  return !!s && typeof (s as PlaytestHost).playtestActions === 'function';
}

const DMG_STEPS = [1, 5, 100];
const SPEED_STEPS = [1, 0.5, 0.25, 1.5, 2];

/** F2: cheats, shortcuts and report export so any part of the game can be reached in seconds. */
export class PlaytestPanel implements Panel {
  closed = false;
  nav = new ListNav(14);
  constructor(private host: PlaytestHost | null) {}

  private items(g: Game): (PlaytestAction | { header: string })[] {
    const p = g.profile;
    const run = p.run;
    const cheat = (label: string, fn: () => void) => () => {
      fn();
      g.log.add('cheat', label);
      g.sfx('confirm');
    };
    const rng = new Rng(Date.now() & 0xffffff);
    const out: (PlaytestAction | { header: string })[] = [];
    const scene = this.host?.playtestActions(g) ?? [];
    if (scene.length) out.push({ header: 'THIS SCENE' }, ...scene.map((a) => ({ ...a, action: cheat(a.label, a.action) })));
    out.push({ header: 'CHEATS' });
    out.push({ label: 'God mode (can\'t die)', sub: Tuning.godMode ? 'ON' : 'off', action: cheat('toggle god mode', () => (Tuning.godMode = !Tuning.godMode)) });
    out.push({ label: 'Damage multiplier', sub: `×${Dev.damageMult}`, action: cheat('damage multiplier', () => (Dev.damageMult = DMG_STEPS[(DMG_STEPS.indexOf(Dev.damageMult) + 1) % DMG_STEPS.length])) });
    out.push({ label: 'Infinite Aether', sub: Dev.infiniteMp ? 'ON' : 'off', action: cheat('toggle infinite aether', () => (Dev.infiniteMp = !Dev.infiniteMp)) });
    out.push({ label: 'Game speed (slow-mo for checking feel)', sub: `×${Dev.timeScale}`, action: cheat('game speed', () => (Dev.timeScale = SPEED_STEPS[(SPEED_STEPS.indexOf(Dev.timeScale) + 1) % SPEED_STEPS.length])) });
    out.push({ header: 'PROGRESSION' });
    out.push({
      label: 'Give resources', sub: '+1000 Cinders/Gilt, materials', action: cheat('give resources', () => {
        p.cinders += 1000;
        p.gilt += 1000;
        p.slag += 200;
        p.starglass += 30;
        p.echoes += 30;
        if (run) run.gilt += 500;
        g.toast('+1000 Cinders, +1000 Gilt, +200 Slag, +30 Starglass, +30 Echoes', C.good);
      }),
    });
    out.push({
      label: 'Unlock the whole Starboard', sub: 'weapons, spells, slots…', action: cheat('unlock starboard', () => {
        p.board = BOARD_LIST.map((n) => n.id);
        g.toast('Starboard fully unlocked (rebuilds on next room / menu change)', C.good);
      }),
    });
    out.push({
      label: 'Master all equipped gear', sub: 'learn passives, unlock evolution', action: cheat('master equipped', () => {
        for (const s of EQUIP_SLOTS) {
          const it = findItem(p, (run ? run.equipped : p.equipped)[s], run?.items ?? []);
          if (it) p.mastery[it.baseId] = MASTERY_XP[MASTERY_XP.length - 1];
          if (it && !p.recipes.includes(it.baseId)) p.recipes.push(it.baseId);
        }
        g.toast('Equipped gear mastered', C.good);
      }),
    });
    out.push({
      label: 'Give 5 random items', sub: 'rare or better', action: cheat('give items', () => {
        const depth = Math.max(1, run?.depth ?? Math.max(1, p.records.bestDepth));
        for (let i = 0; i < 5; i++) {
          const it = rollItem(rng, { depth, luck: 0.5, unlocks: unlocks(p), minRarity: i === 0 ? 'legendary' : 'rare' });
          (run ? run.items : p.stash).push(it);
          if (!p.codex.items.includes(it.baseId)) p.codex.items.push(it.baseId);
          g.toast(`+ ${itemName(it)}`, RARITY_COLOR[it.rarity]);
        }
      }),
    });
    out.push({ header: 'FEEDBACK' });
    out.push({ label: 'Write a feedback note', sub: 'or press F9 any time', action: () => {
      this.closed = true;
      g.openNote();
    } });
    out.push({ label: 'Download playtest report (.md)', sub: `${g.log.notes} notes, ${g.log.entries.length} events`, action: () => {
      void downloadText(`cinderdeep-playtest-${new Date().toISOString().slice(0, 10)}.md`, g.log.toMarkdown(g.reportSummary())).then((msg) => g.toast(msg, C.good));
    } });
    out.push({ label: 'Copy playtest report to clipboard', action: () => {
      navigator.clipboard?.writeText(g.log.toMarkdown(g.reportSummary())).then(() => g.toast('Report copied to clipboard', C.good), () => g.toast('Clipboard not available — use Download instead', C.bad));
    } });
    out.push({ label: 'Clear the playtest log', action: () => g.push(new ConfirmPanel('Delete all feedback notes and recorded events?', () => g.log.clear())) });
    out.push({ label: 'Reset ALL progress (fresh save)', action: () => g.push(new ConfirmPanel('Wipe the save and restart from scratch? (The playtest log is kept.)', () => g.resetSave())) });
    return out;
  }

  update(g: Game): void {
    const items = this.items(g);
    const selectable = items.map((it, i) => ('header' in it ? -1 : i)).filter((i) => i >= 0);
    let k = Math.max(0, selectable.indexOf(this.nav.i));
    if (g.input.take('up')) k = (k - 1 + selectable.length) % selectable.length;
    if (g.input.take('down')) k = (k + 1) % selectable.length;
    this.nav.i = selectable[k];
    if (this.nav.i < this.nav.scroll + 1) this.nav.scroll = Math.max(0, this.nav.i - 1);
    if (this.nav.i >= this.nav.scroll + this.nav.visible) this.nav.scroll = this.nav.i - this.nav.visible + 1;
    if (g.input.take('confirm') || g.input.take('right')) {
      const it = items[this.nav.i];
      if (it && !('header' in it)) it.action();
    }
    if (g.input.take('back') || g.input.take('pause') || g.input.take('playtest')) {
      this.closed = true;
      g.sfx('cancel');
    }
  }

  draw(g: Ctx, game: Game): void {
    dim(g, 0.55);
    const w = 560;
    const x = (UI_W - w) / 2;
    panel(g, x, 16, w, UI_H - 32, 'Playtest Tools (F2)');
    const items = this.items(game);
    const ctx = this.host?.playtestContext() ?? '';
    if (ctx) para(g, ctx, x + 22, 54, w - 44, C.dim, 12);
    const top = 82;
    for (let r = 0; r < this.nav.visible; r++) {
      const idx = this.nav.scroll + r;
      if (idx >= items.length) break;
      const it = items[idx];
      const y = top + r * 28;
      if ('header' in it) {
        text(g, it.header, x + 22, y + 9, '#d8a860', 11, 'left', true);
        continue;
      }
      selRow(g, x + 14, y, w - 28, 26, this.nav.i === idx, game.t);
      text(g, it.label, x + 30, y + 5, this.nav.i === idx ? C.title : C.text, 14, 'left', true);
      if (it.sub) text(g, it.sub, x + w - 26, y + 6, it.sub === 'ON' ? C.good : C.dim, 12, 'right', true);
    }
    scrollbar(g, x + w - 10, top, this.nav.visible * 28, items.length, this.nav.visible, this.nav.scroll);
    hints(g, game.input, [['up', 'Move'], ['confirm', 'Use'], ['back', 'Close']], x + w - 16, UI_H - 46);
  }
}

/** F9: type a quick feedback note; the current game context is attached automatically. */
export class NotePanel implements Panel {
  closed = false;
  textValue = '';
  t = 0;
  constructor(private g: Game, private context: string) {
    g.input.textCapture = (key) => this.onKey(key);
  }
  private onKey(key: string): void {
    if (key === 'Enter') {
      if (this.textValue.trim()) {
        this.g.log.add('note', this.textValue.trim(), this.context);
        this.g.toast('Note saved to the playtest log', C.good);
      }
      this.close();
    } else if (key === 'Escape') this.close();
    else if (key === 'Backspace') this.textValue = this.textValue.slice(0, -1);
    else if (key.length === 1 && this.textValue.length < 400) this.textValue += key;
  }
  private close(): void {
    this.closed = true;
    this.g.input.textCapture = null;
  }
  update(_g: Game, dt: number): void {
    this.t += dt;
  }
  draw(g: Ctx, game: Game): void {
    dim(g, 0.6);
    const w = 640;
    const x = (UI_W - w) / 2;
    panel(g, x, 150, w, 220, 'Feedback note');
    para(g, 'What did you notice? Bugs, confusing moments, things that felt great or bad. Enter saves, Esc cancels.', x + 22, 192, w - 44, C.dim, 13);
    g.fillStyle = '#05030a';
    g.fillRect(x + 20, 236, w - 40, 84);
    g.strokeStyle = 'rgba(216,168,96,0.6)';
    g.strokeRect(x + 20.5, 236.5, w - 41, 83);
    const caret = Math.floor(this.t / 450) % 2 === 0 ? '▌' : '';
    para(g, this.textValue + caret, x + 30, 244, w - 60, C.text, 15);
    text(g, `Context: ${this.context}`, x + 22, 330, '#7a6c88', 11);
    void game;
  }
}
