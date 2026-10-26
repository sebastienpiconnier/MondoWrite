# Plan : Bible v2 (branche `bible-v2`)

Mise en œuvre de la « Proposition retenue (v2) » du document de travail *MondoWrite : repenser la Bible* (octobre 2026). Principe : **la Bible a la forme d'une bible professionnelle, ce que l'auteur remplit est déjà le document** ; l'export ne fait que choisir le lecteur et le rendu.

Cocher chaque case à la fin d'une session (`- [x]`), comme le demande `CLAUDE.md`. Tout se fait dans une branche à part. Rien n'est fusionné dans `main` tant qu'un lot n'a pas passé ses critères (fin du document).

## 0. Branche et garde-fous

```sh
git switch main && git pull
git switch -c bible-v2
git push -u origin bible-v2
```

- **Rebaser chaque semaine** sur `main` (`git fetch && git rebase origin/main`), pour que les corrections publiées entre-temps (synchro iCloud, iOS) ne divergent pas.
- **Format : uniquement des ajouts.** Nouvelles clés de fiche, nouvelles clés de `cosmos.json`, aucun renommage. C'est déjà pris en charge par l'existant, à vérifier par des tests et non à supposer :
  - clés de fiche inconnues gardées dans `card.keep.fiche` et réécrites (`storage/markdown.ts`) ;
  - type de carte inconnu affiché en Idée mais conservé ;
  - clés inconnues de `cosmos.json` conservées (`metaKeep`, `KNOWN_META`).
  Test à ajouter dans `forward-compat.test.ts` : un projet écrit par la v2 (clés `accroche`, `debut`, `fin`, bloc `bibleExport`), relu et réécrit par le code de `main`, ne perd rien.
- **Synchro iCloud** : un iPad en 1.3 et un Mac en v2 sur le même projet doivent cohabiter. Même test, plus un essai réel avant fusion.
- Une version de test TestFlight peut être construite depuis la branche pour les auteurs testeurs ; la release publique reste sur `main`.

## Lot 1 : la Bible en cinq parties

But : le sommaire suit l'ordre d'un dossier. Aucun fichier ne change, seul l'affichage regroupe les rubriques existantes.

