# Faire évoluer la Bible : propositions

D'après deux modèles de bible apportés par l'auteur (bible de série et bible de roman). But : couvrir ce qu'ils demandent **sans formulaire**, en gardant les trois gestes (taper, tirer un fil, déposer) et une Bible qui se lit d'un coup d'œil.

Principe directeur : **la Bible de travail se remplit toute seule à partir du canevas ; la bible de présentation (pour un éditeur, un producteur) est un export.** On ne demande jamais à l'auteur de remplir une rubrique « pour remplir ».

## Ce que les modèles demandent, et où MondoWrite l'a déjà

| Rubrique des modèles | Dans MondoWrite aujourd'hui | Manque |
|---|---|---|
| Titre, genre, cible, format, volume, POV, temps | titre du projet, objectif de mots | une « couverture » du projet |
| Logline, tagline, résumé éditorial, note d'intention | rien | idem |
| Thèmes, ton, comparables | cartes Thème | ton, comparables |
| Lieux, époque | cartes Lieu et leur fiche (époque, ambiance) | |
| Magie, technologie, factions, glossaire | cartes Idée, au mieux | rubriques « monde » |
| Personnage : identité, want, need, blessure, arc | fiche personnage, assistant (24 questions) | blessure et arc visibles d'un coup d'œil, voix |
| Antagoniste : motivations, forces, faiblesses | texte libre | |
| Intrigues secondaires | cartes Intrigue et chronologie | |
| Grands actes (déclencheur, midpoint, climax) | gabarits du Plan | leur résumé dans la Bible |
| Plan chapitre par chapitre | chapitres du Plan | dans l'export de la Bible |
| Série : arène, mécanique, pistes d'épisodes | rien | rubriques propres au scénario |

## Propositions

### 1. La couverture du projet (priorité 1, fait)

En tête de la Bible, une grande fiche qui ressemble à une **quatrième de couverture** : titre, tagline en grand, logline dessous, puis le résumé éditorial. À droite, des **pastilles** cliquables : Genre, Cible, Format (tome unique, trilogie…), Point de vue, Temps du récit, Ton. Chaque pastille vide est un simple « + Genre » discret ; toucher ouvre une petite liste de choix courants avec saisie libre.

