// E2E : sert le jeu en statique, le pilote dans Chrome headless et capture des écrans.
// Usage : node tests/e2e/drive.js
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer-core');

const ROOT = path.join(__dirname, '..', '..');
const SHOTS = path.join(__dirname, 'shots');
const MIME = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript' };
const sleep = ms => new Promise(r => setTimeout(r, ms));

const errors = [];

async function waitFor(page, fn, timeout, label) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeout) {
    if (await page.evaluate(fn)) return;
    await sleep(250);
  }
  const dbg = await page.evaluate(() => ({
    state: window.game && window.game.state,
    busy: window.game && window.game.battle && window.game.battle.busy,
    msg: document.getElementById('bmsg').textContent,
    actions: document.getElementById('bactions').className,
    team: document.getElementById('team').className,
    battle: document.getElementById('battle').className,
  })).catch(() => null);
  throw new Error('timeout en attendant: ' + label + ' — état: ' + JSON.stringify(dbg) +
    (errors.length ? '\nerreurs page: ' + errors.join(' | ') : ''));
}

async function main() {
  fs.mkdirSync(SHOTS, { recursive: true });
  const server = http.createServer((req, res) => {
    const file = path.join(ROOT, req.url === '/' ? 'index.html' : req.url.split('?')[0]);
    fs.readFile(file, (err, data) => {
      if (err) { res.writeHead(404); res.end('not found'); return; }
      res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
      res.end(data);
    });
  }).listen(8765);

  const browser = await puppeteer.launch({
    executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    headless: true,
    args: ['--window-size=900,900'],
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 900, height: 860 });
  page.on('console', m => {
    if (m.type() === 'error') errors.push('console: ' + m.text() + ' @ ' + (m.location().url || '?'));
  });
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));

  const fail = msg => { throw new Error(msg); };

  // 1. Chargement + écran titre
  await page.goto('http://localhost:8765/', { waitUntil: 'networkidle0' });
  await sleep(400);
  const startVisible = await page.$eval('#start', el => !el.classList.contains('hidden'));
  if (!startVisible) fail('écran titre absent');
  await page.screenshot({ path: path.join(SHOTS, '1-start.png') });
  console.log('STEP 1 OK: écran titre affiché');

  // 2. Nouvelle partie (emplacement 1) -> 3 starters avec sprites canvas
  const slotCount = await page.evaluate(() => document.querySelectorAll('#slots .slotcard').length);
  if (slotCount !== 3) fail('3 emplacements attendus, trouvé ' + slotCount);
  await page.click('.slotcard .slot-new');
  await sleep(600);
  const starters = await page.evaluate(() => {
    const cards = [...document.querySelectorAll('#starterCards .scard')];
    return cards.map(c => ({
      name: c.querySelector('.sname').textContent,
      hasSprite: !!c.querySelector('canvas'),
      spritePx: c.querySelector('canvas') ? c.querySelector('canvas').width : 0,
    }));
  });
  if (starters.length !== 3 || !starters.every(s => s.hasSprite && s.spritePx > 0)) {
    fail('starters invalides: ' + JSON.stringify(starters));
  }
  await page.screenshot({ path: path.join(SHOTS, '2-starters.png') });
  console.log('STEP 2 OK: starters =', starters.map(s => s.name).join(', '));

  // 3. Choisir le premier -> monde visible, équipe de 1
  await page.click('#starterCards .scard');
  await sleep(500);
  const world = await page.evaluate(() => ({
    state: window.game.state,
    team: window.game.team.length,
    starterHidden: document.getElementById('starter').classList.contains('hidden'),
    pos: { x: window.game.player.x, y: window.game.player.y },
  }));
  if (world.state !== 'world' || world.team !== 1 || !world.starterHidden) {
    fail('entrée dans le monde ratée: ' + JSON.stringify(world));
  }
  await page.screenshot({ path: path.join(SHOTS, '3-overworld.png') });
  console.log('STEP 3 OK: monde affiché, position', JSON.stringify(world.pos));

  // 4. Sonde : déplacement clavier (flèches + ZQSD)
  await page.keyboard.down('ArrowRight'); await sleep(450); await page.keyboard.up('ArrowRight');
  await page.keyboard.down('z'); await sleep(450); await page.keyboard.up('z');
  await sleep(300);
  const pos2 = await page.evaluate(() => ({ x: window.game.player.x, y: window.game.player.y }));
  if (pos2.x === world.pos.x && pos2.y === world.pos.y) fail('le joueur ne bouge pas');
  console.log('PROBE 4 OK: déplacement', JSON.stringify(world.pos), '->', JSON.stringify(pos2));

  // 5. Sonde : menus Équipe (E) et Procédex (P), fermeture Échap
  await page.keyboard.press('e'); await sleep(300);
  const teamCards = await page.evaluate(() => document.querySelectorAll('#teamList .ccard').length);
  await page.keyboard.press('Escape'); await sleep(200);
  await page.keyboard.press('p'); await sleep(400);
  const dexCells = await page.evaluate(() => document.querySelectorAll('#dexGrid .dcell').length);
  await page.screenshot({ path: path.join(SHOTS, '4-dex.png') });
  await page.keyboard.press('Escape'); await sleep(200);
  const backToWorld = await page.evaluate(() => window.game.state);
  if (teamCards !== 1 || dexCells < 100 || backToWorld !== 'world') {
    fail(`menus: team=${teamCards} dex=${dexCells} state=${backToWorld}`);
  }
  console.log(`PROBE 5 OK: équipe=${teamCards} carte(s), dex=${dexCells} cases`);

  // 6. Combat : marcher dans les hautes herbes (rencontre forcée via Math.random)
  await page.evaluate(() => {
    const g = window.game, s = g.world.spawn;
    // la haute herbe la plus proche du spawn => créature sauvage de bas niveau
    let best = null, bestDist = 1e9;
    for (let y = 1; y < g.world.h - 1; y++)
      for (let x = 1; x < g.world.w - 1; x++)
        if (g.world.get(x, y) === 3 && !g.world.isSolid(x - 1, y) && !g.trainerAt(x - 1, y)) {
          const d = Math.hypot(x - s.x, y - s.y);
          if (d < bestDist) { bestDist = d; best = { x, y }; }
        }
    g.player.x = best.x - 1; g.player.y = best.y;
    g.player.px = g.player.x * 32; g.player.py = g.player.y * 32;
    window.__grassSpot = best;
    window.__origRandom = Math.random;
    Math.random = () => 0.01;
  });
  await page.keyboard.down('ArrowRight'); await sleep(300); await page.keyboard.up('ArrowRight');
  await page.waitForSelector('#battle:not(.hidden)', { timeout: 5000 });
  await page.evaluate(() => { Math.random = window.__origRandom; });
  await sleep(2600); // messages d'intro
  const battleUi = await page.evaluate(() => ({
    enemy: document.getElementById('eName').textContent,
    actionsVisible: !document.getElementById('bactions').classList.contains('hidden'),
    enemySprite: !!document.querySelector('#enemySpot canvas'),
    allySprite: !!document.querySelector('#allySpot canvas'),
  }));
  if (!battleUi.actionsVisible || !battleUi.enemySprite || !battleUi.allySprite) {
    fail('UI combat: ' + JSON.stringify(battleUi));
  }
  console.log('STEP 6 OK: combat contre', battleUi.enemy);

  // 7. Attaquer, observer les dégâts, puis fuir
  await page.click('[data-act=fight]');
  await sleep(300);
  await page.screenshot({ path: path.join(SHOTS, '5-battle-moves.png') });
  await page.click('#bmoves .movebtn');
  // attendre que des dégâts soient visibles dans un sens ou dans l'autre
  let hp = null;
  for (let i = 0; i < 14; i++) {
    await sleep(1000);
    hp = await page.evaluate(() => ({
      enemyHp: window.game.battle.enemy.hp, enemyMax: window.game.battle.enemy.hpMax,
      allyHp: window.game.battle.ally.hp, allyMax: window.game.battle.ally.hpMax,
      msg: document.getElementById('bmsg').textContent,
    }));
    if (hp.enemyHp < hp.enemyMax || hp.allyHp < hp.allyMax) break;
  }
  await page.screenshot({ path: path.join(SHOTS, '6-battle.png') });
  if (hp.enemyHp >= hp.enemyMax && hp.allyHp >= hp.allyMax) {
    fail('aucun dégât après 14s: ' + JSON.stringify(hp));
  }
  console.log(`STEP 7 OK: dégâts (ennemi ${hp.enemyHp}/${hp.enemyMax}, allié ${hp.allyHp}/${hp.allyMax}) — "${hp.msg}"`);

  // 7b. Sac -> Capsule : capture garantie (Math.random forcé bas)
  await waitFor(page, () => !window.game.battle.busy &&
    !document.getElementById('bactions').classList.contains('hidden'), 15000, 'menu d actions');
  await page.evaluate(() => { window.__origRandom = Math.random; Math.random = () => 0.01; });
  await page.click('[data-act=bag]');
  await sleep(300);
  const bagButtons = await page.evaluate(() =>
    [...document.querySelectorAll('#bbag button')].map(b => b.textContent));
  if (bagButtons.length !== 3 || !bagButtons[0].includes('Capsule') || !bagButtons[1].includes('Potion')) {
    fail('sac invalide: ' + JSON.stringify(bagButtons));
  }
  await page.screenshot({ path: path.join(SHOTS, '7-bag.png') });
  await page.click('#bbag button');
  await waitFor(page, () => window.game.state === 'world', 15000, 'fin de combat après capture');
  await page.evaluate(() => { Math.random = window.__origRandom; });
  const afterCapture = await page.evaluate(() => ({
    team: window.game.team.length,
    caught: window.game.caught.size,
  }));
  if (afterCapture.team !== 2 || afterCapture.caught < 2) {
    fail('capture ratée: ' + JSON.stringify(afterCapture));
  }
  console.log('STEP 7b OK: capture via le Sac, équipe =', afterCapture.team);

  // 7b2. Sonde : la capture a donné de l'EXP (x2) au reste de l'équipe,
  // mais pas à la recrue elle-même
  const xp = await page.evaluate(() => ({
    starterExp: window.game.team[0].exp,
    starterLevel: window.game.team[0].level,
    capturedExp: window.game.team[1].exp,
    capturedLevel: window.game.team[1].level,
  }));
  if (xp.starterExp <= Math.pow(5, 3)) fail('le starter n\'a pas reçu d\'EXP de capture: ' + JSON.stringify(xp));
  if (xp.capturedExp !== Math.pow(xp.capturedLevel, 3)) fail('la recrue a reçu sa propre EXP de capture: ' + JSON.stringify(xp));
  console.log(`PROBE 7b2 OK: EXP de capture distribuée (starter ${xp.starterExp} EXP, N.${xp.starterLevel})`);

  // 7b3. Sonde : choix forcé d'une autre créature quand l'active tombe K.O.
  await page.evaluate(() => {
    const g = window.game, b = window.__grassSpot;
    g.player.x = b.x - 1; g.player.y = b.y;
    g.player.px = g.player.x * 32; g.player.py = g.player.y * 32;
    const ally = g.team.find(c => c.hp > 0);
    ally.hp = 1;
    ally.spd = 1; // l'ennemi frappera en premier
    window.__origRandom2 = Math.random;
    Math.random = () => 0.01; // rencontre garantie, attaques qui touchent
  });
  await page.keyboard.down('ArrowRight'); await sleep(300); await page.keyboard.up('ArrowRight');
  await page.waitForSelector('#battle:not(.hidden)', { timeout: 5000 });
  await waitFor(page, () => !window.game.battle.busy &&
    !document.getElementById('bactions').classList.contains('hidden'), 15000, 'menu avant K.O.');
  await page.click('[data-act=fight]');
  await sleep(300);
  await page.click('#bmoves .movebtn');
  await waitFor(page, () => !document.getElementById('team').classList.contains('hidden'),
    20000, 'écran de choix forcé');
  const forced = await page.evaluate(() => ({
    title: document.getElementById('teamTitle').textContent,
    closeHidden: document.getElementById('teamClose').style.display === 'none',
    selectable: document.querySelectorAll('#teamList .ccard.selectable').length,
    ko: document.querySelectorAll('#teamList .ccard.ko').length,
  }));
  if (!forced.title.includes('Choisissez') || !forced.closeHidden || forced.selectable < 1 || forced.ko < 1) {
    fail('choix forcé invalide: ' + JSON.stringify(forced));
  }
  await page.screenshot({ path: path.join(SHOTS, '13-forced-switch.png') });
  await page.click('#teamList .ccard.selectable');
  await waitFor(page, () => !window.game.battle.busy &&
    !document.getElementById('bactions').classList.contains('hidden'), 15000, 'reprise après choix forcé');
  await page.click('[data-act=run]');
  await waitFor(page, () => window.game.state === 'world', 15000, 'fuite après choix forcé');
  await page.evaluate(() => { Math.random = window.__origRandom2; });
  console.log(`PROBE 7b3 OK: K.O. → choix forcé (${forced.selectable} sélectionnable, fermeture masquée), combat repris puis fui`);

  // 7c. Combat de dresseur : se placer en ligne de vue, vérifier fuite/capture interdites
  const trainerSetup = await page.evaluate(() => {
    const g = window.game;
    for (const tr of g.world.trainers) {
      if (g.beaten.has(tr.id)) continue;
      for (const dy of [3, -3]) {
        const py = tr.y + dy, step = dy > 0 ? py - 1 : py + 1;
        if (!g.world.isSolid(tr.x, py) && !g.world.isSolid(tr.x, step) &&
            g.world.get(tr.x, py) !== 3 && g.world.get(tr.x, step) !== 3 &&
            !g.trainerAt(tr.x, py) && !g.trainerAt(tr.x, step)) {
          g.player.x = tr.x; g.player.y = py;
          g.player.px = tr.x * 32; g.player.py = py * 32;
          return { nom: tr.nom, dir: dy > 0 ? 'ArrowUp' : 'ArrowDown', creatures: tr.team.length };
        }
      }
    }
    return null;
  });
  if (!trainerSetup) {
    console.log('STEP 7c SKIP: aucun dresseur accessible en ligne droite sur cette graine');
  } else {
    await page.keyboard.down(trainerSetup.dir); await sleep(300); await page.keyboard.up(trainerSetup.dir);
    await page.waitForSelector('#battle:not(.hidden)', { timeout: 5000 });
    await waitFor(page, () => !window.game.battle.busy &&
      !document.getElementById('bactions').classList.contains('hidden'), 15000, 'menu combat dresseur');
    await page.screenshot({ path: path.join(SHOTS, '8-trainer.png') });
    await page.click('[data-act=run]');
    await sleep(1300);
    const runMsg = await page.$eval('#bmsg', el => el.textContent);
    if (!runMsg.includes('ne fuit pas')) fail('fuite non bloquée face au dresseur: ' + runMsg);
    await page.click('[data-act=bag]'); await sleep(200);
    await page.click('#bbag button'); await sleep(1300);
    const capMsg = await page.$eval('#bmsg', el => el.textContent);
    if (!capMsg.includes('ne capture pas')) fail('capture non bloquée face au dresseur: ' + capMsg);
    console.log(`STEP 7c OK: combat contre ${trainerSetup.nom} (${trainerSetup.creatures} créature(s)), fuite et capture refusées`);
    await page.evaluate(() => window.game.endBattle()); // abrège le combat pour la suite
    await sleep(300);
  }

  // 7d. Sonde : cycle jour/nuit (horloge décalée vers la nuit)
  await page.evaluate(() => {
    window.__realNow = Date.now;
    const cyclePos = (window.__realNow() / 1000) % 300;
    const offset = (0.75 * 300 - cyclePos) * 1000;
    Date.now = () => window.__realNow() + offset;
  });
  await sleep(700);
  const night = await page.evaluate(() => ({
    phase: window.game.dayPhase(),
    hud: document.getElementById('hudTime').textContent,
    alpha: window.game.nightAlpha(),
  }));
  if (night.phase !== 'Nuit' || !night.hud.includes('Nuit') || night.alpha < 0.4) {
    fail('nuit non appliquée: ' + JSON.stringify(night));
  }
  await page.screenshot({ path: path.join(SHOTS, '10-night.png') });
  await page.evaluate(() => { Date.now = window.__realNow; });
  console.log('PROBE 7d OK: phase Nuit, teinte appliquée (alpha', night.alpha.toFixed(2) + ')');

  // 7e. Sonde : le sanctuaire repousse tant que le boss n'est pas battu
  await page.evaluate(() => {
    const g = window.game, s = g.world.shrine;
    g.player.x = s.x - 1; g.player.y = s.y;
    g.player.px = g.player.x * 32; g.player.py = g.player.y * 32;
  });
  await page.keyboard.down('ArrowRight'); await sleep(300); await page.keyboard.up('ArrowRight');
  await sleep(400);
  const shrineToast = await page.$eval('#toast', el => el.textContent);
  if (!shrineToast.includes('force ancienne')) fail('sanctuaire non protégé: ' + shrineToast);
  console.log('PROBE 7e OK: sanctuaire verrouillé —', JSON.stringify(shrineToast));

  // 7f. Combat du boss : entrer dans l'arène par le sud
  await page.evaluate(() => {
    const g = window.game, a = g.world.arena;
    g.player.x = a.x; g.player.y = a.y + 3;
    g.player.px = g.player.x * 32; g.player.py = g.player.y * 32;
  });
  await page.keyboard.down('ArrowUp'); await sleep(300); await page.keyboard.up('ArrowUp');
  await page.waitForSelector('#battle:not(.hidden)', { timeout: 5000 });
  await waitFor(page, () => !window.game.battle.busy &&
    !document.getElementById('bactions').classList.contains('hidden'), 15000, 'menu combat boss');
  const bossInfo = await page.evaluate(() => ({
    boss: window.game.battle.trainer && window.game.battle.trainer.boss === true,
    nom: window.game.battle.trainer ? window.game.battle.trainer.nom : null,
    enemyLevel: window.game.battle.enemy.level,
    opponents: window.game.battle.opponents.length,
  }));
  if (!bossInfo.boss || !/^Maître|^Maîtresse/.test(bossInfo.nom) || bossInfo.opponents !== 3 || bossInfo.enemyLevel < 36) {
    fail('combat de boss invalide: ' + JSON.stringify(bossInfo));
  }
  await page.screenshot({ path: path.join(SHOTS, '11-boss.png') });
  console.log(`STEP 7f OK: défi de ${bossInfo.nom} (3 créatures, N.${bossInfo.enemyLevel})`);
  await page.evaluate(() => window.game.endBattle());
  await sleep(300);

  // 8. Sonde : persistance — recharger et Continuer (emplacement 1)
  await page.reload({ waitUntil: 'networkidle0' });
  await sleep(400);
  const slotInfo = await page.evaluate(() =>
    document.querySelector('#slots .slotcard .slotinfo').textContent);
  if (!slotInfo.includes('Monde')) fail('emplacement 1 vide après sauvegarde: ' + slotInfo);
  await page.click('.slot-continue');
  await sleep(500);
  const resumed = await page.evaluate(() => ({
    state: window.game.state,
    team: window.game.team.length,
    seed: window.game.seedStr,
  }));
  if (resumed.state !== 'world' || resumed.team < 1) fail('reprise ratée: ' + JSON.stringify(resumed));
  console.log('PROBE 8 OK: sauvegarde rechargée, graine', resumed.seed);

  // 9. Sonde : export / import entre emplacements (via les boîtes de dialogue)
  await page.reload({ waitUntil: 'networkidle0' });
  await sleep(400);
  await page.evaluate(() => {
    navigator.clipboard.writeText = () => Promise.reject(new Error('refusé'));
  });
  let exportCode = null;
  page.once('dialog', async d => { exportCode = d.defaultValue(); await d.dismiss(); });
  await page.click('.slot-export');
  await sleep(500);
  if (!exportCode || exportCode.length < 50) fail('code exporté invalide');
  page.once('dialog', async d => { await d.accept(exportCode); });
  const importBtns = await page.$$('.slot-import');
  await importBtns[0].click(); // premier emplacement vide (slot 2)
  await sleep(500);
  const imported = await page.evaluate(() => {
    const d = JSON.parse(localStorage.getItem('procemon-save-2'));
    return d ? { seed: d.seed, team: d.team.length } : null;
  });
  if (!imported || imported.seed !== resumed.seed) fail('import raté: ' + JSON.stringify(imported));
  await page.screenshot({ path: path.join(SHOTS, '12-slots.png') });
  console.log('PROBE 9 OK: export/import — emplacement 2 =', JSON.stringify(imported));

  await browser.close();
  server.close();

  const realErrors = errors.filter(e => !e.includes('favicon'));
  if (realErrors.length) {
    console.log('ERREURS CONSOLE:\n' + realErrors.join('\n'));
    process.exit(1);
  }
  console.log('AUCUNE ERREUR CONSOLE');
  console.log('E2E OK');
}

main().catch(e => { console.error('E2E FAIL:', e.message); process.exit(1); });
