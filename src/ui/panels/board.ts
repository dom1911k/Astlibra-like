import { UI_H, UI_W } from '../../core/constants';
import { BOARD, BOARD_LIST, type BoardNode } from '../../data/starboard';
import type { Game, Panel } from '../../game';
import { canBuyNode, respec, type Profile } from '../../meta/profile';
import { C, dim, hints, panel, para, text, type Ctx } from '../ui';
import { ConfirmPanel } from './common';

const BRANCH_COLOR: Record<BoardNode['branch'], string> = {
  core: '#ffd27a', might: '#ff7a5a', finesse: '#7cff8a', arcana: '#7ab8ff', bulwark: '#c8c8d8', fortune: '#ffd23c',
};

export class BoardPanel implements Panel {
  closed = false;
  cur = 'core';
  t = 0;
  constructor(public profile: Profile, public onChange: () => void) {}
  private pos(n: BoardNode): [number, number] {
    return [350 + n.x * 72, 262 + n.y * 42];
  }
  update(g: Game, dt: number): void {
    this.t += dt;
    const inp = g.input;
    const dirs: [string, number, number][] = [['left', -1, 0], ['right', 1, 0], ['up', 0, -1], ['down', 0, 1]];
    for (const [a, dx, dy] of dirs) {
      if (!inp.take(a as any)) continue;
      const c = BOARD[this.cur];
      let best: BoardNode | null = null;
      let bd = 1e9;
      for (const n of BOARD_LIST) {
        if (n.id === c.id) continue;
        const vx = n.x - c.x;
        const vy = n.y - c.y;
        const along = vx * dx + vy * dy;
        if (along <= 0) continue;
        const perp = Math.abs(vx * dy - vy * dx);
        const score = along + perp * 2.2;
        if (score < bd) {
          bd = score;
          best = n;
        }
      }
      if (best) {
        this.cur = best.id;
        g.sfx('menu');
      }
    }
    if (inp.take('confirm')) {
      const n = BOARD[this.cur];
      if (canBuyNode(this.profile, n.id)) {
        this.profile.cinders -= n.cost;
        this.profile.board.push(n.id);
        g.sfx('levelup');
        g.toast(`Starboard: ${n.name}`, BRANCH_COLOR[n.branch]);
        this.onChange();
      } else g.sfx('cancel');
    }
    if (inp.take('heavy') || inp.take('map')) {
      g.push(new ConfirmPanel('Respec the Starboard? All Cinders spent are refunded. (Free)', () => {
        const r = respec(this.profile);
        g.toast(`Refunded ${Math.floor(r)} Cinders`, C.cinder);
        this.onChange();
      }));
    }
    if (inp.take('back') || inp.take('pause')) {
      this.closed = true;
      g.sfx('cancel');
    }
  }
  draw(g: Ctx, game: Game): void {
    dim(g, 0.8);
    panel(g, 16, 12, UI_W - 32, UI_H - 24, 'The Starboard — permanent upgrades');
    text(g, `${Math.floor(this.profile.cinders)} Cinders`, UI_W - 36, 20, C.cinder, 18, 'right', true);
    // links
    g.lineWidth = 2;
    for (const n of BOARD_LIST) {
      for (const l of n.links) {
        if (l < n.id) continue;
        const m = BOARD[l];
        const [x1, y1] = this.pos(n);
        const [x2, y2] = this.pos(m);
        const own = this.profile.board.includes(n.id) && this.profile.board.includes(m.id);
        g.strokeStyle = own ? 'rgba(255,210,122,0.8)' : 'rgba(150,140,170,0.25)';
        g.beginPath();
        g.moveTo(x1, y1);
        g.lineTo(x2, y2);
        g.stroke();
      }
    }
    for (const n of BOARD_LIST) {
      const [x, y] = this.pos(n);
      const own = this.profile.board.includes(n.id);
      const avail = !own && n.links.some((l) => this.profile.board.includes(l));
      const r = n.keystone ? 13 : n.unlock ? 10 : 8;
      const col = BRANCH_COLOR[n.branch];
      g.fillStyle = own ? col : avail ? 'rgba(60,50,80,1)' : 'rgba(30,26,40,1)';
      g.beginPath();
      if (n.unlock) {
        g.moveTo(x, y - r);
        g.lineTo(x + r, y);
        g.lineTo(x, y + r);
        g.lineTo(x - r, y);
        g.closePath();
      } else g.arc(x, y, r, 0, Math.PI * 2);
      g.fill();
      g.strokeStyle = avail ? col : own ? '#fff' : 'rgba(150,140,170,0.4)';
      g.lineWidth = avail ? 2 : 1;
      g.stroke();
      if (n.id === this.cur) {
        g.strokeStyle = '#fff';
        g.lineWidth = 2;
        g.globalAlpha = 0.6 + Math.sin(this.t / 150) * 0.4;
        g.beginPath();
        g.arc(x, y, r + 6, 0, Math.PI * 2);
        g.stroke();
        g.globalAlpha = 1;
      }
    }
    // info
    const n = BOARD[this.cur];
    const own = this.profile.board.includes(n.id);
    const bx = 690;
    g.fillStyle = 'rgba(28,22,40,0.95)';
    g.fillRect(bx, 60, 240, 210);
    g.strokeStyle = BRANCH_COLOR[n.branch];
    g.strokeRect(bx + 0.5, 60.5, 239, 209);
    text(g, n.branch.toUpperCase(), bx + 12, 68, BRANCH_COLOR[n.branch], 11, 'left', true);
    let y = para(g, n.name, bx + 12, 84, 216, C.title, 16);
    y = para(g, n.text, bx + 12, y + 6, 216, C.text, 13);
    const status = own ? 'OWNED' : canBuyNode(this.profile, n.id) ? `Cost ${n.cost} — press ${game.input.keyName('confirm')} to buy` : n.links.some((l) => this.profile.board.includes(l)) ? `Cost ${n.cost} — not enough Cinders` : `Cost ${n.cost} — connect a path first`;
    para(g, status, bx + 12, y + 10, 216, own ? C.good : C.cinder, 13);
    para(g, 'Diamonds unlock new mechanics; circles add stats; large nodes are keystones.', 30, UI_H - 66, 600, C.dim, 12);
    hints(g, game.input, [['up', 'Move'], ['confirm', 'Buy'], ['heavy', 'Respec (free)'], ['back', 'Close']]);
  }
}
