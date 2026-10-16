import type { StatMods } from '../sim/stats';
import type { PassiveDef, ProcDef } from '../sim/types';
import type { WeaponClass } from './movesets';

export type Slot = 'weapon' | 'shield' | 'armor' | 'charm';
export type Rarity = 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary';
export const RARITIES: Rarity[] = ['common', 'uncommon', 'rare', 'epic', 'legendary'];
export const RARITY_COLOR: Record<Rarity, string> = {
  common: '#c8c8c8', uncommon: '#6fdc6f', rare: '#5fa8ff', epic: '#c77dff', legendary: '#ffb03a',
};
export const RARITY_AFFIXES: Record<Rarity, number> = { common: 0, uncommon: 1, rare: 2, epic: 3, legendary: 3 };

export interface ShieldProps {
  guardPct: number;
  parryBonus: number; // extra parry frames
  guardMove: number; // move speed multiplier while guarding
}

export interface ItemBase {
  id: string;
  name: string;
  slot: Slot;
  cls?: WeaponClass;
  tier: 1 | 2 | 3;
  stats: StatMods;
  shield?: ShieldProps;
  passive: PassiveDef;
  flavor: string;
  legendary?: boolean;
  evolvesTo?: string;
  evolvedFrom?: string;
  /** not in random drop pools (boss/recipe/evolution only) */
  special?: boolean;
  /** Starboard node required for this base to appear in loot */
  unlock?: string;
}

const P = (id: string, name: string, text: string, stats?: StatMods, procs?: ProcDef[]): PassiveDef => ({ id, name, text, stats, procs });

