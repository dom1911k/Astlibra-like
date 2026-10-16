import { Rng } from '../core/rng';
import { ENEMIES, type EliteMod } from '../data/enemies';
import { ROOM_LIST, type RoomTemplate } from '../data/rooms';
import type { Room } from '../sim/room';
import type { SpawnOpts } from '../sim/enemy';

export type NodeType = 'start' | 'combat' | 'elite' | 'treasure' | 'shop' | 'forge' | 'shrine' | 'challenge' | 'rest' | 'lore' | 'secret' | 'boss';

export const NODE_INFO: Record<NodeType, { name: string; icon: string; color: string; text: string }> = {
  start: { name: 'Descent', icon: '▼', color: '#c8b8a0', text: 'The way down.' },
  combat: { name: 'Battle', icon: '⚔', color: '#e0d0c0', text: 'A fight. Run XP, Gilt and a chance at loot.' },
  elite: { name: 'Elite', icon: '☠', color: '#ff7a3c', text: 'A dangerous elite. Guaranteed Rare+ equipment and a relic.' },
  treasure: { name: 'Treasure', icon: '◆', color: '#ffd23c', text: 'A sealed cache. Equipment or a relic — no fight.' },
  shop: { name: 'Merchant', icon: '$', color: '#7cff8a', text: 'Spend Gilt on relics, gear and Lamp Oil.' },
  forge: { name: 'Forge', icon: '⚒', color: '#ff9a4a', text: 'Upgrade gear — or sacrifice one item to empower another.' },
  shrine: { name: 'Shrine', icon: '✧', color: '#c77dff', text: 'Swear a Vow: a powerful boon bound to a curse.' },
  challenge: { name: 'Gauntlet', icon: '⌛', color: '#5fa8ff', text: 'Timed waves. Clear fast for an upgraded reward.' },
  rest: { name: 'Campfire', icon: '♨', color: '#ff6a6a', text: 'Restore HP and refill Lamp Oil.' },
  lore: { name: 'Echo', icon: '?', color: '#9cf2ff', text: 'A memory of the deep. Codex entry and Cinders.' },
  secret: { name: 'Hidden Vault', icon: '✦', color: '#ffe9a8', text: 'A secret vault with Cinders and a rare cache.' },
  boss: { name: 'Guardian', icon: '♛', color: '#ff4040', text: 'The depth guardian. Defeat it to bank your loot.' },
};

export interface MapNode {
  id: string;
  layer: number;
  col: number;
  type: NodeType;
  edges: string[];
  template: string;
  hidden?: boolean;
  shortcut?: boolean;
  elite?: EliteMod[];
  seed: number;
}

export interface ExpMap {
  depth: number;
  layers: number;
  nodes: Record<string, MapNode>;
  start: string;
  boss: string;
}

const LAYERS = 8;

export function generateMap(seed: number, depth: number, opts: { reveal: boolean; difficulty: number }): ExpMap {
  for (let attempt = 0; attempt < 50; attempt++) {
    const m = tryGenerate(new Rng(seed + attempt * 7919), depth, opts);
    if (validateMap(m).ok) return m;
  }
  throw new Error('map generation failed');
}

