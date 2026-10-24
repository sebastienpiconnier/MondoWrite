# Plan : outils de relecture (lot 1)

Idée reprise de WriterSolo (version hors ligne de WriterDuet), adaptée aux principes de MondoWrite : l'outil
**signale**, l'auteur **décide**. Rien n'est corrigé tout seul, aucune IA, aucun appel réseau. Tout est calculé
sur l'appareil, à partir du texte déjà là.

Trois fonctions qui partagent la même lecture du texte :

1. **Vérification** : une liste de points à regarder (noms presque identiques, action trop longue, espaces en trop…).
2. **Filtre par personnage** (scénario) : ne montrer que ses scènes, ou que ses répliques.
3. **Rapports** : scènes, répliques et temps de parole par personnage, répartition par genre.

## Impact sur le format de projet

**Aucun.** Rien n'est écrit dans `cosmos.json`, `cartes/`, `manuscrit/` ni `scenario.fountain`. Les points
ignorés par l'auteur sont un état d'affichage de la session (pas de fichier en plus). Le filtre est un état
d'affichage, comme le filtre du canevas. Les versions précédentes de l'app ne voient aucune différence.

## 1. Vérification

### Règles (fonctions pures, `src/review/checks.ts`)

Scénario (sur `Screenplay.elements`) :

