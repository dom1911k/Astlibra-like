import { UI_W } from '../../core/constants';
import type { Game, Panel } from '../../game';
import { C, ListNav, dim, drawCards, hints, panel, para, selRow, text, type Card, type Ctx } from '../ui';

/** Pick one card out of N (relics, vows, rewards). */
export class ChoicePanel implements Panel {
  closed = false;
  sel = 0;
  t = 0;
  constructor(
    public title: string,
    public subtitle: string,
    public cards: Card[],
    public onPick: (i: number) => void,
    public skip?: { label: string; action: () => void },
  ) {}
  update(g: Game, dt: number): void {
    this.t += dt;
    if (this.t < 250) return; // avoid accidental picks from held attack buttons
    const n = this.cards.length;
    if (g.input.take('left')) {
      this.sel = (this.sel - 1 + n) % n;
      g.sfx('menu');
    }
    if (g.input.take('right')) {
      this.sel = (this.sel + 1) % n;
      g.sfx('menu');
    }
    if (g.input.take('confirm')) {
      g.sfx('confirm');
      this.closed = true;
      this.onPick(this.sel);
    } else if (this.skip && g.input.take('back')) {
      g.sfx('cancel');
      this.closed = true;
      this.skip.action();
    }
  }
  draw(g: Ctx, game: Game): void {
    dim(g, 0.65);
    text(g, this.title, UI_W / 2, 70, C.title, 28, 'center', true);
    text(g, this.subtitle, UI_W / 2, 108, C.dim, 15, 'center');
    drawCards(g, this.cards, this.sel, 150, this.t);
    const h: [any, string][] = [['left', 'Browse'], ['confirm', 'Choose']];
    if (this.skip) h.push(['back', this.skip.label]);
    hints(g, game.input, h);
  }
}

export class ConfirmPanel implements Panel {
  closed = false;
  sel = 1;
  constructor(public msg: string, public onYes: () => void, public yes = 'Yes', public no = 'No') {}
  update(g: Game): void {
    if (g.input.take('left') || g.input.take('right') || g.input.take('up') || g.input.take('down')) this.sel = 1 - this.sel;
    if (g.input.take('confirm')) {
      this.closed = true;
      if (this.sel === 0) this.onYes();
      g.sfx(this.sel === 0 ? 'confirm' : 'cancel');
    } else if (g.input.take('back')) {
      this.closed = true;
      g.sfx('cancel');
    }
  }
  draw(g: Ctx, game: Game): void {
    dim(g, 0.5);
    const w = 460;
    const x = (UI_W - w) / 2;
    panel(g, x, 190, w, 160);
    para(g, this.msg, x + 24, 212, w - 48, C.text, 15);
    [this.yes, this.no].forEach((l, i) => {
      const bx = x + 60 + i * 190;
      selRow(g, bx, 300, 150, 30, this.sel === i, game.t);
      text(g, l, bx + 75, 307, this.sel === i ? C.title : C.dim, 15, 'center', true);
    });
  }
}

export class MessagePanel implements Panel {
  closed = false;
  t = 0;
  constructor(public title: string, public body: string, public onClose?: () => void, public w = 560) {}
  update(g: Game, dt: number): void {
    this.t += dt;
    if (this.t > 200 && (g.input.take('confirm') || g.input.take('back'))) {
      this.closed = true;
      g.sfx('confirm');
    }
  }
  draw(g: Ctx, game: Game): void {
    dim(g, 0.6);
    const x = (UI_W - this.w) / 2;
    const lines = this.body.split('\n').length;
    const h = Math.min(480, 120 + lines * 20 + this.body.length / 4);
    panel(g, x, Math.max(30, 270 - h / 2), this.w, h, this.title);
    para(g, this.body, x + 20, Math.max(30, 270 - h / 2) + 46, this.w - 40, C.text, 14);
    hints(g, game.input, [['confirm', 'Continue']]);
  }
}

/** Simple vertical menu. */
export class MenuPanel implements Panel {
  closed = false;
  nav = new ListNav(12);
  constructor(public title: string, public items: { label: string; action: () => void; disabled?: boolean; sub?: string }[], public w = 340, public backCloses = true) {}
  update(g: Game): void {
    if (this.nav.update(g.input, this.items.length)) g.sfx('menu');
    if (g.input.take('confirm')) {
      const it = this.items[this.nav.i];
      if (it && !it.disabled) {
        g.sfx('confirm');
        it.action();
      } else g.sfx('cancel');
    } else if (this.backCloses && (g.input.take('back') || g.input.take('pause'))) {
      this.closed = true;
      g.sfx('cancel');
    }
  }
  draw(g: Ctx, game: Game): void {
    dim(g, 0.55);
    const h = 60 + this.items.length * 34;
    const x = (UI_W - this.w) / 2;
    const y = Math.max(20, 270 - h / 2);
    panel(g, x, y, this.w, h, this.title);
    this.items.forEach((it, i) => {
      const yy = y + 46 + i * 34;
      selRow(g, x + 12, yy, this.w - 24, 30, i === this.nav.i, game.t);
      text(g, it.label, x + 26, yy + 7, it.disabled ? '#555' : i === this.nav.i ? C.title : C.text, 15, 'left', true);
      if (it.sub) text(g, it.sub, x + this.w - 26, yy + 9, C.dim, 12, 'right');
    });
    hints(g, game.input, [['confirm', 'Select'], ['back', 'Back']]);
  }
}
