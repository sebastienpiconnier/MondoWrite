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
- [ ] Partie vide : en-tête discret, une ligne « À écrire » et le bouton « Questionner » là où il existe (couverture). Reste : la rubrique vide garde son message et son bouton actuels ; « Questionner » sur la couverture viendra avec le lot 4 (nouveaux champs de présentation).
- [x] i18n : `t.bible.parts`, `partTitle`, `privateHint` en français et en anglais.
- [x] Tests : `bible-parts.test.ts` (chaque type a une partie, ordre stable, rubriques masquées respectées, ordre ancien relu).

Multiplateforme : sommaire repliable sur téléphone (≤ 720 px), en-têtes de partie touchables (44 px).

## Lot 2 : la fiche personnage en six cases

Affichage : accroche sous le nom, bande moteur, « au début → à la fin », « qui il est » (le corps de la carte), relations (tirées des fils, déjà calculées par `relatedRuns`), puis « Ajouter si utile ».

- [ ] `character.ts` : ajouter à `CHARACTER_FIELDS` les clés `accroche`, `debut`, `fin` et `principal` (valeur `oui` ou absente, `readFiche` rejette le reste). Clés écrites dans le fichier : ne plus jamais les renommer.
- [ ] Bande moteur (`CharacterMotor.tsx`) : **Veut** (`objectif`), **A besoin** (`besoin`), **Blessure, conflit intérieur** (même clé `blessure`, seuls le libellé et le texte indicatif changent dans `t.character.motor`). Aucune nouvelle clé, aucune donnée déplacée : ce qu'un auteur a écrit comme blessure reste à sa place. Antagoniste inchangé (motivation, force, faille).
- [ ] Case « Personnage principal » (`principal`) sur l'affiche : un interrupteur, aussi au clavier ; les principaux passent en tête de la partie Personnages et ont une page chacun à l'export.
- [ ] Arc : deux cases « Au début » / « À la fin » sous la bande ; la petite courbe du type d'arc reste ; l'ancien texte libre `arc` s'affiche s'il est rempli (« Évolution »).
- [ ] Accroche : une ligne en italique sous le nom, dans l'affiche (`Poster` de `Bible.tsx`).
- [ ] « Ajouter si utile » : les champs vides sont cachés derrière un menu (voix, traits = `personnalite`, défaut moteur, peur, secret, apparence, origine…). Un champ rempli s'affiche toujours. Généraliser dans `CardSheet` pour les lieux et intrigues.
- [ ] Assistant : une question « En une phrase, qui est ce personnage ? » propose de remplir l'accroche, sur clic de l'auteur ; mettre à jour `docs/prompts-ia.md`. L'IA n'écrit pas l'accroche elle-même.
- [ ] Tests : lecture et écriture des nouvelles clés, ancien projet sans ces clés, `principal` invalide ignoré.

## Lot 3 : l'export v2 (dossier de présentation et bible de travail)

Le dialogue en trois questions : **pour qui** (moi : bible de travail ; un tiers : éditeur pour un roman, producteur pour un scénario), **parties** (les cinq, à cocher et ranger, « Pour vous » décochée pour un tiers), **rendu** (Sobre, Éditorial, Nuit ; une couleur d'accent ; une image de couverture du projet). Aperçu en direct, réglage enregistré sous un nom.

- [ ] **Modèle pur** `src/export/bibleExport.ts` : `BibleExportOptions { audience, parts, theme, accent, cover }` et `buildBibleExport(state, options)`. Pour un tiers : pas de questions, pas d'idées en vrac ; personnages cochés « principal » une page chacun, les autres regroupés dans « Et aussi ». Aucun principal coché : tous les personnages ont leur page (projet qui n'a pas encore fait ce choix).
- [ ] **Blocs plus riches** dans `ExportDoc` (`doc.ts`) : `fields` (libellé et valeur en grille, pour la bande moteur), `lead` (accroche, pitch en grand), `pageBreak`, `cover`. Word et Markdown les dégradent proprement (libellé en gras puis valeur) : aucun export existant ne casse.
- [ ] **Mise en page pure** `src/export/bibleLayout.ts` et **dessin** `src/export/biblePdf.ts` (pdf-lib), sur le modèle de `paperback.ts` / `paperbackPdf.ts`. Un thème = un objet de jetons (polices, tailles, couleurs, marges, style de couverture) :
   - Sobre : IBM Plex Sans et Serif, noir sur blanc ;
   - Éditorial : Crimson Text (déjà embarquée), papier crème, accent ;
   - Nuit : Space Grotesk pour les titres, Plex Serif pour le texte, couverture sombre.
   Polices : les paquets `@fontsource` du projet sont en WOFF2 ; vérifier que `@pdf-lib/fontkit` les accepte, sinon ajouter les TTF (licence OFL) dans `src/assets/fonts`. Chargement à la demande, comme aujourd'hui. **Mesurer avant de choisir** : poids ajouté au paquet iOS et au téléchargement Mac ; si c'est trop lourd, ne garder qu'une graisse par police (régulière et grasse, italique synthétisée) ou réduire Sobre à Plex Sans seul.
