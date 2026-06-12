'use strict';

// ---- Génération procédurale de noms (créatures et attaques) ----

const N_START = ['Ka', 'Zo', 'Pi', 'Flo', 'Gru', 'Vex', 'Mor', 'Tila', 'Bra', 'Sno',
  'Plu', 'Cra', 'Dja', 'Fu', 'Glo', 'Hy', 'Ki', 'Lu', 'My', 'Nox',
  'Ori', 'Pa', 'Qui', 'Ru', 'Sy', 'Ta', 'Ulta', 'Vi', 'Wo', 'Xa', 'Ya', 'Zé'];
const N_MID = ['ra', 'lo', 'mi', 'ta', 'vu', 'né', 'po', 'chi', 'gar', 'zel',
  'dor', 'fan', 'lis', 'mo', 'ru', 'sca', 'ti', 'va', 'bul', 'cor'];
const N_END = ['don', 'mir', 'ax', 'elle', 'oss', 'ek', 'ar', 'ouille', 'az',
  'ic', 'o', 'us', 'on', 'ette', 'or', 'um', 'yx', 'eau', 'ard', 'ine'];

const TYPE_PREFIX = {
  FEU:      ['Pyro', 'Brasi', 'Flam', 'Volca'],
  EAU:      ['Aqua', 'Hydro', 'Mari', 'Onda'],
  PLANTE:   ['Flor', 'Sylva', 'Verdo', 'Boto'],
  ELECTRIK: ['Volt', 'Élek', 'Stati', 'Fulgu'],
  GLACE:    ['Cryo', 'Givro', 'Polar', 'Frimo'],
  ROCHE:    ['Litho', 'Roco', 'Grani', 'Séismo'],
  SPECTRE:  ['Spectro', 'Ombro', 'Fanto', 'Nocti'],
  VOL:      ['Aéro', 'Plumo', 'Zéphy', 'Nimbo'],
  TOXIK:    ['Toxi', 'Véno', 'Viro', 'Puro'],
  NORMAL:   ['Como', 'Campa', 'Roussi', 'Marca'],
};

// Noms d'une chaîne d'évolution : préfixe commun, terminaisons distinctes,
// le dernier stade gagne une syllabe médiane (nom plus long = plus imposant).
function genChainNames(rng, type, chainLen, used) {
  for (let tries = 0; tries < 50; tries++) {
    let prefix;
    if (rng.chance(0.5)) prefix = rng.pick(TYPE_PREFIX[type]);
    else {
      prefix = rng.pick(N_START);
      if (rng.chance(0.4)) prefix += rng.pick(N_MID);
    }
    const ends = [];
    while (ends.length < chainLen) {
      const e = rng.pick(N_END);
      if (!ends.includes(e)) ends.push(e);
    }
    const names = [];
    for (let s = 0; s < chainLen; s++) {
      names.push(prefix + (s === 2 ? rng.pick(N_MID) : '') + ends[s]);
    }
    if (names.every(n => !used.has(n))) {
      names.forEach(n => used.add(n));
      return names;
    }
  }
  const fallback = [];
  for (let s = 0; s < chainLen; s++) fallback.push('Mysto' + rng.int(100, 999));
  fallback.forEach(n => used.add(n));
  return fallback;
}

const MOVE_NOUN = {
  NORMAL:   ['Charge', 'Plaquage', 'Griffe', 'Ruade', 'Frappe'],
  FEU:      ['Flamme', 'Brasier', 'Fournaise', 'Flammèche', 'Pyro-Choc'],
  EAU:      ['Vague', 'Torrent', 'Geyser', 'Écume', 'Hydro-Jet'],
  PLANTE:   ['Feuille', 'Liane', 'Racine', 'Spore', 'Pétale'],
  ELECTRIK: ['Éclair', 'Foudre', 'Étincelle', 'Volt', 'Orage'],
  GLACE:    ['Givre', 'Blizzard', 'Stalactite', 'Flocon', 'Verglas'],
  ROCHE:    ['Rocher', 'Éboulis', 'Séisme', 'Galet', 'Avalanche'],
  SPECTRE:  ['Ombre', 'Hantise', 'Cauchemar', 'Spectre', 'Malédiction'],
  VOL:      ['Rafale', 'Cyclone', 'Piqué', 'Bourrasque', 'Plume'],
  TOXIK:    ['Venin', 'Toxine', 'Bave', 'Dard', 'Miasme'],
};
// Adjectifs épicènes uniquement (accord valable quel que soit le genre du nom)
const MOVE_ADJ = ['Rapide', 'Féroce', 'Ultime', 'Mystique', 'Sauvage', 'Sombre',
  'Double', 'Suprême', 'Étrange', 'Sinistre', 'Titanesque'];

function genMoveName(rng, type) {
  const n = rng.pick(MOVE_NOUN[type]);
  return rng.chance(0.6) ? n + ' ' + rng.pick(MOVE_ADJ) : n;
}

const TRAINER_TITLES = ['Gamin', 'Gamine', 'Randonneur', 'Randonneuse', 'Campeur',
  'Campeuse', 'Scout', 'Pêcheur', 'Astronome', 'As du Dex'];
const TRAINER_NAMES = ['Léo', 'Mia', 'Hugo', 'Jade', 'Noa', 'Lina', 'Tom', 'Zoé',
  'Max', 'Iris', 'Théo', 'Emma', 'Lucas', 'Rose', 'Nino', 'Alba'];
