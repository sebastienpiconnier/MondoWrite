# Plan : annuaire de noms de personnages

> **Statut : première livraison en 1.21.0 (lot 4) avec les listes de Faker (tous pays, sans époque ni fréquence), embarquées et chargées à la demande. Novembre 2026 : tirage pondéré et choix de la décennie prêts (`NameRegister`, `scripts/names/build-insee.mjs`), registre FR fabriqué d'après `nat2021` et le fichier des noms 1891-2000 (INSEE), prénoms et noms. ONS (GB) mis de côté : le détail des prénoms n'existe que depuis 1996 (avant, seulement les 100 premiers par décennie, sans effectifs) et il n'y a pas de fichier de noms de famille britannique libre ; le Royaume-Uni garde les listes de Faker. Reste : le guide.**

Demande de l'auteur du 3 novembre 2026 : proposer des prénoms et des noms par genre et par pays. Version visée :
avec les synonymes (même principe de données embarquées ou téléchargées une fois).

## Ce que l'auteur doit pouvoir faire

Dans la fiche d'un personnage (ou à la création d'une carte Personnage), « Proposer un nom » ouvre une petite
fenêtre : pays, genre, époque (décennie de naissance), et une liste de prénoms et noms tirés au hasard. Un clic
sur un nom le prend pour titre de la carte ; « D'autres » en tire de nouveaux. Jamais d'appel réseau pendant
l'usage.

## Principes respectés

- **Facultatif, sans formulaire** : aucun filtre n'est obligatoire ; sans choix, pays et langue de l'interface.
- **L'auteur choisit** : rien n'est renommé sans son clic. Le renommage passe par `updateCard` (les mentions
  suivent), ou par « Renommer partout » si le nom est déjà dans le texte.
- **Pas de doublon** : un nom déjà porté par un personnage du projet n'est pas proposé ; un prénom trop proche
  d'un autre personnage (`review/names.ts`) est signalé, pas caché.
- **Pas de stéréotype** : on propose des noms selon le pays et l'époque des registres, rien d'autre (aucune
  « origine », aucun caractère associé à un nom).

## Données (à valider une par une, licence et contenu)

| Pays | Prénoms | Noms de famille | Licence |
|---|---|---|---|
| France | INSEE, fichier des prénoms (naissances par année depuis 1900, par sexe) | INSEE, [fichier des noms État civil](https://www.insee.fr/fr/statistiques/3536630) (noms par décennie de naissance, 1891 à 2000, national et par département ; national : noms donnés au moins 30 fois, environ 2 Mo en texte) | réutilisation libre avec mention de la source (Licence Ouverte Etalab 2.0, à confirmer pour le fichier des noms) |
| États-Unis | Social Security Administration, prénoms par année | Census Bureau, noms de famille 2010 | domaine public |
| Royaume-Uni | ONS, prénoms des naissances | à trouver | Open Government Licence v3 |
| Autres pays | registres ouverts à rechercher (Belgique, Québec, Suisse, Espagne, Italie…) | | à vérifier |
| En attendant, tous pays | listes de prénoms et de noms par langue de [@faker-js/faker](https://github.com/faker-js/faker) : sans fréquence ni époque, seulement les fichiers de données, pas la bibliothèque | idem | MIT (copyright des contributeurs de Faker, à citer) |

Exclus d'office : les jeux de données tirés de fuites de réseaux sociaux (fréquents sur GitHub, par exemple
`name-dataset`), et tout ce qui n'a pas de licence claire.

Un pays couvert seulement par les listes de Faker n'a ni filtre d'époque ni tirage pondéré : la fenêtre le dit
simplement (« Époque non disponible pour ce pays »).

- Le genre suit les registres (fille, garçon), avec « Tous » par défaut ; l'époque vient de l'année de
  naissance (prénoms donnés dans la décennie choisie).
- Taille visée : quelques Mo au total après réduction (garder les prénoms au-delà d'un seuil de naissances).
  Téléchargés à la demande depuis mondowrite.app (comme le thésaurus, option 2), ou embarqués si c'est léger.

## Lot 1

- [x] Script `scripts/names/build-insee.mjs` (prénoms INSEE) ; format `registers/<PAYS>.json` `{from, step, f, m, l?}`
- [ ] Lancer le script sur `nat2023.csv` et committer `registers/FR.json` ; fichier des noms 1891-2000
- [ ] Recherche des sources (tableau ci-dessus complété), avec licence et copyright pour
      `THIRD-PARTY-NOTICES.md`
- [x] Script `scripts/names/build.mjs` : un fichier compact par pays (prénom, sexe, fréquence par décennie ;
      noms avec fréquence)
- [x] `src/names.ts` (pur) : tirage pondéré par la fréquence (ou « Rares » en option), filtres, exclusion des
      noms du projet ; tests avec une graine fixe
- [x] `NamePicker.tsx` : pays, genre, époque, liste, « D'autres », Entrée et flèches ; depuis la fiche d'un
      personnage, sa carte (menu ⋯) et la création d'un personnage dans le scénario (complétion : « Proposer un
      nom… » en dernier)
- [x] L'époque se préremplit avec l'âge de la fiche (année du jour). Pas d'époque du projet : la couverture n'a pas de champ structuré pour cela (« temps » est le temps du récit), un roman historique choisit la décennie à la main
- [x] Textes `t.names.*` (fr, en), guide

## Fichiers touchés

`scripts/names/`, `src/names.ts` (nouveau), `components/NamePicker.tsx` (nouveau), `CardSheet.tsx`,
`CardActions.tsx`, `Bible.tsx`, `screenplay/editor/autocomplete.ts`, `THIRD-PARTY-NOTICES.md`, `i18n/fr.ts`,
`i18n/en.ts`, guide.
