import { UI_H, UI_W } from '../core/constants';
import { Dev } from '../core/tuning';
import { fmt } from '../core/math';
import { MOVESETS } from '../data/movesets';
import { RELICS } from '../data/relics';
import { SPELLS } from '../data/spells';
import type { Game, Scene } from '../game';
import type { RunState } from '../meta/run';
import { xpForLevel } from '../meta/run';
import { WorldRenderer } from '../render/worldRenderer';
import { Boss } from '../sim/boss';
import type { SimEvent } from '../sim/events';
import type { World } from '../sim/world';
import { C, bar, font, heading, text, textShadow, titleFont, type Ctx } from '../ui/ui';

/** Shared base for every scene that runs the combat simulation (hub, expedition, arena). */
export abstract class PlayScene implements Scene {
  abstract name: string;
  world!: World;
  renderer: WorldRenderer;
  alpha = 1;
  hpGhost = 1;
  bossGhost = 1;
  roomBanner: { text: string; sub: string; t: number } | null = null;
  bossIntro = 0;

  constructor(protected game: Game) {
    this.renderer = new WorldRenderer(game.settings);
  }

  /** Global gameplay hotkeys (pause/menus). Return true if a panel was opened. */
  protected abstract hotkeys(g: Game): boolean;
  protected abstract onEvent(g: Game, e: SimEvent): void;
  protected run(): RunState | null {
    return null;
  }
  protected extraDraw(_g: CanvasRenderingContext2D, _cx: number, _cy: number): void {}
  protected afterFrame(_g: Game, _dt: number, _sim: boolean): void {}
  protected drawExtraHud(_ctx: Ctx, _g: Game): void {}

  frame(g: Game, dt: number, simAllowed: boolean): void {
    this.renderer.settings = g.settings;
    if (simAllowed && this.hotkeys(g)) simAllowed = false;
    this.world.time.timeScale = Dev.timeScale;
    if (simAllowed) {
      this.alpha = this.world.time.advance(dt, () => this.world.step());
      const evs = this.renderer.consume(this.world.events, g.audio);
      this.world.events = [];
      for (const e of evs) this.onEvent(g, e);
      this.renderer.update(dt, this.world);
    }
    if (this.roomBanner) {
      this.roomBanner.t += dt;
      if (this.roomBanner.t > 2600) this.roomBanner = null;
    }
    if (this.bossIntro > 0) this.bossIntro -= dt;
    this.afterFrame(g, dt, simAllowed);
  }

  render(ctx: Ctx, g: Game): void {
    this.renderer.draw(this.world, this.alpha, (c, cx, cy) => this.extraDraw(c, cx, cy));
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(this.renderer.canvas, 0, 0, UI_W, UI_H);
    this.renderer.drawOverlay(ctx);
    this.drawHud(ctx, g);
    this.drawExtraHud(ctx, g);
  }

