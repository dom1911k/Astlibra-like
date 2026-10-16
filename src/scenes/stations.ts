export type StationKind = 'gate' | 'armory' | 'forge' | 'board' | 'merchant' | 'archive' | 'training' | 'notice' | 'chest' | 'shop' | 'anvil' | 'altar' | 'campfire' | 'tablet';

export interface Station {
  kind: StationKind;
  x: number;
  y: number;
  label: string;
  used?: boolean;
}

/** Procedural pixel props for interactable stations (world canvas coords). */
export function drawStation(g: CanvasRenderingContext2D, s: Station, x: number, y: number, t: number, near: boolean): void {
  g.save();
  g.translate(Math.round(x), Math.round(y));
  const glow = (r: number, col: string, a = 0.3) => {
    g.globalCompositeOperation = 'lighter';
    g.globalAlpha = a + Math.sin(t / 300) * 0.08;
    g.fillStyle = col;
    g.beginPath();
    g.arc(0, -r, r, 0, Math.PI * 2);
    g.fill();
    g.globalAlpha = 1;
    g.globalCompositeOperation = 'source-over';
  };
  switch (s.kind) {
    case 'gate':
      g.fillStyle = '#2a2026';
      g.fillRect(-18, -56, 36, 56);
      g.fillStyle = '#5a4a4a';
      g.fillRect(-22, -60, 44, 6);
      g.fillRect(-22, -60, 6, 60);
      g.fillRect(16, -60, 6, 60);
      g.fillStyle = '#ff8a3d';
      g.globalAlpha = 0.5 + Math.sin(t / 200) * 0.2;
      g.fillRect(-16, -54, 32, 54);
      g.globalAlpha = 1;
      glow(24, '#ff8a3d', 0.2);
      break;
    case 'armory':
      g.fillStyle = '#5a4030';
      g.fillRect(-14, -30, 28, 30);
      g.fillStyle = '#8a7a6a';
      g.fillRect(-10, -26, 3, 22);
      g.fillRect(-2, -28, 3, 24);
      g.fillRect(6, -24, 3, 20);
      g.fillStyle = '#c8d0d8';
      g.fillRect(-11, -28, 5, 3);
      g.fillRect(-3, -30, 5, 3);
      break;
    case 'forge':
    case 'anvil':
      g.fillStyle = '#3a3a40';
      g.fillRect(-10, -10, 20, 4);
      g.fillRect(-5, -6, 10, 6);
      g.fillRect(-12, -12, 24, 3);
      if (s.kind === 'forge') {
        g.fillStyle = '#4a3020';
        g.fillRect(14, -26, 18, 26);
        g.fillStyle = '#ff8a3d';
        g.fillRect(18, -16, 10, 8);
        glow(14, '#ff6a20', 0.35);
      } else if (!s.used) glow(10, '#ff8a3d', 0.3);
      break;
    case 'board':
      g.fillStyle = '#2a2440';
      g.fillRect(-14, -44, 28, 44);
      for (let i = 0; i < 7; i++) {
        g.fillStyle = i % 2 ? '#ffd27a' : '#8fd8ff';
        g.fillRect(-10 + ((i * 7) % 20), -40 + i * 5, 2, 2);
      }
      glow(20, '#a8c8ff', 0.15);
      break;
    case 'merchant':
    case 'shop':
      g.fillStyle = '#6a4a30';
      g.fillRect(-18, -12, 36, 12);
      g.fillStyle = '#a03040';
      g.fillRect(-20, -32, 40, 6);
      g.fillStyle = '#e8d8b0';
      for (let i = 0; i < 5; i++) g.fillRect(-20 + i * 8, -26, 4, 3);
      g.fillStyle = '#5a4a3a';
      g.fillRect(-18, -26, 2, 14);
      g.fillRect(16, -26, 2, 14);
      // merchant
      g.fillStyle = '#4a3a5a';
      g.fillRect(-4, -22, 8, 10);
      g.fillStyle = '#e8c8a0';
      g.fillRect(-3, -27, 6, 5);
      g.fillStyle = '#ffd23c';
      g.fillRect(8, -16, 3, 3);
      break;
    case 'archive':
      g.fillStyle = '#4a3020';
      g.fillRect(-16, -40, 32, 40);
      for (let r = 0; r < 4; r++) for (let i = 0; i < 6; i++) {
        g.fillStyle = ['#a04040', '#406090', '#609040', '#a08040'][(i + r) % 4];
        g.fillRect(-14 + i * 5, -37 + r * 10, 3, 8);
      }
      break;
    case 'training':
      g.fillStyle = '#6a4a2a';
      g.fillRect(-1, -26, 3, 26);
      g.fillStyle = '#b89a5e';
      g.fillRect(-6, -22, 13, 12);
      g.fillRect(-8, -19, 17, 3);
      break;
    case 'notice':
      g.fillStyle = '#5a4030';
      g.fillRect(-1, -20, 3, 20);
      g.fillStyle = '#8a6a4a';
      g.fillRect(-12, -34, 24, 16);
      g.fillStyle = '#e8d8b0';
      g.fillRect(-9, -31, 8, 10);
      g.fillRect(2, -31, 7, 6);
      break;
    case 'chest':
      g.fillStyle = s.used ? '#3a2a1a' : '#7a5020';
      g.fillRect(-10, -12, 20, 12);
      g.fillStyle = s.used ? '#2a1a10' : '#a07030';
      g.fillRect(-10, s.used ? -18 : -14, 20, 4);
      g.fillStyle = '#ffd23c';
      g.fillRect(-2, -10, 4, 4);
      if (!s.used) glow(10, '#ffd23c', 0.3);
      break;
    case 'altar':
      g.fillStyle = '#3a3048';
      g.fillRect(-10, -16, 20, 16);
      g.fillRect(-14, -18, 28, 3);
      if (!s.used) {
        g.fillStyle = '#c77dff';
        g.fillRect(-2, -30 + Math.sin(t / 300) * 2, 4, 8);
        glow(16, '#c77dff', 0.3);
      }
      break;
    case 'campfire':
      g.fillStyle = '#4a3020';
      g.fillRect(-10, -3, 20, 3);
      if (!s.used) {
        for (let i = 0; i < 3; i++) {
          g.fillStyle = i === 1 ? '#ffd23c' : '#ff6a20';
          const h = 8 + Math.sin(t / 80 + i * 2) * 3;
          g.fillRect(-5 + i * 3, -3 - h, 3, h);
        }
        glow(18, '#ff6a20', 0.35);
      }
      break;
    case 'tablet':
      g.fillStyle = '#3a4a50';
      g.fillRect(-8, -28, 16, 28);
      g.fillStyle = s.used ? '#506068' : '#9cf2ff';
      for (let i = 0; i < 4; i++) g.fillRect(-5, -24 + i * 6, 10, 1);
      if (!s.used) glow(14, '#9cf2ff', 0.25);
      break;
  }
  g.restore();
  if (near) {
    g.fillStyle = '#ffe9a8';
    const yy = Math.round(y) - 66 + Math.sin(t / 200) * 2;
    g.beginPath();
    g.moveTo(Math.round(x) - 4, yy);
    g.lineTo(Math.round(x) + 4, yy);
    g.lineTo(Math.round(x), yy + 5);
    g.fill();
  }
}
