'use strict';

// ---- Monde procédural (carte de tuiles via bruit fractal) ----

const TILE = { WATER: 0, SAND: 1, GRASS: 2, TALL: 3, TREE: 4, ROCK: 5, HEAL: 6, FLOWER: 7, ARENA: 8, PATH: 9, SHRINE: 10 };
const SOLID_TILES = new Set([TILE.WATER, TILE.TREE, TILE.ROCK]);

class World {
  constructor(seedStr, dex) {
    this.seed = hashStr(String(seedStr));
    this.dex = dex;
    this.w = 96;
    this.h = 96;
    this.gen();
  }

  gen() {
    const s = this.seed;
    this.tiles = new Uint8Array(this.w * this.h);
    for (let y = 0; y < this.h; y++) {
      for (let x = 0; x < this.w; x++) {
        const nx = x / this.w * 2 - 1, ny = y / this.h * 2 - 1;
        // affaissement vers les bords : la carte est une île
        const edge = Math.pow(Math.max(Math.abs(nx), Math.abs(ny)), 5) * 0.55;
        const e = fbm(s, x / 22, y / 22, 4) - edge;
        const m = fbm(s + 9173, x / 16, y / 16, 3);
        let t;
        if (e < 0.34) t = TILE.WATER;
        else if (e < 0.385) t = TILE.SAND;
        else if (e > 0.74) t = TILE.ROCK;
        else {
          t = TILE.GRASS;
          const f = fbm(s + 551, x / 9, y / 9, 2);
          if (m > 0.6 && rand2(s + 77, x, y) < (m - 0.6) * 2.2) t = TILE.TREE;
          else if (f > 0.6) t = TILE.TALL;
          else if (rand2(s + 31, x, y) < 0.035) t = TILE.FLOWER;
        }
        this.tiles[y * this.w + x] = t;
      }
    }
    this.spawn = this.findSpawn();
    // zone de départ dégagée + tuile de soin au centre
    for (let dy = -2; dy <= 2; dy++) {
      for (let dx = -2; dx <= 2; dx++) {
        const x = this.spawn.x + dx, y = this.spawn.y + dy;
        if (x >= 0 && x < this.w && y >= 0 && y < this.h)
          this.tiles[y * this.w + x] = TILE.GRASS;
      }
    }
    this.tiles[this.spawn.y * this.w + this.spawn.x] = TILE.HEAL;
    this.legendId = this.dex.find(sp => sp.legendary).id;
    this.genArena();
    this.genTrainers();
    this.genBoss();
  }

  set(x, y, t) {
    if (x >= 0 && y >= 0 && x < this.w && y < this.h) this.tiles[y * this.w + x] = t;
  }

  // L'arène du champion : creusée dans le plus gros massif rocheux, reliée
  // au point de départ par une route, avec le sanctuaire du légendaire au fond.
  genArena() {
    let best = null, bestScore = -1;
    for (let y = 5; y < this.h - 5; y++) {
      for (let x = 5; x < this.w - 5; x++) {
        const dist = Math.hypot(x - this.spawn.x, y - this.spawn.y);
        if (dist < 15) continue;
        let score;
        if (this.get(x, y) === TILE.ROCK) {
          let rocks = 0;
          for (let dy = -2; dy <= 2; dy++)
            for (let dx = -2; dx <= 2; dx++)
              if (this.get(x + dx, y + dy) === TILE.ROCK) rocks++;
          score = rocks * 2 + dist * 0.1;
        } else if (this.get(x, y) === TILE.GRASS) {
          score = dist * 0.05; // secours si le monde n'a pas de montagne
        } else continue;
        if (score > bestScore) { bestScore = score; best = { x, y }; }
      }
    }
    const a = best || { x: this.w - 8, y: 8 };
    this.arena = a;
    for (let dy = -3; dy <= 3; dy++)
      for (let dx = -3; dx <= 3; dx++)
        this.set(a.x + dx, a.y + dy,
          Math.abs(dx) <= 2 && Math.abs(dy) <= 2 ? TILE.ARENA : TILE.ROCK);
    this.set(a.x, a.y + 3, TILE.ARENA); // entrée au sud
    this.shrine = { x: a.x, y: a.y - 2 };
    this.set(this.shrine.x, this.shrine.y, TILE.SHRINE);
    // route 4-connexe jusqu'au spawn : chaque tuile solide traversée devient PATH
    let cx = a.x, cy = a.y + 4;
    let guard = this.w * this.h;
    while ((cx !== this.spawn.x || cy !== this.spawn.y) && guard-- > 0) {
      if (SOLID_TILES.has(this.get(cx, cy))) this.set(cx, cy, TILE.PATH);
      const dx = this.spawn.x - cx, dy = this.spawn.y - cy;
      if (Math.abs(dx) > Math.abs(dy)) cx += Math.sign(dx);
      else cy += Math.sign(dy);
    }
  }

  genBoss() {
    const rng = new RNG(this.seed ^ 0x0B0B);
    const team = [];
    for (let i = 0; i < 3; i++) {
      let sp;
      do { sp = this.dex[rng.int(0, this.dex.length - 1)]; } while (sp.legendary);
      while (sp.evolveTo !== null) sp = this.dex[sp.evolveTo];
      team.push({ speciesId: sp.id, level: 38 + rng.int(0, 4) });
    }
    const boss = {
      id: this.trainers.length, x: this.arena.x, y: this.arena.y,
      nom: rng.pick(['Maître', 'Maîtresse']) + ' ' + rng.pick(TRAINER_NAMES),
      couleur: '#d8aa3c', boss: true, team,
    };
    this.trainers.push(boss);
    this.bossId = boss.id;
  }

