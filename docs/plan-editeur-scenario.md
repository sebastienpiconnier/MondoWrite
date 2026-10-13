# Plan : éditeur de scénario (Fountain)

Étape 5 bis de la feuille de route (voir `CLAUDE.md`). Ce document est le plan de travail à suivre phase par phase. Chaque phase se termine par `npm run build` et `npm test` au vert, un commit, et un court compte rendu.

Pour lancer une phase dans Claude Code : « Attaque la phase N de `docs/plan-editeur-scenario.md` ». Avant de coder, relire la phase, proposer la liste des fichiers touchés, puis avancer.

## Avancement

À mettre à jour en fin de session (voir « Changer de machine » dans `CLAUDE.md`).

- [x] Phase 0 : outillage de tests
- [x] Phase 1 : modèle, parseur, sérialiseur
- [x] Phase 2 : stockage et lien avec les cartes
- [x] Phase 3 : l'éditeur
- [x] Phase 4 : complétion
- [x] Phase 5 : pages, minutes, séquencier minimal
- [x] Phase 6 : exports
- [x] Phase 7 : finitions

Dernière session : 7 octobre 2026. **Les huit phases du plan sont faites.** Il reste les vérifications à la main listées ci-dessous et ce qui est rangé dans « Plus tard ».

Notes de la phase 1 :

- Code dans `src/screenplay/` : `model.ts`, `rules.ts` (règles de détection partagées), `parse.ts`, `serialize.ts`. Couverture 99 % (`npm run coverage`, seuil 90 %).
- Le modèle a gagné `sceneNumber` et `depth` (niveau de section). Les parenthèses d'une didascalie font partie de son texte.
- Limites connues : plusieurs lignes vides de suite sont ramenées à une seule, et l'écriture est normalisée (`#Acte` devient `# Acte`, `>FIN<` devient `> FIN <`).
- `fountain-js` n'a pas été ajouté comme référence de test.
- La fixture française reprend la scène de la maquette `scenario-Ecriture`.

Notes de la phase 2 :

- `scenario.fountain` est lu et écrit par les deux stockages. Il est créé au premier passage en scénario, ou à l'ouverture d'un projet scénario qui n'en a pas ; revenir en roman ne le supprime pas.
- `src/screenplay/link.ts` : lecture des liens, renommage dans les deux sens, listes « scènes sans carte » et « cartes sans scène » (à brancher sur le panneau « Scènes à écrire » en phase 3).
- Un fichier Fountain que l'auteur n'a pas modifié dans MondoWrite n'est jamais réécrit (pas de normalisation silencieuse d'un fichier venu d'ailleurs).
- Choix faits : une carte Scène sans titre ne reçoit pas d'en-tête à la création du fichier ; vider le titre d'une carte ne touche pas à son en-tête ; une carte qui change de type perd son lien ; si deux en-têtes citent la même carte, le premier compte.
- Tests du store dans `src/__tests__/store-scenario.test.ts` (environnement `happy-dom`). Pas encore testé à la main dans l'app Tauri.

Notes de la phase 3 :

- `src/screenplay/editor/` (`nodes.ts`, `convert.ts`, `keymap.ts`, `autodetect.ts`, `index.ts`), `src/screenplay/scenes.ts` (scènes, personnages, décors) et `src/components/ScreenplayView.tsx`.
- Vérifié : tests sur un vrai éditeur TipTap (`editor.test.ts`, dont une scène complète écrite au clavier seul), puis dans Edge piloté par script (français, anglais, clair, sombre, largeur téléphone, rechargement).
- Reste à faire à la main : ouvrir un `scenario.fountain` produit par MondoWrite dans un autre logiciel Fountain, et essayer l'éditeur dans l'app Tauri et sur un vrai téléphone (clavier virtuel).
- Reporté à la phase 5 : le numéro de page estimé dans la liste des scènes (il dépend de `layout.ts`).
- Ajouts par rapport au plan : **Échap** sort de l'éditeur vers la barre d'éléments (Tab ne le permet plus) ; **Maj+Entrée** va à la ligne dans une action ou un dialogue ; sur petit écran la liste des scènes devient une liste déroulante.
- Majuscules : en-têtes, personnages et transitions passent en majuscules pendant qu'on les écrit. Un texte déjà présent dans le fichier n'est pas réécrit, il est seulement affiché en majuscules.
- Un en-tête qui change de type (Tab) perd son lien avec la carte et son numéro de scène.

