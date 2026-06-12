'use strict';

// ---- Boucle principale, monde, menus, sauvegarde ----

const TS = 32;
const DIRKEYS = {
  ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right',
  z: 'up', w: 'up', s: 'down', q: 'left', a: 'left', d: 'right',
};
const DIRVEC = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };
const SAVE_PREFIX = 'procemon-save-';
const DAY_CYCLE = 300; // secondes par cycle jour/nuit

function hpClass(c) {
  const pct = 100 * c.hp / c.hpMax;
  return pct > 50 ? 'hp-g' : pct > 20 ? 'hp-o' : 'hp-r';
}

class Game {
  constructor() {
    this.canvas = document.getElementById('map');
    this.ctx = document.getElementById('map').getContext('2d');
    this.spriteCache = new Map();
    this.keysDown = [];
    this.state = 'start'; // start | world | menu | battle | battle-team
    this.teamMode = 'view';
    this.slot = 1;
    this.stepCount = 0;
    this.toastTimer = null;
    // migration de l'ancienne sauvegarde unique vers l'emplacement 1
    const old = localStorage.getItem('procemon-save');
    if (old && !localStorage.getItem(SAVE_PREFIX + '1')) {
      localStorage.setItem(SAVE_PREFIX + '1', old);
      localStorage.removeItem('procemon-save');
    }
    this.bindUI();
    this.bindKeys();
    requestAnimationFrame(t => this.loop(t));
  }

  // ---------- UI / entrées ----------

  bindUI() {
    const seedInput = document.getElementById('seedInput');
    seedInput.value = this.randomSeed();
    this.renderSlots();
    document.getElementById('btnTeam').onclick = () => { if (this.state === 'world') this.openTeam('view'); };
    document.getElementById('btnDex').onclick = () => { if (this.state === 'world') this.openDex(); };
    document.getElementById('teamClose').onclick = () => this.closeMenus();
    document.getElementById('dexClose').onclick = () => this.closeMenus();
  }

