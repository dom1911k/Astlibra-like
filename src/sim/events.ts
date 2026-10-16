import type { Element, Sfx } from './types';

/** Events emitted by the DOM-free simulation, consumed by audio/render/meta layers. */
export type SimEvent =
  | { t: 'sfx'; id: Sfx | UiSfx; x?: number; vol?: number; pitch?: number }
  | { t: 'hit'; x: number; y: number; element: Element; crit: boolean; heavy: boolean; dir: number; onPlayer?: boolean; blocked?: boolean; power: number }
  | { t: 'num'; x: number; y: number; value: number; crit: boolean; element: Element; onPlayer?: boolean; heal?: boolean }
  | { t: 'text'; x: number; y: number; text: string; color: string; big?: boolean }
  | { t: 'shake'; amt: number; dur: number }
  | { t: 'flash'; color: string; dur: number; alpha?: number }
  | { t: 'burst'; x: number; y: number; kind: BurstKind; color: string; count?: number; dir?: number; r?: number }
  | { t: 'ring'; x: number; y: number; r: number; color: string; dur?: number }
  | { t: 'line'; x1: number; y1: number; x2: number; y2: number; color: string }
  | { t: 'rumble'; strong: number; weak: number; dur: number }
  | { t: 'kill'; x: number; y: number; enemyId: string; elite: boolean; boss: boolean; xp: number; gilt: number; depthTier: number }
  | { t: 'pickup'; uid: number }
  | { t: 'cleared' }
  | { t: 'exit' }
  | { t: 'playerDead' }
  | { t: 'bossPhase'; phase: number }
  | { t: 'bossDefeated'; id: string }
  | { t: 'perfectDodge' }
  | { t: 'parry' }
  | { t: 'mastery'; kind: 'hit' | 'kill' | 'guard' | 'dodge'; amount: number };

export type UiSfx = 'parry' | 'block' | 'dodge' | 'jump' | 'land' | 'swing' | 'swingHeavy' | 'charge' | 'chargeFull' | 'hurt' | 'kill' | 'potion' | 'pickup' | 'levelup' | 'menu' | 'confirm' | 'cancel' | 'door' | 'stagger' | 'telegraph' | 'boss' | 'explode' | 'cast' | 'coin' | 'rare' | 'legendary' | 'clank' | 'death';
export type BurstKind = 'spark' | 'dust' | 'blood' | 'ember' | 'shard' | 'smoke' | 'star' | 'coin';
