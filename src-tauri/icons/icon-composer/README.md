# Icône MondoWrite pour Icon Composer (macOS 26, iOS 26, iPadOS 26)

Les icônes d'Apple sont désormais faites de calques posés sur un fond, auxquels le système applique le verre
(Liquid Glass), les reflets et les apparences sombre, claire et teintée. Ces trois calques reprennent le dessin
de `../sources/icon-ios.svg` (plein cadre, 1024 × 1024, mêmes coordonnées), sans fond ni effet :

| Fichier | Contenu | Place dans la pile |
|---|---|---|
| `1-traits.svg` | les traits du M (gris `#8E9099`, épaissis à 14 px) | en bas |
| `2-etoiles.svg` | les quatre points crème `#F4F0E8` | au milieu |
| `3-etoile-or.svg` | l'étoile dorée `#F2C14E` | en haut |

Différences voulues avec l'icône actuelle : pas de halo autour de l'étoile (les guides d'Apple demandent de ne
pas dessiner de lueur, d'ombre ni de reflet : le système les ajoute), et des traits plus épais (sous le verre, un
trait fin disparaît).

## Assembler l'icône (sur Mac, Xcode 26 installé)

1. Ouvrir Icon Composer (Xcode > Open Developer Tool > Icon Composer), nouveau document.
2. Fond (Background) : couleur unie `#141B2D`.
3. Glisser les trois SVG dans cet ordre, chacun dans son propre groupe : `1-traits`, `2-etoiles`, `3-etoile-or`
   en haut de la pile.
4. Verre : laisser le Liquid Glass actif sur l'étoile et les points ; essayer de le couper sur les traits s'ils
   paraissent trop pâles.
5. Vérifier les apparences Default, Dark et Mono (teintée), et les aperçus iPhone, iPad et Mac : les mêmes
   éléments doivent rester visibles partout.
6. Enregistrer sous `src-tauri/icons/MondoWrite.icon` (c'est un dossier).

## Brancher l'icône dans l'app

- **iPhone et iPad** : dans le projet Xcode généré (`src-tauri/gen/apple`), ajouter `MondoWrite.icon` au projet
  et le choisir comme icône de l'app (réglage App Icon de la cible). À refaire après un `tauri ios init`.
- **Mac** : le paquet Tauri utilise encore `icon.icns`. Tant qu'il ne sait pas compiler un fichier `.icon`, macOS
  26 affiche l'ancienne icône dans un carré arrondi. À vérifier à chaque mise à jour de Tauri ; en attendant,
  exporter depuis Icon Composer une image 1024 px de l'apparence Default et régénérer `icon.icns` comme le décrit
  `CLAUDE.md` (« Icône et logo »).

Ces étapes n'ont pas été essayées sur une machine : à vérifier à la première fabrication.
