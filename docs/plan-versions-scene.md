# Plan : versions d'une scène (préalable B)

> **Statut : Terminé (1.13.0).**

Deuxième des chantiers préalables à l'import Scrivener (`docs/plan-import-scrivener.md`, « Préalables »),
après le point de vue (`docs/plan-point-de-vue.md`). Version visée : avec le point de vue dans la 1.13.0, ou
1.14.0 (à décider à la publication).

Avant de réécrire une scène, l'auteur veut garder la version d'aujourd'hui, pour pouvoir comparer et revenir
en arrière. C'est l'« instantané » de Scrivener, la fonction que ses habitués citent en premier. MondoWrite a
déjà les copies du jour (`markdown/versions/AAAA-MM-JJ/`), mais elles gardent tout le livre une fois par jour,
sans titre, et l'app ne sait pas les relire : ce n'est pas un filet que l'auteur tient en main.

## Principes respectés

- **L'auteur possède ses textes** : une version est un fichier Markdown (roman) ou Fountain (scénario),
  lisible hors de l'app.
- **Rien ne se perd** : revenir à une version garde d'abord le texte actuel comme version ; supprimer une
  version demande le menu ⋯ (en rouge, en dernier) et peut s'annuler quelques secondes.
- **Discret** : une commande dans le menu ⋯ de la scène et un raccourci ; pas de panneau toujours ouvert.
- **Trois chemins** : menu ⋯ (souris, doigt), raccourci clavier, menu Édition du Mac.

## Impact sur le format de projet

Un dossier de plus, **`versions/`**, à la racine du projet :

```
versions/<id de la carte Scène>/<AAAA-MM-JJ-HHMMSS>.md
```

```markdown
---
title: "Avant d'enlever le rêve"
date: 2026-11-02T09:41:07+01:00
words: 2065
---
Ce lundi matin comme tous les autres, le réveil sonne à six heures trente…
```