const list: ItemBase[] = [
  // ── Fang ──
  { id: 'twin_fangs', name: 'Twin Fangs', slot: 'weapon', cls: 'fang', tier: 1, stats: { atk: 6 }, passive: P('quick_hands', 'Quick Hands', '+8% Attack Speed.', { atkSpeed: 0.08 }), flavor: 'Two short blades, notched from a hundred delves.', evolvesTo: 'starling_pair' },
  { id: 'gloomcutters', name: 'Gloomcutters', slot: 'weapon', cls: 'fang', tier: 1, stats: { atk: 5, critChance: 0.05 }, passive: P('opportunist', 'Opportunist', '+6% Crit Chance. +12% damage to afflicted foes.', { critChance: 0.06, dmgVsAfflicted: 0.12 }), flavor: 'Blackened so they never catch the light.' },
  { id: 'emberfang', name: 'Emberfang', slot: 'weapon', cls: 'fang', tier: 2, stats: { atk: 10, fireConv: 0.1 }, passive: P('kindling', 'Kindling', 'Hits add 10% fire. 20% chance on hit to build Burn.', { fireConv: 0.1 }, [{ trigger: 'hit', chance: 0.2, action: { type: 'status', status: 'burn', amount: 25 } }]), flavor: 'Quenched in cinder-oil; it never quite cools.' },
  { id: 'whisperfang', name: 'Whisperfang', slot: 'weapon', cls: 'fang', tier: 2, stats: { atk: 9, bleedPower: 0.3 }, passive: P('hemorrhage', 'Hemorrhage', 'Critical hits inflict heavy Bleed buildup.', { bleedPower: 0.2 }, [{ trigger: 'crit', action: { type: 'status', status: 'bleed', amount: 45 } }]), flavor: 'Serrated on the inner edge. Cruel, and proud of it.' },
  { id: 'starling_pair', name: 'Starling Pair', slot: 'weapon', cls: 'fang', tier: 3, stats: { atk: 15, atkSpeed: 0.08 }, passive: P('starling_flurry', 'Starling Flurry', 'Every 20 combo hits release 4 homing star-bolts.', {}, [{ trigger: 'combo', every: 20, action: { type: 'bolt', element: 'phys', motion: 0.6, count: 4, homing: true } }]), flavor: 'They sing as they cut — a sound like birds at dawn.', evolvedFrom: 'twin_fangs' },
  // ── Maul ──
  { id: 'mining_maul', name: 'Mining Maul', slot: 'weapon', cls: 'maul', tier: 1, stats: { atk: 12 }, passive: P('heft', 'Heft', '+25% Stagger Power.', { poiseDmg: 0.25 }), flavor: 'Built to break rock. Works on everything else too.', evolvesTo: 'sunder' },
  { id: 'slagbreaker', name: 'Slagbreaker', slot: 'weapon', cls: 'maul', tier: 2, stats: { atk: 18, heavyPct: 0.1 }, passive: P('aftershock', 'Aftershock', 'Heavy hits trigger a shockwave burst.', {}, [{ trigger: 'heavyHit', icd: 10, action: { type: 'explode', element: 'phys', motion: 0.6, radius: 32 } }]), flavor: 'Its head is a lump of foundry slag that refused to melt.' },
  { id: 'bell_of_ruin', name: 'Bell of Ruin', slot: 'weapon', cls: 'maul', tier: 3, stats: { atk: 24, shockConv: 0.1 }, passive: P('thunderclap', 'Thunderclap', 'Kills discharge a shock nova.', {}, [{ trigger: 'kill', action: { type: 'nova', element: 'shock', motion: 1.0, radius: 52 } }]), flavor: 'Rung once at the Foundry\'s fall. The echo never stopped.' },
  { id: 'rootcrusher', name: 'Rootcrusher', slot: 'weapon', cls: 'maul', tier: 2, stats: { atk: 17, frostConv: 0.1 }, passive: P('permafrost', 'Permafrost', 'Heavy hits build Frost. +30% damage to frozen foes (via afflicted).', { dmgVsAfflicted: 0.15 }, [{ trigger: 'heavyHit', action: { type: 'status', status: 'frost', amount: 30 } }]), flavor: 'Rime clings to it even in the forge.' },
  // ── Glaive ──
  { id: 'wick_glaive', name: 'Wick Glaive', slot: 'weapon', cls: 'glaive', tier: 1, stats: { atk: 8 }, passive: P('reach_mastery', 'Reach Mastery', '+12% Light Attack damage.', { lightPct: 0.12 }), flavor: 'A lamp-pole with a blade on the end. Delvers improvise.', evolvesTo: 'starpike' },
  { id: 'lantern_halberd', name: 'Lantern Halberd', slot: 'weapon', cls: 'glaive', tier: 2, stats: { atk: 13, fireConv: 0.15 }, passive: P('lanternlight', 'Lanternlight', 'Hits add 15% fire. +15% Fire damage.', { fireConv: 0.15, firePct: 0.15 }), flavor: 'A caged flame swings from the haft.' },
  { id: 'starpike', name: 'Starpike', slot: 'weapon', cls: 'glaive', tier: 3, stats: { atk: 19, airPct: 0.15 }, passive: P('skypiercer', 'Skypiercer', '+25% Aerial damage; aerial hits restore 1 Aether.', { airPct: 0.25 }, [{ trigger: 'airHit', action: { type: 'mp', amount: 1 } }]), flavor: 'Tipped with a sliver of the fallen star.', evolvedFrom: 'wick_glaive' },
  { id: 'chorus_spear', name: 'Chorus Spear', slot: 'weapon', cls: 'glaive', tier: 2, stats: { atk: 12, shockConv: 0.1 }, passive: P('chorus', 'Chorus', 'Hitting a Shocked foe arcs lightning to 3 others.', {}, [{ trigger: 'hit', cond: 'targetShocked', icd: 12, action: { type: 'chain', element: 'shock', motion: 0.45, jumps: 3, range: 90 } }]), flavor: 'Hums a different note for each foe it touches.' },
  // ── Rod ──
  { id: 'ashwood_rod', name: 'Ashwood Rod', slot: 'weapon', cls: 'rod', tier: 1, stats: { atk: 3, magic: 9 }, passive: P('attunement', 'Attunement', '+1 Aether on hit, +10% Magic.', { mpOnHit: 1, magicPct: 0.1 }), flavor: 'Cut from a tree that grew around a cinder.', evolvesTo: 'comet_focus' },
  { id: 'frostlight_rod', name: 'Frostlight Rod', slot: 'weapon', cls: 'rod', tier: 2, stats: { atk: 4, magic: 14, frostConv: 0.1 }, passive: P('rime', 'Rime', '+30% Status Buildup; hits add 10% frost.', { statusPower: 0.3, frostConv: 0.1 }), flavor: 'Its light is cold enough to burn.' },
  { id: 'comet_focus', name: 'Comet Focus', slot: 'weapon', cls: 'rod', tier: 3, stats: { atk: 6, magic: 22 }, passive: P('overflow', 'Overflow', 'Casting a Spell or Art grants +30% damage for 4s.', {}, [{ trigger: 'cast', action: { type: 'buff', id: 'overflow', name: 'Overflow', stats: { dmgPct: 0.3 }, dur: 240 } }]), flavor: 'A star-shard caged in silver filigree.', evolvedFrom: 'ashwood_rod' },
  { id: 'emberwand', name: 'Emberwand', slot: 'weapon', cls: 'rod', tier: 2, stats: { atk: 4, magic: 13, firePct: 0.15 }, passive: P('pyre', 'Pyre', 'Burning foes explode when killed.', {}, [{ trigger: 'kill', cond: 'targetBurning', action: { type: 'explode', element: 'fire', motion: 1.2, radius: 40, status: { type: 'burn', amount: 40 } } }]), flavor: 'Smells of incense and singed hair.' },
  // ── Pendulum ──
  { id: 'bellblade', name: 'Bellblade', slot: 'weapon', cls: 'pendulum', tier: 1, stats: { atk: 9 }, passive: P('resonance', 'Resonance', '+40% Riposte damage, +2 parry frames.', { riposteDmg: 0.4, parryWindow: 2 }), flavor: 'A blade cast from a cracked chapel bell.', unlock: 'unlock_pendulum', evolvesTo: 'midnight_chime' },
  { id: 'tolling_edge', name: 'Tolling Edge', slot: 'weapon', cls: 'pendulum', tier: 2, stats: { atk: 14 }, passive: P('echo_toll', 'Echo Toll', 'Parries and counters release a shockwave.', {}, [{ trigger: 'parry', action: { type: 'explode', element: 'phys', motion: 1.5, radius: 44 } }, { trigger: 'riposte', action: { type: 'explode', element: 'phys', motion: 1.0, radius: 44 } }]), flavor: 'Every strike rings. Every ring returns.', unlock: 'unlock_pendulum' },
  { id: 'midnight_chime', name: 'Midnight Chime', slot: 'weapon', cls: 'pendulum', tier: 3, stats: { atk: 20, critDmg: 0.2 }, passive: P('death_knell', 'Death Knell', '+40% dmg vs staggered; kills refresh 1s of cooldowns.', { dmgVsStaggered: 0.4 }, [{ trigger: 'kill', action: { type: 'cdr', ticks: 60 } }]), flavor: 'It tolls twelve times. Nobody hears the thirteenth.', unlock: 'unlock_pendulum', evolvedFrom: 'bellblade' },
  // ── Shields ──
  { id: 'tin_buckler', name: 'Tin Buckler', slot: 'shield', tier: 1, stats: { def: 2 }, shield: { guardPct: 0.5, parryBonus: 4, guardMove: 0.6 }, passive: P('deft_parry', 'Deft Parry', '+3 parry frames.', { parryWindow: 3 }), flavor: 'Small, light, and loud when struck.' },
  { id: 'wardplate', name: 'Wardplate', slot: 'shield', tier: 1, stats: { def: 6 }, shield: { guardPct: 0.85, parryBonus: -2, guardMove: 0.3 }, passive: P('bulwark', 'Bulwark', '+6 Defense, +10% Guard reduction.', { def: 6, guardPct: 0.1 }), flavor: 'A cart-door with handles. It works.' },
  { id: 'thornshield', name: 'Thornshield', slot: 'shield', tier: 2, stats: { def: 5, thorns: 0.3 }, shield: { guardPct: 0.65, parryBonus: 1, guardMove: 0.45 }, passive: P('retaliation', 'Retaliation', 'Blocking releases a burst of thorns.', {}, [{ trigger: 'block', icd: 20, action: { type: 'explode', element: 'phys', motion: 0.9, radius: 36, status: { type: 'bleed', amount: 30 } } }]), flavor: 'Whoever made this did not like being touched.' },
  { id: 'ember_targe', name: 'Ember Targe', slot: 'shield', tier: 2, stats: { def: 4, firePct: 0.1 }, shield: { guardPct: 0.6, parryBonus: 3, guardMove: 0.5 }, passive: P('flashpoint', 'Flashpoint', 'Parries erupt in a fire nova.', {}, [{ trigger: 'parry', action: { type: 'nova', element: 'fire', motion: 1.4, radius: 60 } }]), flavor: 'Its boss is a live coal behind glass.' },
  { id: 'mirror_aegis', name: 'Mirror Aegis', slot: 'shield', tier: 3, stats: { def: 8, critChance: 0.05 }, shield: { guardPct: 0.75, parryBonus: 3, guardMove: 0.5 }, passive: P('reflection', 'Reflection', 'Parries return 5 homing star-bolts and 15 Aether.', {}, [{ trigger: 'parry', action: { type: 'bolt', element: 'phys', motion: 0.9, count: 5, homing: true } }, { trigger: 'parry', action: { type: 'mp', amount: 15 } }]), flavor: 'Polished starglass. You see your foe\'s fear in it.' },
  // ── Armor ──
  { id: 'delvers_coat', name: "Delver's Coat", slot: 'armor', tier: 1, stats: { def: 5, moveSpeed: 0.05 }, passive: P('light_step', 'Light Step', '+4 dodge invulnerability frames.', { iframes: 4 }), flavor: 'Oilcloth and patience.' },
  { id: 'miners_plate', name: "Miner's Plate", slot: 'armor', tier: 1, stats: { def: 12, maxHp: 25, moveSpeed: -0.08 }, passive: P('ironhide', 'Ironhide', 'Take 8% less damage.', { dmgTaken: -0.08 }), flavor: 'Heavy as a sin, twice as reliable.' },
  { id: 'ashweave_robe', name: 'Ashweave Robe', slot: 'armor', tier: 1, stats: { def: 3, magic: 5, maxMp: 20 }, passive: P('aether_weave', 'Aether Weave', 'Regenerate 1.5 Aether per second.', { mpRegen: 1.5 }), flavor: 'Woven from the threads of burnt-out wicks.' },
  { id: 'mothsilk_mantle', name: 'Moth-Silk Mantle', slot: 'armor', tier: 2, stats: { def: 7, atkSpeed: 0.06 }, passive: P('flutter', 'Flutter', 'Perfect dodges grant +30% Crit Chance for 3s.', {}, [{ trigger: 'perfectDodge', action: { type: 'buff', id: 'flutter', name: 'Flutter', stats: { critChance: 0.3 }, dur: 180 } }]), flavor: 'Weightless, and it shimmers when you move.' },
  { id: 'cinderforged_mail', name: 'Cinderforged Mail', slot: 'armor', tier: 2, stats: { def: 16, maxHp: 30, moveSpeed: -0.05 }, passive: P('smolder', 'Smolder', 'When hit, erupt in flame around you.', {}, [{ trigger: 'hurt', icd: 30, action: { type: 'nova', element: 'fire', motion: 1.2, radius: 50 } }]), flavor: 'Still warm from the forge. Always.' },
  { id: 'bloodbound_harness', name: 'Bloodbound Harness', slot: 'armor', tier: 2, stats: { def: 4, lowHpDmg: 0.25, lifesteal: 0.02 }, passive: P('berserker', 'Berserker', '+30% damage while below 50% HP.', { lowHpDmg: 0.3 }), flavor: 'Leather straps and old blood. Lots of old blood.' },
  { id: 'starwoven_raiment', name: 'Starwoven Raiment', slot: 'armor', tier: 3, stats: { def: 11, maxHp: 30, maxMp: 20, critDmg: 0.15 }, passive: P('starlit', 'Starlit', '+30% Crit Damage.', { critDmg: 0.3 }), flavor: 'Thread spun from a comet\'s tail.' },
  // ── Charms ──
  { id: 'lucky_coin', name: 'Lucky Coin', slot: 'charm', tier: 1, stats: { goldFind: 0.25 }, passive: P('fortune', 'Fortune', '+15% Loot Rarity.', { lootLuck: 0.15 }), flavor: 'Heads you live. Tails you also live, probably.' },
  { id: 'ember_locket', name: 'Ember Locket', slot: 'charm', tier: 1, stats: { fireConv: 0.08 }, passive: P('flashburn', 'Flashburn', 'Critical hits detonate a small fire burst.', {}, [{ trigger: 'crit', icd: 8, action: { type: 'explode', element: 'fire', motion: 0.5, radius: 28, status: { type: 'burn', amount: 20 } } }]), flavor: 'A locket with a coal where the portrait should be.' },
  { id: 'storm_bead', name: 'Storm Bead', slot: 'charm', tier: 1, stats: { shockConv: 0.08 }, passive: P('static', 'Static', 'Hits vs Shocked foes chain lightning to 2 others.', {}, [{ trigger: 'hit', cond: 'targetShocked', icd: 15, action: { type: 'chain', element: 'shock', motion: 0.4, jumps: 2, range: 80 } }]), flavor: 'It crackles when you squeeze it.' },
  { id: 'frost_tear', name: 'Frost Tear', slot: 'charm', tier: 2, stats: { frostConv: 0.1, statusPower: 0.15 }, passive: P('shatter', 'Shatter', 'Critical hits on Frozen foes shatter for big frost damage.', {}, [{ trigger: 'crit', cond: 'targetFrozen', action: { type: 'explode', element: 'frost', motion: 1.6, radius: 36 } }]), flavor: 'A frozen drop that never melts.' },
  { id: 'glass_heart', name: 'Glass Heart', slot: 'charm', tier: 2, stats: { dmgPct: 0.35, dmgTaken: 0.3 }, passive: P('shatterpoint', 'Shatterpoint', '+25% Crit Damage, but take 10% more damage.', { critDmg: 0.25, dmgTaken: 0.1 }), flavor: 'Beats faster than yours. Breaks easier, too.' },
  { id: 'combo_sigil', name: 'Rhythm Sigil', slot: 'charm', tier: 1, stats: { comboDmg: 0.04 }, passive: P('momentum', 'Momentum', 'Every 15 combo hits: +6% Attack Speed (stacks 5x, 5s).', {}, [{ trigger: 'combo', every: 15, action: { type: 'buff', id: 'momentum', name: 'Momentum', stats: { atkSpeed: 0.06 }, dur: 300, maxStacks: 5 } }]), flavor: 'A metronome that never stops ticking.' },
  { id: 'leech_tooth', name: 'Leech Tooth', slot: 'charm', tier: 1, stats: { lifesteal: 0.03 }, passive: P('feast', 'Feast', 'Kills restore 3% Max HP.', {}, [{ trigger: 'kill', action: { type: 'heal', pct: 0.03 } }]), flavor: 'Pulled from something that drank lamp-oil.' },
  { id: 'hourglass_shard', name: 'Hourglass Shard', slot: 'charm', tier: 2, stats: { cdr: 0.15 }, passive: P('borrowed_time', 'Borrowed Time', 'Arts refund 1.5s of spell cooldowns.', {}, [{ trigger: 'art', action: { type: 'cdr', ticks: 90 } }]), flavor: 'The sand inside falls upward.' },
  { id: 'patience_wick', name: 'Wick of Patience', slot: 'charm', tier: 1, stats: { parryWindow: 2, riposteDmg: 0.25 }, passive: P('calm', 'Calm', 'Parries restore 12 Aether.', {}, [{ trigger: 'parry', action: { type: 'mp', amount: 12 } }]), flavor: 'Burns slow. Burns sure.' },
  { id: 'twinflame_ring', name: 'Twinflame Ring', slot: 'charm', tier: 2, stats: { statusPower: 0.2 }, passive: P('contagion', 'Contagion', 'Killing an afflicted foe spreads its ailments nearby.', {}, [{ trigger: 'kill', cond: 'targetAfflicted', action: { type: 'spread', range: 100 } }]), flavor: 'Two flames, one band. They argue constantly.' },
  { id: 'phantom_knot', name: 'Phantom Knot', slot: 'charm', tier: 2, stats: { procPct: 0.15 }, passive: P('haunt', 'Haunt', 'Hits have 8% chance to summon a spectral blade (max 4).', {}, [{ trigger: 'hit', chance: 0.08, icd: 20, action: { type: 'blade', motion: 0.4, dur: 480, max: 4 } }]), flavor: 'A knot that ties itself.' },
  { id: 'featherfall_band', name: 'Featherfall Band', slot: 'charm', tier: 1, stats: { airPct: 0.15 }, passive: P('updraft', 'Updraft', '+1 extra mid-air jump.', { airJumps: 1 }), flavor: 'Light as a moth\'s wish.' },
  // ── Legendaries (build-defining) ──
  { id: 'sunder', name: 'Sunder, the Last Ember', slot: 'weapon', cls: 'maul', tier: 3, legendary: true, special: true, evolvedFrom: 'mining_maul', stats: { atk: 30, fireConv: 0.25, heavyPct: 0.2 }, passive: P('last_ember', 'Last Ember', 'Heavy hits ignite. Burning foes erupt when killed, igniting others.', {}, [{ trigger: 'heavyHit', action: { type: 'status', status: 'burn', amount: 80 } }, { trigger: 'kill', cond: 'targetBurning', action: { type: 'explode', element: 'fire', motion: 1.6, radius: 56, status: { type: 'burn', amount: 80 } } }]), flavor: 'The last fire of the old foundry, hammered into a weapon.' },
  { id: 'thousand_eye', name: 'Thousand-Eye Fangs', slot: 'weapon', cls: 'fang', tier: 3, legendary: true, stats: { atk: 18, critChance: 0.12, critDmg: 0.3 }, passive: P('thousand_eye', 'Thousand Eyes', 'Every crit has 25% chance to fire a homing star-bolt that can itself crit.', {}, [{ trigger: 'crit', chance: 0.25, action: { type: 'bolt', element: 'phys', motion: 0.7, count: 1, homing: true } }]), flavor: 'Each blade is etched with eyes that blink.' },
  { id: 'stormcaller', name: 'Stormcaller Pike', slot: 'weapon', cls: 'glaive', tier: 3, legendary: true, stats: { atk: 20, shockConv: 0.2, statusPower: 0.3 }, passive: P('stormcaller', 'Stormcaller', 'All hits chain lightning to 2 foes (0.3s cooldown).', {}, [{ trigger: 'hit', icd: 18, action: { type: 'chain', element: 'shock', motion: 0.5, jumps: 2, range: 100 } }]), flavor: 'Raise it and the sky answers.' },
  { id: 'unlit_crown', name: 'The Unlit Crown', slot: 'charm', tier: 3, legendary: true, stats: { critDmg: 1.0, maxHp: -20 }, passive: P('unlit', 'Unlit', '+100% Crit Damage. Crits restore 2 Aether.', {}, [{ trigger: 'crit', action: { type: 'mp', amount: 2 } }]), flavor: 'Worn by the first Wick, who walked without a lantern.' },
  { id: 'moth_veil', name: "Moth-Queen's Veil", slot: 'armor', tier: 3, legendary: true, special: true, stats: { def: 12, iframes: 4, moveSpeed: 0.1 }, passive: P('veil', 'Veil of Dust', 'Perfect dodges erupt in a fire nova and empower your next Heavy by 80%.', {}, [{ trigger: 'perfectDodge', action: { type: 'nova', element: 'fire', motion: 1.8, radius: 60 } }, { trigger: 'perfectDodge', action: { type: 'buff', id: 'veil', name: 'Veil', stats: { heavyPct: 0.8 }, dur: 240, consumeOn: 'heavy' } }]), flavor: 'Shed by the Matriarch. It remembers flight.' },
  { id: 'rootmaw_fang', name: 'Rootmaw Heartwood', slot: 'charm', tier: 2, legendary: true, special: true, stats: { maxHp: 30, poiseDmg: 0.3 }, passive: P('rootbound', 'Rootbound', 'Heavy hits erupt root-spikes ahead of you; kills heal 2%.', {}, [{ trigger: 'heavyHit', icd: 24, action: { type: 'explode', element: 'phys', motion: 1.0, radius: 44, status: { type: 'bleed', amount: 35 } } }, { trigger: 'kill', action: { type: 'heal', pct: 0.02 } }]), flavor: 'Still twitching. Still hungry.' },
  { id: 'starheart', name: 'Starheart', slot: 'charm', tier: 3, legendary: true, special: true, stats: { magic: 15, spellPct: 0.3, artPct: 0.3 }, passive: P('starheart', 'Starheart', 'Using an Art refunds 60% of its Aether and resets spell cooldowns by 3s.', {}, [{ trigger: 'art', action: { type: 'mp', amount: 22 } }, { trigger: 'art', action: { type: 'cdr', ticks: 180 } }]), flavor: 'The Vessel\'s core. It is still warm, and it is still singing.' },
];

