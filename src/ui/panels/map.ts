import { UI_H, UI_W } from '../../core/constants';
import type { Game, Panel } from '../../game';
import { NODE_INFO, type ExpMap, type MapNode } from '../../meta/expedition';
import { DIFFICULTIES } from '../../meta/profile';
import type { RunState } from '../../meta/run';
import { THEMES } from '../../render/theme';
import { C, dim, hints, panel, para, text, type Ctx } from '../ui';

export class MapPanel implements Panel {
  closed = false;
  sel = 0;
  t = 0;
  constructor(public run: RunState, public choose: ((n: MapNode) => void) | null) {}
  private options(): MapNode[] {
    const m = this.run.map;
    return m.nodes[this.run.node].edges.map((id) => m.nodes[id]).sort((a, b) => a.col - b.col);
  }
  private pos(m: ExpMap, n: MapNode): [number, number] {
    const layer = Math.floor(n.layer);
    const inLayer = Object.values(m.nodes).filter((x) => x.layer === n.layer && x.type !== 'secret');
    const count = inLayer.length;
    if (n.type === 'secret') return [90 + layer * 106 + 53, 112];
    const y = 270 + (n.col - (count - 1) / 2) * 92;
    return [90 + layer * 106, y];
  }
  update(g: Game, dt: number): void {
    this.t += dt;
    const opts = this.options();
    if (this.choose && opts.length) {
      if (g.input.take('up') || g.input.take('left')) {
        this.sel = (this.sel - 1 + opts.length) % opts.length;
        g.sfx('menu');
      }
      if (g.input.take('down') || g.input.take('right')) {
        this.sel = (this.sel + 1) % opts.length;
        g.sfx('menu');
      }
      if (this.t > 250 && g.input.take('confirm')) {
        this.closed = true;
        g.sfx('door');
        this.choose(opts[this.sel]);
      }
      if (g.input.take('back')) {
        this.closed = true;
        g.sfx('cancel');
      }
    } else if (g.input.take('back') || g.input.take('map') || g.input.take('confirm') || g.input.take('pause')) {
      this.closed = true;
      g.sfx('cancel');
    }
  }
  draw(g: Ctx, game: Game): void {
    dim(g, 0.75);
    const r = this.run;
    const m = r.map;
    const theme = THEMES['depth' + r.depth];
    panel(g, 20, 16, UI_W - 40, UI_H - 32, `Depth ${r.depth} — ${theme?.name ?? ''}`);
    text(g, DIFFICULTIES[r.difficulty].name, UI_W - 40, 22, C.cinder, 14, 'right', true);
    const opts = this.choose ? this.options() : [];
    // edges
    for (const n of Object.values(m.nodes)) {
      if (n.hidden && !r.visited.includes(n.id)) continue;
      const [x1, y1] = this.pos(m, n);
      for (const e of n.edges) {
        const t = m.nodes[e];
        if (t.hidden && !r.visited.includes(t.id)) continue;
        const [x2, y2] = this.pos(m, t);
        const walked = r.visited.includes(n.id) && r.visited.includes(e);
        const next = n.id === r.node;
        g.strokeStyle = walked ? 'rgba(255,210,122,0.9)' : next ? 'rgba(255,255,255,0.55)' : 'rgba(150,140,170,0.25)';
        g.lineWidth = walked ? 3 : 2;
        if (n.shortcut && Math.floor(t.layer) - Math.floor(n.layer) > 1) g.setLineDash([6, 5]);
        g.beginPath();
        g.moveTo(x1, y1);
        g.lineTo(x2, y2);
        g.stroke();
        g.setLineDash([]);
      }
    }
    // nodes
    for (const n of Object.values(m.nodes)) {
      if (n.hidden && !r.visited.includes(n.id)) continue;
      const [x, y] = this.pos(m, n);
      const info = NODE_INFO[n.type];
      const visited = r.visited.includes(n.id);
      const cur = n.id === r.node;
      const isOpt = opts.includes(n);
      const selected = isOpt && opts[this.sel] === n;
      const rad = n.type === 'boss' ? 22 : 16;
      g.fillStyle = cur ? '#ffd27a' : visited ? 'rgba(80,70,60,1)' : 'rgba(30,24,40,1)';
      g.beginPath();
      g.arc(x, y, rad, 0, Math.PI * 2);
      g.fill();
      g.strokeStyle = selected ? '#fff' : info.color;
      g.lineWidth = selected ? 3 : 2;
      g.stroke();
      if (selected) {
        g.globalAlpha = 0.5 + Math.sin(this.t / 140) * 0.4;
        g.beginPath();
        g.arc(x, y, rad + 7, 0, Math.PI * 2);
        g.stroke();
        g.globalAlpha = 1;
      }
      text(g, info.icon, x, y - 9, cur ? '#2a1a10' : info.color, 16, 'center', true);
      if (n.elite) text(g, '★', x + rad - 2, y - rad - 4, '#ff7a3c', 12, 'center');
    }
    // info box
    const focus = this.choose ? opts[this.sel] : m.nodes[r.node];
    if (focus) {
      const info = NODE_INFO[focus.type];
      g.fillStyle = 'rgba(28,22,40,0.95)';
      g.fillRect(40, UI_H - 112, 560, 66);
      text(g, info.name + (focus.shortcut && this.choose ? '  (shortcut route)' : ''), 54, UI_H - 104, info.color, 17, 'left', true);
      let extra = '';
      if (focus.elite) extra = ` Elite trait: ${focus.elite.join(', ')}.`;
      if (focus.shortcut && this.choose) extra += ' Dashed lines skip ahead toward the guardian — fewer rewards, faster run.';
      para(g, info.text + extra, 54, UI_H - 80, 540, C.text, 13);
    }
    text(g, `Rooms cleared: ${r.stats.rooms} · Level ${r.level} · ${r.relics.length} relics`, UI_W - 40, UI_H - 104, C.dim, 13, 'right');
    hints(g, game.input, this.choose ? [['up', 'Choose path'], ['confirm', 'Travel'], ['back', 'Stay']] : [['back', 'Close']], UI_W - 30, UI_H - 40);
  }
}