| Partie | Contenu (types existants) |
|---|---|
| 1 · Présentation | Couverture (`pitch`), thèmes (`theme`) |
| 2 · Personnages | `personnage` (principaux d'abord) |
| 3 · Univers | `lieu` (avec les photos de leur galerie) ; plus tard la carte Monde |
| 4 · Structure | `intrigue`, actes et chapitres (Plan) ou saison et épisodes (scénario) |
| 5 · Pour vous | `question`, `idee` en vrac, sources (`lien`, `image`, `document`) ; plus tard « au fil des scènes », qui sait quoi, chronologie |

Travail :

- [x] `src/bibleParts.ts` (pur) : `BIBLE_PARTS`, `PART_OF`, `bibleOrder(prefs)` (rubriques visibles dans l'ordre des parties, ordre de l'auteur gardé dans chaque partie), `moveInPart`. Utilisé par la Bible, l'export et les copies Markdown (même ordre partout).
- [x] Sortir le sommaire de `Bible.tsx` dans `BibleToc.tsx` : en-têtes numérotés de partie (une partie d'une seule rubrique est un seul bouton), « Pour vous » séparé par un trait et en gris, avec « Pour toi seul ». Le mode « Choisir et ranger » range à l'intérieur de chaque partie. Dans la page, la première rubrique d'une partie porte « 3 · Univers ».
- [x] Partie vide : en-tête discret, une ligne « À écrire » et le bouton « Questionner » là où il existe (couverture). Reste : la rubrique vide garde son message et son bouton actuels ; « Questionner » sur la couverture est fait au lot 4 (`CoverAssistant`).
- [x] i18n : `t.bible.parts`, `partTitle`, `privateHint` en français et en anglais.
- [x] Tests : `bible-parts.test.ts` (chaque type a une partie, ordre stable, rubriques masquées respectées, ordre ancien relu).

Multiplateforme : sommaire repliable sur téléphone (≤ 720 px), en-têtes de partie touchables (44 px).

## Lot 2 : la fiche personnage en six cases

Affichage : accroche sous le nom, bande moteur, « au début → à la fin », « qui il est » (le corps de la carte), relations (tirées des fils, déjà calculées par `relatedRuns`), puis « Ajouter si utile ».

- [x] `character.ts` : ajouter à `CHARACTER_FIELDS` les clés `accroche`, `debut`, `fin` et `principal` (valeur `oui` ou absente, `readFiche` rejette le reste). Clés écrites dans le fichier : ne plus jamais les renommer.
- [x] Bande moteur (`CharacterMotor.tsx`) : **Veut** (`objectif`), **A besoin** (`besoin`), **Blessure, conflit intérieur** (même clé `blessure`, seuls le libellé et le texte indicatif changent dans `t.character.motor`). Aucune nouvelle clé, aucune donnée déplacée : ce qu'un auteur a écrit comme blessure reste à sa place. Antagoniste inchangé (motivation, force, faille).
- [x] Case « Personnage principal » (`principal`) sur l'affiche : une étoile à côté du nom (bouton `aria-pressed`), les principaux passent en tête de la partie Personnages. La page de chacun à l'export viendra avec le lot 3.
- [x] Arc : deux cases « Au début » / « À la fin » sous la bande ; la petite courbe du type d'arc reste ; l'ancien texte libre `arc` s'affiche s'il est rempli (« Évolution »).
- [x] Accroche : une ligne en italique sous le nom, modifiable sur place (en-tête de la fiche dans `Bible.tsx`).
- [x] « Ajouter si utile » : dans `CardSheet` (tous les types), une pastille « + Champ » par champ vide ; toucher la pastille montre le champ et y met le curseur. « Afficher les champs vides » reste pour tout voir. Le champ « défaut moteur » n'existe pas encore : `faille` en tient lieu.
- [x] Assistant : question `hook` « En une phrase, qui est ce personnage ? » à la fin du thème « L'essentiel » (`THEME_KEYS`, pas dans les anciens niveaux) ; la réponse de l'auteur remplit l'accroche (`QUESTION_FIELD`). Question de la banque fixe, pas de l'IA : `docs/prompts-ia.md` inchangé.
- [x] Tests : `bible-character-v2.test.ts` (nouvelles clés lues et réécrites, ancien projet, `principal` invalide ignoré, export sans « principal », question `hook`).

## Lot 3 : l'export v2 (dossier de présentation et bible de travail)

Le dialogue en trois questions : **pour qui** (moi : bible de travail ; un tiers : éditeur pour un roman, producteur pour un scénario), **parties** (les cinq, à cocher et ranger, « Pour vous » décochée pour un tiers), **rendu** (Sobre, Éditorial, Nuit ; une couleur d'accent ; une image de couverture du projet). Aperçu en direct, réglage enregistré sous un nom.

- [x] **Modèle pur** : réglages dans `src/bibleExport.ts` (`BibleExportOptions { audience, parts, theme, accent, cover, places }`, réglages nommés, nettoyage à la lecture), contenu dans `src/export/biblePack.ts` (`buildBiblePack`). Pour un tiers : pas de « Pour vous » ; personnages cochés « principal » une page chacun, les autres regroupés dans « Et aussi » ; aucun principal coché : tous ont leur page.
- [x] **Blocs plus riches** : plutôt que d'enrichir `ExportDoc` (et risquer Word et Markdown), le PDF a son propre modèle de blocs (`PackBlock` : accroche, cases, arc, affiche d'un personnage, vignettes, liste). Word et Markdown gardent `bibleOf`, limité aux rubriques des parties choisies (`typesForParts`).
- [x] **Mise en page pure** `src/export/bibleLayout.ts`, **rendus** `src/export/bibleThemes.ts`, **dessin** `src/export/biblePdf.ts` (pdf-lib, import dynamique). Polices : Crimson Text (déjà embarquée) et les fichiers **WOFF** de Fontsource (pas WOFF2 : fontkit ne sait pas en faire un sous-ensemble et plante), décompressés par `src/export/woff.ts` (la décompression de fontkit dans le navigateur abîmait des glyphes). Mesure : les fichiers WOFF de Plex Sans, Plex Serif 400 et Space Grotesk 700 sont déjà dans le paquet (repli CSS de l'interface) ; seuls Plex Serif italique et Plex Serif 600 s'ajoutent, environ 45 Ko. Chaque PDF n'embarque que les glyphes utilisés.
- [x] **Aperçu fidèle** : le vrai PDF, refait 350 ms après le dernier changement, pages dessinées par pdf.js.
- [x] **Dialogue** `BibleExportDialog.tsx`, ouvert depuis l'entrée « Bible… » d'`ExportMenu` (remplace les trois entrées PDF, Word, Markdown, proposées en bas du dialogue).
- [x] **Réglages** : bloc facultatif `bibleExport` dans `cosmos.json` (`current` et `presets`), dans `KNOWN_META`, écrit seulement s'il diffère des valeurs par défaut.
- [x] **Vignettes des lieux** : jusqu'à quatre photos des lieux (image principale d'abord), légendées.
- [x] **Nom de fichier daté** (`bibleFileName`).
- [x] Tests : `bible-export.test.ts` (réglages, presets, aller-retour cosmos.json, contenu selon le lecteur, principaux, mise en pages : signets, pas de page blanche, rien hors page).

Multiplateforme : dialogue plein écran sur téléphone, aperçu sous les réglages ; glisser pour ranger doublé de boutons monter / descendre ; partage du fichier par la feuille de partage sur iOS.

## Lot 4 : la bible de série (projets scénario)

- [x] **Présentation** : nouvelles clés de `pitch` : `pourquoi`, `promesse`, `arene`, `mecanique`, `episodeType`, `episodes`, `aFaire`, `aEviter`, `pistes` (`SERIES_TEXTS`, sous-partie repliable « Écrire la série » de la couverture, projet scénario seulement) ; pastilles `statut`, `credits`, `dapres` (roman et scénario ; les deux dernières en saisie libre). Le repère « n/total renseignés » compte les champs du type de projet (`pitchFields`).
- [x] **Fiche** : `enjeuExt`, `enjeuRel`, `enjeuInt`, `ecriture` dans `CHARACTER_FIELDS`, donc dans « Ajouter si utile ». Le PDF montre les enjeux en cases et la consigne d'écriture aussi pour un tiers.
- [x] **Épisodes** : un projet scénario n'a pas d'épisodes (un projet = un scénario, le gabarit « épisode » découpe un seul épisode). Ils s'écrivent donc dans la couverture (`episodes`, une ligne par épisode, « Titre : ce qui s'y passe », `readEpisodes`) et sortent en liste numérotée.
- [x] **Grille des fils** : intrigues × parties du pilote (sections du Fountain, cases de gabarit comprises ; sans section, une colonne par scène), présence calculée par `timeline` comme la chronologie ; au plus 16 colonnes, numérotées, légende dessous.
- [x] **Annexe pilote** : option `pilot` des réglages d'export (cochée par défaut pour un producteur) ; une page d'annonce, puis les dix premières pages du PDF du scénario (format standard, sans page de titre) recopiées par `copyPages`.
- [x] **Mémo personnages** : « En un coup d'œil », les accroches sur une page avant les fiches (scénario, dès deux personnages avec accroche).
- [x] Rendu Nuit proposé par défaut pour un producteur (`defaultTheme`, `exportStateFor` : tant que l'auteur n'a rien changé, rien n'est écrit dans `cosmos.json`).
- [x] **Questionner** sur la couverture (`CoverAssistant`) : une question par champ vide, la réponse va telle quelle dans le champ, « Une autre » passe (`nextAsk`).

## Lot 5 : « Ce qui change » (plan détaillé, 26 octobre 2026)

Une seule saisie nouvelle, sur la scène ; tout le reste se calcule. C'est la « dimension de temps » du document de conception : la Bible sait dire qui et où, elle apprend à dire **quand les choses changent**. Aucune vue n'a de champ à elle (principe « On saisit dans le récit, la Bible se remplit seule »).

### Ce que l'auteur saisit

Sur une scène, une case **« Ce qui change »** : quelques lignes libres, une par changement, avec mentions `@` (le menu des cartes existe déjà).

> @Inès apprend que @Yann a survécu au naufrage.
> @Inès perd la clé du phare.
> @Yann se rend à @La maison du port.

Des pastilles de verbes posent le début de la ligne, en raccourci : **apprend**, **reçoit**, **perd**, **se rend à**, **promet**, **tient**. Elles ne font qu'écrire le mot : une phrase libre reste valable, et une ligne sans verbe connu reste une simple note datée par la scène.

### Où elle s'écrit (trois chemins, comme le reste)

- carte Scène agrandie (`ExpandedCard`), sous le synopsis ;
- panneau « Dans cette scène » du Manuscrit et du Scénario (colonne de droite), là où l'auteur écrit ;
- fiche Scène de la Bible (rubrique Scènes).

Sur le canevas, la carte montre seulement « 3 changements » (comme « N questions à compléter »), qui ouvre la carte agrandie.

### Format (contrat)

- Une ligne de frontmatter facultative sur la carte Scène, comme `questions` : `changes: ["@Inès apprend que @Yann a survécu.", …]`, chaque mention écrite `[@Titre](cosmos:<id>)` comme dans le texte. Ajout à `KNOWN_FRONT`, lecture par `readChanges` (chaînes non vides, 40 lignes et 500 caractères au plus).
- Rien dans `scenario.fountain` : une scène de scénario garde ses changements dans sa carte (le Fountain reste lisible par les autres logiciels).
- Versions d'avant : depuis octobre 2026, une ligne de frontmatter inconnue est gardée (`keep.front`) et réécrite ; rien ne se perd en allant-retour avec la 1.3.1.
- Les mentions suivent les renommages et redeviennent du texte à la suppression d'une carte, par les mêmes fonctions que le corps des cartes (`mentions.ts`) : à brancher sur `changes` dans `updateCard` et `toTrash`.
- Historique d'annulation : `changes` fait partie de la carte, donc de `record()`.

### Lecture (pure, testée) : `src/changes.ts`

- `parseChange(line)` → `{ who: id[], verb: "apprend" | "recoit" | "perd" | "serend" | "promet" | "tient" | null, what: string, refs: id[] }`. Verbes reconnus en français et en anglais (learns, gets, loses, goes to, promises, keeps), au présent, après la première mention ; le reste de la ligne est `what`.
- `changeLog(cards, order)` : tous les changements dans l'ordre du récit (`bookOrder` pour un roman, ordre du Fountain pour un scénario), avec la scène, son numéro et son chapitre.
- `stateAt(characterId, log, index)` : l'état d'un personnage à une scène : où il est (dernier « se rend à »), ce qu'il porte (reçoit moins perd), ce qu'il sait (« apprend »), ce qu'il ignore encore (ce que d'autres ont appris et pas lui).
- `whoKnows(log)` : matrice « qui sait quoi » : une ligne par chose apprise (le `what` normalisé, ou la carte citée), une colonne par personnage, la scène où chacun l'apprend.
- `objects(log)` : les objets cités par « reçoit » / « perd », avec leur porteur au fil des scènes.
- `promises(log)` : chaque « promet » et le « tient » qui lui répond (même carte citée, ou même texte) ; une promesse jamais tenue.

### Ce qui se remplit

1. **Fiche personnage, onglet « Au fil des scènes »** (à côté de « Fiche ») : un curseur sur les scènes (ou les chapitres) montre `stateAt` ; à droite, le journal de ses changements, chaque ligne ouvre sa scène. Rien à saisir ici.
2. **Partie « Pour vous »**, trois rubriques calculées, présentes seulement quand elles ont du contenu : **Au fil des scènes** (journal complet), **Qui sait quoi** (matrice), **Objets** (qui porte quoi, et quand).
3. **Onglet « Vérifier »** (`review/checks.ts`), deux règles nouvelles, toujours formulées en questions avec « C'est voulu » : un personnage nomme dans ses répliques ou son texte une chose avant de l'avoir apprise (« parle avant de savoir », d'après `whoKnows` et le texte des scènes) ; une promesse jamais tenue.
4. **Export** : la bible de travail (lecteur « moi ») reçoit ces trois rubriques dans « Pour vous » (journal en liste, matrice en grille, réutilise le bloc `grid` du lot 4). Jamais dans un dossier pour un tiers. Markdown et Word : le journal en liste.
5. **IA** (si branchée, plus tard) : la cohérence reçoit le journal des changements ; elle pose des questions, comme aujourd'hui.

### Étapes

- [ ] `changes.ts` (pur) et ses tests : lecture des lignes, verbes fr/en, journal, état, matrice, objets, promesses.
- [ ] Format : `changes` dans `CardData`, `markdown.ts` (lecture, écriture, `KNOWN_FRONT`), mentions suivies au renommage et à la suppression, test d'aller-retour et de `keep` côté ancienne version.
- [ ] Saisie : composant `SceneChanges` (lignes éditables avec `@`, pastilles de verbes, ajout, retrait), dans la carte agrandie, « Dans cette scène » et la Bible ; compteur sur la carte du canevas.
- [ ] Bible : onglet « Au fil des scènes » de la fiche personnage, rubriques calculées de « Pour vous ».
- [ ] Vérifier : règles « parle avant de savoir » et « promesse non tenue » (`RuleKey`, textes fr/en).
- [ ] Export : rubriques de « Pour vous » dans la bible de travail (PDF, Word, Markdown).
- [ ] Guide (fr, en) et captures ; `CLAUDE.md` (format `changes`, `changes.ts`).

### Hors de ce lot

« Moment de l'histoire » et la chronologie à deux ordres, la carte Monde (règles, termes, groupes, secrets), les anneaux de complétude du sommaire : chacun son lot, après les retours sur celui-ci.

### Questions à trancher avant de coder

1. **Verbes** : pastilles de raccourci sur du texte libre (proposé), ou texte libre seul ?
2. **Qui sait quoi** sans carte Secret : une ligne par chose apprise, regroupée par texte ou par carte citée (proposé), ou attendre la carte Monde « secret » ?
3. **Objets** sans carte Objet : texte après « reçoit » / « perd » (proposé), ou exiger une carte citée par `@` ?
4. **Curseur de l'onglet** : par scène (précis) ou par chapitre (plus lisible, proposé pour un roman ; par scène pour un scénario) ?

## Compatibilité avec `main` (vérifiée le 26 octobre 2026, à la lecture du code de `main`)

- Projet de la v2 ouvert puis enregistré par la version de `main` (1.3) : `bibleExport` est gardé (clé inconnue de `cosmos.json`, `metaKeep`), les nouveaux champs de fiche aussi (`accroche`, `debut`, `fin`, `principal`, enjeux, `ecriture` : `keep.fiche`). **Mais les nouvelles clés de la couverture sont perdues** (`statut`, `credits`, `dapres` et tout « Écrire la série ») : le `readPitch` de la 1.3 ne garde que ses clés.
- Correctif prêt, commit à part « Couverture : garder les clés inconnues » sur `bible-v2` : à reporter sur `main` (`git cherry-pick`) et publier en 1.3.x **avant** de donner la v2 aux testeurs, pour qu'un aller-retour entre les deux versions ne perde rien.
- Projet de `main` ouvert dans la v2 : rien ne se perd (tout ce qui existait est lu).

## Demandes d'évolution

- **Vrais épisodes de série** (demandée le 26 octobre 2026, au lot 4) : aujourd'hui un projet scénario contient un seul scénario, et le gabarit « épisode » ne découpe qu'un épisode. Les épisodes s'écrivent donc dans la couverture (`pitch.episodes`, une ligne « Titre : ce qui s'y passe »), et la grille des fils croise les intrigues avec les parties du pilote, pas avec les épisodes de la saison. À faire évoluer : des épisodes comme objets du projet (plusieurs scénarios, ou un découpage du Fountain par épisode), pour une grille intrigues × épisodes et des synopsis par épisode tirés du séquencier. Reprendre alors `episodes` de la couverture sans rien perdre.

## Critères pour fusionner dans `main`

Pour chaque lot :

- `npm test` et `npm run build` passent ; nouveaux tests écrits avant la fusion ;
- français et anglais complets, mode sombre vérifié ;
- essai sur Mac, Windows (machine virtuelle ou CI), iPad et iPhone (TestFlight depuis la branche) ;
- un projet de la v2 rouvert dans la version de `main` sans rien perdre, et l'inverse ;
- `CLAUDE.md` mis à jour (parties de la Bible, nouvelles clés).

Fusion proposée : lots 1 à 3 ensemble en **1.4.0** (la Bible et son export forment un tout visible), lot 4 en **1.5.0**.

## Décisions prises (25 octobre 2026)

- Bande moteur : « Blessure » et « Conflit intérieur » fusionnés en une seule case, sur la clé existante `blessure`.
- Personnages principaux : une case à cocher sur la fiche (`principal`).
- Réglages d'export : par projet (`bibleExport` dans `cosmos.json`).
- Vignettes des lieux dans l'export : oui, sans retour du tableau d'ambiance dans l'app.

## Reste à mesurer

- ~~Poids des polices embarquées~~ : mesuré au lot 3 (environ 45 Ko en plus, voir plus haut).
