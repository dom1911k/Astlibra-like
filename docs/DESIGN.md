# CINDERDEEP — Design & Technical Plan

*An original 2D side-scrolling action RPG roguelite. Inspired by the gameplay principles
of ASTLIBRA (crunchy real-time combat, deep equipment, learn-skills-from-gear, escalating
power fantasy) — no characters, story, names, assets or content are borrowed.*

---

## 1. Design overview

**Premise.** Beneath the lamplit mining town of **Lamplight** lies the **Cinderdeep**, an
abyss where fallen stars cooled into "cinders" that warp everything around them. You are a
**Wick** — a lantern-bearing delver who descends on expeditions, fights the warped things
below, and hauls back cinders that permanently strengthen your lantern (the **Starboard**).

**Promise.** Enter weak. Fight, loot, learn skills from your gear, chain relic synergies and
leave each expedition as an overwhelming force — and even when you die, bring something home.

**Pillars (priority order)**
1. *Combat feel* — snappy inputs, readable commitment, crunchy hit stop, per-weapon rhythm.
2. *Equipment depth* — every drop has a moveset, a passive to learn, affixes, upgrade paths.
3. *Power curve* — run levels + relics + forge upgrades multiply; rare drops spike power.
4. *Replayability* — branching depths, risk/reward choices, permanent unlocks change runs.

**Assumptions (documented instead of asked)**
- Platform: desktop browser (also packageable as a static site). Keyboard + gamepad.
- Single playable character; weapon class defines the "combat style".
- All art is procedural pixel art rendered at 480×270 and upscaled; all audio is synthesized
  at runtime with WebAudio. No external assets → zero licensing risk, tiny download.
- Vertical slice target: 3 depths, 3 bosses, 5 weapon classes, ~6 enemy archetypes.

## 2. Engine & stack recommendation

| Option | Verdict |
|---|---|
| Godot 4 | Excellent 2D, but cannot be built/verified in this headless CI-style environment. |
| Unity | Heavy, licensing churn, not verifiable here. |
| Phaser 3 | Good, but its physics/time abstractions fight a custom hit-stop + fixed-step design. |
| **TypeScript + Canvas 2D + Vite (custom engine)** | **Chosen.** Full control of time-step, hit stop, input buffering; deterministic sim runs headless in Node for automated playtests; instant startup; trivially deployable. |

Stack: TypeScript 5 (strict), Vite 5 (dev server/bundler), Vitest (unit tests), tsx
(headless playtest simulator), Playwright (browser smoke test + screenshots).

## 3. Technical architecture

```
src/
  core/      loop (fixed 60 Hz + render interpolation), time (hit stop / time scale),
             input (keyboard+gamepad, remap, buffer), rng (seeded), audio (synth), save
  data/      weapons+movesets, enemies, bosses, items, affixes, relics, spells,
             starboard (permanent board), rooms (handcrafted templates)  ← data-driven
  sim/       World (DOM-free!): physics, player state machine, enemy AI, boss AI,
             projectiles, hit detection, damage calc, status, proc/effects engine
  meta/      profile (permanent), run state (temporary), stats aggregation, loot,
             mastery, forge/crafting, expedition map generation, persistence rules
  render/    renderer (camera, layers), rigs (procedural pixel characters), particles,
             fx consumer (turns sim events into sound/shake/particles/numbers)
  ui/        HUD, menu widgets, screens (inventory, starboard, forge, shop, codex,
             settings/remap, map, summary, debug tuning panel)
  scenes/    Title, Hub, Expedition(room), Map, Summary, Arena (combat test)
```

Key rules:
- **The simulation never touches the DOM.** It emits `SimEvent`s (hit, sound, particle,
  shake, number…) that the presentation layer consumes. The same `World` runs in the
  headless playtest simulator.
- Player is *not* monolithic: `PlayerController` (state machine) delegates to
  `MoveSet` (weapon data), `CombatSystem` (hitboxes/damage), `ProcEngine` (item effects),
  `StatBlock` (aggregated stats).
- Content is data: movesets are frame-data tables, enemies are archetype + stat blocks,
  items are bases + affix pools + passives, relics are proc/stat definitions.
- Damage, status, loot, generation and progression are **pure deterministic functions**
  of (inputs, seeded RNG) → unit-testable.

## 4. Core combat loop

```
 read input → buffer (8 ticks) → state machine decides (cancel windows) →
 attack frames: startup → active (swept hitbox) → recovery
   on contact → damage calc → status buildup → procs → hit stop + reaction + fx
   enemy: hitstun / launch / stagger (poise) → juggle decay
 defense: dodge (i-frames) · guard (chip) · parry (8-tick window → stagger + riposte crit)
 resources: Aether (MP) gained from hits/parries → Weapon Arts & Spells
```

Each weapon class = unique moveset: **Fang** (fast twin-blade, 4-hit chains, short stop),
**Maul** (charge, hyper-armor, launch, long stop), **Glaive** (reach, sweeps, plunge),
**Lumen Rod** (melee+bolts, casting cadence, MP economy), **Pendulum** (counter-stance
weapon: absorb and retaliate).

## 5. Progression systems diagram

