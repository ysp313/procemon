'use strict';

// ---- Sprites pixel-art procéduraux ----
// Principe : remplissage aléatoire d'une demi-grille pondéré vers le centre,
// miroir vertical (symétrie = aspect "créature"), lissage par automate
// cellulaire, puis oreilles et yeux placés sur le corps obtenu.

function mirrorGrid(g, w, h) {
  const half = w / 2;
  for (let y = 0; y < h; y++)
    for (let x = half; x < w; x++) g[y][x] = g[y][w - 1 - x];
}

function smoothGrid(g, w, h) {
  const out = Array.from({ length: h }, () => new Array(w).fill(0));
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      let n = 0;
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++) {
          if (!dx && !dy) continue;
          if (g[y + dy][x + dx]) n++;
        }
      out[y][x] = g[y][x] ? (n >= 2 ? 1 : 0) : (n >= 5 ? 1 : 0);
    }
  }
  return out;
}

function addEars(rng, g, w, h) {
  if (!rng.chance(0.6)) return;
  for (let y = 1; y < h; y++) {
    const row = [];
    for (let x = 1; x < w / 2; x++) if (g[y][x]) row.push(x);
    if (!row.length) continue;
    if (y < 2) return;
    const ex = row[0] + (row.length > 2 && rng.chance(0.5) ? 1 : 0);
    const len = rng.int(1, Math.min(3, y));
    for (let i = 1; i <= len; i++) {
      g[y - i][ex] = 1;
      g[y - i][w - 1 - ex] = 1;
    }
    return;
  }
}

function placeEyes(g, w, h) {
  const half = w / 2;
  for (let y = Math.floor(h * 0.28); y < h * 0.6; y++) {
    const xs = [];
    for (let x = 1; x < half; x++) if (g[y][x]) xs.push(x);
    if (xs.length >= 2) {
      const ex = xs[Math.max(0, xs.length - 2)];
      return [[ex, y], [w - 1 - ex, y]];
    }
  }
  return null;
}

function fallbackSpriteData(size) {
  const g = Array.from({ length: size }, (_, y) => Array.from({ length: size }, (_, x) => {
    const dx = (x - (size - 1) / 2) / (size / 2 - 1);
    const dy = (y - (size - 1) / 2) / (size / 2 - 1);
    return dx * dx + dy * dy < 0.8 ? 1 : 0;
  }));
  const ey = Math.floor(size * 0.4), ex = Math.floor(size * 0.33);
  return { grid: g, eyes: [[ex, ey], [size - 1 - ex, ey]] };
}

function genSpriteData(seed, size) {
  for (let attempt = 0; attempt < 12; attempt++) {
    const rng = new RNG((seed + attempt * 7919) >>> 0);
    const w = size, h = size, half = w / 2;
    let g = Array.from({ length: h }, () => new Array(w).fill(0));
    for (let y = 1; y < h - 1; y++) {
      for (let x = 1; x < half; x++) {
        const dx = (x - (w - 1) / 2) / (w / 2);
        const dy = (y - (h - 1) / 2) / (h / 2);
        const d = Math.sqrt(dx * dx + dy * dy);
        if (rng.chance(clamp(0.82 - d * 0.8, 0.04, 0.82))) g[y][x] = 1;
      }
    }
    mirrorGrid(g, w, h);
    g = smoothGrid(g, w, h);
    g = smoothGrid(g, w, h);
    addEars(rng, g, w, h);
    let count = 0;
    for (const row of g) for (const v of row) count += v;
    if (count < size * size * 0.18) continue;
    const eyes = placeEyes(g, w, h);
    if (!eyes) continue;
    return { grid: g, eyes };
  }
  return fallbackSpriteData(size);
}

function shade(hex, amt) {
  const n = parseInt(hex.slice(1), 16);
  const r = clamp((n >> 16) + amt, 0, 255);
  const g = clamp(((n >> 8) & 255) + amt, 0, 255);
  const b = clamp((n & 255) + amt, 0, 255);
  return '#' + ((r << 16) | (g << 8) | b).toString(16).padStart(6, '0');
}

// Rend le sprite d'une espèce sur un canvas (couleurs dérivées de ses types)
function renderSprite(sp, scale) {
  const size = sp.spriteSize;
  const data = genSpriteData(sp.spriteSeed, size);
  const c = document.createElement('canvas');
  c.width = size * scale;
  c.height = size * scale;
  const x = c.getContext('2d');
  const t1 = TYPES[sp.types[0]], t2 = sp.types[1] ? TYPES[sp.types[1]] : null;
  const base = t1.c, light = t1.c2;
  const accent = t2 ? t2.c : shade(t1.c, -35);
  const belly = t2 ? t2.c2 : shade(t1.c2, 15);
  const seedA = (sp.spriteSeed ^ 0x51ab) >>> 0;
  const g = data.grid;

  for (let yy = 0; yy < size; yy++) {
    for (let xx = 0; xx < size; xx++) {
      if (!g[yy][xx]) {
        // contour : case vide adjacente au corps
        const body = (yy > 0 && g[yy - 1][xx]) || (yy < size - 1 && g[yy + 1][xx]) ||
                     (xx > 0 && g[yy][xx - 1]) || (xx < size - 1 && g[yy][xx + 1]);
        if (body) { x.fillStyle = '#22222e'; x.fillRect(xx * scale, yy * scale, scale, scale); }
        continue;
      }
      // motifs symétriques : le bruit utilise la distance au bord le plus proche
      const mx = Math.min(xx, size - 1 - xx);
      let col = base;
      if (Math.abs(xx - (size - 1) / 2) < size * 0.18 && yy > size * 0.45 && yy < size * 0.88) col = belly;
      else if (rand2(seedA, mx, yy) > 0.68) col = accent;
      else if (rand2(seedA ^ 77, mx, yy) > 0.75) col = light;
      const below = yy + 1 < size && g[yy + 1][xx];
      const above = yy > 0 && g[yy - 1][xx];
      if (!below) col = shade(col, -28);
      else if (!above) col = shade(col, 22);
      x.fillStyle = col;
      x.fillRect(xx * scale, yy * scale, scale, scale);
    }
  }
  for (const [ex, ey] of data.eyes) {
    x.fillStyle = '#ffffff';
    x.fillRect(ex * scale, ey * scale, scale, scale);
    x.fillStyle = '#101018';
    x.fillRect(ex * scale + scale * 0.3, ey * scale + scale * 0.3,
               Math.max(1, scale * 0.5), Math.max(1, scale * 0.5));
  }
  return c;
}

function silhouette(canvas) {
  const c = document.createElement('canvas');
  c.width = canvas.width;
  c.height = canvas.height;
  const x = c.getContext('2d');
  x.drawImage(canvas, 0, 0);
  x.globalCompositeOperation = 'source-in';
  x.fillStyle = '#2d2d3a';
  x.fillRect(0, 0, c.width, c.height);
  return c;
}
