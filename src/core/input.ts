export type Action =
  | 'left' | 'right' | 'up' | 'down'
  | 'jump' | 'light' | 'heavy' | 'dodge' | 'guard'
  | 'art' | 'spell1' | 'spell2' | 'potion' | 'interact'
  | 'pause' | 'inventory' | 'map'
  | 'confirm' | 'back' | 'tabL' | 'tabR' | 'debug' | 'playtest' | 'note';

export const GAMEPLAY_ACTIONS: Action[] = [
  'left', 'right', 'up', 'down', 'jump', 'light', 'heavy', 'dodge', 'guard', 'art', 'spell1', 'spell2', 'potion', 'interact', 'map', 'inventory',
];

export const ACTION_LABEL: Record<Action, string> = {
  left: 'Move Left', right: 'Move Right', up: 'Up / Interact', down: 'Down / Drop',
  jump: 'Jump', light: 'Light Attack', heavy: 'Heavy Attack (hold: charge)', dodge: 'Dodge',
  guard: 'Guard / Parry', art: 'Weapon Art', spell1: 'Spell I', spell2: 'Spell II', potion: 'Lamp Oil (heal)',
  interact: 'Interact', pause: 'Pause', inventory: 'Character', map: 'Map', confirm: 'Confirm', back: 'Back',
  tabL: 'Prev Tab', tabR: 'Next Tab', debug: 'Debug Panel', playtest: 'Playtest Menu', note: 'Feedback Note',
};

export type KeyBindings = Record<Action, string[]>;

export const DEFAULT_KEYS: KeyBindings = {
  left: ['KeyA', 'ArrowLeft'],
  right: ['KeyD', 'ArrowRight'],
  up: ['KeyW', 'ArrowUp'],
  down: ['KeyS', 'ArrowDown'],
  jump: ['Space'],
  light: ['KeyJ'],
  heavy: ['KeyK'],
  dodge: ['KeyL', 'ShiftLeft'],
  guard: ['KeyU'],
  art: ['KeyI'],
  spell1: ['KeyO'],
  spell2: ['KeyP'],
  potion: ['KeyQ'],
  interact: ['KeyE'],
  pause: ['Escape'],
  inventory: ['Tab'],
  map: ['KeyM'],
  confirm: ['Enter', 'Space', 'KeyJ'],
  back: ['Escape', 'Backspace', 'KeyK'],
  tabL: ['KeyQ', 'PageUp'],
  tabR: ['KeyE', 'PageDown'],
  debug: ['F1'],
  playtest: ['F2'],
  note: ['F9'],
};

/** Standard-mapping gamepad buttons. */
const PAD: Partial<Record<Action, number[]>> = {
  jump: [0], light: [2], heavy: [3], dodge: [1], guard: [4], art: [5], spell1: [6], spell2: [7],
  potion: [11], map: [8], pause: [9], inventory: [8],
  up: [12], down: [13], left: [14], right: [15],
  confirm: [0], back: [1], tabL: [4], tabR: [5],
};

/** Source of gameplay input for the simulation (keyboard/pad or scripted bot). */
export interface InputSource {
  held(a: Action): boolean;
  /** presses since last drain (gameplay context) */
  drainPresses(): Action[];
}

export class ScriptedInput implements InputSource {
  heldSet = new Set<Action>();
  queue: Action[] = [];
  held(a: Action) {
    return this.heldSet.has(a);
  }
  press(a: Action) {
    this.queue.push(a);
  }
  drainPresses() {
    const q = this.queue;
    this.queue = [];
    return q;
  }
}

/** Browser keyboard + gamepad input. */
export class Input implements InputSource {
  bindings: KeyBindings = JSON.parse(JSON.stringify(DEFAULT_KEYS));
  private keys = new Set<string>();
  private simQueue: Action[] = [];
  private uiPressed = new Set<Action>();
  private padPrev: boolean[] = [];
  private padAxisPrev = { x: 0, y: 0 };
  private padHeld = new Set<Action>();
  lastDevice: 'keyboard' | 'gamepad' = 'keyboard';
  /** when set, the next key press is captured for remapping */
  captureNext: ((code: string) => void) | null = null;
  /** when set, every key press is routed here as text input (feedback notes) */
  textCapture: ((key: string) => void) | null = null;
  anyPressedThisFrame = false;
  onFirstInput: (() => void) | null = null;

