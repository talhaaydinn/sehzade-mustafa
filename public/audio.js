// Ortak WebAudio altyapısı: efektler (sfx) ve üretilen müzik aynı AudioContext'i kullanır.
const C = window.CENAZE_CONFIG;

export const audio = (() => {
  let ac = null, master = null, sfxBus = null, musicBus = null, noise = null, muted = !C.sound;
  // sadece oyun müziği kapalı mı (efektler çalmaya devam eder). Tarayıcıda hatırlanır.
  let musicMuted = false;
  try { musicMuted = localStorage.getItem('cenaze.musicMuted') === '1'; } catch { /* yok say */ }
  function ensure() {
    if (!ac) {
      try {
        ac = new (window.AudioContext || window.webkitAudioContext)();
        master = ac.createGain(); master.gain.value = muted ? 0 : 1; master.connect(ac.destination);
        sfxBus = ac.createGain(); sfxBus.gain.value = C.sfxVolume; sfxBus.connect(master);
        musicBus = ac.createGain(); musicBus.gain.value = musicMuted ? 0 : C.musicVolume; musicBus.connect(master);
        noise = ac.createBuffer(1, ac.sampleRate, ac.sampleRate);
        const d = noise.getChannelData(0);
        for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      } catch { return null; }
    }
    if (ac.state === 'suspended') ac.resume().catch(() => {});
    return ac;
  }
  return {
    ensure,
    get ctx() { return ac; },
    get running() { return !!ac && ac.state === 'running'; },
    get sfxBus() { return sfxBus; },
    get musicBus() { return musicBus; },
    get noise() { return noise; },
    get muted() { return muted; },
    get musicMuted() { return musicMuted; },
    setMusicMuted(v) {
      musicMuted = !!v;
      if (musicBus) musicBus.gain.value = musicMuted ? 0 : C.musicVolume;
      try { localStorage.setItem('cenaze.musicMuted', musicMuted ? '1' : '0'); } catch { /* yok say */ }
      return musicMuted;
    },
    toggleMute() { muted = !muted; if (master) master.gain.value = muted ? 0 : 1; ensure(); return muted; },
  };
})();

// ---------------------------------------------------------------- küçük ses yapı taşları
export function env(g, t, peak, dur, attack = 0.005) {
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + Math.max(attack + 0.01, dur));
}
export function noiseHit(out, t, type, freq, peak, dur) {
  const ac = audio.ctx;
  const src = ac.createBufferSource(); src.buffer = audio.noise;
  const f = ac.createBiquadFilter(); f.type = type; f.frequency.value = freq;
  const g = ac.createGain(); env(g, t, peak, dur);
  src.connect(f).connect(g).connect(out); src.start(t); src.stop(t + dur + 0.05);
}
export function tone(out, t, type, f0, f1, peak, dur, attack) {
  const ac = audio.ctx;
  const o = ac.createOscillator(); o.type = type;
  o.frequency.setValueAtTime(f0, t);
  if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(f1, t + dur);
  const g = ac.createGain(); env(g, t, peak, dur, attack);
  o.connect(g).connect(out); o.start(t); o.stop(t + dur + 0.05);
}

// ---------------------------------------------------------------- efektler
export const sfx = {
  pop() { if (!audio.running) return; const t = audio.ctx.currentTime; tone(audio.sfxBus, t, 'sine', 520, 980, 0.25, 0.12); },
  chime(level = 1) {
    if (!audio.running) return; const t = audio.ctx.currentTime;
    const notes = [784, 988, 1175, 1568, 1976].slice(0, Math.max(2, Math.min(5, 2 + level)));
    notes.forEach((f, i) => tone(audio.sfxBus, t + i * 0.07, 'triangle', f, f, 0.18, 0.35));
  },
  // derin boru sesi (yeni sancaktar / taşıyıcı)
  horn() {
    if (!audio.running) return; const t = audio.ctx.currentTime;
    [[146.8, 0], [196, 0.35], [220, 0.7]].forEach(([f, d]) => {
      tone(audio.sfxBus, t + d, 'sawtooth', f, f, 0.06, 0.9, 0.08);
      tone(audio.sfxBus, t + d, 'sine', f / 2, f / 2, 0.12, 0.9, 0.08);
    });
  },
  // yumuşak çan (saflara katılım)
  bell() { if (!audio.running) return; const t = audio.ctx.currentTime; tone(audio.sfxBus, t, 'sine', 880, 880, 0.08, 1.2, 0.005); tone(audio.sfxBus, t, 'sine', 1320, 1320, 0.03, 0.8, 0.005); },
  fanfare() {
    if (!audio.running) return; const t = audio.ctx.currentTime;
    [523, 659, 784, 1047].forEach((f, i) => {
      tone(audio.sfxBus, t + i * 0.11, 'sawtooth', f, f, 0.07, 0.3);
      tone(audio.sfxBus, t + i * 0.11, 'triangle', f * 2, f * 2, 0.09, 0.3);
    });
  },
};
