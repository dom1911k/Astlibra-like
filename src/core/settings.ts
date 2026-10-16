import type { KeyBindings } from './input';

export interface Settings {
  master: number;
  sfx: number;
  music: number;
  screenShake: number; // 0..1
  flashes: boolean;
  effects: number; // particle intensity 0.25..1
  damageNumbers: boolean;
  darkness: number; // lantern darkness overlay 0..1
  rumble: boolean;
  bindings: KeyBindings | null;
  showFps: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  master: 0.8, sfx: 0.9, music: 0.5, screenShake: 1, flashes: true, effects: 1, damageNumbers: true, darkness: 0.7, rumble: true, bindings: null, showFps: false,
};
