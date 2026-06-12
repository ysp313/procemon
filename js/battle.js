'use strict';

// ---- Système de combat au tour par tour ----

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function setHpBar(el, c) {
  const pct = Math.max(0, 100 * c.hp / c.hpMax);
  el.style.width = pct + '%';
  el.className = 'hpfill ' + (pct > 50 ? 'hp-g' : pct > 20 ? 'hp-o' : 'hp-r');
}

class Battle {
  constructor(game, opponents, trainer) {
    this.g = game;
    this.opponents = opponents;
    this.enemyIdx = 0;
    this.enemy = opponents[0];
    this.trainer = trainer || null;
    this.ally = game.team.find(c => c.hp > 0);
    this.busy = false;
    const $ = id => document.getElementById(id);
    this.el = {
      root: $('battle'), msg: $('bmsg'), menu: $('bmenu'),
      actions: $('bactions'), moves: $('bmoves'), bag: $('bbag'),
      eName: $('eName'), eLvl: $('eLvl'), eHp: $('eHp'), eTypes: $('eTypes'), eSpot: $('enemySpot'),
      aName: $('aName'), aLvl: $('aLvl'), aHp: $('aHp'), aHpText: $('aHpText'), aXp: $('aXp'), aSpot: $('allySpot'),
    };
    this.el.actions.querySelector('[data-act=fight]').onclick = () => { if (!this.busy) this.showMoves(); };
    this.el.actions.querySelector('[data-act=bag]').onclick = () => { if (!this.busy) this.showBag(); };
    this.el.actions.querySelector('[data-act=team]').onclick = () => {
      if (!this.busy) { this.hideMenus(); this.g.openTeam('switch'); }
    };
    this.el.actions.querySelector('[data-act=run]').onclick = () => { if (!this.busy) this.doRun(); };
  }

  enemyLabel(sp) { return sp.nom + (this.trainer ? ' ennemi' : ' sauvage'); }

  async start() {
    this.el.root.classList.remove('hidden');
    this.setSprite('enemy', this.enemy);
    this.setSprite('ally', this.ally);
    this.refresh();
    this.hideMenus();
    const sp = this.g.dex[this.enemy.speciesId];
    this.g.seen.add(this.enemy.speciesId);
    if (this.trainer) {
      await this.say(`${this.trainer.nom} veut se battre !`);
      Sfx.cry(sp);
      await this.say(`${this.trainer.nom} envoie ${sp.nom} ! (N.${this.enemy.level})`);
    } else {
      Sfx.cry(sp);
      await this.say(`Un ${sp.nom} sauvage apparaît ! (N.${this.enemy.level})`);
    }
    await this.say(`À toi, ${this.ally.nom} !`);
    this.showActions();
  }

  async say(t) { this.el.msg.textContent = t; await sleep(1050); }

  setSprite(side, c) {
    const sp = this.g.dex[c.speciesId];
    const spot = side === 'enemy' ? this.el.eSpot : this.el.aSpot;
    spot.innerHTML = '';
    spot.classList.remove('faint');
    const scale = Math.max(5, Math.floor(150 / sp.spriteSize));
    spot.appendChild(this.g.spriteFor(sp.id, scale));
  }

  refresh() {
    const e = this.enemy, a = this.ally;
    const esp = this.g.dex[e.speciesId];
    this.el.eName.textContent = esp.nom;
    this.el.eLvl.textContent = 'N.' + e.level;
    this.el.eTypes.innerHTML = typeChips(esp.types);
    setHpBar(this.el.eHp, e);
    this.el.aName.textContent = a.nom;
    this.el.aLvl.textContent = 'N.' + a.level;
    setHpBar(this.el.aHp, a);
    this.el.aHpText.textContent = `PV ${a.hp}/${a.hpMax}`;
    const lo = expFor(a.level), hi = expFor(a.level + 1);
    this.el.aXp.style.width = clamp(100 * (a.exp - lo) / (hi - lo), 0, 100) + '%';
  }