  randomSeed() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let s = '';
    for (let i = 0; i < 6; i++) s += chars[Math.floor(Math.random() * chars.length)];
    return s;
  }

  // ---------- Emplacements de sauvegarde ----------

  slotKey(i) { return SAVE_PREFIX + i; }

  slotData(i) {
    try { return JSON.parse(localStorage.getItem(this.slotKey(i))) || null; }
    catch (e) { return null; }
  }

  renderSlots() {
    const wrap = document.getElementById('slots');
    wrap.innerHTML = '';
    for (let i = 1; i <= 3; i++) {
      const d = this.slotData(i);
      const card = document.createElement('div');
      card.className = 'slotcard';
      const info = document.createElement('div');
      info.className = 'slotinfo';
      if (d) {
        const extras = [];
        if ((d.beaten || []).length) extras.push(`${d.beaten.length} dresseur(s) battu(s)`);
        info.innerHTML = `<b>Emplacement ${i}</b> — Monde ${d.seed}<br>
          <small>Équipe de ${d.team.length} · ${(d.caught || []).length} capturés${extras.length ? ' · ' + extras.join(' · ') : ''}</small>`;
      } else {
        info.innerHTML = `<b>Emplacement ${i}</b> — vide`;
      }
      card.appendChild(info);
      const btns = document.createElement('div');
      btns.className = 'slotbtns';
      const mkBtn = (label, cls, fn) => {
        const b = document.createElement('button');
        b.textContent = label;
        b.className = cls;
        b.onclick = fn;
        btns.appendChild(b);
      };
      if (d) {
        mkBtn('Continuer', 'slot-continue', () => this.load(i));
        mkBtn('Exporter', 'slot-export', () => this.exportSlot(i));
        mkBtn('✕', 'slot-delete', () => {
          if (confirm(`Supprimer la sauvegarde de l'emplacement ${i} ?`)) {
            localStorage.removeItem(this.slotKey(i));
            this.renderSlots();
          }
        });
      } else {
        mkBtn('Nouvelle partie', 'slot-new', () => {
          const seed = document.getElementById('seedInput').value.trim().toUpperCase() || this.randomSeed();
          this.newGame(seed, i);
        });
        mkBtn('Importer', 'slot-import', () => this.importSlot(i));
      }
      card.appendChild(btns);
      wrap.appendChild(card);
    }
  }

  exportSlot(i) {
    const raw = localStorage.getItem(this.slotKey(i));
    if (!raw) return null;
    const code = btoa(unescape(encodeURIComponent(raw)));
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(code)
        .then(() => this.toast('Code de sauvegarde copié dans le presse-papiers !'))
        .catch(() => window.prompt('Copiez ce code de sauvegarde :', code));
    } else {
      window.prompt('Copiez ce code de sauvegarde :', code);
    }
    return code;
  }

  importSlot(i) {
    const code = window.prompt(`Collez le code de sauvegarde pour l'emplacement ${i} :`);
    if (!code) return;
    try {
      const json = decodeURIComponent(escape(atob(code.trim())));
      const d = JSON.parse(json);
      if (!d.seed || !Array.isArray(d.team) || !d.team.length) throw new Error('format');
      localStorage.setItem(this.slotKey(i), json);
      this.renderSlots();
      this.toast('Sauvegarde importée !');
    } catch (e) {
      this.toast('Code de sauvegarde invalide.');
    }
  }

  bindKeys() {
    document.addEventListener('pointerdown', () => Sfx.ensure());
    document.addEventListener('keydown', e => {
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' '].includes(e.key)) e.preventDefault();
      Sfx.ensure();
      if (e.key.toLowerCase() === 'm' && !e.repeat) {
        Sfx.muted = !Sfx.muted;
        this.toast(Sfx.muted ? 'Son coupé (M pour réactiver)' : 'Son activé');
        return;
      }
      const dir = DIRKEYS[e.key] || DIRKEYS[e.key.toLowerCase()];
      if (this.state === 'world') {
        if (dir && !this.keysDown.includes(dir)) this.keysDown.push(dir);
        const k = e.key.toLowerCase();
        if (k === 'e') this.openTeam('view');
        else if (k === 'p') this.openDex();
      } else if (this.state === 'menu') {
        if (e.key === 'Escape') this.closeMenus();
      } else if (this.state === 'battle-team') {
        if (e.key === 'Escape' && this.teamMode === 'switch') {
          this.hideTeam();
          this.state = 'battle';
          this.battle.showActions();
        }
      }
    });
    document.addEventListener('keyup', e => {
      const dir = DIRKEYS[e.key] || DIRKEYS[e.key.toLowerCase()];
      if (dir) this.keysDown = this.keysDown.filter(d => d !== dir);
    });
    window.addEventListener('blur', () => { this.keysDown = []; });
  }

  // ---------- Nouvelle partie / chargement ----------

  setupWorld(seedStr) {
    this.seedStr = seedStr;
    this.dex = generateDex(seedStr);
    this.world = new World(seedStr, this.dex);
    const s = this.world.spawn;
    this.player = { x: s.x, y: s.y, px: s.x * TS, py: s.y * TS, dir: 'down', moving: false, prog: 0 };
    this.spriteCache.clear();
    this.buildMapCanvas();
    document.getElementById('hudSeed').textContent = seedStr;
  }

  newGame(seedStr, slot) {
    this.slot = slot || 1;
    this.setupWorld(seedStr);
    this.capsules = 15;
    this.potions = 3;
    this.team = [];
    this.box = [];
    this.seen = new Set();
    this.caught = new Set();
    this.pickedItems = new Set();
    this.beaten = new Set();
    this.showStarters();
  }

  showStarters() {
    document.getElementById('start').classList.add('hidden');
    const ov = document.getElementById('starter');
    ov.classList.remove('hidden');
    const wrap = document.getElementById('starterCards');
    wrap.innerHTML = '';
    const picks = [];
    for (const t of ['FEU', 'EAU', 'PLANTE']) {
      const sp = this.dex.find(s => s.stage === 1 && s.chainLen >= 2 && s.types[0] === t && !picks.includes(s));
      if (sp) picks.push(sp);
    }
    for (let i = 0; picks.length < 3 && i < this.dex.length; i++) {
      const sp = this.dex[i];
      if (sp.stage === 1 && !picks.includes(sp)) picks.push(sp);
    }
    for (const sp of picks) {
      const card = document.createElement('div');
      card.className = 'scard';
      card.appendChild(this.spriteFor(sp.id, 6));
      const nm = document.createElement('div');
      nm.className = 'sname';
      nm.textContent = sp.nom;
      card.appendChild(nm);
      const ty = document.createElement('div');
      ty.innerHTML = typeChips(sp.types);
      card.appendChild(ty);
      card.onclick = () => {
        this.team.push(makeCreature(this.dex, sp.id, 5));
        this.seen.add(sp.id);
        this.caught.add(sp.id);
        ov.classList.add('hidden');
        this.state = 'world';
        this.updateHud();
        this.save();
        this.toast(`${sp.nom} rejoint votre équipe ! Explorez les hautes herbes…`);
      };
      wrap.appendChild(card);
    }
  }

  load(slot) {
    try {
      this.slot = slot || 1;
      const d = JSON.parse(localStorage.getItem(this.slotKey(this.slot)));
      this.setupWorld(d.seed);
      this.capsules = d.capsules;
      this.potions = d.potions === undefined ? 3 : d.potions;
      this.team = d.team;
      this.box = d.box;
      this.seen = new Set(d.seen);
      this.caught = new Set(d.caught);
      this.pickedItems = new Set(d.items || []);
      this.beaten = new Set(d.beaten || []);
      this.player.x = d.x;
      this.player.y = d.y;
      this.player.px = d.x * TS;
      this.player.py = d.y * TS;
      document.getElementById('start').classList.add('hidden');
      this.state = 'world';
      this.updateHud();
    } catch (err) {
      console.error(err);
      this.toast('Sauvegarde illisible — lancez une nouvelle partie.');
    }
  }

  save() {
    const d = {
      seed: this.seedStr, x: this.player.x, y: this.player.y,
      capsules: this.capsules, potions: this.potions, team: this.team, box: this.box,
      seen: [...this.seen], caught: [...this.caught],
      items: [...this.pickedItems], beaten: [...this.beaten],
    };
    localStorage.setItem(this.slotKey(this.slot), JSON.stringify(d));
  }

  updateHud() {
    document.getElementById('hudBalls').textContent = this.capsules;
    document.getElementById('hudPotions').textContent = this.potions;
  }

  // ---------- Cycle jour / nuit ----------

  dayT() { return (Date.now() / 1000 % DAY_CYCLE) / DAY_CYCLE; }

  dayPhase() {
    const t = this.dayT();
    return t < 0.55 ? 'Jour' : t < 0.65 ? 'Crépuscule' : t < 0.9 ? 'Nuit' : 'Aube';
  }

  isNight() { return this.dayPhase() === 'Nuit'; }

  nightAlpha() {
    const t = this.dayT();
    if (t < 0.55) return 0;
    if (t < 0.65) return (t - 0.55) / 0.10 * 0.45;
    if (t < 0.90) return 0.45;
    return 0.45 * (1 - (t - 0.90) / 0.10);
  }

  // ---------- Boucle de jeu ----------

  loop(t) {
    const dt = Math.min(50, t - (this.lastT || t));
    this.lastT = t;
    this.update(dt);
    this.draw();
    requestAnimationFrame(tt => this.loop(tt));
  }

  update(dt) {
    if (this.state !== 'world') return;
    const p = this.player;
    if (p.moving) {
      p.prog += dt / 170;
      if (p.prog >= 1) {
        p.moving = false;
        p.x = p.tx;
        p.y = p.ty;
        p.px = p.x * TS;
        p.py = p.y * TS;
        this.arrive();
      } else {
        p.px = lerp(p.fx, p.tx * TS, p.prog);
        p.py = lerp(p.fy, p.ty * TS, p.prog);
      }
    }
    if (!p.moving && this.state === 'world') {
      const dir = this.keysDown[this.keysDown.length - 1];
      if (dir) {
        p.dir = dir;
        const [dx, dy] = DIRVEC[dir];
        const nx = p.x + dx, ny = p.y + dy;
        if (!this.world.isSolid(nx, ny) && !this.trainerAt(nx, ny)) {
          p.moving = true;
          p.prog = 0;
          p.tx = nx;
          p.ty = ny;
          p.fx = p.px;
          p.fy = p.py;
        }
      }
    }
  }

  arrive() {
    this.stepCount++;
    if (this.stepCount % 20 === 0) this.save();
    const px = this.player.x, py = this.player.y;
    const itemKey = px + ',' + py;
    const item = this.world.itemAt(px, py);
    if (item && !this.pickedItems.has(itemKey)) {
      this.pickedItems.add(itemKey);
      if (item === 'capsule') { this.capsules += 2; this.toast('Vous trouvez 2 Capsules !'); }
      else { this.potions++; this.toast('Vous trouvez une Potion !'); }
      Sfx.item();
      this.updateHud();
      this.save();
    }
    const t = this.world.get(px, py);
    if (t === TILE.HEAL) {
      this.healAll();
      this.capsules = Math.max(this.capsules, 15);
      this.updateHud();
      Sfx.heal();
      this.toast('Équipe soignée et Capsules rechargées !');
      this.save();
      return;
    }
    if (t === TILE.SHRINE) {
      if (!this.beaten.has(this.world.bossId)) {
        this.toast(`Une force ancienne vous repousse… Battez le Maître de l'Arène !`);
      } else if (!this.caught.has(this.world.legendId)) {
        this.toast('La créature légendaire apparaît !');
        this.startBattle(makeCreature(this.dex, this.world.legendId, 45));
      } else {
        this.toast('Le sanctuaire est silencieux. Vous avez accompli votre quête.');
      }
      return;
    }
    if (t === TILE.TALL && Math.random() < (this.isNight() ? 0.15 : 0.115)) {
      this.startBattle(this.world.encounterFor(px, py, this.isNight()));
      return;
    }
    this.checkTrainer();
  }

  trainerAt(x, y) {
    return this.world.trainers.some(t => t.x === x && t.y === y);
  }

  // Un dresseur non battu engage le combat s'il a le joueur en ligne de vue
  checkTrainer() {
    for (const tr of this.world.trainers) {
      if (this.beaten.has(tr.id)) continue;
      const dx = this.player.x - tr.x, dy = this.player.y - tr.y;
      if (dx !== 0 && dy !== 0) continue;
      const dist = Math.abs(dx + dy);
      if (dist === 0 || dist > 3) continue;
      const sx = Math.sign(dx), sy = Math.sign(dy);
      let blocked = false;
      for (let i = 1; i < dist; i++)
        if (this.world.isSolid(tr.x + sx * i, tr.y + sy * i)) { blocked = true; break; }
      if (blocked) continue;
      this.startTrainerBattle(tr);
      return;
    }
  }

  healAll() {
    for (const c of this.team) {
      recomputeStats(this.dex, c);
      c.hp = c.hpMax;
    }
  }

  // ---------- Combat ----------

  startBattle(wild) {
    this._beginBattle([wild], null);
  }

  startTrainerBattle(tr) {
    const opponents = tr.team.map(s => makeCreature(this.dex, s.speciesId, s.level));
    this._beginBattle(opponents, tr);
  }

  _beginBattle(opponents, trainer) {
    this.keysDown = [];
    this.state = 'battle';
    document.getElementById('arena').classList.toggle('night', this.isNight());
    this.battle = new Battle(this, opponents, trainer);
    this.battle.start();
  }

  onTrainerDefeated(id) {
    this.beaten.add(id);
  }

  endBattle() {
    document.getElementById('battle').classList.add('hidden');
    this.state = 'world';
    this.updateHud();
    this.save();
  }

  blackout() {
    document.getElementById('battle').classList.add('hidden');
    const s = this.world.spawn;
    this.player.x = s.x;
    this.player.y = s.y;
    this.player.px = s.x * TS;
    this.player.py = s.y * TS;
    this.player.moving = false;
    this.healAll();
    this.state = 'world';
    this.toast('Vous vous réveillez au point de soin…');
    this.save();
  }

  // ---------- Sprites (cache) ----------

  spriteFor(id, scale) {
    const key = id + '@' + scale;
    if (!this.spriteCache.has(key)) {
      this.spriteCache.set(key, renderSprite(this.dex[id], scale));
    }
    const src = this.spriteCache.get(key);
    const c = document.createElement('canvas');
    c.width = src.width;
    c.height = src.height;
    c.getContext('2d').drawImage(src, 0, 0);
    return c;
  }

  // ---------- Menus ----------

  openTeam(mode) {
    this.teamMode = mode; // view | switch | force
    this.state = mode === 'view' ? 'menu' : 'battle-team';
    this.keysDown = [];
    document.getElementById('teamTitle').textContent =
      mode === 'view' ? 'Équipe' : 'Choisissez une créature';
    document.getElementById('teamClose').style.display = mode === 'view' ? '' : 'none';
    this.renderTeam();
    document.getElementById('team').classList.remove('hidden');
  }

  hideTeam() { document.getElementById('team').classList.add('hidden'); }

  closeMenus() {
    if (this.state === 'battle-team') {
      if (this.teamMode === 'switch') {
        this.hideTeam();
        this.state = 'battle';
        this.battle.showActions();
      }
      return;
    }
    document.getElementById('team').classList.add('hidden');
    document.getElementById('dex').classList.add('hidden');
    this.state = 'world';
  }

  renderTeam() {
    const list = document.getElementById('teamList');
    list.innerHTML = '';
    this.team.forEach((c, i) => {
      const sp = this.dex[c.speciesId];
      const card = document.createElement('div');
      card.className = 'ccard' + (c.hp <= 0 ? ' ko' : '');
      card.appendChild(this.spriteFor(sp.id, 3));
      const info = document.createElement('div');
      info.className = 'cinfo';
      info.innerHTML =
        `<div class="crow"><b>${c.nom}</b> N.${c.level} ${typeChips(sp.types)}</div>
         <div class="hpbar"><div class="hpfill ${hpClass(c)}" style="width:${Math.max(0, 100 * c.hp / c.hpMax)}%"></div></div>
         <div class="cstats">PV ${c.hp}/${c.hpMax} · Atq ${c.atk} · Déf ${c.def} · Vit ${c.spd} · ${c.moves.map(m => m.nom).join(' / ')}</div>`;
      card.appendChild(info);
      if (this.teamMode === 'view') {
        const btns = document.createElement('div');
        btns.className = 'cbtns';
        if (i > 0) {
          const b = document.createElement('button');
          b.textContent = 'En tête';
          b.onclick = () => {
            this.team.splice(i, 1);
            this.team.unshift(c);
            this.renderTeam();
            this.save();
          };
          btns.appendChild(b);
        }
        if (this.team.length > 1) {
          const b = document.createElement('button');
          b.textContent = 'Boîte';
          b.onclick = () => {
            this.team.splice(i, 1);
            this.box.push(c);
            this.renderTeam();
            this.save();
          };
          btns.appendChild(b);
        }
        if (this.potions > 0 && c.hp > 0 && c.hp < c.hpMax) {
          const b = document.createElement('button');
          b.textContent = `Potion (×${this.potions})`;
          b.onclick = () => {
            this.potions--;
            c.hp = Math.min(c.hpMax, c.hp + 25);
            Sfx.heal();
            this.updateHud();
            this.renderTeam();
            this.save();
          };
          btns.appendChild(b);
        }
        card.appendChild(btns);
      } else if (c !== this.battle.ally && c.hp > 0) {
        card.classList.add('selectable');
        card.onclick = () => {
          this.hideTeam();
          this.state = 'battle';
          this.battle.onSwitch(i);
        };
      }
      list.appendChild(card);
    });

    const bl = document.getElementById('boxList');
    bl.innerHTML = '';
    document.getElementById('boxCount').textContent = this.box.length;
    this.box.forEach((c, i) => {
      const cell = document.createElement('div');
      cell.className = 'bcell';
      cell.appendChild(this.spriteFor(c.speciesId, 2));
      const lbl = document.createElement('div');
      lbl.textContent = `${c.nom} N.${c.level}`;
      cell.appendChild(lbl);
      if (this.teamMode === 'view') {
        const b = document.createElement('button');
        b.textContent = '→ Équipe';
        b.onclick = () => {
          if (this.team.length >= 6) { this.toast('Équipe pleine !'); return; }
          this.box.splice(i, 1);
          this.team.push(c);
          this.renderTeam();
          this.save();
        };
        cell.appendChild(b);
      }
      bl.appendChild(cell);
    });
  }

  openDex() {
    this.state = 'menu';
    this.keysDown = [];
    document.getElementById('dexCount').textContent =
      `${this.caught.size} capturés · ${this.seen.size} vus · ${this.dex.length} espèces dans ce monde`;
    const grid = document.getElementById('dexGrid');
    grid.innerHTML = '';
    for (const sp of this.dex) {
      const cell = document.createElement('div');
      cell.className = 'dcell';
      if (sp.legendary) cell.classList.add('legend');
      const label = document.createElement('div');
      if (this.caught.has(sp.id)) {
        cell.appendChild(this.spriteFor(sp.id, 3));
        cell.title = `${sp.nom} — ${sp.types.map(t => TYPES[t].nom).join('/')}`;
        label.textContent = '#' + (sp.id + 1) + ' ' + sp.nom;
      } else if (this.seen.has(sp.id)) {
        cell.appendChild(silhouette(this.spriteFor(sp.id, 3)));
        label.textContent = '#' + (sp.id + 1) + ' ???';
      } else {
        cell.classList.add('unknown');
        const q = document.createElement('div');
        q.className = 'qmark';
        q.textContent = '?';
        cell.appendChild(q);
        label.textContent = '#' + (sp.id + 1);
      }
      cell.appendChild(label);
      grid.appendChild(cell);
    }
    document.getElementById('dex').classList.remove('hidden');
  }

  toast(msg) {
    const t = document.getElementById('toast');
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => t.classList.remove('show'), 2800);
  }

  // ---------- Rendu ----------

  buildMapCanvas() {
    const w = this.world;
    const c = document.createElement('canvas');
    c.width = w.w * TS;
    c.height = w.h * TS;
    const x = c.getContext('2d');
    // palettes d'herbe par biome (même bruit de température que la faune)
    const GR_FROID = ['#69b183', '#63aa7d', '#70b88a'];
    const GR_TEMPERE = ['#72b55c', '#6cae56', '#79bb62'];
    const GR_CHAUD = ['#97b154', '#90aa4e', '#9eb85d'];
    for (let ty = 0; ty < w.h; ty++) {
      for (let tx = 0; tx < w.w; tx++) {
        const t = w.get(tx, ty), px = tx * TS, py = ty * TS;
        const r = rand2(w.seed ^ 0x1357, tx, ty);
        if (t !== TILE.WATER && t !== TILE.SAND) {
          const temp = fbm(w.seed + 4242, tx / 30, ty / 30, 3);
          const GR = temp < 0.42 ? GR_FROID : temp > 0.58 ? GR_CHAUD : GR_TEMPERE;
          x.fillStyle = GR[Math.floor(r * 3)];
          x.fillRect(px, py, TS, TS);
        }
        switch (t) {
          case TILE.WATER:
            x.fillStyle = r < 0.5 ? '#3f6dc4' : '#4373cc';
            x.fillRect(px, py, TS, TS);
            if (r > 0.7) {
              x.fillStyle = '#6f97e0';
              x.fillRect(px + 5 + ((r * 53) | 0) % 14, py + 8 + ((r * 97) | 0) % 16, 8, 2);
            }
            break;
          case TILE.SAND:
            x.fillStyle = '#e2d098';
            x.fillRect(px, py, TS, TS);
            x.fillStyle = '#cdbb7f';
            x.fillRect(px + ((r * 89) | 0) % 24 + 3, py + ((r * 41) | 0) % 24 + 3, 3, 3);
            break;
          case TILE.GRASS:
            if (r > 0.78) {
              x.fillStyle = '#5d9e4b';
              x.fillRect(px + ((r * 71) | 0) % 22 + 4, py + ((r * 37) | 0) % 22 + 4, 4, 3);
            }
            break;
          case TILE.TALL: {
            x.fillStyle = '#4f9c45';
            x.fillRect(px + 1, py + 1, TS - 2, TS - 2);
            for (let i = 0; i < 4; i++) {
              const ox = 4 + i * 7 + (((r * 100) | 0) + i) % 3;
              x.fillStyle = '#39772f';
              x.fillRect(px + ox, py + 8, 3, 20);
              x.fillStyle = '#5fb053';
              x.fillRect(px + ox, py + 8, 3, 5);
            }
            break;
          }
          case TILE.TREE:
            x.fillStyle = '#74522f';
            x.fillRect(px + 12, py + 18, 8, 12);
            x.fillStyle = '#356f33';
            x.beginPath();
            x.arc(px + 16, py + 12, 12, 0, 7);
            x.fill();
            x.fillStyle = '#478a42';
            x.beginPath();
            x.arc(px + 13, py + 9, 7, 0, 7);
            x.fill();
            break;
          case TILE.ROCK:
            x.fillStyle = '#8d877b';
            x.fillRect(px, py, TS, TS);
            x.fillStyle = '#6f6a60';
            x.beginPath();
            x.moveTo(px + 4, py + 26);
            x.lineTo(px + 16, py + 6);
            x.lineTo(px + 28, py + 26);
            x.closePath();
            x.fill();
            x.fillStyle = '#a39d8f';
            x.beginPath();
            x.moveTo(px + 16, py + 6);
            x.lineTo(px + 22, py + 16);
            x.lineTo(px + 16, py + 16);
            x.closePath();
            x.fill();
            break;
          case TILE.HEAL:
            x.fillStyle = '#f3f3f0';
            x.fillRect(px + 2, py + 2, TS - 4, TS - 4);
            x.fillStyle = '#d84a4a';
            x.fillRect(px + 13, py + 7, 6, 18);
            x.fillRect(px + 7, py + 13, 18, 6);
            break;
          case TILE.ARENA:
            x.fillStyle = r < 0.5 ? '#cfc9b8' : '#c6c0ae';
            x.fillRect(px, py, TS, TS);
            x.strokeStyle = '#aaa492';
            x.strokeRect(px + 0.5, py + 0.5, TS - 1, TS - 1);
            break;
          case TILE.PATH:
            x.fillStyle = r < 0.5 ? '#c2a36b' : '#b99a62';
            x.fillRect(px, py, TS, TS);
            x.fillStyle = '#a5874f';
            x.fillRect(px + ((r * 67) | 0) % 22 + 3, py + ((r * 29) | 0) % 22 + 3, 4, 3);
            break;
          case TILE.SHRINE:
            x.fillStyle = '#3a3354';
            x.fillRect(px, py, TS, TS);
            x.strokeStyle = '#6fd8e8';
            x.lineWidth = 2;
            x.beginPath();
            x.arc(px + 16, py + 16, 9, 0, 7);
            x.stroke();
            x.fillStyle = '#9ff0fc';
            x.fillRect(px + 14, py + 14, 4, 4);
            x.lineWidth = 1;
            break;
          case TILE.FLOWER: {
            const cols = ['#e85b5b', '#f0d050', '#ffffff'];
            x.fillStyle = cols[Math.floor(r * 3)];
            const fx = px + 8 + ((r * 61) | 0) % 14, fy = py + 8 + ((r * 23) | 0) % 14;
            x.fillRect(fx - 3, fy, 3, 3);
            x.fillRect(fx + 3, fy, 3, 3);
            x.fillRect(fx, fy - 3, 3, 3);
            x.fillRect(fx, fy + 3, 3, 3);
            x.fillStyle = '#e8a23c';
            x.fillRect(fx, fy, 3, 3);
            break;
          }
        }
      }
    }
    this.mapCanvas = c;
  }

  draw() {
    if (!this.world) return;
    const p = this.player;
    const vw = this.canvas.width, vh = this.canvas.height;
    const mw = this.world.w * TS, mh = this.world.h * TS;
    const camx = Math.round(clamp(p.px + TS / 2 - vw / 2, 0, mw - vw));
    const camy = Math.round(clamp(p.py + TS / 2 - vh / 2, 0, mh - vh));
    this.ctx.drawImage(this.mapCanvas, camx, camy, vw, vh, 0, 0, vw, vh);
    this.drawItems(camx, camy);
    this.drawTrainers(camx, camy);
    this.drawPlayer(camx, camy);
    const na = this.nightAlpha();
    if (na > 0) {
      this.ctx.fillStyle = `rgba(18, 22, 70, ${na})`;
      this.ctx.fillRect(0, 0, vw, vh);
    }
    const phase = this.dayPhase();
    if (phase !== this._lastPhase) {
      this._lastPhase = phase;
      const icons = { Jour: '☀️', 'Crépuscule': '🌆', Nuit: '🌙', Aube: '🌅' };
      document.getElementById('hudTime').textContent = icons[phase] + ' ' + phase;
    }
  }

  drawItems(camx, camy) {
    const x = this.ctx;
    const x0 = Math.floor(camx / TS), y0 = Math.floor(camy / TS);
    for (let ty = y0; ty <= y0 + Math.ceil(this.canvas.height / TS); ty++) {
      for (let tx = x0; tx <= x0 + Math.ceil(this.canvas.width / TS); tx++) {
        const item = this.world.itemAt(tx, ty);
        if (!item || this.pickedItems.has(tx + ',' + ty)) continue;
        const sx = tx * TS - camx, sy = ty * TS - camy;
        if (item === 'capsule') {
          x.fillStyle = '#d84a4a';
          x.beginPath();
          x.arc(sx + 16, sy + 18, 6, Math.PI, 0);
          x.fill();
          x.fillStyle = '#f0f0f0';
          x.beginPath();
          x.arc(sx + 16, sy + 18, 6, 0, Math.PI);
          x.fill();
          x.fillStyle = '#222222';
          x.fillRect(sx + 10, sy + 17, 12, 2);
        } else {
          x.fillStyle = '#8f5fc4';
          x.fillRect(sx + 12, sy + 13, 8, 10);
          x.fillStyle = '#b98ae0';
          x.fillRect(sx + 12, sy + 13, 8, 3);
          x.fillStyle = '#666666';
          x.fillRect(sx + 14, sy + 10, 4, 3);
        }
      }
    }
  }

  drawTrainers(camx, camy) {
    const x = this.ctx;
    for (const tr of this.world.trainers) {
      const sx = tr.x * TS - camx + 16, sy = tr.y * TS - camy;
      if (sx < -32 || sy < -48 || sx > this.canvas.width + 32 || sy > this.canvas.height + 32) continue;
      x.fillStyle = 'rgba(0,0,0,0.25)';
      x.beginPath();
      x.ellipse(sx, sy + 28, 9, 4, 0, 0, 7);
      x.fill();
      const y = sy + 4;
      x.fillStyle = '#3a3a4a';
      x.fillRect(sx - 7, y + 18, 5, 7);
      x.fillRect(sx + 2, y + 18, 5, 7);
      x.fillStyle = tr.couleur;
      x.fillRect(sx - 8, y + 9, 16, 10);
      x.fillStyle = '#e8b88a';
      x.fillRect(sx - 6, y, 12, 10);
      x.fillStyle = '#4a4a5a';
      x.fillRect(sx - 7, y - 2, 14, 4);
      x.fillStyle = '#222222';
      x.fillRect(sx - 4, y + 4, 2, 2);
      x.fillRect(sx + 2, y + 4, 2, 2);
      if (tr.boss) {
        x.fillStyle = '#ffd75e';
        x.fillRect(sx - 5, y - 6, 10, 3);
        x.fillRect(sx - 5, y - 9, 2, 3);
        x.fillRect(sx - 1, y - 9, 2, 3);
        x.fillRect(sx + 3, y - 9, 2, 3);
      } else if (!this.beaten.has(tr.id)) {
        x.fillStyle = '#ffffff';
        x.fillRect(sx - 4, y - 15, 8, 11);
        x.fillStyle = '#d83a3a';
        x.fillRect(sx - 1, y - 13, 2, 5);
        x.fillRect(sx - 1, y - 6, 2, 2);
      }
    }
  }

  drawPlayer(camx, camy) {
    const x = this.ctx, p = this.player;
    const sx = Math.round(p.px - camx) + 16;
    const syTop = Math.round(p.py - camy);
    const bob = p.moving ? Math.round(Math.sin(p.prog * Math.PI * 2) * 1.5) : 0;
    x.fillStyle = 'rgba(0,0,0,0.25)';
    x.beginPath();
    x.ellipse(sx, syTop + 28, 9, 4, 0, 0, 7);
    x.fill();
    const y = syTop + 4 + bob;
    x.fillStyle = '#27406b';
    x.fillRect(sx - 7, y + 18, 5, 7);
    x.fillRect(sx + 2, y + 18, 5, 7);
    x.fillStyle = '#d8434d';
    x.fillRect(sx - 8, y + 9, 16, 10);
    x.fillStyle = '#f2c79a';
    x.fillRect(sx - 6, y, 12, 10);
    x.fillStyle = '#2c3e66';
    x.fillRect(sx - 7, y - 2, 14, 4);
    x.fillStyle = '#222222';
    if (p.dir === 'down') { x.fillRect(sx - 4, y + 4, 2, 2); x.fillRect(sx + 2, y + 4, 2, 2); }
    else if (p.dir === 'left') x.fillRect(sx - 5, y + 4, 2, 2);
    else if (p.dir === 'right') x.fillRect(sx + 3, y + 4, 2, 2);
  }
}

window.addEventListener('DOMContentLoaded', () => { window.game = new Game(); });
