/**
 * Fully synthesized audio (WebAudio). No sample assets: every sound is built from
 * oscillators + filtered noise, with random pitch variation so repeated hits don't sound mechanical.
 */
export class Audio {
  ctx: AudioContext | null = null;
  master!: GainNode;
  sfxBus!: GainNode;
  musicBus!: GainNode;
  noiseBuf!: AudioBuffer;
  volumes = { master: 0.8, sfx: 0.9, music: 0.5 };
  private lastPlay = new Map<string, number>();
  private music: MusicPlayer | null = null;

  unlock(): void {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') void this.ctx.resume();
      return;
    }
    const AC = (globalThis as any).AudioContext || (globalThis as any).webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC() as AudioContext;
    const c = this.ctx;
    this.master = c.createGain();
    const comp = c.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.ratio.value = 4;
    this.master.connect(comp).connect(c.destination);
    this.sfxBus = c.createGain();
    this.musicBus = c.createGain();
    this.sfxBus.connect(this.master);
    this.musicBus.connect(this.master);
    this.noiseBuf = c.createBuffer(1, c.sampleRate, c.sampleRate);
    const d = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    this.applyVolumes();
    this.music = new MusicPlayer(this);
  }

  applyVolumes(): void {
    if (!this.ctx) return;
    this.master.gain.value = this.volumes.master;
    this.sfxBus.gain.value = this.volumes.sfx;
    this.musicBus.gain.value = this.volumes.music * 0.5;
  }

  setMusic(track: MusicTrack | null): void {
    this.music?.set(track);
  }
  update(): void {
    this.music?.schedule();
  }

  // ─────────────── primitives ───────────────
  private env(g: GainNode, t: number, a: number, peak: number, dur: number) {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  }
  tone(type: OscillatorType, f0: number, f1: number, dur: number, vol: number, delay = 0, attack = 0.004): void {
    const c = this.ctx!;
    const t = c.currentTime + delay;
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = type;
    o.frequency.setValueAtTime(Math.max(20, f0), t);
    o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    this.env(g, t, attack, vol, dur);
    o.connect(g).connect(this.sfxBus);
    o.start(t);
    o.stop(t + dur + 0.05);
  }
  noise(dur: number, vol: number, filter: BiquadFilterType, f0: number, f1: number, q = 1, delay = 0): void {
    const c = this.ctx!;
    const t = c.currentTime + delay;
    const src = c.createBufferSource();
    src.buffer = this.noiseBuf;
    src.playbackRate.value = 0.8 + Math.random() * 0.4;
    const f = c.createBiquadFilter();
    f.type = filter;
    f.Q.value = q;
    f.frequency.setValueAtTime(f0, t);
    f.frequency.exponentialRampToValueAtTime(Math.max(30, f1), t + dur);
    const g = c.createGain();
    this.env(g, t, 0.003, vol, dur);
    src.connect(f).connect(g).connect(this.sfxBus);
    src.start(t, Math.random() * 0.5);
    src.stop(t + dur + 0.05);
  }

  play(id: string, vol = 1, pitch = 1): void {
    if (!this.ctx || this.ctx.state !== 'running') return;
    // throttle identical sounds within 25 ms (multi-hit spam)
    const now = this.ctx.currentTime;
    const last = this.lastPlay.get(id) ?? 0;
    if (now - last < 0.025) return;
    this.lastPlay.set(id, now);
    const p = pitch * (0.94 + Math.random() * 0.12);
    const v = vol;
    switch (id) {
      case 'slash':
        this.noise(0.09, 0.5 * v, 'bandpass', 4200 * p, 1400 * p, 1.2);
        this.tone('triangle', 900 * p, 300 * p, 0.06, 0.18 * v);
        this.tone('sine', 140 * p, 60, 0.08, 0.35 * v);
        break;
      case 'blunt':
        this.tone('sine', 150 * p, 38, 0.22, 0.9 * v);
        this.noise(0.14, 0.45 * v, 'lowpass', 1600 * p, 200, 0.8);
        this.tone('square', 90 * p, 40, 0.08, 0.12 * v);
        break;
      case 'pierce':
        this.noise(0.05, 0.35 * v, 'highpass', 3000, 6000, 0.7);
        this.tone('sawtooth', 1100 * p, 260 * p, 0.07, 0.14 * v);
        this.tone('sine', 180 * p, 70, 0.08, 0.35 * v);
        break;
      case 'magic':
        this.tone('triangle', 500 * p, 1500 * p, 0.14, 0.22 * v);
        this.tone('sine', 1000 * p, 2200 * p, 0.1, 0.12 * v, 0.03);
        this.noise(0.08, 0.15 * v, 'bandpass', 5000, 2000, 2);
        break;
      case 'fire':
        this.noise(0.25, 0.4 * v, 'lowpass', 2400 * p, 300, 0.7);
        this.tone('sawtooth', 160 * p, 60, 0.18, 0.12 * v);
        break;
      case 'shock':
        this.tone('square', 1800 * p, 300 * p, 0.12, 0.12 * v);
        this.tone('sawtooth', 120 * p, 90 * p, 0.12, 0.15 * v);
        this.noise(0.1, 0.25 * v, 'highpass', 2500, 5000, 1);
        break;
      case 'frost':
        this.tone('sine', 2400 * p, 1600 * p, 0.18, 0.12 * v);
        this.tone('triangle', 3200 * p, 2800 * p, 0.12, 0.08 * v, 0.02);
        this.noise(0.1, 0.25 * v, 'bandpass', 6000, 3000, 3);
        break;
      case 'parry':
        this.tone('sine', 1250, 1210, 0.45, 0.45 * v);
        this.tone('sine', 1870, 1850, 0.35, 0.3 * v);
        this.tone('triangle', 3100, 2900, 0.2, 0.15 * v);
        this.noise(0.05, 0.6 * v, 'highpass', 2000, 4000, 0.7);
        break;
      case 'block':
      case 'clank':
        this.noise(0.08, 0.5 * v, 'bandpass', 2400 * p, 1600 * p, 4);
        this.tone('square', 620 * p, 500 * p, 0.08, 0.12 * v);
        break;
      case 'dodge':
        this.noise(0.16, 0.25 * v, 'bandpass', 900 * p, 2600 * p, 1.5);
        break;
      case 'jump':
        this.tone('sine', 260 * p, 420 * p, 0.08, 0.15 * v);
        break;
      case 'land':
        this.tone('sine', 110 * p, 50, 0.08, 0.3 * v);
        this.noise(0.05, 0.12 * v, 'lowpass', 900, 200, 0.7);
        break;
      case 'swing':
        this.noise(0.08, 0.18 * v, 'bandpass', 1800 * p, 3800 * p, 1.4);
        break;
      case 'swingHeavy':
        this.noise(0.18, 0.3 * v, 'bandpass', 500 * p, 1500 * p, 1.2);
        break;
      case 'charge':
        this.tone('triangle', 300 * p, 330 * p, 0.06, 0.1 * v);
        break;
      case 'chargeFull':
        this.tone('sine', 1320, 1320, 0.3, 0.3 * v);
        this.tone('sine', 1980, 1980, 0.25, 0.2 * v, 0.02);
        break;
      case 'hurt':
        this.tone('square', 420 * p, 120, 0.16, 0.18 * v);
        this.noise(0.12, 0.4 * v, 'lowpass', 2000, 300, 1);
        break;
      case 'kill':
        this.tone('sine', 90, 35, 0.3, 0.6 * v);
        this.noise(0.25, 0.3 * v, 'lowpass', 1200, 100, 0.7);
        this.tone('triangle', 880 * p, 1760 * p, 0.12, 0.08 * v, 0.05);
        break;
      case 'potion':
        for (let i = 0; i < 3; i++) this.tone('sine', 300 + i * 80, 500 + i * 80, 0.06, 0.15 * v, i * 0.08);
        break;
      case 'pickup':
      case 'coin':
        this.tone('square', 1320 * p, 1320 * p, 0.06, 0.08 * v);
        this.tone('square', 1760 * p, 1760 * p, 0.1, 0.08 * v, 0.06);
        break;
      case 'levelup':
        [523, 659, 784, 1046].forEach((f, i) => this.tone('triangle', f, f, 0.22, 0.2 * v, i * 0.08));
        break;
      case 'menu':
        this.tone('square', 900, 900, 0.03, 0.05 * v);
        break;
      case 'confirm':
        this.tone('square', 700, 700, 0.04, 0.07 * v);
        this.tone('square', 1050, 1050, 0.06, 0.07 * v, 0.04);
        break;
      case 'cancel':
        this.tone('square', 600, 400, 0.08, 0.06 * v);
        break;
      case 'door':
        this.tone('sawtooth', 70, 50, 0.6, 0.15 * v);
        this.noise(0.5, 0.15 * v, 'lowpass', 400, 100, 1);
        break;
      case 'stagger':
        this.noise(0.25, 0.6 * v, 'bandpass', 900, 300, 1);
        this.tone('sawtooth', 200, 60, 0.25, 0.25 * v);
        break;
      case 'telegraph':
        this.tone('square', 1600, 1600, 0.05, 0.08 * v);
        this.tone('square', 1600, 1600, 0.05, 0.08 * v, 0.09);
        break;
      case 'boss':
        this.tone('sawtooth', 110, 55, 0.9, 0.35 * v, 0, 0.05);
        this.tone('sawtooth', 116, 58, 0.9, 0.3 * v, 0, 0.05);
        this.noise(0.8, 0.25 * v, 'lowpass', 700, 120, 1);
        break;
      case 'explode':
        this.tone('sine', 120 * p, 30, 0.35, 0.6 * v);
        this.noise(0.35, 0.5 * v, 'lowpass', 2500 * p, 80, 0.7);
        break;
      case 'cast':
        this.tone('sine', 600, 1400, 0.2, 0.15 * v);
        this.tone('triangle', 900, 2100, 0.2, 0.08 * v, 0.03);
        break;
      case 'rare':
        [784, 988, 1175].forEach((f, i) => this.tone('triangle', f, f, 0.3, 0.15 * v, i * 0.06));
        break;
      case 'legendary':
        [523, 659, 784, 1046, 1318].forEach((f, i) => this.tone('triangle', f, f, 0.5, 0.18 * v, i * 0.07));
        this.tone('sine', 262, 262, 1.2, 0.2 * v);
        break;
      case 'death':
        this.tone('sawtooth', 300, 40, 1.2, 0.3 * v);
        this.noise(0.8, 0.2 * v, 'lowpass', 900, 60, 0.7);
        break;
    }
  }
}

