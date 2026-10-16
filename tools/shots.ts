// Ad-hoc visual check: screenshots of an expedition room and guardian fights. Run after `npm run build`.
import { spawn } from 'node:child_process';
import { chromium } from 'playwright';
const OUT = new URL('./out/', import.meta.url).pathname;
const server = spawn('npx', ['vite', 'preview', '--port', '4181', '--strictPort'], { stdio: 'pipe', detached: true });
await new Promise((r) => setTimeout(r, 2500));
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors: string[] = [];
page.on('pageerror', (e) => errors.push(String(e)));
await page.goto('http://localhost:4181/');
await page.waitForTimeout(500);
await page.evaluate(() => {
  const g = (window as any).__game;
  g.profile.flags.controlsShown = true;
  g.profile.flags.welcome = true;
});
await page.keyboard.press('Enter');
await page.keyboard.press('Enter');
await page.waitForTimeout(500);
// start an expedition through the gate menu programmatically
await page.evaluate(() => {
  const g = (window as any).__game;
  (g.scene as any).begin(g);
});
await page.waitForTimeout(2500);
await page.screenshot({ path: OUT + 's1-expedition.png' });
await page.keyboard.down('KeyD');
await page.waitForTimeout(1200);
await page.keyboard.up('KeyD');
for (let i = 0; i < 6; i++) { await page.keyboard.press('KeyJ'); await page.waitForTimeout(110); }
await page.screenshot({ path: OUT + 's2-fight.png' });
for (const d of [2, 3]) {
  await page.evaluate((depth) => {
    const g = (window as any).__game;
    const sc = g.scene;
    sc.r.depth = depth;
    sc.enterNode(g, sc.r.map.nodes[sc.r.node]);
  }, d);
  await page.waitForTimeout(1500);
  await page.keyboard.down('KeyD');
  await page.waitForTimeout(900);
  await page.keyboard.up('KeyD');
  await page.screenshot({ path: OUT + `s-depth${d}.png` });
}
await page.keyboard.press('KeyM');
await page.waitForTimeout(300);
await page.screenshot({ path: OUT + 's3-map.png' });
await page.keyboard.press('Escape');
for (const [i, boss] of ['rootmaw', 'matriarch', 'vessel'].entries()) {
  await page.evaluate((b) => {
    const g = (window as any).__game;
    const S = (window as any).__scenes;
    g.setScene(new S.ArenaScene(g));
    const w = g.scene.world;
    w.enemies = [];
    w.spawnBoss(b, w.player.x + 140, w.player.y);
  }, boss);
  await page.waitForTimeout(2600);
  await page.keyboard.press('KeyJ');
  await page.waitForTimeout(150);
  await page.screenshot({ path: OUT + `s${4 + i}-${boss}.png` });
}
console.log('errors:', errors);
await browser.close();
try { process.kill(-server.pid!, 'SIGTERM'); } catch {}
process.exit(0);