export const ITEMS: Record<string, ItemBase> = Object.fromEntries(list.map((i) => [i.id, i]));
export const ITEM_LIST = list;

// ─────────────────────────────── Affixes ───────────────────────────────
export interface AffixDef {
  id: string;
  stat?: keyof StatMods;
  base: number; // value at tier 1, common roll 1.0
  slots: Slot[];
  weight: number;
  proc?: ProcDef;
  procText?: string;
  minRarity?: Rarity;
  intRound?: boolean;
}

const ALL: Slot[] = ['weapon', 'shield', 'armor', 'charm'];
export const AFFIXES: AffixDef[] = [
  { id: 'atk', stat: 'atk', base: 3, slots: ['weapon', 'charm'], weight: 10, intRound: true },
  { id: 'atkPct', stat: 'atkPct', base: 0.08, slots: ['weapon', 'charm'], weight: 8 },
  { id: 'magic', stat: 'magic', base: 3, slots: ['weapon', 'armor', 'charm'], weight: 6, intRound: true },
  { id: 'critChance', stat: 'critChance', base: 0.04, slots: ALL, weight: 9 },
  { id: 'critDmg', stat: 'critDmg', base: 0.15, slots: ['weapon', 'charm', 'armor'], weight: 8 },
  { id: 'atkSpeed', stat: 'atkSpeed', base: 0.05, slots: ['weapon', 'charm', 'armor'], weight: 6 },
  { id: 'maxHp', stat: 'maxHp', base: 15, slots: ['armor', 'shield', 'charm'], weight: 9, intRound: true },
  { id: 'def', stat: 'def', base: 3, slots: ['armor', 'shield'], weight: 9, intRound: true },
  { id: 'fireConv', stat: 'fireConv', base: 0.08, slots: ['weapon', 'charm'], weight: 5 },
  { id: 'shockConv', stat: 'shockConv', base: 0.08, slots: ['weapon', 'charm'], weight: 5 },
  { id: 'frostConv', stat: 'frostConv', base: 0.08, slots: ['weapon', 'charm'], weight: 5 },
  { id: 'statusPower', stat: 'statusPower', base: 0.15, slots: ALL, weight: 5 },
  { id: 'mpOnHit', stat: 'mpOnHit', base: 0.5, slots: ['weapon', 'charm'], weight: 5 },
  { id: 'lifesteal', stat: 'lifesteal', base: 0.015, slots: ['weapon', 'charm'], weight: 4 },
  { id: 'cdr', stat: 'cdr', base: 0.06, slots: ['armor', 'charm'], weight: 5 },
  { id: 'moveSpeed', stat: 'moveSpeed', base: 0.04, slots: ['armor', 'charm'], weight: 4 },
  { id: 'dmgVsAfflicted', stat: 'dmgVsAfflicted', base: 0.12, slots: ['weapon', 'charm'], weight: 5 },
  { id: 'comboDmg', stat: 'comboDmg', base: 0.02, slots: ['weapon', 'charm'], weight: 4 },
  { id: 'heavyPct', stat: 'heavyPct', base: 0.12, slots: ['weapon', 'charm'], weight: 5 },
  { id: 'lightPct', stat: 'lightPct', base: 0.1, slots: ['weapon', 'charm'], weight: 5 },
  { id: 'airPct', stat: 'airPct', base: 0.12, slots: ['weapon', 'charm', 'armor'], weight: 4 },
  { id: 'artPct', stat: 'artPct', base: 0.15, slots: ['weapon', 'charm'], weight: 4 },
  { id: 'spellPct', stat: 'spellPct', base: 0.15, slots: ['weapon', 'charm', 'armor'], weight: 4 },
  { id: 'goldFind', stat: 'goldFind', base: 0.12, slots: ['charm', 'armor'], weight: 3 },
  { id: 'lootLuck', stat: 'lootLuck', base: 0.08, slots: ['charm'], weight: 2 },
  { id: 'poiseDmg', stat: 'poiseDmg', base: 0.12, slots: ['weapon', 'charm'], weight: 4 },
  { id: 'guardPct', stat: 'guardPct', base: 0.06, slots: ['shield'], weight: 6 },
  { id: 'parryWindow', stat: 'parryWindow', base: 1.2, slots: ['shield', 'charm'], weight: 4, intRound: true },
  { id: 'thorns', stat: 'thorns', base: 0.25, slots: ['shield', 'armor'], weight: 4 },
  { id: 'lowHpDmg', stat: 'lowHpDmg', base: 0.15, slots: ['armor', 'charm'], weight: 3 },
  { id: 'dmgTaken', stat: 'dmgTaken', base: -0.04, slots: ['armor', 'shield'], weight: 5 },
  { id: 'mpRegen', stat: 'mpRegen', base: 0.5, slots: ['armor', 'charm'], weight: 4 },
  { id: 'xpGain', stat: 'xpGain', base: 0.1, slots: ['charm', 'armor'], weight: 3 },
  // Proc affixes (Epic+): add mechanics, not just numbers.
  { id: 'p_critburst', base: 1, slots: ['weapon', 'charm'], weight: 3, minRarity: 'epic', procText: 'Crits detonate a fire burst', proc: { trigger: 'crit', icd: 10, action: { type: 'explode', element: 'fire', motion: 0.45, radius: 26 } } },
  { id: 'p_killbolts', base: 1, slots: ['weapon', 'charm', 'armor'], weight: 3, minRarity: 'epic', procText: 'Kills fire 2 homing bolts', proc: { trigger: 'kill', action: { type: 'bolt', element: 'phys', motion: 0.6, count: 2, homing: true } } },
  { id: 'p_dodgeheavy', base: 1, slots: ['armor', 'charm'], weight: 3, minRarity: 'epic', procText: 'Dodging empowers next Heavy +50%', proc: { trigger: 'dodge', action: { type: 'buff', id: 'dodgeheavy', name: 'Poised', stats: { heavyPct: 0.5 }, dur: 120, consumeOn: 'heavy' } } },
  { id: 'p_airmp', base: 1, slots: ['weapon', 'armor'], weight: 3, minRarity: 'epic', procText: 'Aerial hits restore 1 Aether', proc: { trigger: 'airHit', action: { type: 'mp', amount: 1 } } },
  { id: 'p_shockchain', base: 1, slots: ['weapon', 'charm'], weight: 3, minRarity: 'epic', procText: 'Finishers arc lightning to 3 foes', proc: { trigger: 'finisher', action: { type: 'chain', element: 'shock', motion: 0.6, jumps: 3, range: 90 } } },
  { id: 'p_parryward', base: 1, slots: ['shield', 'armor'], weight: 3, minRarity: 'epic', procText: 'Parries grant a 15% HP barrier', proc: { trigger: 'parry', action: { type: 'shield', pct: 0.15, dur: 300 } } },
];
export const AFFIX_BY_ID: Record<string, AffixDef> = Object.fromEntries(AFFIXES.map((a) => [a.id, a]));

export interface AffixRoll {
  id: string;
  value: number;
}

export interface ItemInst {
  uid: string;
  baseId: string;
  rarity: Rarity;
  plus: number; // forge upgrade level
  affixes: AffixRoll[];
  ilvl: number; // depth tier it dropped at
  locked?: boolean;
  isNew?: boolean;
}

export const MAX_PLUS = 10;