- Roman : le texte de la scène en Markdown, comme `manuscrit/<id>.md`. Scénario : le corps de la scène en
  Fountain (synopsis compris, sans l'en-tête, qui reste le titre de la carte), plus `kind: scenario` dans
  l'en-tête du fichier, pour ne jamais rendre une version de scénario dans un roman ou l'inverse.
- `title` facultatif (« Garder cette version… » propose d'en écrire un), `date` et `words` (ou `pages`) écrits
  par l'app pour la liste.
- Un fichier de version **ne change jamais** une fois écrit (sauf son titre, qu'on peut renommer) : pas de
  conflit possible entre deux appareils, chaque appareil n'ajoute que des fichiers neufs.
- **Pas dans `TEXT_DIRS`** : les versions ne sont pas lues à l'ouverture du projet (un roman de 60 scènes avec
  dix versions chacune ralentirait l'ouverture pour rien). Elles sont lues à la demande, scène par scène.
- Nom du dossier : `versions/` à la racine. À ne pas confondre avec `markdown/versions/` (copies du jour, jamais
  relues) : nouvelle constante `SCENE_VERSIONS_DIR` (versions.ts) ; la constante des copies du jour n'a pas
  changé.
- Versions précédentes de l'app : elles ignorent le dossier (pas lu, pas effacé). La suppression d'un projet par
  une ancienne version laisse `versions/`, donc le dossier du projet n'est pas retiré (il n'est pas vide) :
  acceptable, rien n'est perdu.

## Stockage

Nouvelles méthodes de `storage` (comme `writeMedia`, `readMedia`) :

- `readVersions(cardId)` : { nom : contenu } des versions d'une scène (les noms refusés sont ignorés). Une
  seule lecture : les fichiers sont petits et la fenêtre a besoin des textes pour comparer.
- `writeVersion(cardId, name, text)` : écriture sûre (`writeSafely`). Le nom est neuf (`versionName` évite
  ceux qui existent), sauf pour Renommer et l'annulation d'une suppression, qui réécrivent le même fichier.
- `deleteVersion(cardId, name)` : seul effacement, sur demande de l'auteur.

Tauri : `versions/` ajouté à `PROJECT_DIRS` (suppression du projet), permissions déjà couvertes par le dossier
du projet ; iCloud : demander le téléchargement du dossier de la scène quand on ouvre ses versions (comme
`medias/`, sans attendre à l'ouverture du projet). Navigateur : une clé `localStorage` par projet. Le `.zip`
(« Exporter une copie », `importZipData`, grands exemples) emporte et reprend `versions/` (chemins vérifiés
comme les autres : identifiant de carte valide, nom de fichier daté).

## Lot 1 : garder, revenir

- [x] Module pur `src/versions.ts` : nom de fichier daté (`versionName`, unique même à la même seconde),
      en-tête lu et écrit (`readVersionFile`, `versionFile`), compte des mots ou des pages, chemins sûrs
- [x] Méthodes du stockage (Tauri, navigateur) et `.zip`
- [x] **« Garder cette version… »** : menu ⋯ de la barre du Manuscrit et du Scénario, menu ⋯ de la carte
      agrandie, menu Édition du Mac, raccourci **Cmd/Ctrl + Alt + S** (décision 1). Fait : ouvre la fenêtre des
      versions, le champ du titre a le focus ; « Version gardée » s'affiche quatre secondes dans la fenêtre
- [x] **« Versions de la scène… »** (même menu ; sans le nombre, qui demanderait de lire le disque à chaque
      ouverture du menu, et sans lien dans la colonne de droite pour la même raison) : fenêtre avec la liste (date relative, titre, mots), le
      texte de la version choisie (lecture seule, mise en page de la scène), et ses actions : **Revenir à cette
      version** (le texte actuel est d'abord gardé comme version « Avant de revenir à la version du … », puis
      remplacé : c'est ce filet qui protège, pas Annuler), **Copier le texte**, **Renommer**, et dans ⋯ **Supprimer**
- [x] Roman : le texte passe par `setManuscriptText` (et l'éditeur se recharge, comme après « À faire »).
      Scénario : par `setScreenplay` (synopsis et corps remplacés, en-tête gardé)
- [x] La carte part à la corbeille : ses versions restent ; remise, elle les retrouve ; vider la corbeille ne
      touche pas aux versions (comme `manuscrit/`)
- [x] Textes `t.versions.*` (fr, en), raccourci dans `shortcuts.ts`, menu du Mac, guide (texte ; captures à
      faire avec `npm run guide:shots`)

## Lot 2 : comparer

- [x] Module pur `src/textDiff.ts` : différences mot à mot entre deux textes (paragraphes d'abord, puis mots
      dans les paragraphes changés ; sans dépendance), testé sur des scènes de plusieurs milliers de mots
- [x] Dans la fenêtre : **Comparer avec le texte actuel** (mots retirés barrés en rouge, ajoutés soulignés en
      vert, jetons `--diff-del` et `--diff-add` dans les deux thèmes, contraste vérifié ; jamais la couleur seule :
      barré et souligné), et comparer deux versions entre elles
- [x] Résumé en tête : « 214 mots ajoutés, 87 retirés »

## Lot 3 : pour plus tard (si l'auteur le demande)

- Version gardée d'office avant une opération lourde (« Revenir à » le fait déjà ; aussi avant un
  Rechercher et remplacer dans tout le projet ?)
- Version automatique une fois par jour pour chaque scène modifiée (doublerait les copies du jour)
- Reprendre un passage d'une version sans tout remplacer (le Chutier le permet déjà par copier-coller)
- Import Scrivener : chaque instantané (`Snapshots/<UUID>.snapshots/`, RTF daté, titre dans `index.xml`)
  devient une version de la scène

## Fichiers touchés

`src/versions.ts` (nouveau), `src/textDiff.ts` (lot 2), `storage/paths.ts`, `storage/index.ts`,
`storage/tauri.ts`, `storage/browser.ts`, `store.ts` (garder, revenir, zip), `components/VersionsDialog.tsx`
(nouveau), `Manuscript.tsx`, `ScreenplayView.tsx`, `ExpandedCard.tsx`, `Dialogs.tsx`, `MoreMenu` (entrées),
`appMenu.ts`, `shortcuts.ts`, `i18n/fr.ts`, `i18n/en.ts`, `styles/writing.css`, `styles.css` (jetons du lot 2),
CLAUDE.md, guide (fr, en).

## Tests

- **Unitaires** : noms de fichiers (uniques, triés), en-tête (titre avec guillemets, date, mots), refus d'un
  chemin piégé, version de scénario jamais rendue dans un roman ; « Revenir à » garde d'abord l'actuel ; carte à
  la corbeille puis remise ; `.zip` aller-retour ; lot 2 : différences sur des cas connus et un long texte.
- **Bout en bout** : écrire une scène, garder une version, réécrire, revenir, retrouver les deux versions
  (l'ancienne et « Avant de revenir »), recharger la page.
- **À la main** : app Mac (dossier iCloud et dossier ordinaire), iPad (versions créées sur un appareil, vues
  sur l'autre).

## Décisions (prises le 2 novembre 2026)

1. **Raccourci** : (a) Cmd/Ctrl + Alt + S, ou (b) aucun raccourci, le menu suffit. Proposition : (a), Scrivener
   utilise Cmd + 5 mais Cmd + chiffre sert déjà aux vues dans MondoWrite.
2. **Où ouvrir les versions** : (a) une fenêtre (proposition : la comparaison du lot 2 a besoin de place), ou
   (b) un onglet « Versions » dans la colonne de droite, à côté de « Dans cette scène » et « Vérifier ».
3. **Scénario** : la version garde-t-elle (a) le corps et le synopsis (proposition), ou (b) aussi l'en-tête,
   qui reviendrait alors avec elle (risque de renommer la carte sans le vouloir) ?
4. **Lot 2 dans la même version de l'app** que le lot 1 (proposition : oui, revenir sans voir ce qui change
   est moins utile), ou plus tard.

Réponses de l'auteur : 1, au choix de Claude : (a) Cmd/Ctrl + Alt + S ; 2, (a) une fenêtre ; 3, (a) corps et
synopsis, sans l'en-tête ; 4, oui, lots 1 et 2 ensemble.

## Reste

- [x] À la main : app Mac (dossier iCloud et dossier ordinaire), iPad (versions créées sur un appareil, vues
      sur l'autre), raccourci Cmd + Alt + S sur un clavier Mac
- [x] Captures du guide (fenêtre des versions, pastille du point de vue)
