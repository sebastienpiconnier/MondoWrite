# Plan : révisions de scénario

Demande de l'auteur du 3 novembre 2026, d'après Final Draft et Fade In. Version visée : à fixer (après les
épisodes).

Quand un scénario part en préparation, chaque nouvelle version circule sur des pages de couleur, les lignes
changées sont marquées d'un astérisque dans la marge, et les pages sont **verrouillées** : une page ajoutée
devient 12A, une page retirée laisse « 13-14 » sur la précédente, pour que toute l'équipe garde les mêmes
numéros. C'est attendu des scénaristes professionnels.

## Ce que l'auteur doit pouvoir faire

- Ouvrir une passe de révision (« Révision bleue, 3 novembre ») : désormais, tout élément modifié ou ajouté
  porte la marque de cette passe.
- Voir les marques à l'écran (astérisque dans la marge droite, couleur de la passe en fond discret) et les
  imprimer (astérisque, en-tête de page « Révision bleue – 03/11/2026 »).
- Verrouiller les pages : les numéros ne bougent plus, les ajouts deviennent 12A, 12B, les retraits laissent
  « OMIS » ou fusionnent les numéros.
- Imprimer seulement les pages révisées d'une passe (envoi à l'équipe).
- Effacer les marques (« Nouvelle version propre ») sans toucher au texte.

## Principes respectés

- **Rien d'obligatoire** : un scénario sans passe ouverte ne change pas.
- **Format ouvert** : le texte reste du Fountain. Fountain ne sait pas noter les révisions : la marque est une
  note `[[cosmos:rev:<n>]]` en fin d'élément, comme les commentaires (`[[cosmos:comment:<id>]]`), ignorée par
  les autres logiciels. L'export FDX écrit les révisions de Final Draft (`Revision ID`, ensemble des
  révisions), et l'import FDX les relit.

## Impact sur le format de projet

- Dans `scenario.fountain` (et chaque fichier d'épisode) : ` [[cosmos:rev:2]]` en fin d'action, de réplique,
  de didascalie, d'en-tête ou de transition modifiés pendant la passe 2. Une seule marque par élément (la plus
  récente). Ordre des notes : `[[ia]]`, révision, commentaires.
- Dans `cosmos.json`, bloc facultatif `revisions` (dans `KNOWN_META`) :
  `{ "sets": [{ "n": 1, "color": "bleu", "date": "2026-11-03", "label": "" }], "current": 1, "locked": { "pages": [...] } }`.
  Couleurs dans l'ordre d'usage américain (blanc, bleu, rose, jaune, vert, or, saumon, chamois…), clés jamais
  traduites.
- Pages verrouillées : on garde, à l'instant du verrouillage, l'élément qui ouvre chaque page (par son rang et
  un extrait), pour recalculer les pages A et les omissions ; c'est une donnée du projet, pas un affichage.
- Une version d'avant garde le bloc `revisions` (clé inconnue) et montre la note dans le texte de l'élément,
  comme `[[ia]]` : accepté.

## Lot 1 : passes et marques

- [ ] `screenplay/revisions.ts` (pur) : lire et écrire la note, élément modifié par rapport à l'instantané pris à
      l'ouverture de la passe (comparaison élément par élément avec `textDiff.ts`), effacement
- [ ] Éditeur : attribut `rev` des nœuds (non repris par Entrée, comme `comments`), astérisque en marge par
      décoration, fond de la couleur de la passe (jetons `--rev-<couleur>` dans les deux thèmes, contraste
      vérifié)
- [ ] Barre du scénario, menu ⋯ : « Ouvrir une révision… » (couleur proposée, date, nom facultatif),
      « Fermer la révision », « Effacer les marques »
- [ ] PDF : astérisque en marge, en-tête de la passe sur les pages révisées, option « Seulement les pages
      révisées »
- [ ] FDX : écrire et relire les révisions

## Lot 2 : pages verrouillées

- [ ] `paginate.ts` et `typeset.ts` : pagination contrainte par les pages verrouillées (12A, 12B ; « 13-14 »),
      même résultat à l'écran (`pages.ts`) et dans le PDF
- [ ] Numéros de scène verrouillés aussi (une scène ajoutée entre 12 et 13 devient 12A), en s'appuyant sur les
      numéros déjà gardés dans le fichier (`#12A#`)
- [ ] « Déverrouiller » rend une pagination libre, après confirmation

## Fichiers touchés

`screenplay/revisions.ts` (nouveau), `screenplay/parse.ts`, `serialize.ts`, `rules.ts`, `editor/nodes.ts`,
`editor/convert.ts`, `editor/pages.ts`, `paginate.ts`, `export/typeset.ts`, `export/pdf.ts`, `export/fdx.ts`,
`fdxImport.ts`, `components/ScreenplayView.tsx`, `ScriptPdfPanel.tsx`, `store.ts`, `styles.css` (jetons),
`i18n/fr.ts`, `i18n/en.ts`, CLAUDE.md, guide.

## Tests

Couverture à 90 % sur `src/screenplay/` comme le reste : marques à l'aller-retour Fountain et FDX, élément
modifié puis remis à l'identique (marque retirée ou gardée : à décider, Final Draft la garde), pages A,
omissions, PDF des seules pages révisées.