| Clé | Ce qui est signalé | Seuil |
|---|---|---|
| `similarNames` | Deux noms de personnage presque identiques (« INES » et « INÈS », « JEAN-PAUL » et « JEAN PAUL », une lettre d'écart) | distance d'édition ≤ 1 sur les noms sans accents, ou égaux sans accents ni tirets |
| `rareName` | Un nom qui ne parle qu'une fois alors qu'un nom proche parle souvent (faute de frappe probable) | 1 réplique contre ≥ 3 |
| `longAction` | Paragraphe d'action trop long | plus de 4 lignes une fois mis en page (`typeset`) |
| `extraSpaces` | Espaces doubles, espace en début ou fin d'élément | |
| `headingFormat` | En-tête sans INT., EXT., INT./EXT. ou sans moment (JOUR, NUIT…) | prefixes de `headingParts` |
| `emptyElement` | Élément vide (personnage sans réplique, didascalie vide) | |
| `unknownCharacter` | Personnage qui parle sans carte Personnage (proposer de la créer) | |

Roman (sur le HTML du manuscrit, par scène) :

| Clé | Ce qui est signalé |
|---|---|
| `similarNames` | Noms de cartes Personnage ou Lieu presque identiques à un nom écrit dans le texte (« Inés » pour « Inès ») |
| `extraSpaces` | Espaces doubles, espace avant une virgule ou un point (en français : espace manquante avant `; : ! ?` si la typographie est en `fr`) |
| `longParagraph` | Paragraphe de plus de 250 mots (facultatif, réglable plus tard) |

Chaque règle rend des `Finding` :

```ts
interface Finding {
  rule: RuleKey;          // clé fixe, jamais traduite
  sceneId: string | null; // carte Scène concernée
  at: number;             // index de l'élément (scénario) ou position dans la scène (roman)
  text: string;           // extrait, pour la liste
  names?: string[];       // pour similarNames : les noms en cause
}
```

### Interface

- Vue Scénario et vue Manuscrit : la colonne de droite a deux **onglets**, « Dans cette scène » et « Vérifier »
  (décidé le 24 oct. 2026). Le bouton **« Vérifier · N »** de la barre au-dessus de la page ouvre l'onglet et donne le
  nombre de points.
- Le panneau groupe les points par règle, avec leur nombre. Un point se clique : la vue va à la scène et sélectionne
  l'élément ou le passage. **« Ignorer »** le retire de la liste pour la session.
- Pour `similarNames` : un bouton **« Renommer partout… »** qui ouvre la fenêtre existante (`ReplacePanel`, `renameId`)
  avec le nom à garder. Pour `unknownCharacter` : **« Créer la carte »** (`addTitledCard`). Rien d'autre n'est
  modifié par le panneau.
- Raccourci : aucun (pour ne pas en ajouter un de plus) ; commande dans le menu Édition du Mac
  (« Vérifier le texte… »).
- Téléphone : le panneau s'ouvre en feuille, comme les autres panneaux latéraux.

### Fichiers

- `src/review/checks.ts` (nouveau, pur) : règles du scénario et du roman.
- `src/review/names.ts` (nouveau, pur) : normalisation (sans accents, sans tirets), distance d'édition.
- `src/components/ReviewPanel.tsx` (nouveau) : liste, navigation, Ignorer.
- `src/components/ScreenplayView.tsx`, `src/components/Manuscript.tsx` : bouton et panneau.
- `src/appMenu.ts` : commande du menu Édition.
- `src/i18n/fr.ts`, `en.ts` : `review.*` (noms des règles, aide de chaque règle).
- `src/__tests__/review-checks.test.ts` : chaque règle, cas positif et négatif, dans les deux langues.

## 2. Filtre par personnage (scénario)

- Dans la vue Scénario, la liste des scènes reçoit un choix **« Personnage »** : tous, ou un nom (tirés de
  `sceneCharacters`).
- Deux modes : **« Ses scènes »** (la liste et la feuille ne gardent que les scènes où il parle ou est cité dans
  l'action) et **« Ses répliques »** (dans ces scènes, les autres éléments sont estompés, comme le mode focus ; on peut
  toujours écrire partout).
- Réalisé par décorations ProseMirror (comme `focusWriting.ts`) : le document n'est pas coupé, rien n'est écrit.
  Les scènes masquées le sont par une décoration de nœud (`display: none`), les coupures de page passent alors en
  « feuille continue » pour ne pas mentir sur la pagination.
- Raccourci depuis la Bible : sur la fiche d'un personnage d'un scénario, **« Voir ses scènes dans le scénario »**.
- Fichiers : `src/screenplay/editor/characterFilter.ts` (nouveau, décorations), `ScreenplayView.tsx`, `Bible.tsx`,
  i18n, test des scènes retenues (fonction pure `scenesWith(elements, name)`).

## 3. Rapports

- Dans la Bible, rubrique Personnages : une troisième présentation, **« Fiches · Relations · Chiffres »** (décidé le
  24 oct. 2026), état d'affichage comme « Relations ». Pas de fenêtre : le tableau a la largeur de la page.
  - un clic sur un nom ouvre sa fiche ; dans un scénario, « Ses répliques » mène au filtre par personnage ;
  - chaque fiche personnage montre aussi une ligne discrète sous le nom : « 3 scènes · 14 répliques · 38 % du temps
    de parole » (roman : « 3 scènes où il est cité »).
- Le tableau :
  - scénario : scènes, répliques, mots dits, part du temps de parole, première et dernière apparition (n° de scène) ;
  - roman : scènes où le personnage est cité (`detectCards`), mots des scènes où il apparaît ;
  - **répartition par genre** à partir du champ `genre` de la fiche (valeur libre de l'auteur : on groupe les valeurs
    telles qu'écrites, plus « non renseigné ») : nombre de personnages, de répliques, de mots dits.
- Tri par colonne, export CSV par `storage.saveAs` (un seul format, lisible par tout tableur).
- Le tableau suit `useVocab` (Décor, Lieu…) et la langue pour les nombres (`Intl`).
- Fichiers : `src/review/report.ts` (nouveau, pur), `src/components/CharacterStats.tsx` (nouveau), `Bible.tsx`
  (présentation « Chiffres », ligne de la fiche), i18n, test des comptes.

## Accessibilité et multiplateforme

- Tous les boutons ont leurs trois chemins (souris, doigt, clavier). Le panneau se parcourt aux flèches, Entrée va au
  point, Échap ferme.
- Cibles de 44 px au doigt, contraste vérifié dans les palettes, rien au survol seul.
- Textes en rem, couleurs par jetons.

## Maquettes

Artifact « MondoWrite, outils de relecture » (Design, 24 oct. 2026) : vérifier le scénario (onglets), filtre par
personnage, chiffres des personnages dans la Bible.

## Guide

- Nouvelle section « Relire » dans les chapitres Manuscrit et Scénario (fr, en), section « Rapport » dans la Bible.
- Captures : panneau de vérification (scénario d'exemple et roman d'exemple), filtre par personnage, rapport.

## Étapes

- [x] `names.ts` et `checks.ts` (scénario), tests
- [x] `checks.ts` (roman), tests
- [x] `ReviewPanel` dans le Scénario, puis dans le Manuscrit ; menu du Mac
- [x] Filtre par personnage : `scenesWith`, décorations, choix dans la liste des scènes, lien depuis la Bible
- [x] `report.ts`, présentation « Chiffres » de la Bible, ligne de chiffres dans la fiche, export CSV
- [x] i18n complet, guide (fr, en), captures, PDF, CLAUDE.md
- [x] Vérification à la main : roman et scénario (navigateur, Playwright). Reste : tactile et mode sombre sur un vrai iPad

## Plus tard (lot 2)

- Raccourcir le script : mots seuls sur une ligne et lignes gagnables (à partir de `typeset`).
- Lecture à voix haute, une voix du système par personnage (`speechSynthesis`, hors ligne).
