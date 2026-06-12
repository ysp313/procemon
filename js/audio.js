'use strict';

// ---- Effets sonores procéduraux (WebAudio, aucun fichier) ----
// Le cri d'une espèce est dérivé de sa graine de sprite : même créature, même cri.

const Sfx = {
  ctx: null,
  muted: false,

  // L'AudioContext doit être créé/réveillé après un geste utilisateur
  ensure() {
    if (!this.ctx) {
      try { this.ctx = new (window.AudioContext || window.webkitAudioContext)(); }
      catch (e) { return null; }
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
    return this.ctx;
  },

  beep(freq, dur, type, vol, when, slide) {
    if (this.muted) return;
    const ctx = this.ensure();
    if (!ctx) return;
    try {
      const o = ctx.createOscillator(), g = ctx.createGain();
      const t0 = ctx.currentTime + (when || 0);
      o.type = type || 'square';
      o.frequency.setValueAtTime(freq, t0);
      if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq + slide), t0 + dur);
      g.gain.setValueAtTime(vol || 0.04, t0);
      g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
      o.connect(g).connect(ctx.destination);
      o.start(t0);
      o.stop(t0 + dur + 0.02);
    } catch (e) { /* audio non disponible : silencieux */ }
  },

  cry(sp) {
    const rng = new RNG((sp.spriteSeed ^ 0xC41) >>> 0);
    // grave pour les types lourds, les stades évolués et le légendaire
    const stage = sp.legendary ? 4 : sp.stage;
    const base = clamp(140 + TYPE_IDS.indexOf(sp.types[0]) * 35 + rng.int(0, 70) - stage * 25, 70, 600);
    const n = rng.int(2, 4);
    let t = 0;
    for (let i = 0; i < n; i++) {
      const dur = 0.07 + rng.next() * 0.12;
      this.beep(base * (1 + rng.next() * 0.8), dur,
        rng.pick(['square', 'sawtooth', 'triangle']), 0.05, t, rng.int(-90, 150));
      t += dur + 0.03;
    }
  },

  hit() { this.beep(220, 0.09, 'square', 0.05, 0, -130); },
  faint() { this.beep(320, 0.4, 'sawtooth', 0.05, 0, -270); },
  capture() { this.beep(520, 0.1, 'triangle', 0.05, 0); this.beep(660, 0.12, 'triangle', 0.05, 0.12); },
  captureOk() { this.beep(523, 0.12, 'square', 0.05, 0); this.beep(659, 0.12, 'square', 0.05, 0.13); this.beep(784, 0.22, 'square', 0.05, 0.26); },
  levelup() { this.beep(440, 0.09, 'square', 0.05, 0); this.beep(554, 0.09, 'square', 0.05, 0.09); this.beep(659, 0.18, 'square', 0.05, 0.18); },
  heal() { this.beep(660, 0.1, 'triangle', 0.05, 0); this.beep(880, 0.16, 'triangle', 0.05, 0.1); },
  item() { this.beep(784, 0.07, 'square', 0.04, 0); this.beep(988, 0.1, 'square', 0.04, 0.08); },
};