  showActions() {
    this.el.moves.classList.add('hidden');
    this.el.bag.classList.add('hidden');
    this.el.actions.classList.remove('hidden');
  }

  hideMenus() {
    this.el.actions.classList.add('hidden');
    this.el.moves.classList.add('hidden');
    this.el.bag.classList.add('hidden');
  }

  showBag() {
    this.el.actions.classList.add('hidden');
    const bag = this.el.bag;
    bag.classList.remove('hidden');
    bag.innerHTML = '';
    const cap = document.createElement('button');
    cap.textContent = `◎ Capsule ×${this.g.capsules}`;
    cap.onclick = () => { if (!this.busy) this.doCapture(); };
    bag.appendChild(cap);
    const pot = document.createElement('button');
    pot.textContent = `Potion ×${this.g.potions} (+25 PV)`;
    pot.onclick = () => { if (!this.busy) this.doPotion(); };
    bag.appendChild(pot);
    const back = document.createElement('button');
    back.className = 'backbtn';
    back.textContent = '← Retour';
    back.onclick = () => this.showActions();
    bag.appendChild(back);
  }

  async doPotion() {
    if (this.g.potions <= 0) { await this.say('Plus de Potions !'); this.showActions(); return; }
    if (this.ally.hp >= this.ally.hpMax) {
      await this.say(`${this.ally.nom} a déjà tous ses PV !`);
      this.showActions();
      return;
    }
    this.busy = true;
    this.hideMenus();
    this.g.potions--;
    this.ally.hp = Math.min(this.ally.hpMax, this.ally.hp + 25);
    Sfx.heal();
    this.refresh();
    await this.say(`${this.ally.nom} récupère des PV !`);
    await this.attack(this.enemy, this.ally, this.enemyMove(), false);
    if (this.ally.hp <= 0) { await this.allyDown(); return; }
    this.busy = false;
    this.showActions();
  }

  showMoves() {
    this.el.actions.classList.add('hidden');
    const mv = this.el.moves;
    mv.classList.remove('hidden');
    mv.innerHTML = '';
    this.ally.moves.forEach((m, i) => {
      const b = document.createElement('button');
      b.className = 'movebtn';
      b.innerHTML = `<b>${m.nom}</b><span><span class="chip" style="background:${TYPES[m.type].c}">${TYPES[m.type].nom}</span></span><small>Puissance ${m.power} · Précision ${m.acc}</small>`;
      b.onclick = () => { if (!this.busy) this.doTurn(i); };
      mv.appendChild(b);
    });
    const back = document.createElement('button');
    back.className = 'backbtn';
    back.textContent = '← Retour';
    back.onclick = () => this.showActions();
    mv.appendChild(back);
  }

  enemyMove() {
    return this.enemy.moves[Math.floor(Math.random() * this.enemy.moves.length)];
  }

  async doTurn(moveIdx) {
    this.busy = true;
    this.hideMenus();
    const pm = this.ally.moves[moveIdx];
    const em = this.enemyMove();
    const playerFirst = this.ally.spd > this.enemy.spd ||
      (this.ally.spd === this.enemy.spd && Math.random() < 0.5);
    const seq = playerFirst ? ['p', 'e'] : ['e', 'p'];
    for (const who of seq) {
      if (this.ally.hp <= 0 || this.enemy.hp <= 0) break;
      if (who === 'p') {
        await this.attack(this.ally, this.enemy, pm, true);
        if (this.enemy.hp <= 0) { await this.victory(); return; }
      } else {
        await this.attack(this.enemy, this.ally, em, false);
        if (this.ally.hp <= 0) { await this.allyDown(); return; }
      }
    }
    this.busy = false;
    this.showActions();
  }

