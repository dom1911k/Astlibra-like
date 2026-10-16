/**
 * Browser smoke test: builds nothing itself — run `npm run build` first.
 * Serves dist/ with `vite preview`, drives the game with real key presses in headless
 * Chromium, fails on any console error, and writes screenshots to tools/out/.
 *
 *   npm run build && npm run smoke
 */
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { chromium, type Page } from 'playwright';

const OUT = new URL('./out/', import.meta.url).pathname;
mkdirSync(OUT, { recursive: true });
const PORT = 4179;

async function waitForServer(url: string, ms = 20000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    try {
      const r = await fetch(url);
      if (r.ok) return;
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error('server did not start');
}

async function press(page: Page, key: string, hold = 60) {
  await page.keyboard.down(key);
  await page.waitForTimeout(hold);
  await page.keyboard.up(key);
}

async function main() {
  const server = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], { stdio: 'pipe', detached: true });
  const errors: string[] = [];
  try {
    await waitForServer(`http://localhost:${PORT}/`);
    const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH ?? '/opt/pw-browsers/chromium', args: ['--autoplay-policy=no-user-gesture-required'] });
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    page.on('console', (m) => {
      if (m.type() === 'error') errors.push(m.text());
    });
    page.on('pageerror', (e) => errors.push(String(e)));
    await page.goto(`http://localhost:${PORT}/`);
    await page.waitForTimeout(800);
    await page.screenshot({ path: OUT + '01-title.png' });
    await press(page, 'Enter');
    await page.waitForTimeout(300);
    await page.screenshot({ path: OUT + '02-title-menu.png' });
    await press(page, 'Enter'); // Enter Lamplight
    await page.waitForTimeout(800);
    await page.screenshot({ path: OUT + '03-hub-welcome.png' });
    await press(page, 'Enter'); // close welcome
    await page.waitForTimeout(300);
    // walk right through the hub
    await page.keyboard.down('KeyD');
    await page.waitForTimeout(900);
    await page.keyboard.up('KeyD');
    await page.screenshot({ path: OUT + '04-hub.png' });
    // jump to training grounds via the exposed game handle
    // walk to the training station (station 7 is to the right)
    const scene = await page.evaluate(() => (window as any).__game.scene.name);
    if (scene !== 'arena') {
      await page.keyboard.down('KeyD');
      for (let i = 0; i < 60; i++) {
        await page.waitForTimeout(100);
        const near = await page.evaluate(() => (window as any).__game.scene.near?.kind);
        if (near === 'training') break;
      }
      await page.keyboard.up('KeyD');
      await press(page, 'KeyW');
      await page.waitForTimeout(600);
    }
    await page.screenshot({ path: OUT + '05-arena.png' });
    // combo on the dummy
    await page.keyboard.down('KeyD');
    await page.waitForTimeout(500);
    await page.keyboard.up('KeyD');
    for (let i = 0; i < 4; i++) {
      await press(page, 'KeyJ', 40);
      await page.waitForTimeout(90);
      if (i === 1) await page.screenshot({ path: OUT + '06-attack.png' });
    }
    await press(page, 'KeyK', 40);
    await page.waitForTimeout(120);
    await page.screenshot({ path: OUT + '07-heavy.png' });
    await page.keyboard.down('KeyW');
    await press(page, 'KeyJ', 40);
    await page.keyboard.up('KeyW');
    await page.waitForTimeout(150);
    await press(page, 'Space', 120);
    await press(page, 'KeyJ', 40);
    await page.waitForTimeout(80);
    await page.screenshot({ path: OUT + '08-aerial.png' });
    await page.waitForTimeout(800);
    // debug panel
    await press(page, 'F1');
    await page.waitForTimeout(300);
    await page.screenshot({ path: OUT + '09-debug.png' });
    await press(page, 'F1');
    await page.waitForTimeout(200);
    // character panel
    await press(page, 'Tab');
    await page.waitForTimeout(300);
    await page.screenshot({ path: OUT + '10-character.png' });
    await press(page, 'Tab');
    // playtest tools: F2 menu and an F9 feedback note
    await press(page, 'F2');
    await page.waitForTimeout(300);
    await page.screenshot({ path: OUT + '11-playtest.png' });
    await press(page, 'Escape');
    await page.waitForTimeout(200);
    await press(page, 'F9');
    await page.waitForTimeout(200);
    await page.keyboard.type('smoke test note');
    await page.screenshot({ path: OUT + '12-note.png' });
    await press(page, 'Enter');
    await page.waitForTimeout(200);
    const notes = await page.evaluate(() => (window as any).__game.log.notes);
    if (notes < 1) errors.push('F9 note was not saved');
    const stats = await page.evaluate(() => {
      const g = (window as any).__game;
      const w = g.scene.world;
      return { scene: g.scene.name, hits: w?.stats.hits, fps: g.fps };
    });
    console.log('state:', JSON.stringify(stats));
    await browser.close();
  } finally {
    try {
      process.kill(-server.pid!, 'SIGTERM');
    } catch {
      server.kill();
    }
  }
  if (errors.length) {
    console.error('Console errors:\n' + errors.join('\n'));
    process.exit(1);
  }
  console.log('Smoke test passed. Screenshots in', OUT);
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
