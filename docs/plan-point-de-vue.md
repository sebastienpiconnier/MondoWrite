# Plan : point de vue d'une scène (préalable A)

Premier des chantiers préalables à l'import Scrivener (`docs/plan-import-scrivener.md`, « Préalables »).
Version visée : 1.13.0 (à confirmer).

Dans un roman choral, chaque scène est vue par un personnage : Ethan, puis Violette, puis Ethan… L'auteur a
besoin de choisir ce narrateur, de voir l'alternance d'un coup d'œil, et de relire le fil d'un seul narrateur.
Aujourd'hui MondoWrite ne connaît le point de vue qu'à l'échelle du projet (pastille `pov` de la couverture :
première personne, troisième…). Dans Scrivener, c'est l'usage n° 1 des étiquettes (le tutoriel conseille de
renommer « Label » en « POV »).

Ce qui ne change pas : le point de vue du projet (couverture) reste la **forme** de la narration ; le point de
vue d'une scène dit **qui** raconte. Les deux sont indépendants.

## Principes respectés

- **Facultatif, sans formulaire** : une scène sans point de vue est normale. Rien ne le demande, rien ne le
  remplit à la place de l'auteur.
- **Un seul contenu** : le choix vit dans la fiche de la scène ; toutes les vues le lisent. Aucun fil n'est
  créé (le point de vue n'est pas une présence de plus à tenir en double).
- **Trois chemins** : souris (pastille, menu), doigt (pastille ≥ 44 px), clavier (même menu que le statut :
  flèches, Entrée, Échap).

## Impact sur le format de projet

Une clé de plus dans la fiche d'une carte Scène : **`fiche.pov`**, identifiant d'une carte Personnage, comme
`fiche.pivot` d'un Épisode.

```markdown
---
id: s8k2m4q9xa
type: scene
title: "La rencontre avec Ambre"
fiche: {"synopsis":"Ethan croise Ambre au parc.","statut":"fini","pov":"p4t8w2zq1c"}
---
```

- Clé écrite, jamais traduite, jamais renommée. Dans `SCENE_FIELDS` (`character.ts`).
- Lecture : gardée seulement si elle désigne une carte **Personnage** qui existe ; sinon la scène s'affiche
  « sans point de vue » mais la clé reste dans le fichier (un personnage remis de la corbeille retrouve ses
  scènes). Elle disparaît quand l'auteur choisit un autre narrateur ou « Aucun ».
- Renommer le personnage ne touche à rien (c'est un identifiant).
- Versions précédentes : depuis octobre 2026 elles gardent les champs de fiche inconnus (`keep.fiche`) ;
  celles d'avant la perdent à l'enregistrement, comme toute clé nouvelle. Test dans `forward-compat.test.ts`.
- Roman et scénario : même clé, même fichier `cartes/` (la fiche n'est pas dans le Fountain). Basculer de type
  de projet ne touche à rien.

## Factorisation préalable

`pivot` est aujourd'hui un cas à part, écrit en dur dans `export/canvas.ts`, `export/doc.ts`,
`CardSheet.tsx` et `ai/semantic.ts` (`key === "pivot"`). Avant d'ajouter `pov`, une seule notion :

- `CARD_REF_FIELDS = { pivot: "personnage", pov: "personnage" }` dans `character.ts` : champs qui désignent
  une carte, avec le type attendu.
- `cardRef(card, key, cards)` (pur) : la carte désignée si elle existe et a le bon type, sinon `null`.
  `pivotOf` (episodes.ts) l'utilise.
- Exports et IA : un champ de `CARD_REF_FIELDS` s'écrit avec le **titre** de la carte, jamais son
  identifiant ; `semantic.ts` le range dans `CODE_FIELDS`.
- `CardSheet` : un seul composant de choix d'une carte (liste des Personnages), pour `pivot` comme pour `pov`.

## Lot 1 : choisir et retrouver

- [x] `fiche.pov`, `CARD_REF_FIELDS`, `cardRef`, factorisation de `pivot` (tests : carte absente, mauvais type,
      personnage à la corbeille puis remis, renommage)
- [x] **Pastille « Point de vue »** (`PovPicker.tsx`, sur le modèle de `SceneStatusPicker`) : portrait rond ou
      initiale et prénom, « Point de vue » en texte indicatif quand il n'y en a pas. Menu : les personnages
      (ceux déjà narrateurs d'abord, puis par nombre de scènes où ils paraissent), « Aucun », et
      « Nouveau personnage… » qui crée la carte (titre saisi dans le menu) et la choisit. Placée à côté du
      statut partout où il est (roman ; en scénario, seulement dans la carte agrandie, voir décision 1) : en-tête de scène du Manuscrit, carte agrandie (`SceneDraft`,
      `ExpandedCard`), fiche de la Bible (Séquencier : lot 2)
- [x] Une seule étape d'annulation par choix (`setFiche`, comme le statut)
- [x] **Carte Scène sur le canevas** : la pastille du narrateur (portrait ou initiale cerclée de
      `--type-personnage`, et son nom) sous le statut, seulement s'il y en a un ; elle ouvre le même menu
- [x] **Bible, fiche d'un personnage** : ligne « Narrateur de N scènes (M mots) », qui déplie la liste ; un
      clic ouvre la scène dans le Manuscrit
- [x] Exports qui écrivent la fiche d'une scène (Bible en PDF, Word, Markdown, copies Markdown, canevas) :
      « Point de vue : Ethan », jamais l'identifiant (`ficheValue`). `export/outline.ts` ne fait que les signets
      du PDF : rien à y changer
- [x] Textes `t.pov.*` dans `fr.ts` puis `en.ts`
- [x] Tests : `pov.test.ts`, deux cas dans `une-action-une-etape`, un dans `forward-compat`, bout en bout
      `npm run e2e -- "point de vue"`. Reste à vérifier sur l'app Mac et sur iPad (pastille au doigt, menu avec
      le clavier virtuel)

## Lot 2 : voir l'alternance

- [ ] **Plan** (roman) : pastille du narrateur sur chaque scène ; **Séquencier** (scénario) : la même, dès qu'une scène du projet a un point de vue
- [ ] **Ruban du récit** : mode « Par point de vue » ; chaque segment de scène prend la couleur de son
      narrateur (couleurs dérivées des jetons existants, contraste vérifié en clair et en sombre, nom au survol
      **et** au toucher, légende sous le ruban). On voit d'un coup d'œil qu'Ethan raconte huit scènes de
      suite. Le mode est un réglage de l'appareil, pas du projet
- [ ] **Chronologie** (`timeline.ts`) : nouvel état de case `"pov"` (plus fort que `"linked"`) sur la ligne du
      personnage narrateur, dessiné plein
- [ ] **Chiffres des personnages** (`review/report.ts`, Bible › Personnages › Chiffres) : colonnes « En point
      de vue : scènes, mots, part du livre », et dans l'export CSV
- [ ] **Filtre « Ses scènes en point de vue »** : dans le Manuscrit, ne montrer que les scènes d'un narrateur,
      dans l'ordre du livre, pour relire son fil d'un trait (les autres scènes sont repliées en une ligne
      « 3 scènes de Violette », jamais cachées sans trace) ; et dans le filtre du canevas. Un affichage, rien
      n'est écrit

## Lot 3 : aller plus loin

- [ ] **Vérifier** (`review/checks.ts`, roman) : scènes sans point de vue quand la plupart en ont un ; narrateur
      absent sur une longue suite de chapitres (seuil à régler, par exemple un quart du livre) ; signalé,
      jamais corrigé
- [ ] **Export du manuscrit** : option « Nom du narrateur en tête de chapitre ou de scène » (romans choraux
      qui titrent « Ethan », « Violette »), dans les réglages d'export existants (PDF, Word, EPUB, broché)
- [ ] **Suggestion discrète** : sur une scène sans point de vue, le personnage le plus cité dans son texte est
      proposé dans le menu (« Ethan ? »), un clic pour le prendre. Calculé avec `detectCards`, sans IA
- [ ] **Relecture par l'IA, voix** (`ai/review.ts`) : quand des scènes ont un narrateur, comparer la voix des
      scènes d'un même narrateur entre elles (plutôt que tout le livre d'un bloc). Optionnel, IA branchée

## Fichiers touchés

`character.ts`, `episodes.ts`, `types.ts` (rien de neuf si `fiche` reste un `Record`), `store.ts` (choix,
nouveau personnage), `components/PovPicker.tsx` (nouveau), `SceneStatusPicker.tsx` (style partagé),
`Manuscript.tsx`, `SceneDraft.tsx`, `ExpandedCard.tsx`, `Bible.tsx`, `Sequencier.tsx`, `Plan.tsx`,
`CardNode.tsx`, `CardSheet.tsx`, `StoryRibbon.tsx` et `ribbon.ts`, `timeline.ts` et `Timeline.tsx`,
`review/report.ts`, `review/checks.ts`, `canvasFilter.ts`, `export/canvas.ts`, `export/doc.ts`,
`export/outline.ts`, `export/biblePack.ts`, `ai/semantic.ts`, `i18n/fr.ts`, `i18n/en.ts`, `styles.css`
(jetons), CLAUDE.md (format, architecture), guide (fr et en).

## Tests

- **Unitaires** : `cardRef` et la factorisation de `pivot` (aucune régression des tests d'épisodes) ; lecture
  et écriture de `fiche.pov` ; personnage supprimé, remis, renommé ; ruban par point de vue ; chronologie
  `"pov"` ; chiffres ; filtre ; points de « Vérifier ».
- **Contraste** : les couleurs des narrateurs sur le ruban, 3:1 sur `--surface` dans les deux thèmes (comme le
  test des `--type-*`).
- **Bout en bout** : `npm run e2e -- pov` (choisir un narrateur depuis le Manuscrit, le voir sur la carte, dans
  la Bible et le ruban, annuler, recharger).
- **À la main** : souris, tactile émulé (iPad, iPhone ≤ 720 px), clavier seul ; français et anglais ; clair et
  sombre ; roman et scénario ; un projet ouvert dans la 1.12.0 après avoir posé des points de vue (la clé
  reste).

## Décisions (tranchées le 2 novembre 2026)

1. **Scénario** : le point de vue se choisit dans la fiche de la carte agrandie ; la pastille du Séquencier
   n'apparaît que dès qu'une scène du projet a un point de vue. Le roman a la pastille partout.
2. **Un seul narrateur par scène.** Une scène à deux regards se coupe en deux scènes.
3. **Seules les cartes Personnage** peuvent être narratrices ; pour un autre narrateur, l'auteur transforme sa
   carte d'un `/`.
4. **Couleur d'un narrateur calculée et stable** (même personnage, même couleur partout) ; un choix par
   l'auteur viendra seulement si on le demande.