  async attack(att, def, mv, fromPlayer) {
    const aSp = this.g.dex[att.speciesId], dSp = this.g.dex[def.speciesId];
    const attName = fromPlayer ? att.nom : this.enemyLabel(aSp);
    const defName = fromPlayer ? this.enemyLabel(dSp) : def.nom;
    await this.say(`${attName} utilise ${mv.nom} !`);
    if (Math.random() * 100 >= mv.acc) { await this.say(`L'attaque échoue !`); return; }
    const eff = effectiveness(mv.type, dSp.types);
    if (eff === 0) { await this.say(`Ça n'affecte pas ${defName}…`); return; }
    const stab = aSp.types.includes(mv.type) ? 1.5 : 1;
    const crit = Math.random() < 1 / 16;
    const rnd = 0.85 + Math.random() * 0.15;
    const dmg = Math.max(1, Math.floor(
      (((2 * att.level / 5 + 2) * mv.power * att.atk / Math.max(1, def.def)) / 50 + 2)
      * eff * stab * (crit ? 1.5 : 1) * rnd));
    def.hp = Math.max(0, def.hp - dmg);
    Sfx.hit();
    const spot = fromPlayer ? this.el.eSpot : this.el.aSpot;
    spot.classList.add('hit');
    setTimeout(() => spot.classList.remove('hit'), 850);
    this.refresh();
    await sleep(650);
    if (crit) await this.say('Coup critique !');
    if (eff > 1) await this.say(`C'est super efficace !`);
    else if (eff < 1) await this.say(`Ce n'est pas très efficace…`);
    if (def.hp <= 0) {
      spot.classList.add('faint');
      Sfx.faint();
      await this.say(`${defName} est K.O. !`);
    }
  }

  expGain() {
    const esp = this.g.dex[this.enemy.speciesId];
    return Math.max(1, Math.floor(esp.baseExp * this.enemy.level / 6 * (this.trainer ? 1.5 : 1)));
  }

  async victory() {
    await this.gainExp(this.expGain());
    if (this.trainer) {
      this.enemyIdx++;
      if (this.enemyIdx < this.opponents.length) {
        this.enemy = this.opponents[this.enemyIdx];
        const nsp = this.g.dex[this.enemy.speciesId];
        this.g.seen.add(this.enemy.speciesId);
        this.setSprite('enemy', this.enemy);
        this.refresh();
        Sfx.cry(nsp);
        await this.say(`${this.trainer.nom} envoie ${nsp.nom} ! (N.${this.enemy.level})`);
        this.busy = false;
        this.showActions();
        return;
      }
      await this.say(`Vous avez battu ${this.trainer.nom} !`);
      this.g.onTrainerDefeated(this.trainer.id);
      if (this.trainer.boss) {
        this.g.capsules += 10;
        this.g.potions += 5;
        Sfx.captureOk();
        await this.say(`Incroyable… Vous êtes le nouveau champion de l'île !`);
        await this.say('Vous recevez 10 Capsules et 5 Potions !');
        await this.say(`Le sanctuaire derrière l'arène s'illumine d'une lueur étrange…`);
      } else {
        this.g.capsules += 2;
        this.g.potions += 1;
        await this.say('Vous recevez 2 Capsules et 1 Potion !');
      }
    } else if (Math.random() < 0.45) {
      this.g.capsules++;
      await this.say('Vous trouvez une Capsule par terre !');
    }
    this.busy = false;
    this.g.endBattle();
  }

  // Toute l'équipe reçoit le même montant d'EXP (victoire comme capture)
  async gainExp(exp) {
    if (this.g.team.length > 1) await this.say(`Toute l'équipe gagne ${exp} points d'EXP !`);
    else await this.say(`${this.g.team[0].nom} gagne ${exp} points d'EXP !`);
    for (const c of this.g.team) {
      c.exp += exp;
      if (c === this.ally) this.refresh();
      let up;
      while ((up = checkLevelUp(this.g.dex, c))) {
        if (c === this.ally) this.refresh();
        Sfx.levelup();
        await this.say(`${c.nom} monte au niveau ${up.level} !`);
        for (const l of up.learned) {
          if (l.replaced) await this.say(`${c.nom} oublie ${l.replaced.nom} et apprend ${l.move.nom} !`);
          else await this.say(`${c.nom} apprend ${l.move.nom} !`);
        }
        if (up.evolved) {
          const oldName = c.nom;
          await this.say(`Quoi ? ${oldName} évolue !`);
          evolveCreature(this.g.dex, c);
          this.g.seen.add(c.speciesId);
          this.g.caught.add(c.speciesId);
          if (c === this.ally) { this.setSprite('ally', c); this.refresh(); }
          Sfx.cry(this.g.dex[c.speciesId]);
          await this.say(`${oldName} évolue en ${this.g.dex[c.speciesId].nom} !`);
        }
      }
    }
  }

