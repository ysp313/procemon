# Procémon

Jeu type Pokémon en HTML/CSS/JavaScript pur, **entièrement généré procéduralement** à partir d'une graine : la même graine produit toujours le même monde, les mêmes ~105 espèces de créatures (noms, types, stats, attaques, chaînes d'évolution) et les mêmes sprites pixel-art.

## Lancer le jeu

Aucun build, aucune dépendance. Ouvrir `index.html` dans un navigateur, ou servir le dossier en statique :

```
python -m http.server 8000
# puis http://localhost:8000
```

## Comment jouer

- **ZQSD / WASD / Flèches** : se déplacer
- **E** : équipe (réorganiser, soigner à la Potion, déposer dans la Boîte)
- **P** : Procédex (espèces vues / capturées)
- **M** : couper/activer le son · **Échap** : fermer un menu
- Les **hautes herbes** déclenchent des rencontres ; les créatures sont plus fortes (et plus évoluées) loin du point de départ.
- La **faune dépend du biome** : Eau près des lacs, Plante/Toxik en forêt, Roche en montagne, Glace dans les zones froides, Feu/Électrik dans les zones chaudes.
- Les **dresseurs** (marqués d'un « ! ») vous défient s'ils vous voient en ligne droite — impossible de fuir ou de capturer ; victoire = Capsules et Potion.
- Le **cycle jour/nuit** (~5 min) change l'ambiance et la faune : la nuit, les Spectres rôdent et les rencontres sont plus fréquentes.
- Suivez la **route** jusqu'à l'**Arène** creusée dans la montagne : son Maître aligne trois créatures de niveau 40. Le vaincre déverrouille le **sanctuaire** où la **créature légendaire** du monde (unique, introuvable ailleurs) peut être affrontée et capturée.
- Des **Capsules et Potions** traînent au sol ; la tuile **✚** au point de départ soigne l'équipe et recharge les Capsules.
- En combat : attaquer, ouvrir le **Sac** (Capsule — plus efficace sur un ennemi affaibli — ou Potion), changer de créature ou fuir.
- **Sauvegarde** : 3 emplacements, sauvegarde automatique, export/import par code (partagez vos parties entre navigateurs).

## Génération procédurale

- **Monde** : île 96×96 générée par bruit fractal (élévation + humidité + température) — lacs, plages, forêts, montagnes, nappes de hautes herbes, teinte de l'herbe par biome.
- **Espèces** : chaînes d'évolution de 1 à 3 stades, types parmi 10, stats, table d'apprentissage d'attaques et noms français à base de syllabes partageant un préfixe par famille.
- **Sprites** : automate cellulaire sur demi-grille miroir (symétrie bilatérale), coloration par type, ombrage, oreilles et yeux placés sur le corps obtenu.
- **Sons** : effets WebAudio synthétisés — chaque espèce a un cri dérivé de sa graine (grave pour les stades évolués).
- **Dresseurs et objets** : placés déterministiquement à partir de la graine ; seuls les ramassages et victoires sont sauvegardés.

## Tests

```
node tests/smoke.js     # génération (dex, monde, sprites, niveaux) hors navigateur
node tests/e2e/drive.js # pilote le jeu dans Chrome headless (npm install dans tests/e2e d'abord)
```
