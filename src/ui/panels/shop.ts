import { UI_H, UI_W } from '../../core/constants';
import { RARITY_COLOR, type ItemInst } from '../../data/items';
import type { RelicDef } from '../../data/relics';
import type { Game, Panel } from '../../game';
import { itemName } from '../../meta/items';
import type { Profile } from '../../meta/profile';
import { C, ListNav, dim, hints, panel, para, selRow, text, type Ctx } from '../ui';
import { itemTooltip } from './character';

export interface Offer {
  kind: 'item' | 'relic' | 'potion' | 'heal' | 'slag' | 'echoes' | 'starglass';
  label: string;
  price: number;
  item?: ItemInst;
  relic?: RelicDef;
  desc?: string;
  sold?: boolean;
  repeat?: boolean;
}

export class ShopPanel implements Panel {
  closed = false;
  nav = new ListNav(12);
  constructor(
    public title: string,
    public offers: Offer[],
    public wallet: { gilt: number },
    public profile: Profile,
    public onBuy: (o: Offer) => void,
  ) {}
  update(g: Game): void {
    if (this.nav.update(g.input, this.offers.length)) g.sfx('menu');
    if (g.input.take('confirm')) {
      const o = this.offers[this.nav.i];
      if (!o || o.sold) return void g.sfx('cancel');
      if (this.wallet.gilt < o.price) {
        g.toast('Not enough Gilt', C.bad);
        return void g.sfx('cancel');
      }
      this.wallet.gilt -= o.price;
      if (!o.repeat) o.sold = true;
      g.sfx('coin');
      this.onBuy(o);
    }
    if (g.input.take('back') || g.input.take('pause')) {
      this.closed = true;
      g.sfx('cancel');
    }
  }
  draw(g: Ctx, game: Game): void {
    dim(g, 0.7);
    panel(g, 20, 16, UI_W - 40, UI_H - 32, this.title);
    text(g, `${Math.floor(this.wallet.gilt)} Gilt`, UI_W - 40, 24, C.gilt, 18, 'right', true);
    this.offers.forEach((o, i) => {
      const y = 62 + i * 34;
      selRow(g, 36, y, 440, 30, this.nav.i === i, game.t);
      const col = o.sold ? '#555' : o.item ? RARITY_COLOR[o.item.rarity] : o.relic ? RARITY_COLOR[o.relic.rarity] : C.text;
      text(g, (o.relic ? '✧ ' : '') + (o.item ? itemName(o.item) : o.label), 48, y + 7, col, 14, 'left', true);
      text(g, o.sold ? 'SOLD' : `${o.price} G`, 464, y + 8, o.sold ? '#555' : this.wallet.gilt >= o.price ? C.gilt : C.bad, 13, 'right', true);
    });
    const o = this.offers[this.nav.i];
    if (o?.item) itemTooltip(g, o.item, this.profile, 500, 62, 400);
    else if (o?.relic) {
      text(g, o.relic.name, 500, 62, RARITY_COLOR[o.relic.rarity], 17, 'left', true);
      text(g, `${o.relic.rarity.toUpperCase()} RELIC · lasts this expedition`, 500, 86, C.dim, 12);
      para(g, o.relic.text, 500, 108, 400, C.text, 14);
    } else if (o?.desc) para(g, o.desc, 500, 62, 400, C.text, 14);
    hints(g, game.input, [['confirm', 'Buy'], ['back', 'Leave']], UI_W - 30, UI_H - 40);
  }
}