  attach(target: Window): void {
    target.addEventListener('keydown', (e) => {
      if (e.code === 'Tab' || e.code === 'Space' || e.code.startsWith('Arrow') || e.code === 'F1' || e.code === 'F2' || e.code === 'F9') e.preventDefault();
      this.firstInput();
      this.lastDevice = 'keyboard';
      if (this.textCapture) {
        e.preventDefault();
        this.textCapture(e.key);
        return;
      }
      if (this.captureNext) {
        const cb = this.captureNext;
        this.captureNext = null;
        cb(e.code);
        return;
      }
      if (e.repeat) return;
      this.keys.add(e.code);
      for (const a of this.actionsForKey(e.code)) this.pressed(a);
    });
    target.addEventListener('keyup', (e) => this.keys.delete(e.code));
    target.addEventListener('blur', () => this.keys.clear());
    target.addEventListener('pointerdown', () => this.firstInput());
  }
  private firstInput() {
    if (this.onFirstInput) {
      const f = this.onFirstInput;
      this.onFirstInput = null;
      f();
    }
  }
  private actionsForKey(code: string): Action[] {
    const out: Action[] = [];
    for (const a in this.bindings) if (this.bindings[a as Action].includes(code)) out.push(a as Action);
    return out;
  }
  private pressed(a: Action) {
    this.simQueue.push(a);
    this.uiPressed.add(a);
    this.anyPressedThisFrame = true;
    if (this.simQueue.length > 64) this.simQueue.splice(0, this.simQueue.length - 64);
  }
  /** Poll gamepads; call once per rendered frame. */
  poll(): void {
    const pads = typeof navigator !== 'undefined' && navigator.getGamepads ? navigator.getGamepads() : [];
    const pad = Array.from(pads).find((p) => p && p.connected);
    this.padHeld.clear();
    if (!pad) return;
    const now: boolean[] = pad.buttons.map((b) => b.pressed || b.value > 0.5);
    for (const a in PAD) {
      for (const idx of PAD[a as Action]!) {
        if (now[idx]) this.padHeld.add(a as Action);
        if (now[idx] && !this.padPrev[idx]) {
          this.lastDevice = 'gamepad';
          this.firstInput();
          this.pressed(a as Action);
        }
      }
    }
    const ax = pad.axes[0] ?? 0;
    const ay = pad.axes[1] ?? 0;
    const T = 0.45;
    if (ax < -T) this.padHeld.add('left');
    if (ax > T) this.padHeld.add('right');
    if (ay < -T) this.padHeld.add('up');
    if (ay > T) this.padHeld.add('down');
    if (ax < -T && this.padAxisPrev.x >= -T) this.pressed('left');
    if (ax > T && this.padAxisPrev.x <= T) this.pressed('right');
    if (ay < -T && this.padAxisPrev.y >= -T) this.pressed('up');
    if (ay > T && this.padAxisPrev.y <= T) this.pressed('down');
    if (Math.abs(ax) > T || Math.abs(ay) > T) this.lastDevice = 'gamepad';
    this.padAxisPrev = { x: ax, y: ay };
    this.padPrev = now;
  }
  held(a: Action): boolean {
    if (this.padHeld.has(a)) return true;
    for (const k of this.bindings[a]) if (this.keys.has(k)) return true;
    return false;
  }
  drainPresses(): Action[] {
    const q = this.simQueue;
    this.simQueue = [];
    return q;
  }
  /** discard pending gameplay presses (e.g. when closing a menu) */
  clearSim(): void {
    this.simQueue = [];
  }
  ui(a: Action): boolean {
    return this.uiPressed.has(a);
  }
  /** UI edge with consumption so two widgets don't react to one press */
  take(a: Action): boolean {
    if (this.uiPressed.has(a)) {
      this.uiPressed.delete(a);
      return true;
    }
    return false;
  }
  /** forget this frame's UI presses (a closing menu must not also trigger the scene underneath) */
  clearUi(): void {
    this.uiPressed.clear();
  }
  endFrame(): void {
    this.uiPressed.clear();
    this.anyPressedThisFrame = false;
  }
  keyName(a: Action): string {
    if (this.lastDevice === 'gamepad') {
      const names = ['A', 'B', 'X', 'Y', 'LB', 'RB', 'LT', 'RT', 'Back', 'Start', 'L3', 'R3', 'D-Up', 'D-Down', 'D-Left', 'D-Right'];
      const b = PAD[a]?.[0];
      return b !== undefined ? names[b] : '?';
    }
    return keyLabel(this.bindings[a][0] ?? '—');
  }
}

export function keyLabel(code: string): string {
  const special: Record<string, string> = {
    ArrowLeft: '←', ArrowRight: '→', ArrowUp: '↑', ArrowDown: '↓', Space: 'Space', Escape: 'Esc',
    ShiftLeft: 'LShift', ShiftRight: 'RShift', ControlLeft: 'LCtrl', ControlRight: 'RCtrl', Enter: 'Enter', Backspace: 'Bksp',
  };
  if (special[code]) return special[code];
  return code.replace(/^Key/, '').replace(/^Digit/, '');
}
