/**
 * Draws a sprite through a scratch canvas so it can be given a 1px pixel-art outline
 * (and a solid-white hit flash) in a single consistent style for every character.
 */
export class Outliner {
  private c: HTMLCanvasElement;
  private g: CanvasRenderingContext2D;
  private s: HTMLCanvasElement;
  private sg: CanvasRenderingContext2D;
  /** @param size scratch canvas size; (ox, oy) = feet origin inside it */
  constructor(private size = 112, private ox = 56, private oy = 84) {
    const SIZE = size;
    this.c = document.createElement('canvas');
    this.c.width = this.c.height = SIZE;
    this.g = this.c.getContext('2d')!;
    this.s = document.createElement('canvas');
    this.s.width = this.s.height = SIZE;
    this.sg = this.s.getContext('2d')!;
  }

  /**
   * @param draw  draws the sprite with origin (0,0) at the feet
   * @param outline outline colour (null = none)
   * @param tint  if set, the whole sprite is replaced by this colour (hit flash)
   */
  draw(target: CanvasRenderingContext2D, x: number, y: number, draw: (g: CanvasRenderingContext2D) => void, outline: string | null, tint: string | null = null, alpha = 1): void {
    const g = this.g;
    const SIZE = this.size;
    const OX = this.ox;
    const OY = this.oy;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, SIZE, SIZE);
    g.globalAlpha = 1;
    g.globalCompositeOperation = 'source-over';
    g.translate(OX, OY);
    draw(g);
    g.setTransform(1, 0, 0, 1, 0, 0);
    const sx = Math.round(x) - OX;
    const sy = Math.round(y) - OY;
    const prevA = target.globalAlpha;
    target.globalAlpha = prevA * alpha;
    if (outline) {
      this.silhouette(outline);
      target.drawImage(this.s, sx - 1, sy);
      target.drawImage(this.s, sx + 1, sy);
      target.drawImage(this.s, sx, sy - 1);
      target.drawImage(this.s, sx, sy + 1);
    }
    if (tint) {
      this.silhouette(tint);
      target.drawImage(this.s, sx, sy);
    } else target.drawImage(this.c, sx, sy);
    target.globalAlpha = prevA;
  }

  private silhouette(color: string): void {
    const sg = this.sg;
    const SIZE = this.size;
    sg.globalCompositeOperation = 'source-over';
    sg.clearRect(0, 0, SIZE, SIZE);
    sg.drawImage(this.c, 0, 0);
    sg.globalCompositeOperation = 'source-in';
    sg.fillStyle = color;
    sg.fillRect(0, 0, SIZE, SIZE);
    sg.globalCompositeOperation = 'source-over';
  }
}

/** Cached soft radial glow sprites for additive lighting. */
const glowCache = new Map<string, HTMLCanvasElement>();
export function glowSprite(color: string, r: number): HTMLCanvasElement {
  const key = color + r;
  let c = glowCache.get(key);
  if (c) return c;
  c = document.createElement('canvas');
  c.width = c.height = r * 2;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(r, r, 0, r, r, r);
  grad.addColorStop(0, color);
  grad.addColorStop(0.35, withAlpha(color, 0.35));
  grad.addColorStop(1, withAlpha(color, 0));
  g.fillStyle = grad;
  g.fillRect(0, 0, r * 2, r * 2);
  glowCache.set(key, c);
  return c;
}

export function withAlpha(hex: string, a: number): string {
  if (hex.startsWith('rgba') || hex.startsWith('rgb')) return hex;
  let h = hex.slice(1);
  if (h.length === 3) h = h.split('').map((x) => x + x).join('');
  const n = parseInt(h, 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

/** Mix two hex colours (t=0 → a, t=1 → b). */
export function mix(a: string, b: string, t: number): string {
  const pa = parseInt(a.slice(1), 16);
  const pb = parseInt(b.slice(1), 16);
  const ch = (s: number) => Math.round(((pa >> s) & 255) * (1 - t) + ((pb >> s) & 255) * t);
  return '#' + ((1 << 24) | (ch(16) << 16) | (ch(8) << 8) | ch(0)).toString(16).slice(1);
}
export const shade = (c: string, t: number) => (t >= 0 ? mix(c, '#ffffff', t) : mix(c, '#000000', -t));
