# Cinderdeep — Expeditions of the Last Lantern

A 2D side-scrolling action RPG roguelite inspired by the *gameplay principles* of ASTLIBRA (crunchy real-time combat, deep equipment, learning skills from gear, an escalating power fantasy). The world, story, characters, enemies, items, names, art and audio are all original. Art is procedural pixel art (outlined, shaded sprites; per-depth tilesets with ambient occlusion and baked light sources; parallax layers, light shafts, dynamic lantern lighting, colour grading). Audio is synthesized at runtime. The only bundled assets are two OFL-licensed fonts (Cinzel and Source Sans 3, via Fontsource), so the game works offline.

Design document, engine choice, architecture, hit-stop design, generation approach and plan: **[docs/DESIGN.md](docs/DESIGN.md)**.

## Run it

Requires Node 18+ (developed on Node 22).

```bash
npm install
npm run dev        # http://localhost:5173 — play in the browser
npm run build      # typecheck + production build into dist/ (static, host anywhere)
npm run preview    # serve the production build
```

| Command | What it does |
|---|---|
| `npm test` | Vitest: damage/hit stop/loot/forge/save/progression rules, map generation (600 maps validated), room reachability for every template, all weapon movesets, every guardian fought to the end |
| `npm run sim -- --runs 4` | Headless playtest simulator: time-to-kill matrix (5 weapons × 8 enemies) and full bot-played expeditions with power-curve, upgrade timing, deaths and guardian kills |
| `npm run build && npm run smoke` | Launches the built game in headless Chromium, plays title → hub → training grounds → combos → menus, fails on console errors, saves screenshots to `tools/out/` |

## Controls

| Action | Keyboard | Gamepad |
|---|---|---|
| Move / aim | A D (W S) or arrows | Left stick / D-pad |
| Jump (hold for height; ↓+Jump drops through planks) | Space | A |
| Light attack (↑+Light = launcher) | J | X |
| Heavy attack (hold to charge; in air = plunge) | K | Y |
| Dodge (i-frames; last-moment = Perfect Dodge) | L / Left Shift | B |
| Guard (tap just before a hit = Parry → Riposte) | U | LB |
| Weapon Art / Spell I / Spell II | I / O / P | RB / LT / RT |
| Lamp Oil (heal) | Q | R3 |
| Interact | W / E | Up |
| Character · Map · Pause | Tab · M · Esc | Back · Back · Start |
| Combat tuning panel (Training Grounds) | F1 | — |

Keyboard bindings can be changed in Settings → Controls.

## What's in the game

- **Combat:** fixed 60 Hz simulation with render interpolation; data-driven frame data (startup/active/recovery, cancel windows, hit-confirm cancels, input buffering, coyote time); swept hitboxes with per-target re-hit rules; configurable **hit stop** (per hit type, same-tick merging, multi-target scaling, rolling budget) that freezes only gameplay, not rendering/UI/audio; victim shake, knockback, launch/juggle with decay, poise/stagger, hyper-armor, dodge i-frames, perfect dodge slow-mo, parry → riposte, guard chip damage, unblockable (red) telegraphs, projectile reflection.
- **5 weapon classes with distinct movesets and rhythm:** Fang (fast twin blades), Maul (charge, hyper-armor, shockwaves), Glaive (reach, pogo plunge, thrown charge), Lumen Rod (melee taps that fuel bolts and chargeable orbs), Pendulum (counter-stance weapon). Each has a launcher, aerial chain, plunge, dash attack, riposte and Weapon Art.
- **Enemies:** 8 archetypes (fast melee, shielded heavy, artillery, flying diver, suicide bomber, summoner/support, anti-spam duelist, juggernaut), 5 elite modifiers, and 3 multi-phase **guardians** (Rootmaw Warden, Cinder Matriarch, The Pale Vessel) with telegraphs, phase gates and punish windows.
- **Equipment:** 51 bases (weapons, shields, armor, charms) incl. 7 legendaries, 5 rarities, 39 affixes (incl. proc affixes that add mechanics), forge upgrades +10, refine, reroll, salvage, sacrifice, evolution, crafting recipes.
- **Mastery:** every item levels as you use it; Lv3 permanently teaches its passive (slot it with any gear), Lv5 unlocks evolution and a recipe.
- **Build synergies:** proc engine (on hit/crit/kill/dodge/perfect dodge/parry/block/heavy/aerial/combo/cast/status/finisher/art) with depth limits and a per-tick budget so chains can't loop forever; 4 status effects (burn, shock, frost/freeze, bleed/hemorrhage); 36 relics with archetype tags that bias later offers toward your build; 6 spells.
- **Expeditions:** 3 depths with themes, layered branching maps (combat, elite, treasure, merchant, forge, shrine, gauntlet, campfire, echo/lore, hidden vault, shortcuts, guardian), validated for completability; rooms are handcrafted templates with randomized encounters.
- **Persistence:** run levels and relics reset; Cinders, mastery, learned passives, recipes, codex and the gear you brought are permanent. Guardians are checkpoints that bank everything (extract or descend). On death you keep the single best unbanked find plus half of unbanked Gilt/materials. 5 difficulty tiers (Ember I–V).
- **Hub (Lamplight):** expedition gate, armory, forge, Starboard (43-node permanent board with free respec), merchant, archive (bestiary/equipment/relics/lore/records), Training Grounds, notice board.
- **UI & accessibility:** HUD (HP/barrier/Aether/oil/XP, skill cooldowns, buffs, combo meter, boss bar with phase marks and poise), equipment comparison with stat deltas, tooltips for every mechanic, run summary; screen shake, flash, particle, darkness, damage-number and vibration settings; key remapping; gamepad support.
- **Saving:** checksummed save with a rotating backup and automatic recovery; in-progress expeditions resume at the current room.

## Project status

**Working and tested:** everything in the list above is implemented and runs. The automated checks pass: unit tests, headless browser smoke test, bot-played expeditions (bots reach all three guardians and clear full expeditions, with no softlocks).

**Known limitations / placeholders**
- Characters are procedurally drawn and animated, not hand-drawn frame-by-frame sprite sheets.
- Music is a minimal generative drone/arpeggio per area. Sound effects are synthesized.
- Balance comes from the simulator bot plus spot checks; it has not had wide human playtesting. The Cinder Matriarch is the main difficulty spike for melee bots.
- The bot can't pathfind every platform layout. The simulator teleports it when it makes no progress for 20 s and reports these as "assists". The room reachability test separately proves every room is completable without double jump.
- Mouse input is not supported (keyboard and gamepad only).
- One save profile.

## Code map

```
src/core     loop/time (hit stop), input (+buffer/remap), rng, audio synth, tuning, settings
src/data     movesets (frame data), enemies & guardians, items/affixes, relics, spells, starboard, rooms, lore
src/sim      DOM-free simulation: world, player state machine, enemy AI, bosses, physics, damage, procs
src/meta     profile, run state & death/banking rules, loot, build aggregation, mastery, forge, maps, saves, reachability
src/render   world renderer, procedural rigs, tiles/themes, particles/camera
src/ui       widgets, HUD, panels (character, starboard, forge, shop, map, codex, settings, debug)
src/scenes   title, hub, expedition, training arena, summary
tools        playtest simulator + bot, browser smoke test
tests        vitest suites
```