```
            ┌──────────── Expedition (temporary) ─────────────┐
 kills ───► │ Run XP → Run Level (stats)                      │
 rooms ───► │ Relics (procs/stats) · Blessings/Curses · Gilt   │──► death/extract
            │ Loot (unbanked) · Forge upgrades in-run          │      │
            └───────────────────────┬─────────────────────────┘      │
                 hits w/ equipment  │                               ▼
            ┌───────────────────────▼──────┐   ┌──────────── Permanent ───────────┐
            │ Equipment Mastery (per base) │──►│ Learned passives (slot into kit)│
            │  Lv1 dmg · Lv3 learn passive │   │ Recipes · Evolutions             │
            │  Lv5 evolve                  │   │ Stash (banked gear) · Materials  │
            └──────────────────────────────┘   │ Cinders → Starboard nodes:       │
                                               │  stats · double jump · air dash  │
                                               │  spells · weapon classes · slots │
                                               └──────────────┬───────────────────┘
                                                              ▼  next expedition
```

## 6. Equipment & item data model

```ts
ItemBase  { id, name, slot: weapon|shield|armor|charm, class?, tier, baseStats,
            moveset?(weapon), guard?(shield), passive: PassiveDef, evolvesTo?, flavor }
ItemInst  { uid, baseId, rarity, plus(0..10), affixes: AffixRoll[], unique?: UniqueId }
AffixDef  { id, stat|proc, tiers:[min,max][], slots, weight, text }
PassiveDef{ id, name, stats?: StatMods, procs?: ProcDef[], text }
ProcDef   { trigger: hit|crit|kill|dodge|parry|block|heavy|air|combo|cast|status|hurt,
            chance, icd, action: explode|bolt|status|heal|mp|buff|cdr|chain|spread|blade }
Mastery   { [baseId]: xp }   → level from thresholds
```
Rarity: Common · Uncommon(1 affix) · Rare(2) · Epic(3 + unique chance) · Legendary
(unique, build-defining effect). Stats aggregate: base + plus scaling + affixes + passives
(equipped/learned) + relics + run level + Starboard.

## 7. Procedural generation approach

Hybrid: **handcrafted room templates** (tile grids with spawn markers, platform layouts,
hazards) are assembled into a **layered branching map** per depth (≈7 layers, 2–3 nodes
per layer, typed nodes: combat/elite/treasure/shop/forge/shrine/challenge/rest/lore/secret/
boss). Rules enforce pacing (no shop in layer 1, guaranteed rest before boss, ≤2 elites
per path…). A validator proves every node is reachable from start and reaches the boss;
the generator retries with a new sub-seed until valid (property-tested in Vitest).
Encounters = template × depth budget × elite modifiers.

## 8. Hit stop & responsiveness implementation

- Fixed 60 Hz simulation, decoupled from rendering (interpolated), so feel does not
  depend on refresh rate. Rendering, UI, audio and camera shake keep running in real time.
- `TimeController.requestHitStop(kind, intensity)` — kinds `light/heavy/crit/parry/
  guardBreak/finisher/kill`, each a tunable ms value. While active, **gameplay ticks are
  skipped** (players, enemies, projectiles, cooldowns, DoTs, buffs, combat timers all
  pause — one consistent rule), but impact particles/screen shake/flash continue.
- Same-tick requests merge with `max`, not sum. During an active stop, new requests extend
  only to `max(remaining, new)`; a rolling budget clamps chained stops (≤ 160 ms per 300 ms)
  and multi-target hits consolidate to a single stop scaled by `1 + 0.15·(n-1)` (capped).
- Victims shake in place during the stop (render-only offset — no physics change).
- Input buffer stores presses with a sim-tick age that does **not** advance during hit
  stop, so a press during a freeze fires on the first valid tick afterwards, exactly once.
- Attacks use swept hitboxes (union of previous and current active frame), per-instance
  hit registries with re-hit intervals, and knockback resolved through tile collision.
- All values live in a runtime-tunable `Tuning` object editable in the Training Grounds
  debug panel (F1) and persisted to localStorage — no rebuild required.

## 9. Prioritized implementation plan

1. Core: loop, time, input, renderer, physics, player movement, one weapon, one enemy,
   hit stop + feedback, combat arena + debug panel. **(Phase 1 — prove feel)**
2. 5 weapon movesets, aerials, launch/juggle, guard/parry/dodge, enemy archetypes, boss.
3. Stats, items, affixes, rarity, mastery + learned passives, relics, procs, forge.
4. Hub, expedition map generation, room assembly, loot, death/extract persistence,
   summary, save/load.
5. Content: more items/relics/enemies/bosses, Starboard tree, balance via simulator.
6. Polish: audio, accessibility (shake/flash/effects sliders), remapping, perf.

## 10. First playable milestone

Training Grounds arena where the player can walk, jump, dodge, combo with the Fang, hit a
dummy and a Gloomling with hit stop, reactions, knockback, numbers, sound and shake, with
a live tuning panel — *and it must feel good before anything else is built.*

## Risks & design conflicts (identified early)

| Risk | Mitigation |
|---|---|
| Hit stop + many hits = sluggishness | merge/budget rules, kind-based durations, tuning panel |
| Proc chains → infinite loops | proc depth limit (2), per-tick proc budget, ICDs |
| Power fantasy vs boss challenge | bosses have stagger thresholds & phase gates rather than pure HP; poise-based not damage-based interrupts |
| Procedural art readability | strong silhouettes, team colors, telegraph flashes, effect-intensity setting |
| Death feeling wasteful | Cinders + mastery always kept; equipped gear never lost; one salvaged item |
| Save corruption | checksummed primary + rotating backup, schema version migration |
| Browser audio autoplay | audio context unlocked on first input |
