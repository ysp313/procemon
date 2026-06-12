'use strict';

// ---- Hachage et générateur pseudo-aléatoire déterministes ----

function hashStr(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function hash2i(seed, x, y) {
  let h = (seed >>> 0) ^ Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return (h ^ (h >>> 16)) >>> 0;
}

// Valeur déterministe dans [0,1) pour une coordonnée donnée
function rand2(seed, x, y) {
  return hash2i(seed, x, y) / 4294967296;
}

// Générateur séquentiel seedé (mulberry32)
class RNG {
  constructor(seed) { this.s = (seed >>> 0) || 1; }
  next() {
    let t = this.s += 0x6D2B79F5;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  int(min, max) { return min + Math.floor(this.next() * (max - min + 1)); }
  pick(arr) { return arr[Math.floor(this.next() * arr.length)]; }
  chance(p) { return this.next() < p; }
}

// ---- Bruit de valeur pour la génération du terrain ----

function lerp(a, b, t) { return a + (b - a) * t; }
function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }

function valueNoise(seed, x, y) {
  const x0 = Math.floor(x), y0 = Math.floor(y);
  const fx = x - x0, fy = y - y0;
  const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
  const v00 = rand2(seed, x0, y0), v10 = rand2(seed, x0 + 1, y0);
  const v01 = rand2(seed, x0, y0 + 1), v11 = rand2(seed, x0 + 1, y0 + 1);
  return lerp(lerp(v00, v10, sx), lerp(v01, v11, sx), sy);
}

function fbm(seed, x, y, octaves) {
  let v = 0, amp = 1, freq = 1, total = 0;
  for (let i = 0; i < octaves; i++) {
    v += valueNoise(seed + i * 1013, x * freq, y * freq) * amp;
    total += amp;
    amp *= 0.5;
    freq *= 2;
  }
  return v / total;
}
