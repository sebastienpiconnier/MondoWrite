# Ce que MondoWrite peut reprendre de NEO

[NEO](https://github.com/hughhowey/neo) (Hugh Howey) est un traitement de texte pour romanciers, sous licence **MIT**. Son code peut être repris dans MondoWrite (GPL-3.0) à condition de garder la mention de copyright et la licence MIT des fichiers copiés (dans `licenses/` et en tête du fichier repris).

Les deux outils se complètent : NEO est centré sur la page (on écrit le livre), MondoWrite sur le chaos des idées (canevas, bible, plan). Ce qui suit, ce sont les idées de NEO qui serviraient la vue Manuscrit de MondoWrite sans alourdir le reste.

## Déjà repris (octobre 2026)

| Idée de NEO | Dans MondoWrite |
|---|---|
| Des pages qui ressemblent à un livre | Manuscrit mis en pages au format livre (2:3, alinéas, justifié), numérotation continue d'une scène à l'autre |
| Lettrine en ouverture de chapitre | Première lettre de la première scène d'un chapitre |
| Chapitres numérotés automatiquement | Numéro tiré de la place dans le récit, jamais écrit dans le fichier |
| Objectif du jour, objectif du livre, compte des mots par jour | Panneau Statistiques : mots du jour, jours d'affilée, barres de progression, objectifs enregistrés dans `cosmos.json` |
| Entrée, Entrée, Entrée | Deux fois Entrée sur une ligne vide coupe la scène (nouvelle carte Scène, même chapitre) ; une troisième, au début de la nouvelle scène, ouvre un chapitre ; Retour arrière annule |
| Les pages d'un livre publié | Type de page d'une scène : page de titre, mentions légales, dédicace, épigraphe, prologue, épilogue, remerciements, à propos de l'auteur ; placées avant ou après le récit, hors chapitres |
| Bible du fork (`bible.js`, branche `pr-story-bible`) | Genre, surnoms et relations dans la fiche ; champs remplis seuls visibles, « Plus de détails » pour les autres ; surnoms reconnus dans le texte ; « Cité N fois, dès la scène X » sous le nom |

## À reprendre ensuite, par ordre d'intérêt

1. **Typographie automatique** (`app.js`, à partir de la ligne 4173 environ, fonction `smartKeys`) : tiret cadratin à partir de deux traits d'union, points de suspension, guillemets courbes et, en français, guillemets « » avec espaces insécables et espace fine avant `; : ! ?`. C'est le code le plus directement réutilisable : il est indépendant de l'éditeur (il travaille sur le texte autour du curseur) et Sébastien l'a déjà adapté au français dans son fork. À brancher comme règles de saisie TipTap dans le manuscrit et les cartes.
2. **Le Chutier** (« Darlings ») : glisser un passage sur un onglet pour le retirer du texte sans le perdre, et le remettre plus tard à sa place exacte. Dans MondoWrite, un passage chuté pourrait aussi devenir une carte Idée sur le canevas, ce qui prolonge naturellement la logique du chaos vers l'ordre.
3. **Marques à reprendre** (⌘⇧X) : un repère dans le texte et une note en marge (« vérifier la date »), un point rouge sur la scène dans la liste. Proche des questions « à creuser » des personnages : les deux pourraient partager le même panneau.
4. **Note de plan en paragraphe fantôme** : la note d'une scène (le texte de sa carte) s'affiche en gris dans la page vide et suit le curseur pendant qu'on écrit. Dans MondoWrite, c'est le lien le plus direct entre la carte Scène et son texte.
5. **Sprints d'écriture** : un objectif de mots en temps limité, avec le compte en direct.
6. **Bible du fork, encore à reprendre** : types de fiches du monde avec leurs champs (objet : à qui il appartient, pourquoi il compte ; groupe : membres, but ; indice : ce qu'il révèle, qui le sait ; système : principe, limites et prix à payer ; événement : quand, ce qui s'est passé, conséquences ; lieu : ambiance), galerie de plusieurs images par fiche, « renommer aussi dans le texte » quand on renomme un personnage, synopsis de toute l'histoire en tête du Plan, import de fiches d'un autre projet, export des fiches en un seul fichier HTML.
7. **Paragraphes « poésie » et « sans alinéa »** (⌘⇧Entrée, Maj+Entrée) : citations, chansons, lettres, panneaux dans le récit.
8. **Correcteur à la demande** (⌘;) plutôt que des soulignements pendant l'écriture.
9. **Sauvegardes quotidiennes** (archive ZIP du projet, gardée quinze jours) et **instantané PDF horodaté** avec empreinte SHA-256 du texte.
10. **Import .docx, .txt, .md** avec détection des chapitres et des sauts de section : utile pour faire entrer un manuscrit existant dans MondoWrite (chaque chapitre devient un chapitre du plan, chaque section une carte Scène).

## À ne pas reprendre

- **Couvertures générées par OpenAI** : contraire au pilier « souveraineté des données » si elles sont proposées par défaut. Une couverture abstraite générée localement (NEO sait aussi le faire, sans IA) serait acceptable pour l'écran d'accueil.
- **Bibliothèque en étagères** : l'écran d'accueil de MondoWrite remplit déjà ce rôle ; inutile de le compliquer.
- Tout ce qui tient à Electron (menus natifs, `preload.js`) : MondoWrite est en Tauri.