export type MusicTrack = 'hub' | 'depth1' | 'depth2' | 'depth3' | 'boss' | 'title';

/** Tiny generative music: drone + slow arpeggio in a mode chosen per track. */
class MusicPlayer {
  private track: MusicTrack | null = null;
  private nextT = 0;
  private step = 0;
  private drone: { o: OscillatorNode[]; g: GainNode } | null = null;
  constructor(private a: Audio) {}
  set(track: MusicTrack | null) {
    if (track === this.track) return;
    this.track = track;
    const c = this.a.ctx!;
    if (this.drone) {
      const d = this.drone;
      d.g.gain.setTargetAtTime(0.0001, c.currentTime, 0.4);
      setTimeout(() => d.o.forEach((o) => o.stop()), 2000);
      this.drone = null;
    }
    if (!track) return;
    const root = TRACKS[track].root;
    const g = c.createGain();
    g.gain.value = 0.0001;
    g.gain.setTargetAtTime(0.06, c.currentTime, 1.2);
    const f = c.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = track === 'boss' ? 900 : 500;
    const os = [root / 2, root / 2 * 1.005, root * 0.75].map((fr) => {
      const o = c.createOscillator();
      o.type = 'sawtooth';
      o.frequency.value = fr;
      o.connect(f);
      o.start();
      return o;
    });
    f.connect(g).connect(this.a.musicBus);
    this.drone = { o: os, g };
    this.nextT = c.currentTime + 0.1;
    this.step = 0;
  }
  schedule() {
    const c = this.a.ctx;
    if (!c || !this.track) return;
    const tr = TRACKS[this.track];
    while (this.nextT < c.currentTime + 0.25) {
      const t = this.nextT;
      const s = this.step++;
      const deg = tr.pattern[s % tr.pattern.length];
      if (deg !== null) {
        const f = tr.root * Math.pow(2, tr.scale[(deg + 70) % tr.scale.length] / 12 + Math.floor(deg / tr.scale.length));
        const o = c.createOscillator();
        const g = c.createGain();
        o.type = tr.wave;
        o.frequency.value = f;
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(tr.vol, t + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, t + tr.len);
        o.connect(g).connect(this.a.musicBus);
        o.start(t);
        o.stop(t + tr.len + 0.05);
      }
      if (tr.kick && s % 4 === 0) {
        const o = c.createOscillator();
        const g = c.createGain();
        o.frequency.setValueAtTime(110, t);
        o.frequency.exponentialRampToValueAtTime(40, t + 0.15);
        g.gain.setValueAtTime(0.25, t);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 0.2);
        o.connect(g).connect(this.a.musicBus);
        o.start(t);
        o.stop(t + 0.25);
      }
      this.nextT += tr.beat;
    }
  }
}

