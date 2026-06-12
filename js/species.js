'use strict';

// ---- Génération du Procédex (espèces) et logique des créatures ----

function generateMove(rng, type, powerBase) {
  const power = clamp(powerBase + rng.int(-8, 18), 25, 115);
  const acc = power >= 90 ? rng.int(72, 88) : power >= 60 ? rng.int(85, 95) : rng.int(95, 100);
  return { nom: genMoveName(rng, type), type, power, acc };
}

function makeLearnset(rng, types) {
  const lvls = [1, 1, 6, 11, 17, 24, 32, 40];
  return lvls.map((lv, i) => {
    const r = rng.next();
    let t;
    if (types.length > 1) {
      t = r < 0.4 ? types[0] : r < 0.65 ? types[1] : r < 0.85 ? 'NORMAL' : rng.pick(TYPE_IDS);
    } else {
      t = r < 0.55 ? types[0] : r < 0.8 ? 'NORMAL' : rng.pick(TYPE_IDS);
    }
    return { lv, ...generateMove(rng, t, 32 + i * 9) };
  });
}

// Le dex est entièrement déterminé par la graine du monde.
// Les espèces d'une même chaîne d'évolution sont contiguës (id, id+1, id+2).
function generateDex(seedStr) {
  const seed = hashStr(String(seedStr));
  const rng = new RNG(hash2i(seed, 1234, 5678));
  const dex = [];
  const target = 105;
  const usedNames = new Set();
  const sizes = [12, 16, 20];

  while (dex.length < target) {
    const r = rng.next();
    const chainLen = r < 0.25 ? 1 : r < 0.75 ? 2 : 3;
    const t1 = rng.pick(TYPE_IDS);
    let t2 = null;
    if (rng.chance(0.32)) { do { t2 = rng.pick(TYPE_IDS); } while (t2 === t1); }
    const types = t2 ? [t1, t2] : [t1];
    const names = genChainNames(rng, t1, chainLen, usedNames);
    const baseSeed = rng.int(1, 0x7fffffff);
    const base = { hp: rng.int(34, 56), atk: rng.int(30, 62), def: rng.int(30, 60), spd: rng.int(28, 62) };
    const evo1 = rng.int(14, 20), evo2 = rng.int(28, 36);

    for (let s = 0; s < chainLen; s++) {
      const id = dex.length;
      const mult = 1 + s * 0.42;
      const b = {
        hp: Math.round(base.hp * mult),
        atk: Math.round(base.atk * mult) + (s ? rng.int(0, 6) : 0),
        def: Math.round(base.def * mult) + (s ? rng.int(0, 6) : 0),
        spd: Math.round(base.spd * mult) + (s ? rng.int(0, 6) : 0),
      };
      const tot = b.hp + b.atk + b.def + b.spd;
      dex.push({
        id,
        nom: names[s],
        types,
        stage: s + 1,
        chainLen,
        base: b,
        spriteSeed: hash2i(baseSeed, s * 37 + 11, 97) || 1,
        spriteSize: sizes[Math.min(s + (chainLen === 1 ? 1 : 0), 2)],
        learnset: makeLearnset(rng, types),
        evolveLevel: s === 0 && chainLen > 1 ? evo1 : s === 1 && chainLen > 2 ? evo2 : null,
        evolveTo: s < chainLen - 1 ? id + 1 : null,
        baseExp: Math.round(tot / 2.6) + s * 25,
      });
    }
  }

  // La créature légendaire du monde : unique, gardée par le sanctuaire de l'arène.
  // Jamais rencontrée dans les hautes herbes ni dans les équipes de dresseurs.
  const t1 = rng.pick(TYPE_IDS);
  let t2;
  do { t2 = rng.pick(TYPE_IDS); } while (t2 === t1);
  let nom;
  do {
    nom = rng.pick(TYPE_PREFIX[t1]) + rng.pick(['zar', 'khan', 'dôn', 'goth', 'myr', 'axis']);
  } while (usedNames.has(nom));
  usedNames.add(nom);
  const lb = { hp: rng.int(90, 110), atk: rng.int(85, 115), def: rng.int(85, 115), spd: rng.int(85, 115) };
  const llv = [1, 1, 1, 1, 20, 30, 40, 45];
  dex.push({
    id: dex.length,
    nom,
    types: [t1, t2],
    stage: 1,
    chainLen: 1,
    legendary: true,
    base: lb,
    spriteSeed: hash2i(rng.int(1, 0x7fffffff), 13, 97) || 1,
    spriteSize: 24,
    learnset: llv.map((lv, i) => ({ lv, ...generateMove(rng, rng.chance(0.5) ? t1 : t2, 58 + i * 7) })),
    evolveLevel: null,
    evolveTo: null,
    baseExp: 250,
  });
  return dex;
}

// ---- Créatures (instances) ----

function expFor(level) { return level * level * level; }

function recomputeStats(dex, c) {
  const b = dex[c.speciesId].base;
  c.hpMax = Math.floor(b.hp * 2 * c.level / 100) + c.level + 10;
  c.atk = Math.floor(b.atk * 2 * c.level / 100) + 5;
  c.def = Math.floor(b.def * 2 * c.level / 100) + 5;
  c.spd = Math.floor(b.spd * 2 * c.level / 100) + 5;
}

function makeCreature(dex, speciesId, level) {
  const sp = dex[speciesId];
  const c = {
    speciesId,
    nom: sp.nom,
    level,
    exp: expFor(level),
    moves: sp.learnset.filter(m => m.lv <= level).slice(-4)
      .map(m => ({ nom: m.nom, type: m.type, power: m.power, acc: m.acc })),
  };
  recomputeStats(dex, c);
  c.hp = c.hpMax;
  return c;
}

// Monte d'un seul niveau si l'EXP le permet ; retourne les événements
// (attaques apprises, évolution disponible) ou null.
function checkLevelUp(dex, c) {
  if (c.level >= 50 || c.exp < expFor(c.level + 1)) return null;
  c.level++;
  const oldMax = c.hpMax;
  recomputeStats(dex, c);
  c.hp += c.hpMax - oldMax;
  const sp = dex[c.speciesId];
  const learned = [];
  for (const m of sp.learnset) {
    if (m.lv !== c.level) continue;
    const copy = { nom: m.nom, type: m.type, power: m.power, acc: m.acc };
    if (c.moves.length < 4) {
      c.moves.push(copy);
      learned.push({ move: m, replaced: null });
    } else {
      let wi = 0;
      for (let i = 1; i < c.moves.length; i++) if (c.moves[i].power < c.moves[wi].power) wi = i;
      if (c.moves[wi].power < m.power) {
        const old = c.moves[wi];
        c.moves[wi] = copy;
        learned.push({ move: m, replaced: old });
      }
    }
  }
  let evolved = null;
  if (sp.evolveTo !== null && c.level >= sp.evolveLevel) {
    evolved = { from: sp, to: dex[sp.evolveTo] };
  }
  return { level: c.level, learned, evolved };
}

function evolveCreature(dex, c) {
  const sp = dex[c.speciesId];
  if (sp.evolveTo === null) return;
  const to = dex[sp.evolveTo];
  if (c.nom === sp.nom) c.nom = to.nom;
  const ratio = c.hp / c.hpMax;
  c.speciesId = to.id;
  recomputeStats(dex, c);
  c.hp = Math.max(1, Math.round(c.hpMax * ratio));
}
