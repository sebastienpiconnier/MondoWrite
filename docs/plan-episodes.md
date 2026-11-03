# Plan : écrire les épisodes d'une série

Suite de la Bible v2 (lots 6 et 7 : cartes Épisode, saisons, pivot, grille intrigues × épisodes). Demande de
l'auteur du 26 octobre 2026 (`docs/demandes-evolution.md`, reprise ici) : « un projet scénario n'a pas
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

**Décision à prendre (auteur)** : le pilote dans `scenario.fountain` (compatibilité, choix proposé) ou tous les
épisodes dans `episodes/` (plus régulier, mais une version d'avant ne verrait plus aucun texte).

## Modèle en mémoire

- Le store garde le texte de **l'épisode ouvert** dans `screenplay` (tout le code actuel continue de lire ce
  seul scénario) et les autres dans `episodeTexts: Record<id, Screenplay>`, chargés à l'ouverture (fichiers
  courts) ou à la demande si un gros projet le demande.
- `openEpisode(id)` : envoie ce qui attend dans l'éditeur, range le texte courant, met celui de l'épisode dans
  `screenplay`. L'historique d'annulation du canevas repart de zéro, comme pour toute frappe venue de l'éditeur.
- `savedScreenplay` et la règle « réécrit à l'octet près » valent pour chaque fichier.

## Lot 1 : un texte par épisode

- [ ] Format : `EPISODES_DIR`, lecture, écriture, suppression, .zip, surveillance, conflits ; tests d'aller-retour
- [ ] Store : `episodeTexts`, `openEpisode`, `currentEpisode` ; recherche, remplacer, « Aller à » et
      statistiques sur tous les épisodes (pas seulement l'ouvert)
- [ ] Vue Scénario : sélecteur d'épisode en tête de la liste des scènes (« Ép. 3 · Le phare »), flèches pour
      passer au suivant ; Cmd/Ctrl + Alt + ↑ / ↓ ; menu ⋯ « Nouvel épisode »
- [ ] Carte Épisode : bouton « Écrire l'épisode » (carte agrandie, Bible), qui crée le fichier s'il n'existe pas
      (page de titre reprise du pilote, titre de l'épisode)
- [ ] Une scène, un personnage ou un décor écrits dans un épisode reçoivent leur carte (`adoptNew`) ; la scène est
      reliée à son épisode par un fil « dans » (proposé, à confirmer : le fil rend visible l'appartenance sur le
      canevas et dans la grille)
- [ ] Supprimer une carte Épisode : son texte part à la corbeille avec elle (comme une Scène), jamais perdu

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
