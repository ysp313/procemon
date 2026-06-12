'use strict';

// ---- Types, couleurs et table d'efficacité ----

const TYPES = {
  NORMAL:   { nom: 'Normal',   c: '#a8a290', c2: '#cdc8b8' },
  FEU:      { nom: 'Feu',      c: '#e8633a', c2: '#ffb056' },
  EAU:      { nom: 'Eau',      c: '#4a90d9', c2: '#8fd0ff' },
  PLANTE:   { nom: 'Plante',   c: '#5cab46', c2: '#a8e07a' },
  ELECTRIK: { nom: 'Électrik', c: '#dfc02c', c2: '#fff08a' },
  GLACE:    { nom: 'Glace',    c: '#6fc4c4', c2: '#d2f6f6' },
  ROCHE:    { nom: 'Roche',    c: '#a08c5a', c2: '#d8c894' },
  SPECTRE:  { nom: 'Spectre',  c: '#7b62a3', c2: '#b9a5e0' },
  VOL:      { nom: 'Vol',      c: '#8d9de0', c2: '#d3dafc' },
  TOXIK:    { nom: 'Toxik',    c: '#a4509e', c2: '#e08ad8' },
};
const TYPE_IDS = Object.keys(TYPES);

// CHART[attaquant][défenseur] = multiplicateur (1 si absent)
const CHART = {
  FEU:      { PLANTE: 2, GLACE: 2, EAU: 0.5, ROCHE: 0.5, FEU: 0.5 },
  EAU:      { FEU: 2, ROCHE: 2, EAU: 0.5, PLANTE: 0.5 },
  PLANTE:   { EAU: 2, ROCHE: 2, FEU: 0.5, PLANTE: 0.5, VOL: 0.5, TOXIK: 0.5 },
  ELECTRIK: { EAU: 2, VOL: 2, PLANTE: 0.5, ELECTRIK: 0.5, ROCHE: 0.5 },
  GLACE:    { PLANTE: 2, VOL: 2, FEU: 0.5, EAU: 0.5, GLACE: 0.5 },
  ROCHE:    { FEU: 2, VOL: 2, GLACE: 2, ROCHE: 0.5 },
  SPECTRE:  { SPECTRE: 2, TOXIK: 0.5, NORMAL: 0 },
  NORMAL:   { ROCHE: 0.5, SPECTRE: 0 },
  VOL:      { PLANTE: 2, ELECTRIK: 0.5, ROCHE: 0.5 },
  TOXIK:    { PLANTE: 2, TOXIK: 0.5, ROCHE: 0.5, SPECTRE: 0.5 },
};

function effectiveness(atkType, defTypes) {
  let m = 1;
  const row = CHART[atkType] || {};
  for (const t of defTypes) {
    if (row[t] !== undefined) m *= row[t];
  }
  return m;
}

function typeChips(types) {
  return types.map(t =>
    `<span class="chip" style="background:${TYPES[t].c}">${TYPES[t].nom}</span>`
  ).join('');
}
