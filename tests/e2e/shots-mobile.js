// Captures mobiles : sert le jeu, l'ouvre en émulation smartphone (portrait + paysage),
// vérifie le déplacement par glissement tactile, et enregistre des captures dans shots/.
// Usage : node tests/e2e/shots-mobile.js
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer-core');

const ROOT = path.join(__dirname, '..', '..');
const SHOTS = path.join(__dirname, 'shots');
const MIME = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript' };
const sleep = ms => new Promise(r => setTimeout(r, ms));

const PROFILES = [
  { label: 'portrait', width: 390, height: 844 },
  { label: 'paysage', width: 844, height: 390 },
];

async function waitFor(page, fn, timeout, label) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeout) {
    if (await page.evaluate(fn)) return;
    await sleep(150);
  }
  throw new Error('timeout: ' + label);
}

// Glissement maintenu via CDP (puppeteer 13 n'expose pas touchMove).
async function touchDrag(client, fromX, fromY, toX, toY) {
  await client.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: fromX, y: fromY }] });
  const steps = 6;
  for (let i = 1; i <= steps; i++) {
    const x = fromX + (toX - fromX) * i / steps;
    const y = fromY + (toY - fromY) * i / steps;
    await client.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y }] });
    await sleep(40);
  }
  await sleep(600); // maintien : la boucle de jeu continue d'avancer dans la direction
  await client.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
}

async function runProfile(browser, base, prof) {
  const context = await browser.createIncognitoBrowserContext();
  const page = await context.newPage();
  const errors = [];
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', e => errors.push(e.message));
  await page.setViewport({
    width: prof.width, height: prof.height,
    deviceScaleFactor: 2, isMobile: true, hasTouch: true,
  });

  await page.goto(base, { waitUntil: 'networkidle0' });
  await sleep(400);
  await page.screenshot({ path: path.join(SHOTS, `m-${prof.label}-1-start.png`) });

  // Nouvelle partie -> starters -> monde
  await page.click('.slotcard .slot-new');
  await waitFor(page, () => document.querySelectorAll('#starterCards .scard').length === 3, 4000, 'starters');
  await page.screenshot({ path: path.join(SHOTS, `m-${prof.label}-2-starters.png`) });
  await page.click('#starterCards .scard');
  await waitFor(page, () => window.game && window.game.state === 'world', 4000, 'monde');
  await page.screenshot({ path: path.join(SHOTS, `m-${prof.label}-3-overworld.png`) });

  // Menu Équipe (avant de bouger, pour éviter une rencontre). On tente un vrai
  // tap ; en émulation headless la synthèse du clic est parfois capricieuse, on
  // se rabat alors sur un click direct — le rendu capturé est identique.
  await page.tap('#btnTeam');
  await sleep(300);
  if (await page.evaluate(() => window.game.state !== 'menu')) {
    await page.evaluate(() => document.getElementById('btnTeam').click());
  }
  await waitFor(page, () => window.game.state === 'menu', 2000, 'équipe');
  await page.screenshot({ path: path.join(SHOTS, `m-${prof.label}-4-team.png`) });
  await page.evaluate(() => document.getElementById('teamClose').click());
  await waitFor(page, () => window.game.state === 'world', 2000, 'retour monde');

  // Déplacement par glissement tactile sur la carte
  const client = await page.target().createCDPSession();
  const rect = await page.$eval('#map', el => {
    const r = el.getBoundingClientRect();
    return { x: r.x, y: r.y, w: r.width, h: r.height };
  });
  const cx = rect.x + rect.w / 2, cy = rect.y + rect.h / 2;
  const before = await page.evaluate(() => ({ x: window.game.player.x, y: window.game.player.y }));
  await touchDrag(client, cx, cy, cx + Math.min(90, rect.w / 3), cy); // glisse vers la droite
  await sleep(200);
  const after = await page.evaluate(() => ({ x: window.game.player.x, y: window.game.player.y }));
  const moved = after.x !== before.x || after.y !== before.y;

  // Mesure du débordement éventuel
  const overflow = await page.evaluate(() => ({
    docW: document.documentElement.scrollWidth,
    docH: document.documentElement.scrollHeight,
    winW: window.innerWidth,
    winH: window.innerHeight,
  }));

  await context.close();
  return { moved, before, after, overflow, errors };
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
  }).listen(8766);

  const browser = await puppeteer.launch({
    executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    headless: true,
    args: ['--window-size=900,900'],
  });

  let failed = false;
  for (const prof of PROFILES) {
    const r = await runProfile(browser, 'http://localhost:8766/', prof);
    const hOver = r.overflow.docW > r.overflow.winW + 1;
    const vOver = r.overflow.docH > r.overflow.winH + 1;
    console.log(`\n[${prof.label}] ${prof.width}x${prof.height}`);
    console.log(`  déplacement glissement : ${r.moved ? 'OK' : 'ÉCHEC'} (${JSON.stringify(r.before)} -> ${JSON.stringify(r.after)})`);
    console.log(`  débordement H : ${hOver ? 'OUI ('+r.overflow.docW+'>'+r.overflow.winW+')' : 'non'} · V : ${vOver ? 'OUI ('+r.overflow.docH+'>'+r.overflow.winH+')' : 'non'}`);
    console.log(`  erreurs console : ${r.errors.length ? r.errors.join(' | ') : 'aucune'}`);
    if (!r.moved || hOver || vOver || r.errors.length) failed = true;
  }

  await browser.close();
  server.close();
  console.log('\nCaptures dans tests/e2e/shots/ (préfixe m-portrait-*, m-paysage-*)');
  if (failed) { console.log('RÉSULTAT : problèmes détectés'); process.exit(1); }
  console.log('RÉSULTAT : OK (déplacement tactile + aucun débordement)');
}

main().catch(e => { console.error(e); process.exit(1); });
