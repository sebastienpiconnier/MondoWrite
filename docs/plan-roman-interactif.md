# Roman interactif / Interactive novel

Issue #84. Étude complète (outils, structures, formats, publication, points juridiques) : document « MondoWrite Interactif »
de novembre 2026. Ce plan n'en garde que les décisions et le détail de chaque lot.

## Décisions (14 et 16 novembre 2026)

- **Un type de projet dans MondoWrite**, pas une app séparée, promu sous le nom « MondoWrite Interactif ».
- **D'abord derrière une option « Fonctions expérimentales »** (réglage de l'appareil, coupé par défaut).
- **La forme du livre-jeu, sans son système de jeu** : des liens entre scènes et des variables simples (objets,
  clés, mots de passe). Pas de caractéristiques prédéfinies, pas de combats, pas de dés intégrés.
- **Ne jamais écrire « livre dont vous êtes le héros »** (marque de Gallimard) : « livre-jeu », « roman
  interactif », « fiction interactive ». Rien de l'univers ni du texte des règles des Défis fantastiques.
- **Langage Ink** (inkle, MIT) comme format compilé ; les scènes restent en Markdown, les choix dans un bloc
  ` ```choix ` en fin de scène (syntaxe Ink réduite : `*`, `->`, `~`, `{ }`).
- **Le canevas construit l'arborescence** dans une vue à part, « Carte des choix », synchronisée avec le texte
  dans les deux sens ; le canevas actuel et son fichier ne sont jamais touchés.
- **Images dans le récit** : fonction du cœur, utile aussi aux romans classiques (lot 1).
- **Export web d'abord**, livre-jeu imprimé ensuite (EPUB, PDF, sections mélangées et numérotées).
- **Assistant externe (MCP)** : outils propres aux projets interactifs (lot 6).
- Une édition séparée reste possible plus tard : même dépôt, même format de projet, conteneur iCloud partagé.

## Lots

| Lot | Contenu |
| --- | --- |
| 0. Isolation | Ce document ; voir ci-dessous |
| 1. Images (cœur) | `images/`, insertion, texte alternatif, exports |
| 2. Carte des choix | Vue dédiée, flèches de choix, scène créée par une flèche, bloc `choix` |
| 3. Lecture et compilation | Ink (bladeink côté Rust ou inkjs), Mode Lecture, « tester à partir d'ici » |
| 4. Variables | Objets, clés, mots de passe ; conditions sur les flèches |
| 5. Vérificateur | Impasses, inaccessibles, parties automatiques, mise en page automatique |
| 6. Assistant IA interactif | Outils MCP |
| 7. Export web | HTML autonome |
| 8. Export livre-jeu | Mélange, numérotation, « rendez-vous au N », EPUB et PDF |
| 9. Import | Twee 3 et Ink |
| 10. Storylets | Option, à décider après retours |

## Lot 0 · Isolation (fait sur la branche `roman-interactif`)

Règle : un roman ou un scénario existant ne voit, ne lit ni ne modifie rien de la partie interactive.

- **Format** : un roman interactif est un **roman** (`kind` « roman ») dont `cosmos.json` porte en plus
  `interactive: true`. La clé n'est pas dans `KNOWN_META` : elle voyage dans `metaKeep` et toute version depuis
  octobre 2026 la réécrit telle quelle. Une version sans le module, ou avec l'option coupée, ouvre donc ce projet
  comme un roman sans rien perdre. Pas de troisième `kind` : tout le code qui teste `kind === "scenario"` reste
  juste, et `useVocab` n'a rien à apprendre.
- **Module** : `src/interactive/` (pur, testé par `src/__tests__/interactive.test.ts`). Tout ce qui touche à la
  fiction à choix passe par lui : `isInteractiveMeta`, `interactiveMeta`, `readExperimental`,
  `interactiveOffered`, `showsInteractive`. Les lots suivants y ajoutent leurs fichiers.
- **Option expérimentale** : réglage de l'appareil `experimental` (`{ interactive: boolean }`, settings.ts),
  case « Roman interactif » sous « Fonctions expérimentales » (Réglages, onglet général). Coupée : la page des
  projets ne propose pas le roman interactif, et un roman interactif s'ouvre comme un roman.
- **Création** : « Un roman interactif » sur la page des projets, seulement si l'option est active ;
  `createProject({ …, interactive: true })` pose `kind: "roman"` et `interactive: true`.
- **Option de compilation** : `VITE_NO_INTERACTIVE=1` fabrique une version sans le module (`INTERACTIVE_BUILD`
  faux) : ni case dans les Réglages, ni type proposé.
- **Projet ouvert** : Réglages › Ce projet dit « Roman interactif » sous le type (option active seulement).
- **Pas encore** : crate Rust dédiée (arrive avec la compilation Ink, lot 3), libellé dans la liste des projets
  (la liste ne garde que `kind`).