function tryGenerate(rng: Rng, depth: number, opts: { reveal: boolean; difficulty: number }): ExpMap {
  const nodes: Record<string, MapNode> = {};
  const layers: MapNode[][] = [];
  const combatTemplates = ROOM_LIST.filter((t) => t.kind === 'combat' && (t.minDepth ?? 1) <= depth);
  const eliteTemplates = ROOM_LIST.filter((t) => t.kind === 'elite');
  for (let L = 0; L < LAYERS; L++) {
    const n = L === 0 || L === LAYERS - 1 ? 1 : L === LAYERS - 2 ? 2 : rng.int(2, 3);
    const layer: MapNode[] = [];
    const usedTypes = new Set<NodeType>();
    for (let c = 0; c < n; c++) {
      let type: NodeType;
      if (L === 0) type = 'start';
      else if (L === LAYERS - 1) type = 'boss';
      else if (L === LAYERS - 2) type = c === 0 ? 'rest' : rng.pick(['shop', 'forge', 'shrine'] as NodeType[]);
      else {
        const weights: Partial<Record<NodeType, number>> =
          L === 1
            ? { combat: 4, treasure: 1, shrine: 0.6, lore: 0.6 }
            : { combat: 3.2, elite: 1.2 + opts.difficulty * 0.3, shop: 0.8, forge: 0.8, shrine: 0.8, challenge: 0.8, treasure: 0.7, rest: 0.4, lore: 0.5 };
        const opts2 = (Object.keys(weights) as NodeType[]).filter((t) => t === 'combat' || t === 'elite' || !usedTypes.has(t));
        type = rng.weighted(opts2, (t) => weights[t] ?? 0);
      }
      usedTypes.add(type);
      const tpl = pickTemplate(rng, type, combatTemplates, eliteTemplates);
      const node: MapNode = { id: `n${L}_${c}`, layer: L, col: c, type, edges: [], template: tpl.id, seed: rng.int(1, 1e9) };
      if (type === 'elite') node.elite = [rng.pick(['hasted', 'warded', 'vampiric', 'volatile', 'colossal'] as EliteMod[])];
      layer.push(node);
      nodes[node.id] = node;
    }
    layers.push(layer);
  }
  // edges: connect each node to 1-2 nodes in the next layer by relative position
  for (let L = 0; L < LAYERS - 1; L++) {
    const cur = layers[L];
    const nxt = layers[L + 1];
    for (const node of cur) {
      const rel = cur.length === 1 ? 0.5 : node.col / (cur.length - 1);
      const target = Math.round(rel * (nxt.length - 1));
      node.edges.push(nxt[target].id);
      if (rng.chance(0.55)) {
        const alt = target + (rng.chance(0.5) ? 1 : -1);
        if (alt >= 0 && alt < nxt.length && !node.edges.includes(nxt[alt].id)) node.edges.push(nxt[alt].id);
      }
    }
    // ensure every next-layer node has an incoming edge
    for (const n of nxt) {
      if (!cur.some((c) => c.edges.includes(n.id))) {
        const rel = nxt.length === 1 ? 0.5 : n.col / (nxt.length - 1);
        cur[Math.round(rel * (cur.length - 1))].edges.push(n.id);
      }
    }
  }
  // secret vault: hidden branch hanging off a mid layer
  if (rng.chance(0.75)) {
    const L = rng.int(2, 4);
    const from = rng.pick(layers[L]);
    const secret: MapNode = { id: `s${L}`, layer: L + 0.5, col: 3, type: 'secret', edges: [...layers[L + 1].map((n) => n.id).slice(0, 1)], template: 'u_hall', hidden: !opts.reveal, seed: rng.int(1, 1e9) };
    nodes[secret.id] = secret;
    from.edges.push(secret.id);
  }
  // boss shortcut: skip two layers at the cost of exploration
  if (rng.chance(0.6)) {
    const from = rng.pick(layers[2]);
    const to = rng.pick(layers[5]);
    if (!from.edges.includes(to.id)) {
      from.edges.push(to.id);
      from.shortcut = true;
    }
  }
  return { depth, layers: LAYERS, nodes, start: layers[0][0].id, boss: layers[LAYERS - 1][0].id };
}

function pickTemplate(rng: Rng, type: NodeType, combat: RoomTemplate[], elite: RoomTemplate[]): RoomTemplate {
  switch (type) {
    case 'boss': return ROOM_LIST.find((t) => t.id === 'boss_arena')!;
    case 'elite': return rng.pick(elite);
    case 'challenge': return ROOM_LIST.find((t) => t.id === 'ch_gauntlet')!;
    case 'combat':
    case 'start': return rng.pick(combat);
    default: return ROOM_LIST.find((t) => t.id === 'u_hall')!;
  }
}

/** Every node reachable from start, and every node can reach the boss (no dead ends / softlocks). */
export function validateMap(m: ExpMap): { ok: boolean; reason?: string } {
  const reach = new Set<string>();
  const stack = [m.start];
  while (stack.length) {
    const id = stack.pop()!;
    if (reach.has(id)) continue;
    reach.add(id);
    for (const e of m.nodes[id].edges) stack.push(e);
  }
  for (const id in m.nodes) if (!reach.has(id)) return { ok: false, reason: `unreachable ${id}` };
  const memo = new Map<string, boolean>();
  const reachesBoss = (id: string): boolean => {
    if (id === m.boss) return true;
    if (memo.has(id)) return memo.get(id)!;
    memo.set(id, false);
    const r = m.nodes[id].edges.some(reachesBoss);
    memo.set(id, r);
    return r;
  };
  for (const id in m.nodes) if (!reachesBoss(id)) return { ok: false, reason: `dead end ${id}` };
  for (const id in m.nodes) for (const e of m.nodes[id].edges) if (m.nodes[e].layer <= m.nodes[id].layer) return { ok: false, reason: 'backwards edge' };
  return { ok: true };
}

