# Feuille de route : ce qui est validé et reste à faire

**Seul endroit où se tient la liste des chantiers à venir.** Une ligne par chantier, dans l'ordre où on compte les
faire, avec un lien vers son plan quand il en a un. Ce qui est fait sort de la liste : l'historique Git le garde.
Un plan (`docs/plan-*.md`) garde le détail d'un chantier (décisions, format, pièges) et n'est pas une liste de
tâches. Une idée ne cite pas le logiciel qui l'a inspirée ; un nom de logiciel n'apparaît que pour la
compatibilité (import Scrivener, fichiers Final Draft, Fountain) ou pour du code repris (licence,
`THIRD-PARTY-NOTICES.md`).

Dernière mise à jour : 4 novembre 2026.

## 1. Sécurité des projets

- [ ] **Sauvegardes automatiques hors du projet.** Des .zip datés du projet, écrits dans un dossier à part (pas
      dans le dossier du projet, synchronisé avec lui), avec une rotation (garder les N derniers). Les versions du
      jour (`markdown/versions/`) vivent dans le projet : si le dossier est abîmé ou effacé, elles partent avec.
- [ ] **Revenir au projet tel qu'il était un jour donné.** Liste datée des sauvegardes ci-dessus, et « Ouvrir
      cette sauvegarde » en nouveau projet (jamais par-dessus le projet actuel), pour retrouver un canevas, une
      Bible ou un plan d'avant, pas seulement le texte d'une scène.

## 2. Plans prêts, pas encore commencés

- [ ] **Synonymes, sans quitter l'app** : `docs/plan-synonymes.md`
- [ ] **Annuaire de noms de personnages**, par genre et par pays : `docs/plan-noms.md`
- [ ] **Révisions de scénario** (pages de couleur, astérisques, pages verrouillées) : `docs/plan-revisions-scenario.md`
- [ ] **Univers partagé entre plusieurs projets** (le plus gros, en dernier, après une étude) :
      `docs/plan-univers-partage.md`

## 3. Écrire

- [ ] **Objectifs plus fins.** En plus de l'objectif par jour et pour le livre (`goals`) : une échéance (date de
      fin, l'objectif du jour se calcule tout seul), un objectif de séance avec un signal quand il est atteint, un
      objectif par chapitre ou par scène.
- [ ] **Fréquence des mots et répétitions.** Les mots les plus employés du manuscrit (hors mots outils) et les
      répétitions proches, dans l'onglet « Vérifier » : signaler, jamais corriger.
- [ ] **Mode révision pour le roman.** Comme les révisions de scénario : le texte modifié pendant une passe de
      révision prend la couleur de cette passe.
- [ ] **Fusionner deux scènes.** L'inverse de « Couper la scène » : réunir une scène et la suivante (texte,
      synopsis, fils), la carte de la seconde partant à la corbeille.
- [ ] **Police et interligne de la page d'écriture.** Réglages de l'appareil (`settings.writing`) : quelques
      polices embarquées (licence OFL) et interligne simple, 1,5 ou double, pour le Manuscrit à l'écran seulement
      (les exports gardent leur format). Tout est en `em` : l'interligne entre dans le calcul des pages.
- [ ] **Point de vue, pour aller plus loin** (lot 3 de `docs/plan-point-de-vue.md`) : questions de « Vérifier »
      (scènes sans narrateur, narrateur longtemps absent), nom du narrateur en tête de chapitre à l'export,
      narrateur suggéré, relecture de la voix par narrateur (IA).

## 4. Ergonomie

- [ ] **Palette de commandes.** Cmd/Ctrl + K ouvre un champ où l'on tape le nom d'une action (« organiser »,
      « exporter en PDF », « mode focus »…) et l'exécute. « Aller à » mène à des endroits ; la palette, à des
      actions. Utile surtout sous Windows et Linux, sans barre des menus. Les commandes viennent de la même liste
      que le menu du Mac (`appMenu.ts`) et les raccourcis (`shortcuts.ts`), pour ne rien décrire deux fois.
- [ ] **Page des projets plus riche.** Recherche, tri (nom, dernière ouverture, type) et filtre roman / scénario
      quand la liste grandit, et « Reprendre là où j'en étais » qui rouvre le dernier projet à la bonne vue, à la
      bonne scène, curseur compris (position gardée sur l'appareil, jamais dans le projet).

## 5. Import Scrivener, finitions

Détail dans `docs/plan-import-scrivener.md` (lot 3).

- [ ] Collections choisies en cadres ; plusieurs livres dans le Manuscrit, choix du livre
- [ ] Positions du liège libre, styles de citation, image de carte, son et vidéo de la Recherche
- [ ] Anciennes versions des chapitres rangées dans la Recherche (« Version 1 », « Archives ») : en faire des
      versions des scènes
- [ ] Essai complet sur le projet du tutoriel : rien ne disparaît sans être cité dans le rapport

## 6. Petits restes

- [ ] Chronologie par intrigue dans le séquencier d'un scénario
- [ ] Clés d'IA dans le trousseau du système
- [ ] EPUB de la Bible
- [ ] Mobile : test sur appareil de l'iPad (zones de sécurité, clavier, Split View, Stage Manager), Android à publier