Notes de la phase 4 :

- `src/screenplay/editor/autocomplete.ts` (calcul des suggestions, fonctions pures) et `src/components/SuggestionMenu.tsx` (menu partagé avec le menu « / » des cartes).
- Vérifié par tests et dans Edge piloté par script : « HU » propose HUGO, préfixe puis décor puis moment, création d'un décor depuis un en-tête lié (carte et fil « se passe à »), menu « / » des cartes inchangé.
- Le menu s'ouvre en écrivant (pas en déplaçant le curseur), en fin d'élément seulement. Une suggestion n'est présélectionnée que si elle complète ce qui est tapé : sur un nom déjà complet ou un élément vide, Entrée garde son rôle habituel.
- Une carte Personnage « Hugo Le Bris » propose aussi « HUGO » ; les noms et décors déjà utilisés dans le scénario passent devant, par fréquence.
- La création de carte est proposée pour un personnage sans carte et, après le tiret de l'en-tête, pour un décor sans carte. Le fil n'est tiré que pour un décor, depuis la carte de la scène si elle existe.
- Le rapprochement décor ↔ carte se fait sur le nom exact : « PHARE, LANTERNE » ne retrouve pas la carte « Phare de Kerlaouen ».

Notes de la phase 5 :

- `src/screenplay/layout.ts` (gabarits Letter et A4), `paginate.ts` (estimation), `sequence.ts` (blocs et déplacement), `src/components/Sequencier.tsx` et `usePagination.ts`.
- Valeurs de référence des tests : la fixture française fait 29 lignes, soit une page ; répétée 150 fois, entre 82 et 86 pages en Letter.
- Letter : 60 caractères d'action et 55 lignes par page. A4 : 57 caractères et 59 lignes (valeur posée à la main, à caler sur le PDF en phase 6).
- Règles de bas de page : un en-tête de scène n'est jamais en dernière ligne, et un personnage n'est pas séparé de sa première ligne de réplique (ajout par rapport au plan).
- `cosmos.json` gagne le champ facultatif `paper`. Il est fixé quand le projet devient un scénario (ou à l’ouverture d’un scénario qui n’en a pas) : **A4 si l’interface est en français, US Letter sinon**. Il ne suit plus la langue ensuite, pour que la pagination soit la même sur tous les appareils. Un roman n’a pas ce champ.
- Séquencier : les sections (`# Acte II`) sont des blocs fixes ; une scène qui en franchit une change d'acte. Ce qui précède le premier bloc reste en tête. Déplacement à la souris (glisser) ou par les boutons Monter et Descendre (doigt, clavier).
- Affichage : durée et pages dans la barre du haut, « Page 3 sur 6 » sous la feuille, page de début dans la liste des scènes. Dans le séquencier, la durée d'une scène n'est affichée qu'à partir d'une demi-page.
- Les gabarits par actes et les durées cibles de la maquette du séquencier viendront avec l'étape 4 de la feuille de route.

Notes de la phase 6 :

