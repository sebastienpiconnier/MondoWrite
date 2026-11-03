# Plan : écrire les épisodes d'une série

Suite de la Bible v2 (lots 6 et 7 : cartes Épisode, saisons, pivot, grille intrigues × épisodes). Demande de
l'auteur du 26 octobre 2026 : « un projet scénario n'a pas
d'épisodes, un projet = un seul scénario ». Version visée : 1.15.0 (à confirmer).

Aujourd'hui une série se **prépare** dans MondoWrite (les épisodes sont des cartes, avec leurs intrigues et leurs
personnages par les fils), mais ne s'**écrit** pas : il n'y a qu'un `scenario.fountain`, donc un seul texte. Le
gabarit « épisode de série » du séquencier ne découpe qu'un épisode.

## Ce que l'auteur doit pouvoir faire

- Ouvrir le texte de l'épisode 3 depuis sa carte, le séquencier ou la vue Scénario, et l'écrire au format
  standard, avec tout ce que l'éditeur sait déjà faire.
- Voir pour chaque épisode ses scènes, ses pages et sa durée ; pour la saison, le total.
- Exporter un épisode (PDF, Fountain, FDX) ou toute la saison (un PDF par épisode, ou un seul PDF).
- Garder une seule Bible, un seul canevas : un personnage écrit dans l'épisode 5 est la même carte que dans
  le pilote.

## Principes respectés

- **Un seul contenu** : un épisode est une carte Épisode qui existe déjà ; son texte en est le corps, comme le
  texte d'une carte Scène. Aucune liste d'épisodes à tenir à part.
- **La structure émerge** : un scénario sans carte Épisode reste un film, rien ne change. Le texte d'un épisode
  naît au premier « Écrire l'épisode ».
- **Format ouvert** : chaque épisode est un fichier Fountain ordinaire, lisible dans Highland, Fade In, etc.

## Impact sur le format de projet

```
MaSerie/
  scenario.fountain          le pilote : l'épisode de numéro le plus petit de la saison 1, ou le seul texte
  episodes/<id>.fountain     un fichier par autre épisode, au nom de sa carte Épisode
```

- Les cartes Scène d'un épisode sont des cartes ordinaires ; leur en-tête est relié par `[[cosmos:<id>]]` dans
  le fichier de leur épisode. Une carte Scène appartient à l'épisode dont le fichier la cite (lu, jamais écrit
  dans la carte).
- `scenario.fountain` garde son rôle : une version d'avant la 1.15.0 ouvre le projet et voit le pilote, comme
  aujourd'hui. Le dossier `episodes/` lui est inconnu : à vérifier qu'elle ne l'efface pas (l'enregistrement
  ne supprime que les cartes retirées), test dans `forward-compat.test.ts`.
- Nouveau dossier de fichiers texte en `.fountain` : `TEXT_DIRS` ne lit que des `.md`, donc une entrée à part
  dans `readAll` (Tauri) et `deserialize`, `isProjectFilePath`, `isProjectEntry`, `deleteProject`, l'export
  .zip, la surveillance du dossier et les conflits (`conflicts.ts`, une copie « (MondoWrite) » par fichier).