  async allyDown() {
    if (this.g.team.some(c => c.hp > 0)) {
      await this.say('Choisissez une autre créature !');
      this.g.openTeam('force');
    } else {
      await this.say(`Vous n'avez plus de créature en état de se battre…`);
      this.busy = false;
      this.g.blackout();
    }
  }

  // Appelé par l'écran d'équipe quand une créature est choisie
  async onSwitch(i) {
    this.busy = true;
    this.hideMenus();
    const wasForced = this.g.teamMode === 'force';
    this.ally = this.g.team[i];
    this.setSprite('ally', this.ally);
    this.refresh();
    await this.say(`À toi, ${this.ally.nom} !`);
    if (!wasForced && this.enemy.hp > 0) {
      await this.attack(this.enemy, this.ally, this.enemyMove(), false);
      if (this.ally.hp <= 0) { await this.allyDown(); return; }
    }
    this.busy = false;
    this.showActions();
  }

  async doCapture() {
    if (this.trainer) {
      await this.say(`On ne capture pas la créature d'un dresseur !`);
      this.showActions();
      return;
    }
    if (this.g.capsules <= 0) {
      await this.say('Plus de Capsules ! Retournez au point de soin.');
      this.showActions();
      return;
    }
    this.busy = true;
    this.hideMenus();
    this.g.capsules--;
    const esp = this.g.dex[this.enemy.speciesId];
    Sfx.capture();
    await this.say(`Vous lancez une Capsule sur ${esp.nom} !`);
    const hpFactor = 1 - 0.65 * this.enemy.hp / this.enemy.hpMax;
    const stageFactor = esp.legendary ? 0.16 : [1, 0.55, 0.3][esp.stage - 1];
    const p = clamp(hpFactor * stageFactor + 0.06, 0.03, 0.95);
    this.el.eSpot.classList.add('shake');
    await sleep(1400);
    this.el.eSpot.classList.remove('shake');
    if (Math.random() < p) {
      this.el.eSpot.classList.add('faint');
      Sfx.captureOk();
      this.g.caught.add(this.enemy.speciesId);
      await this.say(`${esp.nom} a été capturé !`);
      // capturer rapporte le double d'EXP (distribuée avant d'ajouter la recrue)
      await this.gainExp(this.expGain() * 2);
      if (this.g.team.length < 6) {
        this.g.team.push(this.enemy);
        await this.say(`${esp.nom} rejoint votre équipe.`);
      } else {
        this.g.box.push(this.enemy);
        await this.say(`${esp.nom} est envoyé dans la Boîte.`);
      }
      this.busy = false;
      this.g.endBattle();
    } else {
      await this.say(`Mince ! ${esp.nom} s'est échappé de la Capsule !`);
      await this.attack(this.enemy, this.ally, this.enemyMove(), false);
      if (this.ally.hp <= 0) { await this.allyDown(); return; }
      this.busy = false;
      this.showActions();
    }
  }

  async doRun() {
    if (this.trainer) {
      await this.say('On ne fuit pas un combat de dresseur !');
      this.showActions();
      return;
    }
    this.busy = true;
    this.hideMenus();
    const p = clamp(0.55 + (this.ally.spd - this.enemy.spd) / 80, 0.3, 0.95);
    if (Math.random() < p) {
      await this.say('Vous prenez la fuite !');
      this.busy = false;
      this.g.endBattle();
    } else {
      await this.say('Impossible de fuir !');
      await this.attack(this.enemy, this.ally, this.enemyMove(), false);
      if (this.ally.hp <= 0) { await this.allyDown(); return; }
      this.busy = false;
      this.showActions();
    }
  }
}