  protected drawHud(ctx: Ctx, g: Game): void {
    const w = this.world;
    const p = w.player;
    const d = p.derived;
    const run = this.run();
    // ── vitals ──
    const x = 58;
    let y = 16;
    hudPlate(ctx, 8, 8, 292, run ? 74 : 62);
    lanternEmblem(ctx, 30, 36, p.hp / d.maxHp, g.t);
    const hpF = p.hp / d.maxHp;
    this.hpGhost = Math.max(hpF, this.hpGhost - 0.004);
    bar(ctx, x, y, 226, 13, hpF, hpF < 0.3 ? '#ff3030' : C.hp, 'rgba(0,0,0,0.7)', this.hpGhost);
    if (p.barrier > 0) bar(ctx, x, y + 10, 226 * Math.min(1, p.barrier / d.maxHp), 4, 1, '#8fe0ff', 'rgba(0,0,0,0)');
    textShadow(ctx, `${Math.ceil(p.hp)} / ${d.maxHp}`, x + 6, y, '#fff', 11, 'left', true);
    y += 18;
    bar(ctx, x, y, 190, 7, p.mp / d.maxMp, C.mp);
    textShadow(ctx, `${Math.floor(p.mp)}`, x + 196, y - 3, '#9fc8ff', 11, 'left', true);
    y += 12;
    // lamp oil
    for (let i = 0; i < Math.max(p.potions, Math.round(p.stats.potions)); i++) {
      const full = i < p.potions;
      ctx.fillStyle = '#05030a';
      ctx.fillRect(x + i * 12 - 1, y + 1, 10, 12);
      ctx.fillStyle = full ? '#e0a040' : 'rgba(255,255,255,0.12)';
      ctx.fillRect(x + i * 12, y + 3, 8, 9);
      if (full) {
        ctx.fillStyle = '#ffe6a0';
        ctx.fillRect(x + i * 12 + 1, y + 4, 3, 4);
      }
      ctx.fillStyle = full ? '#7a5020' : 'rgba(255,255,255,0.1)';
      ctx.fillRect(x + i * 12 + 2, y + 1, 4, 2);
    }
    text(ctx, g.input.keyName('potion'), x + Math.max(1, p.potions) * 12 + 4 + Math.max(0, Math.round(p.stats.potions) - p.potions) * 12, y, C.dim, 11);
    if (run) {
      y += 18;
      const need = xpForLevel(run.level);
      bar(ctx, x, y, 190, 4, run.xp / need, C.xp);
      textShadow(ctx, `Lv ${run.level}`, x + 196, y - 4, '#d8b0ff', 11, 'left', true);
    }
    // ── skills ──
    this.drawSkills(ctx, g);
    // ── buffs ──
    let bx = 16;
    const by = run ? 90 : 78;
    for (const b of p.buffs) {
      if (b.dur <= 1) continue;
      ctx.fillStyle = 'rgba(8,6,12,0.7)';
      ctx.font = font(11, true);
      const label = b.stacks > 1 ? `${b.name} ×${b.stacks}` : b.name;
      const bw = ctx.measureText(label).width + 12;
      ctx.fillRect(bx, by, bw, 16);
      ctx.fillStyle = '#ffd27a';
      ctx.fillRect(bx, by + 14, bw * (1 - b.t / b.dur), 2);
      text(ctx, label, bx + 6, by + 2, '#ffe9b0', 11, 'left', true);
      bx += bw + 4;
    }
    // ── combo ──
    if (p.combo >= 3) {
      const cx = UI_W - 30;
      const cy = 150;
      const pulse = 1 + Math.max(0, (p.comboTimer - 140) / 10) * 0.25;
      ctx.save();
      ctx.translate(cx, cy);
      ctx.scale(pulse, pulse);
      heading(ctx, `${p.combo}`, 0, 0, p.combo >= 50 ? '#ff8a3d' : p.combo >= 20 ? '#ffd23c' : '#fff', 32, 'right');
      ctx.restore();
      textShadow(ctx, 'HITS', cx, cy + 34, C.dim, 12, 'right', true);
      bar(ctx, cx - 60, cy + 50, 60, 3, p.comboTimer / 150, '#ffd23c');
      if (p.stats.comboDmg > 0) textShadow(ctx, `+${Math.round(p.stats.comboDmg * Math.min(10, Math.floor(p.combo / 10)) * 100)}% dmg`, cx, cy + 56, '#ffb86a', 11, 'right');
    }
    if (p.riposte > 0) textShadow(ctx, `RIPOSTE READY — ${g.input.keyName('light')}/${g.input.keyName('heavy')}`, UI_W / 2, UI_H - 120, '#fff2a0', 15, 'center', true);
    // ── boss bar ──
    const boss = w.boss;
    if (boss && (boss.alive || boss.deathT < 40)) this.drawBossBar(ctx, boss);
    // ── banner ──
    if (this.roomBanner) {
      const b = this.roomBanner;
      const a = b.t < 300 ? b.t / 300 : b.t > 2000 ? Math.max(0, 1 - (b.t - 2000) / 600) : 1;
      ctx.globalAlpha = a;
      heading(ctx, b.text, UI_W / 2, 116, C.title, 28, 'center');
      ornamentLine(ctx, UI_W / 2, 152, 160);
      textShadow(ctx, b.sub, UI_W / 2, 158, '#c8b8a8', 14, 'center');
      ctx.globalAlpha = 1;
    }
  }