- Le **volume** n'est pas saisi : il vient de l'objectif d'écriture (barre de progression « 32 000 / 80 000 mots »).
- Les **thèmes** sont les cartes Thème, montrées en étiquettes colorées.
- Les **comparables** (« Dune rencontre Le Nom de la Rose ») sont deux ou trois vignettes, qui peuvent pointer vers des cartes Source.
- La **note d'intention** est un texte libre repliable sous la couverture.
- Stockage : un bloc `pitch` facultatif dans `cosmos.json` (lisible par les anciennes versions, qui l'ignorent).

### 2. Personnages : la fiche devient une affiche (priorité 1, fait ; reste la lecture des trois cases en une phrase)

La fiche a déjà portrait, genre, âge, métier. On ajoute une **bande « moteur »** de trois cases visibles d'un coup d'œil : **Veut** (want), **A besoin** (need), **Blessure**. Remplies, elles se lisent comme une phrase : « Veut retrouver son frère, a besoin d'accepter le silence, blessée par la nuit du naufrage. »

- **Type d'arc** : trois pastilles (Positif, Tragique, Plat) et une petite courbe dessinée qui monte, descend ou reste plate.
- **Voix** : une ligne « Comment elle parle », avec une réplique d'exemple.
- **Antagoniste** : quand le rôle choisi est Antagoniste, la bande devient **Motivation, Force, Faille**.
- Ces cases se remplissent aussi par l'assistant : une réponse à « Que veut ce personnage, plus que tout ? » propose de remplir « Veut » (sur clic).

### 3. La carte des relations (priorité 2, fait)

Dans la rubrique Personnages, un bouton « Relations » affiche les personnages en **portraits ronds** reliés par leurs fils étiquetés (« sœur de », « trahit »). Ce sont les fils du canevas, rien de plus : tirer un fil ici le tire là-bas. Vue en lecture rapide, idéale pour un dossier éditeur.

### 4. Le monde (priorité 2)

Trois rubriques facultatives, cachées tant qu'elles sont vides (le menu « Choisir et ranger les rubriques » existe déjà) :

- **Groupes** (factions, familles, clans) : une carte dont les membres sont les personnages reliés, affichés en portraits.
- **Règles** (magie, technologie, lois du monde) : une fiche à trois cases, **Fonctionne / Limite / Coût**. Ce trio suffit à éviter l'incohérence ; la vérification de cohérence par l'IA s'en servira.
- **Glossaire** : un mot inventé devient une carte Terme. Dans le texte, le mot est souligné en pointillé et sa définition apparaît au survol ou au toucher. Le glossaire de la Bible est alphabétique (`localeCompare` avec la langue).

### 5. Le tableau d'ambiance (priorité 2, fait)

Un onglet « Ambiance » dans la Bible : **toutes les images du projet** (portraits, lieux, sources) en mosaïque, groupées par type. Toucher une image ouvre sa fiche. Aucune donnée nouvelle : tout vient de `image` et `images`.

### 6. Structure et chapitres dans la Bible (priorité 2)

- **Intrigues** : chaque carte Intrigue montre une mini-chronologie (points sur les scènes où elle apparaît), déjà calculée par `timeline.ts`.
- **Grands actes** : un résumé en trois colonnes tiré du gabarit du Plan (situation initiale, déclencheur, midpoint, crise, climax, dénouement), où chaque case liste ses scènes. Une case vide est montrée en pointillé, sans reproche.
- **Plan chapitre par chapitre** : ajouté à l'export de la Bible (titre, scènes, synopsis), puisque les chapitres existent déjà.

### 7. Deux exports : bible de travail et dossier de présentation (priorité 3)

- **Bible de travail** : l'export actuel (tout, y compris les questions ouvertes et les notes).
- **Dossier de présentation** : couverture, logline, résumé, note d'intention, personnages principaux avec portrait et bande « moteur », monde, grands actes, plan. Sans les questions ouvertes ni les passages « à reprendre ». PDF et Word.

### 8. Repères de complétude, sans culpabiliser (priorité 3)

Dans le sommaire, un petit anneau par rubrique qui se remplit (« 3 personnages sur 5 ont un moteur »). Jamais de rouge, jamais de pourcentage global. Toucher l'anneau mène à la première fiche incomplète.

### 9. L'IA qui aide à trouver sa logline (priorité 3)

Bouton « Questionner » sur la couverture, comme pour les personnages : l'IA pose une question à la fois (« Qu'est-ce qui empêche ton héros d'abandonner ? »), l'auteur répond, la réponse s'ajoute à la note d'intention. **L'IA n'écrit pas la logline**, même sur demande : les consignes de `docs/prompts-ia.md` s'appliquent.

### 10. Scénario et série (priorité 3)

Pour un projet scénario, la couverture remplace Volume par **Format** (long métrage, série de N épisodes de X minutes) et ajoute :

- **Arène** : le lieu et l'époque où l'histoire se rejoue (c'est une carte Lieu épinglée).
- **Mécanique de la série** : ce qui fait tourner chaque épisode, en une phrase.
- **Pistes d'épisodes** : une liste de cartes Idée marquées « épisode », chacune avec son pitch, qui deviendront des projets ou des sections Fountain.

## Ordre proposé

1. Couverture du projet et bande « moteur » des personnages (le cœur des deux modèles).
2. Carte des relations, Groupes, Règles, Glossaire, tableau d'ambiance.
3. Actes et chapitres dans la Bible, dossier de présentation, repères de complétude, logline par questions, rubriques série.

## Impact sur le format

- `cosmos.json` : un bloc `pitch` facultatif.
- Cartes : nouvelles clés de `fiche` (`veut`, `besoin`, `blessure`, `arc`, `voix`, `force`, `faille`, `fonctionne`, `limite`, `cout`), facultatives, filtrées par `SHEET_FIELDS`.
- Nouveaux types facultatifs (`groupe`, `regle`, `terme`) : vérifier comment une version précédente lit un type inconnu (migration par `version` si besoin) avant de coder.
