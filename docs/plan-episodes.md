# Plan : écrire une série, saison par saison, épisode par épisode

Demande de l'auteur du 26 octobre 2026 (un projet scénario n'a pas d'épisodes), puis du 3 novembre 2026 après un
premier essai : **pas de carte Saison ni de carte Épisode** (trop de types de cartes), mais une structure en
cadres sur le canevas, Saison › Épisode › scènes, et un plan de série dans le séquencier.

## Décisions de l'auteur (3 novembre 2026)

- **Un seul fichier** : toute la série dans `scenario.fountain`.
- **Saisons et épisodes sont des niveaux du plan**, pas des cartes. Le canevas les montre en cadres imbriqués.
- **Personnage pivot et repère** (mi-saison, fin de saison) d'un épisode : abandonnés.
- **Scènes pas encore placées** : elles attendent dans un cadre « À placer », comme pour les cases d'un gabarit.

## Le premier essai (lot 1 du 3 novembre), remplacé

Il donnait un fichier par épisode (`episodes/<id>.fountain`, `pilot` dans cosmos.json), un sélecteur d'épisode et
« Écrire l'épisode » sur la carte Épisode. **Rien n'a été publié** (pas de version, pas d'étiquette) : il ne faut
pas publier de version avant la fin du nouveau lot 1, qui retire ce format. On en garde le principe de lecture
d'un épisode seul dans la vue Scénario et le séquencier (`currentScript`, rangs locaux et `scriptOffset`), qui
s'appuiera sur les sections au lieu des repères en mémoire.

## Format : des sections Fountain

```fountain
Title: Le Phare

# Saison 1 : La relève [[cosmos:season:a8k2m4q9xb]]

## Le signal [[cosmos:episode:k3x9a7bq2m]]
= Inès entend un signal venu du large.

### Catalyseur [[cosmos:beat:c_catalyst]]

INT. PHARE, LANTERNE - NUIT [[cosmos:s8k2m4q9xa]]
...

## Tempête [[cosmos:episode:p4t8w2zq1c]]
...
```

- Saison : section de niveau 1 ; épisode : niveau 2 ; case de gabarit : niveau 3 (dans un film, les cases restent
  au niveau 1, rien ne change). La note porte un identifiant stable, pour que le cadre de l'épisode sur le
  canevas et ses scènes le retrouvent même renommé. Elle ne s'affiche jamais (comme celle des cases).
- Titre de la saison et de l'épisode : le texte de la section. **Numéro d'un épisode : sa place dans la saison**,
  jamais écrit. Synopsis d'un épisode : la ligne `= …` sous sa section (Fountain la prévoit).
- Une scène appartient à l'épisode dans la section duquel elle est écrite. Rien n'est recopié dans sa carte.
- Une série sans saison nommée : le premier « Nouvel épisode » crée « Saison 1 » ; on la renomme quand on veut.
- Les autres logiciels (Highland, Fade In…) voient de simples sections ; une version d'avant de MondoWrite aussi
  (elle les montre comme sections et les garde).

## Ce qui disparaît

- **Le type de carte Épisode** n'est plus proposé. À l'ouverture d'un projet qui en a, chaque carte Épisode
  devient une section d'épisode, dans l'ordre de la série (`episodeOrder`), regroupée par sa `saison` en
  « Saison 1 », « Saison 2 »… ; son titre devient celui de la section, son synopsis la ligne `= …`. La carte part
  à la **corbeille** (avec pivot, repère et fils : rien n'est effacé pour de bon, l'auteur peut la remettre). Les
  anciennes lignes de la couverture (`pitch.episodes`) deviennent aussi des sections.
- **La grille intrigues × épisodes** se calcule à partir des scènes : une intrigue est dans un épisode si une de
  ses scènes y est reliée (ou la nomme). Même chose pour « les épisodes où paraît chaque personnage ».
- Le format du premier essai (`episodes/`, `pilot`) : retiré du code avant toute publication.

## Lot 1 : le plan de la série

- [x] `screenplay/series.ts` (pur) : saisons et épisodes lus dans les sections (titre, identifiant, rang, synopsis,
      scènes), épisode d'une scène, ajouter, renommer, déplacer, supprimer une saison ou un épisode, déplacer une
      scène d'un épisode à un autre (avec son texte) ; tests à 90 % comme le reste de `src/screenplay/`
- [x] Séquencier en arbre : Saison › Épisode › (case) › scènes ; « Nouvelle saison », « Nouvel épisode » (dans la
      saison choisie), titres modifiables sur place, synopsis de l'épisode, replier et déplier, déplacer par
      glisser et par flèches (un épisode change de saison, une scène d'épisode), pages et minutes par épisode et
      par saison. Supprimer une saison ou un épisode : son texte n'est jamais perdu (il rejoint l'épisode
      précédent, après confirmation, comme un chapitre du roman)
- [x] Vue Scénario : le sélecteur montre l'épisode ouvert (liste tirée des sections) ; l'éditeur ne montre que
      cet épisode, comme dans le premier essai ; « Tout » pour voir la saison d'un bloc
- [x] Reprise des cartes Épisode et des lignes de la couverture (voir plus haut), une fois, à l'ouverture
- [x] Retrait du format du premier essai (`episodes/`, `pilot`, repères en mémoire, « Écrire l'épisode »)
- [x] Textes fr et en, guide (fr, en), CLAUDE.md (format, pièges), tests unitaires et de bout en bout

Reste du lot 1 : un épisode se déplace par son menu (Monter, Descendre), pas encore en le glissant ; retirer une
saison ou un épisode ne demande pas de confirmation (le texte reste, Cmd/Ctrl + Z l'annule). La bible de série
lit les sections comme des épisodes (numéro, saison, synopsis) en attendant le lot 3.

## Lot 2 : le canevas en cadres

- [x] « Organiser » dessine les cadres imbriqués : un par saison, un par épisode dedans (titre « Ép. 3 · Tempête »),
      les cases du gabarit de l'épisode dedans, les scènes à l'intérieur ; « À placer » pour les cartes Scène pas
      encore écrites dans un épisode
- [x] Le cadre d'un épisode porte son identifiant (comme `beat` pour une case) : une scène lâchée dans un cadre
      d'épisode y passe, son texte avec elle, à la place que donne sa position (comme `dropIntoBeats`)
- [x] Le canevas suit le récit (`followStory`) quand l'ordre change dans le séquencier
- [x] Hiérarchie des titres de cadres (saison > épisode > case) dans `frameLevels.ts`

Fait (3 novembre) : les cases du gabarit dans l'épisode attendent le lot 3 (gabarit par épisode) ; la hiérarchie
des titres vient de la profondeur des cadres (`frameDepth`), la saison prend le style d'une case de gabarit.

## Lot 3 : Bible, vérifications, exports

- [x] Bible : la rubrique « Épisodes » liste les sections (saison, titre, synopsis modifiable), « Nouvel épisode »
      de la couverture crée une section ; export de la bible de série et grille des fils calculée
- [x] Gabarit par épisode : chaque épisode a ses propres cases (niveau 3), « épisode de série » proposé par défaut
- [x] « Vérifier » : série sans épisode, longueur de chaque épisode selon le format de la couverture, personnage
      principal absent de plusieurs épisodes de suite
- [x] Exports : PDF, Fountain et FDX d'un épisode, d'une saison ou de toute la série (une page de titre par épisode)
- [x] Statistiques et « Aller à » par épisode

Fait (3 novembre). Reste : l'export de toute la série met une seule page de titre (une par épisode quand on
exporte un épisode ou une saison) ; le gabarit de l'auteur (« Mes gabarits ») ne se pose pas encore par épisode.

## Fichiers touchés (lot 1)

`screenplay/series.ts` (nouveau), `screenplay/template.ts` (cases au niveau 3 dans une série),
`screenplay/sequence.ts`, `screenplay/season.ts` (retiré ou réécrit sur les sections), `projectState.ts`,
`storage/*` (retrait de `episodes/`), `store.ts`, `episodes.ts`, `types.ts` (Épisode plus proposé),
`components/Sequencier.tsx`, `ScreenplayView.tsx`, `EpisodePicker.tsx`, `CardSheet.tsx`, `CardActions.tsx`,
`Bible.tsx`, `ProjectCover.tsx`, `i18n/fr.ts`, `i18n/en.ts`, guide, CLAUDE.md, tests.