  private drawSkills(ctx: Ctx, g: Game): void {
    const p = this.world.player;
    const ms = MOVESETS[p.moveset.cls];
    const slots: { name: string; key: string; cost: number; cd: number; cdMax: number; color: string; ok: boolean }[] = [];
    const artCost = p.artCost();
    slots.push({ name: 'ART', key: g.input.keyName('art'), cost: artCost, cd: 0, cdMax: 1, color: '#ffd27a', ok: p.mp >= artCost });
    for (let i = 0; i < 2; i++) {
      const id = this.world.loadout.spells[i];
      const sp = id ? SPELLS[id] : null;
      slots.push({ name: sp ? sp.name.split(' ')[0].toUpperCase() : '—', key: g.input.keyName(i === 0 ? 'spell1' : 'spell2'), cost: sp?.mp ?? 0, cd: p.spellCd[i], cdMax: sp?.cooldown ?? 1, color: sp?.color ?? '#555', ok: !!sp && p.mp >= sp.mp && p.spellCd[i] <= 0 });
    }
    const sx = 16;
    const sy = UI_H - 64;
    slots.forEach((s, i) => {
      const x = sx + i * 62;
      ctx.fillStyle = '#05030a';
      ctx.fillRect(x - 1, sy - 1, 58, 64);
      const bgr = ctx.createLinearGradient(0, sy, 0, sy + 48);
      bgr.addColorStop(0, s.ok ? 'rgba(50,38,60,0.95)' : 'rgba(26,20,32,0.92)');
      bgr.addColorStop(1, 'rgba(10,7,14,0.95)');
      ctx.fillStyle = bgr;
      ctx.fillRect(x, sy, 56, 48);
      ctx.strokeStyle = s.ok ? s.color : 'rgba(200,160,90,0.25)';
      ctx.lineWidth = 1;
      ctx.strokeRect(x + 2.5, sy + 2.5, 51, 43);
      if (s.ok) {
        ctx.globalAlpha = 0.15 + Math.sin(g.t / 300 + i) * 0.08;
        ctx.fillStyle = s.color;
        ctx.fillRect(x + 3, sy + 3, 50, 42);
        ctx.globalAlpha = 1;
      }
      if (s.cd > 0) {
        ctx.fillStyle = 'rgba(0,0,0,0.65)';
        ctx.fillRect(x + 3, sy + 3, 50, 42 * (s.cd / s.cdMax));
        textShadow(ctx, (s.cd / 60).toFixed(1), x + 28, sy + 17, '#fff', 13, 'center', true);
      }
      ctx.font = titleFont(10);
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      ctx.fillStyle = s.ok ? s.color : C.dim;
      ctx.fillText(s.name, x + 28, sy + 7);
      if (s.cost) text(ctx, `${s.cost}`, x + 28, sy + 29, s.ok ? '#9fc8ff' : '#556', 12, 'center', true);
      const kg = ctx.createLinearGradient(0, sy + 48, 0, sy + 62);
      kg.addColorStop(0, '#3a2e48');
      kg.addColorStop(1, '#1c1424');
      ctx.fillStyle = kg;
      ctx.fillRect(x, sy + 49, 56, 13);
      text(ctx, s.key, x + 28, sy + 49, '#f4ead8', 11, 'center', true);
    });
    ctx.font = titleFont(12);
    ctx.textAlign = 'left';
    ctx.fillStyle = '#d8c8a8';
    ctx.fillText(ms.name.toUpperCase(), sx + 194, sy + 6);
    text(ctx, ATTACK_NAMES(p), sx + 192, sy + 22, C.dim, 11);
  }

  private drawBossBar(ctx: Ctx, b: Boss): void {
    const w = 380;
    const x = 326;
    const y = 34;
    const f = Math.max(0, b.hp / b.maxHp);
    this.bossGhost = Math.max(f, this.bossGhost - 0.002);
    hudPlate(ctx, x - 12, y - 26, w + 24, 52);
    heading(ctx, b.bossDef.name, x, y - 20, '#ffd8c8', 14);
    ctx.font = titleFont(14);
    const nw = ctx.measureText(b.bossDef.name).width;
    text(ctx, b.bossDef.title, x + nw + 10, y - 18, '#a08a90', 12);
    bar(ctx, x, y, w, 12, f, '#c03030', 'rgba(0,0,0,0.7)', this.bossGhost);
    for (const th of b.thresholds) {
      ctx.fillStyle = '#ffd27a';
      ctx.fillRect(x + w * th - 1, y - 2, 2, 16);
    }
    bar(ctx, x, y + 15, w, 4, Math.min(1, b.poiseDmg / b.poiseMax), b.state === 'stagger' ? '#fff' : '#ffd23c');
    if (b.state === 'stagger') textShadow(ctx, 'STAGGERED', x + w, y - 19, '#ffd23c', 13, 'right', true);
    else textShadow(ctx, `Phase ${b.phase}`, x + w, y - 19, C.dim, 12, 'right');
  }