const N = null;
const TRACKS: Record<MusicTrack, { root: number; scale: number[]; pattern: (number | null)[]; beat: number; len: number; vol: number; wave: OscillatorType; kick?: boolean }> = {
  title: { root: 220, scale: [0, 2, 3, 7, 8], pattern: [0, N, 2, N, 4, N, 3, N, 1, N, N, N, 0, N, N, N], beat: 0.32, len: 1.2, vol: 0.05, wave: 'triangle' },
  hub: { root: 261.6, scale: [0, 2, 4, 7, 9], pattern: [0, N, 2, N, 4, 3, N, 2, 0, N, N, 1, 2, N, N, N], beat: 0.3, len: 0.9, vol: 0.05, wave: 'triangle' },
  depth1: { root: 196, scale: [0, 2, 3, 5, 7, 8, 10], pattern: [0, N, N, 3, N, N, 4, N, 2, N, N, N, 5, N, 4, N], beat: 0.24, len: 0.8, vol: 0.045, wave: 'sine' },
  depth2: { root: 174.6, scale: [0, 1, 3, 5, 7, 8, 10], pattern: [0, N, 1, N, 4, N, 1, N, 0, N, 5, N, 4, N, N, N], beat: 0.22, len: 0.7, vol: 0.045, wave: 'triangle' },
  depth3: { root: 246.9, scale: [0, 2, 4, 6, 7, 9, 11], pattern: [0, 4, N, 7, N, 4, N, 9, 0, N, 6, N, 4, N, N, N], beat: 0.26, len: 1, vol: 0.04, wave: 'sine' },
  boss: { root: 146.8, scale: [0, 1, 3, 5, 6, 8, 10], pattern: [0, 0, 3, 0, 4, 0, 3, 1, 0, 0, 5, 0, 4, 3, 1, N], beat: 0.15, len: 0.18, vol: 0.05, wave: 'square', kick: true },
};