- `src/screenplay/export/` : `typeset.ts` (composition en pages, fonction pure), `pdf.ts`, `fdx.ts`, `index.ts` ; `src/components/ExportMenu.tsx` ; `saveAs()` dans les deux stockages.
- Dépendances : `pdf-lib` 1.17.1 et `@pdf-lib/fontkit` 1.1.1 (MIT). Polices : Courier Prime Regular et Bold en TTF, prises dans le dépôt `google/fonts`, avec `OFL.txt` à côté (`src/assets/fonts/`).
- Le PDF et ses polices sont dans un morceau chargé à la demande (import dynamique) : rien ne pèse sur le démarrage.
- Vérifié : tests (composition, PDF relu par pdf-lib, FDX relu comme XML), un PDF rendu en image et regardé, et les trois téléchargements depuis l'app dans Edge.
- Reste à faire à la main : ouvrir le FDX dans Final Draft ou Fade In, et essayer « Enregistrer sous » dans l'app Tauri (permissions `dialog:allow-save` et `fs:allow-write-file` ajoutées, non essayées).
- Écart estimation / PDF sur un long métrage (150 fois la fixture) : 82 pages estimées pour 84 réelles en Letter (2,4 %), 75 pour 75 en A4. L'écart vient des répliques coupées. Sous le seuil de 5 % du plan, donc `linesPerPage` n'a pas été retouché.
- Coupe des répliques : « (À SUIVRE) » en bas de page et « NOM (SUITE) » en haut de la suivante en français, « (MORE) » et « (CONT'D) » en anglais.
- Limites du PDF : l'emphase Fountain (`*italique*`, `**gras**`, `_souligné_`) est imprimée telle quelle, le dialogue double est imprimé l'un sous l'autre, et le PDF n'est pas balisé pour l'accessibilité (pdf-lib ne le permet pas).
- Les notes `[[…]]` et le texte mis de côté ne sont exportés ni en PDF ni en FDX ; l'export Fountain garde tout, liens `[[cosmos:id]]` compris.

Notes de la phase 7 :

- **Import** : `src/screenplay/import.ts` (fonction pure) et le bouton « Importer un scénario Fountain… » de l'accueil. Une carte Scène par en-tête, une carte Personnage par nom qui parle, une carte Décor par lieu (en-têtes à préfixe standard seulement), un fil « se passe à » de chaque scène vers son décor. Le synopsis Fountain (`= …`) qui suit un en-tête devient le texte de sa carte. Le fichier d'origine n'est pas modifié ; l'import refuse un dossier qui contient déjà un projet.
- **Numéros de scène** : option du projet (`sceneNumbers` dans `cosmos.json`, écrit seulement si activé). Numéros affichés dans la marge de l'éditeur, imprimés dans le PDF et exportés en FDX. Ils ne sont pas écrits dans `scenario.fountain` ; un numéro déjà présent dans le fichier (`#12A#`) passe devant. Le verrouillage pour le tournage reste à faire.
- **Mode focus** : bouton dans la barre d'éléments et Ctrl ou Cmd + Maj + F. La barre du haut, la liste des scènes et le panneau de droite s'effacent.
- Vérifié par tests et dans Edge piloté par script (import par le vrai sélecteur de fichier, numéros, focus).

Retours après essai dans l'exe (7 octobre 2026) :

- Une carte Scène créée sur le canevas entre maintenant tout de suite dans le scénario (fin du texte) : « Scènes à écrire » ne garde que les cartes sans titre. C'est un changement par rapport au § 2.2.
- Un scénario vide s'ouvre sur un en-tête de scène, plus sur une action.

Séquencier, après le plan (7 octobre 2026) : deux présentations au choix (liste ou fiches), les personnages qui parlent dans chaque scène (cliquables s'ils ont une carte), et un synopsis par scène, écrit depuis le volet des scènes de la vue Scénario ou depuis le séquencier. Le synopsis est une ligne Fountain `= …` sous l'en-tête.

Page de titre et vraies pages (7 octobre 2026) : la vue Scénario commence par une page de garde modifiable (titre, mention, auteur, source, contact, date, copyright), et la feuille est découpée en pages aux proportions exactes du format choisi (mesuré : 1,414 en A4, 1,294 en Letter), marges réelles et interligne simple. C'est un changement par rapport à la phase 3, où la feuille était continue avec un interligne plus aéré.

Vérifications à faire à la main (aucune n'a pu l'être ici) :

- ouvrir un `scenario.fountain` produit par MondoWrite dans un autre logiciel Fountain ;
- ouvrir le FDX dans Final Draft ou Fade In ;
- dans l'app Tauri : relancer l'exe sur un projet hors du dossier personnel, « Enregistrer sous » des exports, import d'un fichier ;
- sur un vrai téléphone : la barre d'éléments au-dessus du clavier virtuel.

---

## 1. Ce qu'on construit

Quand le projet est un **scénario** (`kind: "scenario"`), la vue **Scénario** (ex-Manuscrit) devient un éditeur au format cinéma :

- six éléments : **en-tête de scène**, **action**, **personnage**, **didascalie** (parenthétique), **dialogue**, **transition** ;
- mise en page standard à l'écran (Courier Prime, retraits normalisés) ;
- **Tab** change le type de l'élément courant, **Entrée** crée l'élément suivant logique ;
- complétion des personnages et des décors depuis la Bible ;
- compteur de **pages** et de **minutes** (une page ≈ une minute) ;
- chaque en-tête de scène est relié à sa carte Scène sur le canevas ;
- exports **Fountain**, **PDF** au format standard et **FDX** (Final Draft).

Hors périmètre de ce plan : collaboration temps réel, révisions colorées (pages bleues, roses…), numérotation de tournage verrouillée, dépouillement complet. Ils sont listés en fin de document.

## 2. Décisions de conception

### 2.1 Un seul fichier `scenario.fountain`

Le texte du scénario vit dans **un seul fichier** à la racine du projet :

```
MonFilm/
  cosmos.json
  cartes/*.md
  scenario.fountain      ← nouveau
```

Raison : un fichier Fountain unique s'ouvre tel quel dans Highland, Fade In, WriterSolo, Slugline, Trelby, Beat… C'est la promesse « l'auteur possède ses textes ». Un fichier par scène casserait cette promesse.

Cela remplace la mention `scenario/<scene-id>.fountain` de `CLAUDE.md` (mise à jour en même temps que ce plan).

### 2.2 Lien scène ↔ carte par une note Fountain

Chaque en-tête de scène relié à une carte porte une **note Fountain** (ignorée par les autres logiciels) :

```fountain
INT. PHARE, LANTERNE - NUIT [[cosmos:k3x9a7bq2m]]

La lampe est froide. Sur la console, un cahier relié de cuir, ouvert.
```

- `[[cosmos:<id>]]` = identifiant de la carte `scene` correspondante.
- Une scène sans note est une scène « libre » : l'app propose de créer sa carte.
- Une carte Scène sans scène dans le fichier apparaît dans le panneau « Scènes à écrire ».
- Le titre de la carte et le texte de l'en-tête sont synchronisés dans les deux sens (l'en-tête fait foi s'ils divergent au chargement).

### 2.3 Modèle en mémoire

Le fichier est converti en une **liste d'éléments**, pas en arbre :

```ts
// src/screenplay/model.ts
export type ElementType =
  | "sceneHeading" | "action" | "character" | "parenthetical"
  | "dialogue" | "transition" | "centered" | "pageBreak"
  | "section" | "synopsis" | "note" | "boneyard";

export interface ScreenplayElement {
  type: ElementType;
  text: string;            // sans les marqueurs Fountain (pas de "." forcé, pas de "@")
  cardId?: string;         // sceneHeading : carte liée ([[cosmos:id]])
  dual?: boolean;          // character : dialogue double (^)
  forced?: boolean;        // l'élément était forcé dans le source (., @, !, >)
}

export interface Screenplay {
  titlePage: Record<string, string>; // Title, Credit, Author, Draft date…
  elements: ScreenplayElement[];
}
```

Les six éléments du § 1 sont les seuls que l'interface propose. Les autres (`centered`, `section`, `note`, `boneyard`…) sont **conservés à l'identique** lors d'un aller-retour, pour ne jamais détruire le travail fait dans un autre logiciel.

### 2.4 Parseur et sérialiseur maison

Fountain est un format ligne à ligne, court à spécifier. On écrit **notre propre parseur et sérialiseur**, petits et testés, plutôt qu'une dépendance :

- on a besoin d'un aller-retour exact (fichier → modèle → fichier identique) que les parseurs orientés « rendu HTML » ne garantissent pas ;
- le format est stable (spécification sur fountain.io).

Une bibliothèque existante (par exemple `fountain-js`) peut servir de **référence dans les tests** pour comparer la classification des lignes. Vérifier sa licence avant de l'ajouter en `devDependencies`.

Règles Fountain à couvrir (résumé, la spec fait foi) :

| Élément | Détection | Forçage |
|---|---|---|
| En-tête de scène | ligne précédée d'une ligne vide, commençant par `INT`, `EXT`, `EST`, `INT./EXT`, `INT/EXT`, `I/E` suivi de `.` ou espace | `.` en début de ligne |
| Personnage | ligne en MAJUSCULES, précédée d'une ligne vide, suivie d'une ligne non vide ; extension possible `(V.O.)`, `(O.S.)`, `(CONT'D)` | `@` |
| Dialogue double | personnage suivi de `^` | |
| Didascalie | ligne entre parenthèses dans un bloc de dialogue | |
| Dialogue | lignes qui suivent un personnage ou une didascalie | |
| Transition | MAJUSCULES finissant par `TO:` entre lignes vides | `>` |
| Centré | `> texte <` | |
| Action | tout le reste | `!` |
| Saut de page | `===` | |
| Section, synopsis | `#`, `=` | |
| Note, boneyard | `[[ ]]`, `/* */` | |
| Page de titre | `Clé: valeur` en tête de fichier | |
| Numéro de scène | `#12#` en fin d'en-tête | |

Point d'attention pour le **français** : les en-têtes `INT.` et `EXT.` sont détectés nativement. Les variantes françaises non standard (`INTÉRIEUR`, `INT/EXT JOUR`) doivent être **sérialisées avec un `.` de forçage** pour rester lisibles ailleurs. Règle : à l'écriture, tout `sceneHeading` que le parseur ne détecterait pas seul reçoit un `.` initial.

### 2.5 Éditeur : TipTap, un nœud par élément

L'éditeur réutilise TipTap (déjà dans le projet). Un **nœud bloc par type d'élément** :

```
src/screenplay/editor/
  nodes.ts         SceneHeading, Action, Character, Parenthetical, Dialogue, Transition (+ Preserved pour le reste)
  keymap.ts        Tab, Maj+Tab, Entrée, Retour arrière
  autodetect.ts    règles d'entrée (input rules)
  autocomplete.ts  suggestions personnages, décors, moments
  convert.ts       Screenplay ↔ document ProseMirror
```

- `Preserved` : nœud non éditable (affiché discrètement) pour `note`, `boneyard`, `section`, `synopsis`, `centered`, `pageBreak`.
- Le document ProseMirror **n'est jamais** la source de vérité sur disque : à chaque modification (avec délai, comme la sauvegarde actuelle), `convert.ts` produit un `Screenplay`, puis `serialize()` produit le texte Fountain.

### 2.6 Clavier (conventions Final Draft, adaptées)

| Élément courant | Entrée | Tab | Maj+Tab |
|---|---|---|---|
| En-tête de scène | → Action | → Action | → Transition |
| Action | → Action (nouveau paragraphe) | → Personnage | → En-tête de scène |
| Personnage | → Dialogue | → Action | → Action |
| Didascalie | → Dialogue | → Dialogue | → Dialogue |
| Dialogue | → Action | → Didascalie | → Personnage |
| Transition | → En-tête de scène | → En-tête de scène | → Action |

- **Entrée sur un élément vide** : le transforme selon la colonne Tab (permet d'enchaîner au clavier sans souris).
- **Retour arrière au début d'un élément vide** : le supprime et remonte.
- Le type courant est annoncé par une **région `aria-live`** (« Dialogue ») et affiché dans la barre d'éléments.
- Sur mobile : la barre d'éléments se place au-dessus du clavier (API `visualViewport`), cf. maquette `mobile-Scenario`.

### 2.7 Détection automatique à la frappe

Dans un élément Action :

- `int. `, `ext. `, `int./ext. `, `i/e ` en début de ligne → devient En-tête de scène (texte mis en majuscules) ;
- une ligne entièrement en majuscules finissant par `TO:` ou `:` après validation → Transition ;
- `(` en tout début d'un élément sous un Personnage → Didascalie.

Toujours annulable par Ctrl/Cmd+Z (une seule étape).

### 2.8 Complétion

Menu discret (même composant que le menu « / » des cartes) :

- **Personnage** : titres des cartes `personnage` (en majuscules) + noms déjà utilisés dans le scénario, triés par fréquence ; extensions proposées après le nom : `(V.O.)`, `(O.S.)` / `(H.C.)`, `(CONT'D)` / `(SUITE)` selon la langue.
- **En-tête de scène** : préfixes `INT.`, `EXT.`, `INT./EXT.` → décors (cartes `lieu`) → moments.
- **Moments** (i18n) : fr `JOUR`, `NUIT`, `AUBE`, `CRÉPUSCULE`, `SOIR`, `MATIN`, `PLUS TARD`, `CONTINU` ; en `DAY`, `NIGHT`, `DAWN`, `DUSK`, `EVENING`, `MORNING`, `LATER`, `CONTINUOUS`.
- Choisir un décor qui n'existe pas encore propose de **créer la carte** (lien bidirectionnel avec la Bible).

### 2.9 Pages et minutes

Estimation par comptage de lignes, sans moteur de mise en page :

- largeur en caractères (Courier 12 pt = 10 caractères par pouce) : action 60, personnage 38 (départ à 3,7 pouces du bord), didascalie 25, dialogue 35, transition alignée à droite ;
- une ligne vide entre éléments, sauf entre personnage, didascalie et dialogue d'un même bloc ;
- **55 lignes par page** (constante réglable), un en-tête de scène ne termine jamais une page ;
- `durée ≈ pages` en minutes, affichée « ≈ 94 min ».

C'est une estimation : l'afficher avec « ≈ ». Le PDF (phase 6) donne la pagination réelle ; ajuster la constante si l'écart dépasse 5 %.

### 2.10 Format papier

Réglage du projet : **US Letter** (défaut des scénarios en anglais) ou **A4** (fréquent en France). Marges de référence (Letter) : gauche 1,5 pouce, droite 1 pouce, haut et bas 1 pouce. Le compteur et le PDF utilisent le même gabarit (`src/screenplay/layout.ts`), une seule source de vérité.

## 3. Phases

### Phase 0 : outillage de tests

- Ajouter **Vitest** (`npm i -D vitest`) et un script `"test": "vitest run"`.
- Ajouter `npm test` à `ci.yml` (job `front`).
- Un premier test trivial pour valider la chaîne.

**Fini quand** : `npm test` passe en local et en CI.

### Phase 1 : modèle, parseur, sérialiseur

Fichiers : `src/screenplay/model.ts`, `parse.ts`, `serialize.ts`, `__tests__/`.

- Implémenter les règles du § 2.4, page de titre comprise.
- Jeux de test dans `src/screenplay/__tests__/fixtures/` :
  - un court scénario en français (reprendre la scène de la maquette `scenario-Ecriture`) ;
  - un en anglais ;
  - un fichier « torture » : dialogue double, notes, boneyard, sections, centré, sauts de page, en-têtes forcés, numéros de scène, accents et apostrophes typographiques.
- Tests :
  - classification ligne par ligne attendue ;
  - **aller-retour** : `serialize(parse(texte)) === texte` sur chaque fichier (à la normalisation des fins de ligne près) ;
  - en-tête français non standard → sérialisé avec `.`.

**Fini quand** : tous les tests passent, couverture du parseur ≥ 90 %.

### Phase 2 : stockage et lien avec les cartes

Fichiers : `src/storage/paths.ts` (`SCREENPLAY_FILE = "scenario.fountain"`), `index.ts`, `store.ts`, `src/screenplay/link.ts`.

- `serialize`/`deserialize` du projet incluent `scenario.fountain` s'il existe (projet roman : jamais créé).
- `store.ts` : `screenplay: Screenplay | null`, `setScreenplay()`, sauvegarde automatique comme les cartes (même diff `lastFiles`).
- `link.ts` :
  - lecture des notes `[[cosmos:id]]` ;
  - synchronisation titre de carte ↔ texte d'en-tête (l'en-tête fait foi au chargement) ;
  - liste « scènes sans carte » et « cartes sans scène ».
- Passer un projet roman en scénario : si `scenario.fountain` n'existe pas, le créer avec un en-tête par carte Scène (ordre du canevas de haut en bas, en attendant le Séquencier) et une page de titre (`Title:` = titre du projet).
- Tauri : aucune nouvelle permission (fichier dans le dossier projet déjà autorisé).

**Fini quand** : test d'intégration du stockage navigateur (écrire, relire, comparer) ; supprimer une carte Scène ne supprime **pas** le texte de la scène (la note de lien est simplement retirée).

### Phase 3 : l'éditeur

Fichiers : `src/screenplay/editor/*`, `src/components/ScreenplayView.tsx`, styles dans `styles.css`.

- Vue Scénario : si `kind === "scenario"`, `App.tsx` affiche `ScreenplayView` au lieu de `Bientot`.
- Mise en page à l'écran : feuille blanche (ou `--surface` en sombre), largeur de page proportionnelle, retraits du § 2.9, police `--font-script`, en-têtes en gras et majuscules, personnages en majuscules.
- Clavier du § 2.6 et détection du § 2.7.
- Barre d'éléments (6 boutons, `aria-pressed`), mêmes raccourcis que le clavier ; sur écran tactile, positionnée au-dessus du clavier virtuel.
- Liste des scènes à gauche (navigation, numéro de page estimé), panneau « Dans cette scène » à droite (carte liée, personnages présents, décor) : reprendre la maquette `scenario-Ecriture`.
- i18n : tous les libellés dans `fr.ts` / `en.ts` (section `screenplay`).
- Mode sombre : uniquement des variables CSS (ajouter `--page`, `--page-ink` si besoin).

**Fini quand** :
- on écrit une scène complète au clavier seul (en-tête, action, personnage, didascalie, dialogue, transition) sans toucher la souris ;
- recharger la page redonne exactement le même texte ;
- le fichier `scenario.fountain` produit s'ouvre correctement dans un autre logiciel Fountain (test manuel, noter lequel dans le commit).

### Phase 4 : complétion

Fichiers : `src/screenplay/editor/autocomplete.ts`, réutilisation du menu des cartes (extraire un composant `SuggestionMenu` partagé).

- Règles du § 2.8, navigation clavier (flèches, Entrée, Échap) et au doigt.
- Création de carte Personnage ou Décor depuis la complétion.

**Fini quand** : taper `HU` sur une ligne Personnage propose `HUGO` ; choisir un décor inconnu crée la carte et le lien.

### Phase 5 : pages, minutes, séquencier minimal

Fichiers : `src/screenplay/layout.ts`, `paginate.ts`, tests.

- Estimation du § 2.9, affichée en pied de page de l'éditeur et dans la barre du haut (« ≈ 94 min »).
- Réglage Letter / A4 dans « Ce projet » (Réglages).
- Séquencier minimal (vue Plan en mode scénario) : liste ordonnée des scènes avec en-tête, pages, minutes ; glisser-déposer pour **réordonner les scènes dans le fichier** (déplacement du bloc complet, de son en-tête jusqu'au suivant). Les gabarits par actes viendront avec l'étape 4 générale.

**Fini quand** : tests de pagination sur les fixtures (valeurs attendues documentées) ; réordonner deux scènes dans le séquencier modifie l'ordre dans `scenario.fountain` sans perte.

### Phase 6 : exports

Fichiers : `src/screenplay/export/pdf.ts`, `fdx.ts`, `fountain.ts`, bouton « Exporter » dans la vue.

- **Fountain** : le fichier tel quel (enregistrer sous).
- **PDF** : `pdf-lib` + `@pdf-lib/fontkit` (licences MIT, à vérifier à l'installation), police **Courier Prime en TTF** embarquée dans `src/assets/fonts/` (licence SIL OFL, joindre le fichier de licence). Fontsource ne fournit que du WOFF/WOFF2 : récupérer le TTF officiel. Page de titre, numéros de page en haut à droite à partir de la page 2, en-têtes jamais en bas de page, `(SUITE)` / `(MORE)` et `(CONT'D)` quand un dialogue est coupé entre deux pages.
- **FDX** : XML Final Draft (`<FinalDraft DocumentType="Script">`, paragraphes `Scene Heading`, `Action`, `Character`, `Parenthetical`, `Dialogue`, `Transition`). Valider en ouvrant le fichier dans Final Draft ou Fade In.
- Enregistrement : dialogue « Enregistrer sous » de Tauri (`plugin-dialog` `save()`, ajouter la permission `dialog:allow-save`) ; dans le navigateur, téléchargement d'un `Blob`.

**Fini quand** : les trois exports de la fixture française s'ouvrent sans erreur ; le PDF a le même nombre de pages (± 1) que l'estimation.

### Phase 7 : finitions

- Import d'un `.fountain` existant comme nouveau projet scénario (création automatique des cartes Scène, Personnage, Décor).
- Numéros de scène (option), verrouillage pour le tournage plus tard.
- Mode focus (comme le Manuscrit roman).
- Mise à jour de `CLAUDE.md` (architecture, pièges rencontrés) et du README.

## 4. Pièges à anticiper

- **Majuscules et accents** : `toUpperCase()` avec la locale (`toLocaleUpperCase(lang)`), pour `É`, `À`, `Ç`.
- **Apostrophes** : conserver `’` dans le texte ; ne pas l'utiliser pour détecter quoi que ce soit.
- **Un personnage en majuscules suivi d'une ligne vide** n'est pas un personnage en Fountain (c'est de l'action) : le sérialiseur doit forcer `@` si l'éditeur a un Personnage sans dialogue.
- **Lignes vides significatives** : Fountain distingue les éléments par les lignes vides ; le sérialiseur est responsable de les produire, jamais l'utilisateur.
- **Fichier modifié ailleurs** (autre logiciel, synchro iCloud) : au retour du focus sur la fenêtre, comparer avec `lastFiles` et proposer de recharger plutôt que d'écraser.
- **Performance** : un long métrage fait 100 à 120 pages (environ 2 000 éléments). Conversion et sérialisation doivent rester sous 16 ms ; sinon, ne reconvertir que la scène modifiée.

## 5. Plus tard (hors plan)

Révisions colorées et pages verrouillées, dépouillement complet (accessoires, costumes, figuration), rapports (temps de présence par personnage, jour/nuit par décor) sur la base du séquencier de la maquette, collaboration temps réel (Yjs), lecture à voix haute des dialogues.