  /** Relic strip for runs. */
  protected drawRelics(ctx: Ctx, run: RunState): void {
    let x = UI_W - 16;
    const y = 14;
    textShadow(ctx, `${fmt(run.gilt)} Gilt`, x, y, C.gilt, 14, 'right', true);
    textShadow(ctx, `${Math.floor(run.stats.cinders)} Cinders`, x, y + 18, C.cinder, 12, 'right', true);
    const n = run.relics.length;
    const icons = run.relics.slice(-12);
    x = UI_W - 16 - icons.length * 14;
    icons.forEach((id, i) => {
      const r = RELICS[id];
      const col = r.rarity === 'legendary' ? '#ffb03a' : r.rarity === 'rare' ? '#5fa8ff' : r.rarity === 'uncommon' ? '#6fdc6f' : '#c8c8c8';
      ctx.fillStyle = col;
      ctx.save();
      ctx.translate(x + i * 14 + 5, y + 46);
      ctx.rotate(Math.PI / 4);
      ctx.fillRect(-4, -4, 8, 8);
      ctx.restore();
    });
    if (n) textShadow(ctx, `${n} relic${n > 1 ? 's' : ''}`, UI_W - 16, y + 56, C.dim, 11, 'right');
    if (run.curses.length) textShadow(ctx, `${run.curses.length} curse${run.curses.length > 1 ? 's' : ''}`, UI_W - 16, y + 70, C.bad, 11, 'right');
  }
}

function ATTACK_NAMES(p: World['player']): string {
  if (p.state === 'attack' && p.atk) return p.atk.def.name;
  return '';
}

/** Dark translucent HUD plate with a gold hairline and corner studs. */
function hudPlate(ctx: Ctx, x: number, y: number, w: number, h: number): void {
  const grad = ctx.createLinearGradient(0, y, 0, y + h);
  grad.addColorStop(0, 'rgba(24,18,32,0.82)');
  grad.addColorStop(1, 'rgba(8,6,12,0.7)');
  ctx.fillStyle = grad;
  ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = 'rgba(200,160,90,0.45)';
  ctx.lineWidth = 1;
  ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
  ctx.fillStyle = '#d8a860';
  for (const [cx, cy] of [[x, y], [x + w - 3, y], [x, y + h - 3], [x + w - 3, y + h - 3]]) ctx.fillRect(cx, cy, 3, 3);
}

/** The player's lantern emblem; its flame shrinks as HP drops. */
function lanternEmblem(ctx: Ctx, x: number, y: number, hpF: number, t: number): void {
  ctx.fillStyle = '#05030a';
  ctx.beginPath();
  ctx.arc(x, y, 20, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#d8a860';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(x, y, 18, 0, Math.PI * 2);
  ctx.stroke();
  const glow = ctx.createRadialGradient(x, y + 2, 0, x, y + 2, 17);
  glow.addColorStop(0, `rgba(255,190,90,${0.35 + hpF * 0.4})`);
  glow.addColorStop(1, 'rgba(255,190,90,0)');
  ctx.fillStyle = glow;
  ctx.fillRect(x - 18, y - 18, 36, 36);
  // lantern cage
  ctx.fillStyle = '#6a4a2a';
  ctx.fillRect(x - 6, y - 10, 12, 2);
  ctx.fillRect(x - 6, y + 8, 12, 2);
  ctx.fillRect(x - 6, y - 8, 1, 16);
  ctx.fillRect(x + 5, y - 8, 1, 16);
  ctx.fillRect(x - 1, y - 13, 2, 3);
  // flame
  const fh = 3 + hpF * 9 + Math.sin(t / 90) * 1;
  ctx.fillStyle = hpF < 0.3 ? '#ff6040' : '#ffb040';
  ctx.beginPath();
  ctx.moveTo(x - 3.5, y + 7);
  ctx.quadraticCurveTo(x - 4, y + 7 - fh * 0.6, x, y + 7 - fh);
  ctx.quadraticCurveTo(x + 4, y + 7 - fh * 0.6, x + 3.5, y + 7);
  ctx.fill();
  ctx.fillStyle = '#fff2c0';
  ctx.beginPath();
  ctx.ellipse(x, y + 5, 1.6, Math.max(1, fh * 0.35), 0, 0, Math.PI * 2);
  ctx.fill();
}

function ornamentLine(ctx: Ctx, cx: number, y: number, half: number): void {
  for (const dir of [-1, 1]) {
    const grad = ctx.createLinearGradient(cx, 0, cx + dir * half, 0);
    grad.addColorStop(0, 'rgba(216,168,96,0.9)');
    grad.addColorStop(1, 'rgba(216,168,96,0)');
    ctx.fillStyle = grad;
    ctx.fillRect(Math.min(cx, cx + dir * half), y, half, 1);
  }
  ctx.fillStyle = '#d8a860';
  ctx.beginPath();
  ctx.moveTo(cx, y - 3);
  ctx.lineTo(cx + 3, y);
  ctx.lineTo(cx, y + 3);
  ctx.lineTo(cx - 3, y);
  ctx.fill();
}