  genTrainers() {
    const rng = new RNG(this.seed ^ 0x7AA7);
    const couleurs = ['#4a8f3c', '#8f5fc4', '#c47f3c', '#3c8fc4', '#c43c8f', '#5a5a8f'];
    this.trainers = [];
    let attempts = 0;
    while (this.trainers.length < 14 && attempts++ < 6000) {
      const x = rng.int(5, this.w - 6), y = rng.int(5, this.h - 6);
      const t = this.get(x, y);
      if (t !== TILE.GRASS && t !== TILE.FLOWER) continue;
      const dist = Math.hypot(x - this.spawn.x, y - this.spawn.y);
      if (dist < 12) continue;
      if (this.trainers.some(tr => Math.abs(tr.x - x) < 7 && Math.abs(tr.y - y) < 7)) continue;
      const teamSize = dist > 45 ? 3 : dist > 25 ? 2 : 1;
      const team = [];
      for (let i = 0; i < teamSize; i++) {
        let sp;
        do { sp = this.dex[rng.int(0, this.dex.length - 1)]; } while (sp.legendary);
        while (sp.stage > 1) sp = this.dex[sp.id - 1];
        const level = clamp(4 + Math.floor(dist / 4) + rng.int(0, 3), 4, 45);
        while (sp.evolveTo !== null && level >= sp.evolveLevel) sp = this.dex[sp.evolveTo];
        team.push({ speciesId: sp.id, level });
      }
      this.trainers.push({
        id: this.trainers.length, x, y,
        nom: rng.pick(TRAINER_TITLES) + ' ' + rng.pick(TRAINER_NAMES),
        couleur: rng.pick(couleurs),
        team,
      });
    }
  }

  // Objet au sol (déterministe ; le ramassage est mémorisé dans la sauvegarde)
  itemAt(x, y) {
    const t = this.get(x, y);
    if (t !== TILE.GRASS && t !== TILE.SAND) return null;
    if (this.trainers.some(tr => tr.x === x && tr.y === y)) return null;
    const r = rand2(this.seed ^ 0xF00D, x, y);
    if (r < 0.004) return 'capsule';
    if (r < 0.007) return 'potion';
    return null;
  }

  // Faune locale : les types rencontrés dépendent du terrain environnant
  // (eau, forêt, roche), d'un bruit de température et de l'heure (nuit).
  typePool(x, y, night) {
    let water = 0, tree = 0, rock = 0;
    for (let dy = -3; dy <= 3; dy++)
      for (let dx = -3; dx <= 3; dx++) {
        const t = this.get(x + dx, y + dy);
        if (t === TILE.WATER) water++;
        else if (t === TILE.TREE) tree++;
        else if (t === TILE.ROCK) rock++;
      }
    const temp = fbm(this.seed + 4242, x / 30, y / 30, 3);
    const pool = ['NORMAL', 'VOL'];
    if (water > 3) pool.push('EAU', 'EAU');
    if (tree > 2) pool.push('PLANTE', 'PLANTE', 'TOXIK');
    if (rock > 1) pool.push('ROCHE', 'ROCHE');
    if (temp < 0.42) pool.push('GLACE', 'GLACE');
    if (temp > 0.58) pool.push('FEU', 'ELECTRIK');
    pool.push('SPECTRE');
    if (night) pool.push('SPECTRE', 'SPECTRE', 'TOXIK');
    return pool;
  }

  findSpawn() {
    const cx = this.w >> 1, cy = this.h >> 1;
    for (let r = 0; r < 45; r++) {
      for (let y = cy - r; y <= cy + r; y++) {
        for (let x = cx - r; x <= cx + r; x++) {
          if (Math.max(Math.abs(x - cx), Math.abs(y - cy)) !== r) continue;
          if (x < 4 || y < 4 || x >= this.w - 4 || y >= this.h - 4) continue;
          if (this.get(x, y) === TILE.GRASS) return { x, y };
        }
      }
    }
    return { x: cx, y: cy };
  }

  get(x, y) {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return TILE.WATER;
    return this.tiles[y * this.w + x];
  }

  isSolid(x, y) { return SOLID_TILES.has(this.get(x, y)); }

  // Rencontre sauvage : espèce tirée de la faune locale (biome) par zone de
  // 16x16 tuiles, stades évolués et niveaux croissants loin du point de départ.
  encounterFor(x, y, night) {
    const dist = Math.hypot(x - this.spawn.x, y - this.spawn.y);
    const maxStage = dist > 50 ? 3 : dist > 26 ? 2 : 1;
    const pool = this.typePool(x, y, night);
    const cx = x >> 4, cy = y >> 4;
    const slot = Math.floor(Math.random() * 5);
    const want = pool[hash2i(this.seed ^ 0x77AA, cx * 7 + slot, cy * 13 + slot) % pool.length];
    const idx = hash2i(this.seed ^ 0xBEEF, cx * 131 + slot, cy * 173 + slot * 7) % this.dex.length;
    let sp = this.dex[idx];
    if (sp.legendary) sp = this.dex[0];
    while (sp.stage > 1) sp = this.dex[sp.id - 1];
    for (let i = 0; i < this.dex.length; i++) {
      const cand = this.dex[(idx + i) % this.dex.length];
      if (cand.stage === 1 && !cand.legendary && cand.types[0] === want) { sp = cand; break; }
    }
    while (sp.evolveTo !== null && sp.stage < maxStage && Math.random() < 0.45)
      sp = this.dex[sp.evolveTo];
    const level = clamp(2 + Math.floor(dist / 5) + Math.floor(Math.random() * 4) - 1, 2, 42);
    return makeCreature(this.dex, sp.id, level);
  }
}