- [ ] **Aperçu fidèle** : on génère le vrai PDF (anti-rebond de 300 ms) et on dessine ses pages avec pdf.js (`pdfDocument.ts`, `renderPage` existe déjà). Ce que l'on voit est exactement le fichier exporté.
- [ ] **Dialogue** `BibleExportDialog.tsx`, ouvert depuis l'entrée « Bible » d'`ExportMenu`. Word et Markdown restent proposés en bas du dialogue.
- [ ] **Réglages** : bloc facultatif `bibleExport` dans `cosmos.json` (liste `{ nom, options }`), ajouté à `KNOWN_META`. Par projet, car l'image de couverture appartient au projet.
- [ ] **Vignettes des lieux** : la partie Univers du PDF montre jusqu'à quatre photos tirées des galeries des lieux (image principale d'abord), en vignettes légendées par le nom du lieu. Rien ne revient dans l'app : le tableau d'ambiance reste retiré.
- [ ] **Nom de fichier daté** (« Dossier de présentation - Titre - 2026-10-25.pdf ») : chaque export sert de version.
- [ ] Tests : `bible-export.test.ts` (options → document : parties, audience, personnages principaux), `bible-layout.test.ts` (une page par principal, rien ne déborde, nombre de pages stable sur le projet d'exemple).

Multiplateforme : dialogue plein écran sur téléphone, aperçu sous les réglages ; glisser pour ranger doublé de boutons monter / descendre ; partage du fichier par la feuille de partage sur iOS.

## Lot 4 : la bible de série (projets scénario)

- [ ] **Présentation** : nouvelles clés de `pitch` (`PITCH_TEXTS`) : `arene`, `pourquoi`, `mecanique`, `episodeType`, `aFaire`, `aEviter`, `promesse`, `pistes` ; nouvelles pastilles (`PITCH_CHIPS`) : `statut`, `credits`, `dapres`, utiles aussi au roman. Une sous-partie « Écrire la série » n'apparaît que dans un projet scénario.
- [ ] **Fiche** : enjeux à trois étages en champs facultatifs (`enjeuExt`, `enjeuRel`, `enjeuInt`) et une consigne d'écriture (`ecriture`), dans « Ajouter si utile ».
- [ ] **Épisodes** : synopsis tirés des chapitres du séquencier, un chapitre valant un épisode avec le gabarit « épisode de série » (`plan.ts`). À vérifier : comment un projet scénario range aujourd'hui ses épisodes.
- [ ] **Grille des fils** (intrigues × épisodes) tirée de `timeline.ts`, déjà calculée.
- [ ] **Annexe pilote** : les premières pages de `scenario.fountain` au format standard, produites par l'export scénario existant et ajoutées au PDF (`copyPages` de pdf-lib).
- [ ] **Mémo personnages** : l'accroche de chaque personnage, sur une page.
- [ ] Rendu Nuit proposé par défaut pour un producteur.

## Lot 5 : « Ce qui change » (après retours des testeurs)

Une case libre sur la carte Scène, avec mentions @ ; elle remplit « Au fil des scènes », qui sait quoi et les objets de la partie « Pour vous ». Plan détaillé à écrire une fois les lots 1 à 3 en mains des testeurs.

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

- Poids des polices embarquées pour les trois rendus, sur le paquet iOS (lot 3, avant de figer les thèmes).
