// =====================================================================
//  Müzik: public/music/ klasöründe ses dosyası varsa onları sırayla çalar.
//  Yoksa ağır bir cenaze ezgisi üretir: dem (drone), hicaz makamında ney
//  benzeri ezgi ve her iki adımda bir kös vuruşu.
//  Yürüyüş temposu her zaman config.stepsPerMinute'tan gelir.
// =====================================================================
import { audio, noiseHit } from './audio.js';

const C = window.CENAZE_CONFIG;

// Re hicaz: Re, Mi♭(biraz tiz), Fa#, Sol, La, Si♭, Do, Re
const TONIC = 293.66;
const SCALE = [0, 1.13, 4, 5, 7, 8, 10, 12, 13.13, 16];

export class FuneralMusic {
  constructor() {
    this.files = []; this.idx = 0; this.mode = 'idle'; this.title = '';
    this.t0 = performance.now() / 1000;
    this.next = 0; this.noteAt = 0; this.deg = 4; this.droneOn = false;
  }

  async loadLibrary() {
    try {
      const lib = await (await fetch('/api/music', { cache: 'no-store' })).json();
      this.files = [...(lib.root || []), ...Object.entries(lib).filter(([k]) => k !== 'root').flatMap(([, v]) => v)];
    } catch { this.files = []; }
  }

  start() {
    if (this.files.length) this.playFile(); else { this.mode = 'synth'; this.title = 'Cenaze ezgisi (hicaz)'; }
  }

  playFile() {
    const url = this.files[this.idx % this.files.length];
    this.idx++;
    if (!this.el) {
      this.el = new Audio(); this.el.crossOrigin = 'anonymous';
      this.el.onended = () => this.playFile();
      this.el.onerror = () => { this.files = this.files.filter((f) => f !== url); this.files.length ? this.playFile() : (this.mode = 'synth'); };
    }
    this.el.src = url;
    this.mode = 'file';
    this.title = decodeURIComponent(url.split('/').pop()).replace(/\.[^.]+$/, '');
    this.hooked = false;
    this.el.play().catch(() => { /* ses kilidi açılınca update() tekrar dener */ });
  }

  // adım sayacı (yürüyüş temposu)
  step() { return (performance.now() / 1000 - this.t0) * (C.stepsPerMinute || 76) / 60; }

  update() {
    const ac = audio.ctx;
    if (!ac || !audio.running) return;
    if (this.mode === 'file') {
      if (!this.hooked && this.el) {
        try { ac.createMediaElementSource(this.el).connect(audio.musicBus); } catch { /* zaten bağlı */ }
        this.hooked = true;
      }
      if (this.el?.paused) this.el.play().catch(() => {});
      return;
    }
    if (this.mode !== 'synth') return;
    this.drone(ac);
    const stepDur = 60 / (C.stepsPerMinute || 76);
    const now = ac.currentTime;
    if (this.next < now) this.next = now + 0.05;
    // kös: iki adımda bir
    while (this.next < now + 0.3) {
      const n = Math.round((this.next - 0) / stepDur);
      if (n % 2 === 0) this.kos(this.next, n % 8 === 0 ? 1 : 0.65);
      this.next += stepDur;
    }
    // ney ezgisi
    if (this.noteAt < now) this.noteAt = now + 0.1;
    while (this.noteAt < now + 0.4) {
      const r = Math.random();
      if (r < 0.18) { this.noteAt += stepDur * (2 + Math.floor(Math.random() * 3)); continue; } // nefes / sus
      this.deg = Math.max(0, Math.min(SCALE.length - 1, this.deg + [-2, -1, -1, 0, 1, 1, 2][Math.floor(Math.random() * 7)]));
      if (Math.random() < 0.15) this.deg = [0, 4, 7][Math.floor(Math.random() * 3)]; // karara / güçlüye dön
      const len = stepDur * [1, 2, 2, 3, 4][Math.floor(Math.random() * 5)];
      this.ney(this.noteAt, TONIC * 2 ** (SCALE[this.deg] / 12), len);
      this.noteAt += len;
    }
  }

  drone(ac) {
    if (this.droneOn) return;
    this.droneOn = true;
    const out = audio.musicBus;
    for (const [f, g] of [[TONIC / 4, 0.05], [TONIC / 2, 0.03], [TONIC * 0.75 / 2, 0.015]]) {
      const o = ac.createOscillator(); o.type = 'sawtooth'; o.frequency.value = f;
      const lp = ac.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 380;
      const gn = ac.createGain(); gn.gain.value = 0;
      gn.gain.linearRampToValueAtTime(g, ac.currentTime + 4);
      const lfo = ac.createOscillator(); lfo.frequency.value = 0.07 + Math.random() * 0.05;
      const lg = ac.createGain(); lg.gain.value = g * 0.4; lfo.connect(lg).connect(gn.gain); lfo.start();
      o.connect(lp).connect(gn).connect(out); o.start();
    }
  }

  kos(t, v) {
    const ac = audio.ctx, out = audio.musicBus;
    const o = ac.createOscillator(); o.type = 'sine';
    o.frequency.setValueAtTime(70, t); o.frequency.exponentialRampToValueAtTime(38, t + 0.9);
    const g = ac.createGain();
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.55 * v, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + 1.5);
    o.connect(g).connect(out); o.start(t); o.stop(t + 1.6);
    noiseHit(out, t, 'lowpass', 260, 0.18 * v, 0.35);
  }

  ney(t, f, len) {
    const ac = audio.ctx, out = audio.musicBus;
    const dur = len * 0.95;
    const o = ac.createOscillator(); o.type = 'sine'; o.frequency.setValueAtTime(f * 0.985, t); o.frequency.linearRampToValueAtTime(f, t + 0.12);
    const o2 = ac.createOscillator(); o2.type = 'triangle'; o2.frequency.value = f * 2;
    const vib = ac.createOscillator(); vib.frequency.value = 5.2;
    const vg = ac.createGain(); vg.gain.setValueAtTime(0, t); vg.gain.linearRampToValueAtTime(f * 0.006, t + 0.4);
    vib.connect(vg); vg.connect(o.frequency); vg.connect(o2.frequency);
    const g = ac.createGain();
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.13, t + 0.18); g.gain.setValueAtTime(0.12, t + dur - 0.25); g.gain.linearRampToValueAtTime(0.0001, t + dur);
    const g2 = ac.createGain(); g2.gain.value = 0.18;
    const lp = ac.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 2400;
    o.connect(g); o2.connect(g2).connect(g); g.connect(lp).connect(out);
    // nefes sesi
    const n = ac.createBufferSource(); n.buffer = audio.noise; n.loop = true;
    const bp = ac.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = f * 2; bp.Q.value = 6;
    const ng = ac.createGain(); ng.gain.setValueAtTime(0.0001, t); ng.gain.linearRampToValueAtTime(0.05, t + 0.1); ng.gain.linearRampToValueAtTime(0.012, t + 0.4); ng.gain.linearRampToValueAtTime(0.0001, t + dur);
    n.connect(bp).connect(ng).connect(out);
    for (const x of [o, o2, vib, n]) { x.start(t); x.stop(t + dur + 0.05); }
  }
}