- Changer le numéro des épisodes ne renomme aucun fichier (le nom est l'identifiant de la carte). Quand le pilote
  change (un épisode passe en tête), les deux textes échangent leur fichier en une étape.

**Décision prise (lot 1)** : le premier épisode reste dans `scenario.fountain` (une version d'avant ouvre toujours
le projet et y voit ce texte). C'est le premier épisode **écrit**, noté `pilot` dans `cosmos.json`, et non le plus
petit numéro : il ne change pas de fichier quand on renumérote, ce qui évite tout échange de fichiers. S'il part à la
corbeille, le suivant prend `scenario.fountain`.

## Modèle en mémoire (fait autrement que prévu)

Le plan prévoyait de garder l'épisode ouvert seul dans `screenplay` et les autres à part. Toutes les actions qui
cherchent une scène par sa carte (renommage, corbeille, carte agrandie, recherche, remplacer, versions,
commentaires) auraient alors dû savoir dans quel épisode chercher, sous peine de doubler une scène dans l'épisode
ouvert. Fait à la place (`screenplay/season.ts`) :

- `screenplay` est **toute la saison** : chaque épisode commence par un repère en mémoire (section vide avec
  l'identifiant de sa carte et sa page de titre), jamais écrit. Ces actions voient donc la saison sans rien changer.
- La vue Scénario, le séquencier, la page de titre, la pagination, le ruban, « Vérifier » et l'export lisent
  l'épisode ouvert (`currentScript`) et y écrivent (`setScript`). Leurs rangs d'éléments sont locaux ;
  `scriptOffset` les ramène à la saison pour les actions du store.
- `currentEpisode` est un état d'affichage : le premier épisode à l'ouverture.
- Chaque fichier d'épisode inchangé est réécrit à l'octet près.

## Lot 1 : un texte par épisode

- [x] Format : `EPISODES_DIR`, lecture, écriture, suppression, .zip, surveillance, conflits ; tests d'aller-retour
      (`season.test.ts`, `store-season.test.ts`)
- [x] Store : saison en mémoire, `openEpisode`, `currentEpisode` ; recherche, remplacer et statistiques sur toute
      la saison ; aller à une scène d'un autre épisode (recherche, « À faire », « Aller à ») ouvre cet épisode
- [x] Vue Scénario et séquencier : sélecteur d'épisode (« Ép. 2 · Tempête »), flèches précédent et suivant, menu
      avec « Nouvel épisode » et « à écrire » pour un épisode sans texte. Pas de raccourci clavier pour l'instant
      (le sélecteur se joint à la tabulation) : Cmd/Ctrl + Alt + ↑ / ↓ reste à confirmer sur Mac et Windows
- [x] Carte Épisode : « Écrire l'épisode » dans sa fiche (Bible, carte agrandie) et dans son menu ⋯ ; le texte est
      créé s'il n'existe pas (page de titre du premier épisode, sans date ni version)
- [x] Une scène, un personnage ou un décor écrits dans un épisode reçoivent leur carte (`adoptNew`, inchangé)
- [ ] Fil « dans » entre une scène et son épisode : **pas fait**, à confirmer avec l'auteur (il rendrait
      l'appartenance visible sur le canevas, au prix de beaucoup de fils)
- [x] Supprimer une carte Épisode : son texte part à la corbeille avec elle et revient avec elle
- [ ] Reste à vérifier à la main : app Mac (fichiers `episodes/`, iCloud entre Mac et iPad), iPad (sélecteur au doigt)

Limites connues du lot 1, pour le lot 2 : « Aller à » numérote les pages sur toute la saison ; « Organiser le
canevas » range les scènes de tous les épisodes ensemble (les cases d'un même gabarit dans deux épisodes se
mêlent) ; la grille des fils ne lit pas encore les scènes des épisodes.

## Lot 2 : la saison d'un coup d'œil

- [ ] Séquencier : choix « Cet épisode » ou « Toute la saison » (épisodes en sections repliables, pages et
      minutes par épisode)
- [ ] Gabarit par épisode : chaque fichier a ses propres cases (sections Fountain), le gabarit « épisode de
      série » proposé par défaut au premier texte d'un épisode
- [ ] Grille intrigues × épisodes : une case est aussi « citée » quand une scène de l'épisode relève de
      l'intrigue (fil intrigue → scène), plus seulement par le fil intrigue → épisode
- [ ] Statistiques : présence des personnages par épisode ; « Vérifier » signale un personnage principal absent
      de plusieurs épisodes de suite
- [ ] « Organiser le canevas » : un cadre par épisode, ses scènes dedans

## Lot 3 : exports

- [ ] PDF, Fountain, FDX de l'épisode ouvert (comme aujourd'hui) ; « Toute la saison » : un PDF unique (page de
      titre par épisode) ou un .zip d'un fichier par épisode
- [ ] Bible de série : les épisodes avec leur synopsis, durée réelle quand le texte existe
- [ ] Import : un dossier de fichiers Fountain ou FDX d'une saison devient un projet avec un épisode par fichier

## Fichiers touchés

`storage/paths.ts`, `storage/index.ts`, `storage/tauri.ts`, `storage/browser.ts`, `conflicts.ts`, `store.ts`,
`episodes.ts`, `screenplay/link.ts`, `components/ScreenplayView.tsx`, `Sequencier.tsx`, `ExpandedCard.tsx`,
`Bible.tsx`, `TrashList.tsx`, `trash.ts`, `search.ts`, `replace.ts`, `goto.ts`, `organize.ts`,
`useProjectStats.ts`, `screenplay/export/*`, `export/biblePack.ts`, `i18n/fr.ts`, `i18n/en.ts`, CLAUDE.md
(format, pièges), guide (fr, en).

## Tests

- Unitaires : lecture et écriture d'`episodes/`, échange du pilote, corbeille d'un épisode, appartenance d'une
  scène, recherche et remplacement sur plusieurs épisodes, version d'avant qui garde `episodes/`
- Bout en bout : créer deux épisodes, écrire dans chacun, recharger, vérifier séquencier et grille
- À la main : Mac, iPad (sélecteur au doigt), synchronisation iCloud d'un nouvel épisode
