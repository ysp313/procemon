// Test de fumée : exécute la génération procédurale hors navigateur.
// Usage : node tests/smoke.js
'use strict';
const fs = require('fs');
const path = require('path');

const files = ['rng', 'data', 'names', 'sprites', 'species', 'world'];
const src = files
  .map(f => fs.readFileSync(path.join(__dirname, '..', 'js', f + '.js'), 'utf8'))
  // retire les directives 'use strict' pour évaluer le tout dans une seule portée
  .join('\n').replace(/^'use strict';$/gm, '');

const test = `
const dex = generateDex('TEST');
if (dex.length < 105) throw new Error('dex trop petit: ' + dex.length);
console.log('Dex:', dex.length, 'espèces');
const sp = dex[0];
console.log('Espèce 0:', sp.nom, sp.types.join('/'), 'stats', JSON.stringify(sp.base), 'attaques', sp.learnset.length);
// chaînes d'évolution cohérentes
for (const s of dex) {
  if (s.evolveTo !== null) {
    const to = dex[s.evolveTo];
    if (!to || to.stage !== s.stage + 1) throw new Error('chaîne incohérente pour ' + s.nom);
  }
}
console.log('Chaînes d évolution: OK');
const c = makeCreature(dex, 0, 7);
console.log('Créature:', c.nom, 'N.' + c.level, 'PV', c.hp + '/' + c.hpMax, '|', c.moves.map(m => m.nom).join(', '));
if (!c.moves.length) throw new Error('créature sans attaque');
// montée de niveau + évolution
const c2 = makeCreature(dex, 0, 5);
c2.exp = expFor(30);
let ups = 0, up;
while ((up = checkLevelUp(dex, c2))) {
  ups++;
  if (up.evolved) evolveCreature(dex, c2);
}
console.log('Level-ups:', ups, '→ N.' + c2.level, 'espèce', dex[c2.speciesId].nom, '(stade ' + dex[c2.speciesId].stage + ')');
// monde
const w = new World('TEST', dex);
console.log('Spawn:', JSON.stringify(w.spawn), 'tuile =', w.get(w.spawn.x, w.spawn.y));
const counts = {};
for (let i = 0; i < w.tiles.length; i++) counts[w.tiles[i]] = (counts[w.tiles[i]] || 0) + 1;
console.log('Tuiles (0=eau 2=herbe 3=hautes herbes 4=arbre):', JSON.stringify(counts));
if (!counts[3]) throw new Error('aucune haute herbe générée');
const enc = w.encounterFor(w.spawn.x + 8, w.spawn.y + 8);
console.log('Rencontre:', enc.nom, 'N.' + enc.level);
// biomes : la faune locale est un pool de types valide
const pool = w.typePool(w.spawn.x, w.spawn.y);
if (!pool.length || !pool.every(t => TYPE_IDS.includes(t))) throw new Error('pool de types invalide');
console.log('Pool de types au spawn:', [...new Set(pool)].join(', '));
// dresseurs
if (w.trainers.length < 10) throw new Error('trop peu de dresseurs: ' + w.trainers.length);
for (const tr of w.trainers) {
  if (Math.hypot(tr.x - w.spawn.x, tr.y - w.spawn.y) < 12) throw new Error('dresseur trop près du spawn');
  if (!tr.team.length || tr.team.some(s => !dex[s.speciesId] || s.level < 1)) throw new Error('équipe de dresseur invalide');
}
console.log('Dresseurs:', w.trainers.length, '— ex:', w.trainers[0].nom,
  '(' + w.trainers[0].team.map(s => dex[s.speciesId].nom + ' N.' + s.level).join(', ') + ')');
// objets au sol : déterministes et présents
let items = 0;
for (let y = 0; y < w.h; y++) for (let x = 0; x < w.w; x++) if (w.itemAt(x, y)) items++;
if (items < 5) throw new Error('trop peu d objets: ' + items);
const w2 = new World('TEST', dex);
let same = true;
for (let y = 0; y < w.h && same; y++) for (let x = 0; x < w.w; x++)
  if (w.itemAt(x, y) !== w2.itemAt(x, y)) { same = false; break; }
if (!same) throw new Error('objets non déterministes');
console.log('Objets au sol:', items, '(déterministes)');
// légendaire : unique, costaud, jamais dans la nature ni chez les dresseurs
const leg = dex.filter(s => s.legendary);
if (leg.length !== 1) throw new Error('légendaires: ' + leg.length);
const lt = leg[0].base.hp + leg[0].base.atk + leg[0].base.def + leg[0].base.spd;
if (lt < 340) throw new Error('légendaire trop faible: ' + lt);
for (let i = 0; i < 300; i++) {
  const e = w.encounterFor(5 + (i * 7) % 86, 5 + (i * 13) % 86, i % 2 === 0);
  if (e.speciesId === leg[0].id) throw new Error('légendaire rencontré en sauvage !');
}
for (const tr of w.trainers)
  if (tr.team.some(s => s.speciesId === leg[0].id)) throw new Error('légendaire chez un dresseur !');
console.log('Légendaire:', leg[0].nom, leg[0].types.join('/'), 'total stats', lt);
// arène : boss, sanctuaire, et accessibilité à pied depuis le spawn (BFS)
const boss = w.trainers.find(t => t.boss);
if (!boss || boss.team.length !== 3 || boss.team.some(s => s.level < 36)) throw new Error('boss invalide');
if (w.get(w.shrine.x, w.shrine.y) !== TILE.SHRINE) throw new Error('sanctuaire absent');
const seen2 = new Set([w.spawn.x + ',' + w.spawn.y]);
const queue = [[w.spawn.x, w.spawn.y]];
let reachable = false;
while (queue.length) {
  const [qx, qy] = queue.shift();
  if (qx === boss.x && qy === boss.y + 1) { reachable = true; break; }
  for (const [ddx, ddy] of [[0, 1], [0, -1], [1, 0], [-1, 0]]) {
    const nx2 = qx + ddx, ny2 = qy + ddy, k = nx2 + ',' + ny2;
    if (!seen2.has(k) && !w.isSolid(nx2, ny2)) { seen2.add(k); queue.push([nx2, ny2]); }
  }
}
if (!reachable) throw new Error('arène inaccessible à pied depuis le spawn');
console.log('Arène:', JSON.stringify(w.arena), '— boss', boss.nom,
  '(' + boss.team.map(s => dex[s.speciesId].nom + ' N.' + s.level).join(', ') + ') — accessible: OK');
// nuit : le pool nocturne est élargi (spectres)
const dayPool = w.typePool(w.spawn.x, w.spawn.y, false);
const nightPool = w.typePool(w.spawn.x, w.spawn.y, true);
if (nightPool.length <= dayPool.length) throw new Error('pool nocturne non élargi');
console.log('Pool nuit:', nightPool.filter(t => t === 'SPECTRE').length, 'entrées SPECTRE (jour:',
  dayPool.filter(t => t === 'SPECTRE').length + ')');
// sprites (données pures, sans DOM)
for (let s = 0; s < 40; s++) {
  const d = genSpriteData(s * 1234 + 5, [12, 16, 20][s % 3]);
  if (!d || !d.grid || !d.eyes) throw new Error('échec sprite ' + s);
}
console.log('Sprites: 40/40 OK');
// déterminisme
const dex2 = generateDex('TEST');
if (JSON.stringify(dex2[50]) !== JSON.stringify(dex[50])) throw new Error('génération non déterministe');
console.log('Déterminisme: OK');
console.log('SMOKE OK');
`;

eval(src + '\n' + test);