// ─────────────────────────────── encounters ───────────────────────────────
export interface WaveSpawn {
  id: string;
  x: number;
  y: number;
  opts: SpawnOpts;
  boss?: boolean;
}

export function scaling(depth: number, layer: number, diff: { hp: number; atk: number }): { hpMult: number; atkMult: number; defAdd: number } {
  return {
    hpMult: (1 + 0.95 * (depth - 1)) * (1 + 0.05 * layer) * diff.hp,
    atkMult: (1 + 0.55 * (depth - 1)) * (1 + 0.03 * layer) * diff.atk,
    defAdd: (depth - 1) * 3,
  };
}

export function buildEncounter(room: Room, node: MapNode, depth: number, diffIdx: number, diff: { hp: number; atk: number }): WaveSpawn[][] {
  const rng = new Rng(node.seed);
  const sc = scaling(depth, node.layer, diff);
  const base: SpawnOpts = { hpMult: sc.hpMult, atkMult: sc.atkMult, defAdd: sc.defAdd };
  if (node.type === 'boss') {
    const id = depth === 1 ? 'rootmaw' : depth === 2 ? 'matriarch' : 'vessel';
    const b = room.boss ?? room.ground[0] ?? room.player;
    return [[{ id, x: b.x, y: b.y, opts: { hpMult: diff.hp, atkMult: diff.atk }, boss: true }]];
  }
  const pool = Object.values(ENEMIES).filter((e) => e.minDepth <= depth && e.ai !== 'dummy');
  const groundPool = pool.filter((e) => !e.flying);
  const flyPool = pool.filter((e) => e.flying);
  let budget = 3 + depth * 2 + node.layer * 0.9 + diffIdx;
  const waves: WaveSpawn[][] = [];
  const nWaves = node.type === 'challenge' ? 3 : node.layer >= 3 || depth > 1 ? 2 : 1;
  const per = budget / nWaves;
  for (let wv = 0; wv < nWaves; wv++) {
    const wave: WaveSpawn[] = [];
    let b = per + (node.type === 'challenge' ? 1 : 0);
    const spots = rng.shuffle([...room.ground]);
    const fspots = rng.shuffle([...room.flying]);
    let guard = 0;
    while (b > 0.5 && guard++ < 20) {
      const useFly = fspots.length > 0 && rng.chance(0.3);
      const list = (useFly ? flyPool : groundPool).filter((e) => e.cost <= b + 0.5);
      if (!list.length) break;
      const def = rng.weighted(list, (e) => (e.minDepth === depth ? 1.6 : 1) / Math.sqrt(e.cost));
      const spot = useFly ? fspots.pop() : spots.pop();
      if (!spot) break;
      wave.push({ id: def.id, x: spot.x + rng.int(-10, 10), y: spot.y, opts: { ...base } });
      b -= def.cost;
    }
    if (wave.length) waves.push(wave);
  }
  // elite: replace the first spawn of wave 1 with an elite heavy hitter
  if (node.type === 'elite' || (diffIdx >= 3 && node.type === 'combat')) {
    const eliteIds = pool.filter((e) => !e.flying && e.cost >= 2).map((e) => e.id);
    const spot = room.ground[Math.floor(room.ground.length / 2)] ?? room.player;
    const elite: WaveSpawn = { id: rng.pick(eliteIds.length ? eliteIds : ['gloomling']), x: spot.x, y: spot.y, opts: { ...base, elite: node.elite ?? ['colossal'] } };
    if (!waves.length) waves.push([]);
    waves[waves.length - 1].push(elite);
  }
  if (!waves.length) waves.push([{ id: 'gloomling', x: room.ground[0]?.x ?? 200, y: room.ground[0]?.y ?? 200, opts: base }]);
  return waves;
}
