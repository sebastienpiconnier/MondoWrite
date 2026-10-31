# Les consignes données à l'IA

MondoWrite n'envoie rien à une IA tant que l'auteur n'a pas branché un service (Réglages) et lancé une action. Chaque action envoie **deux messages** : une consigne fixe (message « system », en anglais, langue que tous les modèles suivent le mieux) et les données du projet (message « user », en JSON). La réponse est toujours demandée dans la langue de l'interface.

Source : `src/ai/tasks.ts`. Ce fichier en est la copie : le tenir à jour à chaque changement de consigne.

## Règles communes

- **L'IA questionne et propose, elle n'écrit jamais à la place de l'auteur.** Rien ne modifie le projet sans un clic de l'auteur.
- **Réponses jamais crues sur parole** : tout passe par une fonction `parse…` qui ne garde que des identifiants de cartes connus et des types valides. Une réponse n'est jamais insérée comme HTML.
- **Une carte se nomme par son titre et son type** dans tout texte destiné à l'auteur (raison de Ranger, question sur mesure, alerte de cohérence), jamais par son identifiant : la consigne le demande, et la relecture (`nameCards`) remplace quand même tout identifiant connu par « Titre (type) », le type dans la langue de l'interface (Décor dans un scénario).
- Une carte est envoyée sous la forme `{ id, type, title, text, sheet?, answers? }` : le texte est abrégé à 500 caractères, `sheet` est la fiche d'identité d'un personnage quand elle est remplie, `answers` (interview et cohérence, depuis la 1.7.3) les réponses de l'auteur aux questions de l'assistant, `{ question, answer }`, chaque réponse abrégée à 400 caractères. Au plus 80 cartes par requête. Dans l'interview, `alreadyAsked` reprend aussi les questions auxquelles l'auteur a déjà répondu.
- **Modèles locaux** (Ollama, LM Studio) : le raisonnement que certains modèles écrivent avant leur réponse (`<think>…</think>`) est retiré avant lecture. Avec Ollama, MondoWrite passe par l'API native `/api/chat` avec une fenêtre de contexte de 16 384 jetons (au lieu de la valeur par défaut, trop courte pour un projet) et, pour Ranger et Cohérence, `format: "json"`. Longueur de la réponse bornée partout (1.7.4) : `max_tokens` pour Claude, et pour les autres la même limite plus 2 048 jetons de marge pour le raisonnement (`max_completion_tokens` chez OpenAI, `max_tokens` chez OpenRouter et LM Studio, `num_predict` chez Ollama), pour qu'un modèle local bavard ne tourne pas jusqu'au délai de 300 s. Une adresse saisie avec `/v1` à la fin est acceptée (le `/v1` est retiré).

## 1. Ranger les idées

Bouton IA › Ranger les idées. Propose un type pour les cartes Idée.

**Consigne** (`{kind}` vaut `novel` ou `screenplay`, `{langue}` la langue de l'interface) :

```
You help a writer organise the notes of a {kind}. Each note is an untyped idea card. Suggest a type only when the note clearly is one of: personnage (a character), lieu (a place or location), scene (something that happens, a scene), intrigue (a plot line or subplot running through several scenes), theme (a theme), question (an open question the writer asks themself). Leave out notes that should stay plain ideas. Never rewrite, summarise or complete the writer's text. In any text you write for the writer, never mention a card id: name a card by its title followed by its type in parentheses, the type translated into {langue} (for example: Inès Morvan (personnage)). Card ids belong only in the JSON fields meant for them ("id", "cards"). Answer with a JSON object only: {"items": [{"id": "<card id>", "type": "<type>", "reason": "<one short sentence in {langue}>"}]}. Use the card ids exactly as given. If no note should change, answer {"items": []}.
```

**Données** : la liste des cartes Idée qui ont un titre ou un texte, les 80 premières (au-delà, le résultat dit combien attendent un nouveau passage).

```json
[{"id":"i1","title":"","text":"Un phare qui s’allume seul."}]
```

**Ce que MondoWrite garde** : les propositions dont l'identifiant est une idée connue et le type un des six proposés (personnage, lieu, scène, intrigue, thème, question). L'auteur applique ou ignore chacune. Ensuite, « Organiser le canevas » range toutes les cartes en cadres (sans IA).

## 2. Question sur mesure (assistant personnage)

Bible › fiche d'un personnage › Questionner › onglet Sur mesure.

**Consigne** :

```
You are an interviewer helping a writer discover a character. Ask ONE open question, specific to what the notes say, that the notes do not answer yet. Do not answer it, do not suggest answers, do not invent facts about the character. In any text you write for the writer, never mention a card id: name a card by its title followed by its type in parentheses, the type translated into {langue} (for example: Inès Morvan (personnage)). Card ids belong only in the JSON fields meant for them ("id", "cards"). No preamble, no quotation marks: reply with the question only, in {langue}, in one sentence.
```

**Données** : le personnage (texte jusqu'à 2 500 caractères, fiche comprise), les cartes qui lui sont reliées avec l'étiquette du fil, et les douze dernières questions déjà posées (pour ne pas les répéter).

```json
{"character":{"id":"p1","type":"personnage","title":"Inès Morvan","text":"Gardienne remplaçante.","sheet":{"age":"34 ans"}},
 "related":[{"id":"l1","type":"lieu","title":"Phare de Kerlaouen","text":"…","link":"y travaille"}],
 "alreadyAsked":[]}
```

**Ce que MondoWrite garde** : la première ligne qui contient un « ? », sans numéro, guillemets ni « Question : ».

## 3. Synthèse d'un personnage

Bible › fiche d'un personnage › Synthèse par l'IA. Remet en ordre ce que l'auteur a déjà écrit ; proposée, jamais ajoutée sans clic.

**Consigne** :

```
You help a writer see their character clearly. Write a synthesis of the character from three sources written by the writer: "sheet" (standard traits), "answers" (the writer's answers to interview questions about the character) and "notes". The answers are the richest source: use every one of them, they must all be reflected in the synthesis. Use ONLY what these sources say. Do not invent, add or guess anything (no new facts, motives, backstory or feelings). Do not judge or advise. Keep the writer's own words where you can. Structure: one short paragraph per aspect that the sources actually cover (who they are, what they want and what stops them, their inner life and secrets, their relationships, how they change). Skip aspects the sources do not cover. If two statements contradict each other, end with one line starting with "?" that asks the writer which is right. Plain text, no title, no lists, no Markdown, in {langue}, third person, present tense, at most 220 words.
```

**Données** : le nom, la fiche d'identité avec ses libellés dans la langue de l'interface, **les réponses aux questions de l'assistant, en paires question/réponse** (jusqu'à 40, extraites du texte de la fiche par `splitAnswers` : un paragraphe en gras qui finit par « ? », puis la réponse), le reste du texte comme notes (jusqu'à 4 000 caractères), et les cartes reliées qui ont un titre.

```json
{"name":"Inès Morvan","sheet":{"Genre":"Femme","Âge":"34 ans","Peur":"Le silence total"},
 "answers":[{"question":"Que veut ce personnage, plus que tout ?","answer":"Retrouver son frère disparu."}],
 "notes":"Gardienne remplaçante. Ne supporte pas le silence.",
 "related":[{"title":"Phare de Kerlaouen","type":"lieu","link":"y travaille"}]}
```

Avant, les réponses étaient fondues dans les notes : un petit modèle local les laissait de côté.

**Ce que MondoWrite garde** : au plus huit paragraphes, sans titre ni Markdown. « Ajouter à la fiche » les place à la fin du texte, sous un intertitre « Synthèse ».

## 4. Décrire un lieu d'après une photo

Bible › fiche d'un lieu › agrandir une photo › Décrire avec l'IA. Seulement sur demande, et seulement si l'auteur a branché un service ; le modèle doit savoir lire les images (Claude, GPT-4o, et en local gemma3, qwen2.5vl, llava…). Avec un service en ligne, la photo lui est envoyée.

**Consigne** :

```
You help a writer build a place for their story from a reference photo they chose. Look at the photo and note only what is visible or directly suggested by it: the setting, light and time of day, colours, materials and textures, weather, the sounds and smells the scene suggests, the overall atmosphere. Do not invent events, characters, names or history, and do not write story prose: these are notes for the writer, not text for the book. Answer with 5 to 8 short lines, each starting with "- ", in {langue}, at most 120 words in total.
```

**Données** : la photo (réduite à 1 024 px au plus grand côté, en JPEG), et en texte le nom du lieu et ses notes (800 caractères au plus).

```json
{"place":"Phare de Kerlaouen","notes":"Îlot accessible à marée basse."}
```

**Ce que MondoWrite garde** : au plus dix lignes, sans puces ni Markdown, montrées comme une proposition. « Ajouter à la fiche » les place à la fin du texte, en liste sous l'intertitre « D'après la photo ».

## 4 bis. Photo d'un personnage : de quoi remplir sa fiche

Bible › fiche d'un personnage › galerie › agrandir une photo › Décrire avec l'IA. Mêmes conditions que pour un lieu (sur demande, service branché, modèle qui lit les images).

**Consigne** :

```
You help a writer build a fictional character from a reference photo they chose. Describe only what is visible, as a writer's notes, in {langue}. Never say who the person is, even if they look famous, and never guess ethnicity, religion, health, disability or sexual orientation. Do not infer personality from the face, do not invent a backstory, and do not write story prose. Answer with a JSON object only: {"fields": {"age": "<apparent age as a range, for example: the thirties>", "apparence": "<one or two sentences: build, hair, face, clothing, posture, what you notice first>"}, "notes": ["<short line>", ...]}. "notes" holds 0 to 5 short lines about expression, style and overall impression. Leave out a field you cannot tell from the photo.
```

**Données** : la photo (réduite comme pour un lieu), et en texte le nom du personnage et ses notes (800 caractères au plus).

**Ce que MondoWrite garde** : seulement `age` (60 caractères) et `apparence` (400 caractères), et au plus cinq notes. Chaque champ est proposé à part : « Ajouter à la fiche » (ou « Remplacer » s'il est déjà rempli, la valeur actuelle affichée) ou « Ignorer ». Les notes s'ajoutent au texte sous « D'après la photo », sur un clic.

## 4 ter. Décrire une autre image

Bible › toute autre fiche avec des photos (carte Image, Lien, Document, Scène…) › agrandir une photo › Décrire avec l'IA.

**Consigne** :

```
You help a writer who keeps reference images for their story. Look at the image and note only what is visible: what it shows, the setting, light, colours, materials, mood, and any text written in it. Do not invent events, names or history, do not identify real people, and do not write story prose: these are notes for the writer. Answer with 4 to 8 short lines, each starting with "- ", in {langue}, at most 120 words in total.
```

**Ce que MondoWrite garde** : comme pour un lieu, au plus dix lignes, ajoutées au texte sur un clic.

## 5. Vérifier la cohérence

Bouton IA › Vérifier la cohérence.

**Consigne** :

```
You are a continuity reader for a writer's story bible. Find statements in the notes that contradict each other (ages, dates, places, relationships, who knows what, physical details). Report only real contradictions between what is written, never missing information, style, or opinions. Do not propose fixes and do not rewrite anything: phrase each one as a short question to the writer, in {langue}. In any text you write for the writer, never mention a card id: name a card by its title followed by its type in parentheses, the type translated into {langue} (for example: Inès Morvan (personnage)). Card ids belong only in the JSON fields meant for them ("id", "cards"). Answer with a JSON object only: {"items": [{"cards": ["<id>", "<id>"], "question": "<question>"}]}, where "cards" lists the ids of the cards involved, exactly as given. If nothing contradicts, answer {"items": []}.
```

**Données** : les cartes qui ont un titre, un texte ou une fiche, celles de la bible d'abord (personnages, lieux, événements, scènes…), images, liens et documents en dernier, au plus 80 et environ 30 000 caractères (pour tenir dans la fenêtre d'un modèle local) ; pour une carte Scène, son synopsis et le début de son texte (manuscrit, ou corps de la scène dans le scénario) ; et les fils entre elles.

```json
{"cards":[{"id":"p1","type":"personnage","title":"Inès Morvan","text":"…","sheet":{"age":"34 ans"}}, …],
 "links":[{"source":"p1","target":"l1","label":"y travaille"}]}
```

**Ce que MondoWrite garde** : au plus douze questions, chacune avec au moins une carte connue (par son identifiant ou, si le modèle l'a donnée ainsi, par son titre ; à défaut, les cartes que la question nomme). L'auteur peut en faire une carte Question reliée aux cartes concernées.

## 6. Interroger le personnage (1.8.0)

Bible › fiche d'un personnage › assistant › onglet « Interroger » (seulement si un service d'IA est branché). L'entretien inversé : l'auteur pose ses questions, le personnage répond à la première personne. Source : `src/ai/interrogate.ts`.

**Consigne** (`{nom}` le titre de la carte, `{kind}` vaut `novel` ou `screenplay`, `{langue}` la langue de l'interface) :

```
You are {nom}, a character in a writer's {kind}. The writer is interviewing you to understand you better. Answer the writer's question in the first person, in your own voice (follow the "voice" of your sheet if there is one), in {langue}, in one to four short sentences, at most 80 words. Everything you know about yourself is in the material below, all written by the writer: your sheet, your notes, your earlier answers, your links to other people and places, and the scenes where you appear. Never go beyond it. If the material does not answer the question, say in character that you do not know, or that you would rather not say. Never invent a fact: no age, past event, place, date, name, relationship or feeling that the material does not state. Never mention a person or place whose name is not in the material. Do not give the writer advice, do not narrate, do not talk about yourself in the third person, never mention cards, ids or types. Reply with your answer only: no quotation marks, no name before it, no stage directions.
```

**Données** : aucun identifiant de carte.

```json
{"you":{"name":"Inès Morvan","sheet":{"Voix":"Phrases courtes."},"notes":"…","earlierAnswers":[{"question":"Tu as peur de quoi ?","answer":"Du noir."}]},
 "links":[{"from":"Inès Morvan","link":"remplace","to":"Yann Le Goff","type":"personnage","about":"Ancien gardien."}],
 "scenes":[{"scene":"Arrivée","passages":["Inès monte l’escalier."]}],
 "conversation":[{"writer":"…","you":"…"}],
 "question":"Qui es-tu ?"}
```

- `sheet` : les champs remplis de la fiche (moteur, arc et voix compris, libellés de l'interface, l'étoile « principal » exceptée), 600 caractères chacun ; `notes` : le texte de la carte, 2 500 caractères ; `earlierAnswers` : ses `reponses` (questions en clair, `q:` et `i:` compris), 30 au plus, 400 caractères chacune.
- `links` : les fils vers des cartes titrées, avec leur sens et leur étiquette, et le début du texte de l'autre carte (200 caractères), 20 au plus.
- `scenes` : roman, les paragraphes du manuscrit qui le nomment (titre, prénom, surnoms, comme la Bible), deux par scène, 420 caractères chacun ; scénario, les scènes où il parle ou est nommé dans l'action (lecture du filtre par personnage), avec l'action et ses propres répliques, 900 caractères par scène. Dans l'ordre du récit, au plus 14 scènes et environ 7 000 caractères.
- `conversation` : les six derniers échanges de la conversation en cours (réponses abrégées à 500 caractères), qui n'est jamais enregistrée.
- Longueur demandée : 350 jetons (plus la marge de raisonnement hors Claude).

**Ce que MondoWrite garde** (`parseInterrogation`) : du texte brut seulement (balises et Markdown retirés, préfixe « Nom : » ou « Réponse : », guillemets autour de la réponse et didascalie de tête retirés), 700 caractères au plus, coupé à une fin de phrase. Les noms propres de la réponse (mot à majuscule qui ne commence pas une phrase) qu'aucun texte du projet ne contient (consigne envoyée, titres et textes de toutes les cartes, question de l'auteur) sont signalés sous la réponse : « Ce nom n’existe pas encore dans ton projet ». Rien n'entre dans le projet sans « Garder » : la réponse va alors dans `reponses` du personnage sous la clé `i:<question de l'auteur>` (à la suite d'une réponse déjà gardée pour la même question), et paraît repliée sous la fiche avec la question en clair. L'interview, la synthèse et la cohérence la reçoivent comme les autres réponses.

## 7. Du vrac aux cartes (1.8.0)

Bouton IA › Du vrac aux cartes… (sur téléphone : Carnet › Découper avec l'IA, pour une note longue). Code : `src/ai/vrac.ts`, fenêtre `VracDialog`.

L'auteur colle un texte en vrac (notes, compte rendu de brainstorm, dictée), au plus 8 000 caractères (au-delà, la fenêtre le dit et demande de le coller en plusieurs fois : la réponse recopie le texte, plus long elle dépasserait le délai des services). L'IA propose de le découper en cartes reliées par des fils. Le texte des cartes est celui de l'auteur, découpé, jamais réécrit : seul le titre vient de l'IA.

**Consigne** (exemple pour un roman ; `{types}` est la liste des types du projet, sans Image, Lien ni Document, avec l'Épisode seulement pour une série) :

```
You help a writer turn raw notes for a novel (a brainstorm, a dictation, a list) into cards. Split the text into passages, one per card. Each card gets a type, a short title and its text. Types (use these keys only): idee (a loose idea that fits no other type); personnage (a character); lieu (a place or location); scene (a scene: something that happens at a given moment, only if the text really describes one); intrigue (a plot line or subplot running through several scenes); groupe (a group, family, organisation or faction); objet (an object that matters to the story); evenement (an event of the story world, past or offstage); regle (a rule of the story world: magic, society, technology); secret (a secret someone keeps); theme (a theme); question (an open question the writer asks themself). The "text" of a card MUST be copied word for word from the writer's text: an exact, continuous excerpt. Never rewrite, rephrase, summarise, correct, translate or complete it, and never add words. A passage goes in one card only. Leave out filler that belongs in no card. The "title" is the only thing you write: at most 6 words, in the language of the text, taken from the passage (for a character or a place, its name). Then suggest links between cards that the text itself connects (a character lives in a place, a secret is kept by someone), with an optional "label" of 1 to 4 words in {langue}. A link may also point to an existing card of the project, by its "id" from the list "existing" (for example when the text names a character who already has a card); do not create a new card for something that already has one, link to it instead. Answer with a JSON object only: {"cards": [{"key": "n1", "type": "<type>", "title": "<title>", "text": "<exact excerpt>"}], "links": [{"from": "<key or existing id>", "to": "<key or existing id>", "label": "<label>"}]}. Keys are "n1", "n2"… Use existing ids exactly as given. At most 40 cards. If nothing in the text makes a card, answer {"cards": [], "links": []}.
```

**Données** : le texte collé, et les cartes du projet qui ont un titre (identifiant, type, titre ; au plus 150), pour que l'IA puisse y tirer des fils.

```json
{"text":"Brainstorm du 12 mars.\nInès Morvan, gardienne remplaçante du phare…",
 "existing":[{"id":"k3x9a7bq2m","type":"personnage","title":"Yann Le Goff"}]}
```

Réponse en JSON (`format: "json"` pour Ollama), limite de longueur `1500 + longueur du texte / 2` jetons (au plus 8 000), délai de 240 s pour un service en ligne.

**Ce que MondoWrite garde** (`parseVrac`) :

- chaque passage est cherché dans le texte collé, espaces, ponctuation, casse et accents repliés ; trouvé, c'est le passage d'origine, tel que l'auteur l'a écrit (avec sa ponctuation et sa marque de liste en tête de ligne), qui entre dans la carte, jamais le texte rendu par l'IA ; un mot changé au milieu est rattrapé en alignant le début et la fin du passage (longueur voisine), et c'est encore le texte d'origine qui est gardé ; sinon le passage est écarté, et la fenêtre dit combien ;
- un passage déjà pris (ou contenu dans un autre) ne fait pas une seconde carte ; au plus 40 cartes ;
- un type hors de la liste du projet (Image, Lien, Document, type inconnu) devient Idée : le texte reste à l'auteur ;
- le titre est coupé à une ligne de 80 caractères ; vide, les premiers mots du passage ;
- un fil relie deux cartes connues (clé d'une carte gardée, ou identifiant d'une carte du projet), dont au moins une nouvelle, sans boucle ni doublon ; son étiquette est coupée à 40 caractères, et un identifiant qui s'y glisserait devient « Titre (type) » (`nameCards`).

L'auteur voit la liste : chaque carte cochée (case), son type et son titre modifiables, l'aperçu du texte ; les fils cochés, retirés d'office si une de leurs cartes est décochée. « Créer les cartes » les pose en une seule étape d'annulation (`createVracCards`), en grille, dans un espace libre près du centre de la vue, jamais sur une carte ni sur un cadre. Sur téléphone, elles vont dans « À ranger ». Une Scène range son texte comme toute carte qui devient Scène (manuscrit d'un roman, Fountain d'un scénario). Rien n'est créé sans ce clic.

## 8. Mode Atelier (1.8.0)

L'exception choisie par projet : Réglages › Ce projet › « Activer le mode Atelier pour ce projet » (seulement quand un service d'IA est branché ; `aiMode: "atelier"` dans cosmos.json, absent sinon). Le principe reste le même ailleurs : l'IA questionne, elle n'écrit pas. Dans l'Atelier, elle peut proposer du texte, mais rien n'entre sans un clic de l'auteur, et ce qu'il accepte reste marqué (soulignement pointillé ; `<span data-ia>` dans le Markdown, note `[[ia]]` dans le Fountain, liste `ia` d'une carte ou de la couverture) et noté dans `ia-journal.md` (date et heure, action, carte ou scène par son titre, service et modèle, mots insérés), jusqu'à « Je l'ai repris ». Consignes et lecteurs : `src/ai/atelier.ts`. Chaque réponse est relue en texte brut (balises, Markdown, puces et guillemets autour retirés, longueur bornée), jamais insérée comme HTML. Toutes les consignes finissent par la même règle :

```
Write in {langue}. Plain text only: no Markdown, no HTML, no quotation marks around your answer, no commentary. Never mention a card id.
```

### A1. Trois variantes

Barre de mise en forme (cartes, Bible, manuscrit) sur une sélection de 600 caractères au plus ; barre du scénario sur l'action, la réplique ou la didascalie où est le curseur.

```
You help a writer who asked, for this project, for alternative wordings of {a sentence or short passage from a novel | a line of dialogue from a screenplay | a line of action (scene description) from a screenplay} they wrote. Give exactly three rewordings of the passage. Keep its meaning, its point of view, its tense, its person and the voice of the text; do not add events, names or information, and do not explain. Each rewording is about as long as the passage. {règle commune} Answer with a JSON object only: {"variants": ["<rewording 1>", "<rewording 2>", "<rewording 3>"]}.
```

**Données** : `{"passage": "…", "speaker": "INÈS", "textBefore": "…", "textAfter": "…"}` (le personnage d'une réplique ; 600 caractères avant, 400 après, dans le même paragraphe).

**Ce que MondoWrite garde** (`parseVariants`) : trois textes au plus, distincts entre eux et du passage, au plus trois fois sa longueur. La variante prise remplace la sélection en une transaction de l'éditeur (une étape d'annulation), marquée, ligne au journal.

### A2. Synopsis d'une scène

À côté d'un synopsis vide (volet des scènes du Scénario, séquencier, Plan, volet du Manuscrit, carte agrandie d'une scène de scénario), quand la scène a au moins huit mots de texte.

```
You help a writer keep track of their {novel | screenplay}. Summarise the scene below in one or two sentences, present tense, at most 40 words: what happens and what changes. Use only what the text says; do not interpret, judge or add anything. {règle commune}
```

**Données** : `{"scene": "<titre>", "text": "<texte de la scène, 12 000 caractères au plus>"}`.

**Ce que MondoWrite garde** (`parseSynopsis`) : le premier paragraphe, sans « Synopsis : » devant, 400 caractères au plus. Gardé : roman, `fiche.synopsis` et `ia: ["synopsis"]` dans la carte ; scénario, ligne `= … [[ia]]`. Retouché par l'auteur, la marque part.

### A3. Trois directions

Barre de la page du Manuscrit et barre du Scénario (scène où est le curseur).

```
You help a writer who is stuck at the end of a scene of their {novel | screenplay}. Suggest exactly three different directions for what could happen next, each in one short line (at most 25 words): a lead, not prose for the book. Make them genuinely different (for example: an escalation, a reversal, a quiet turn). Use the characters and places the writer already has when they fit; do not invent backstory. {règle commune} Answer with a JSON object only: {"directions": ["<line 1>", "<line 2>", "<line 3>"]}.
```

**Données** : titre, synopsis, les 3 000 derniers caractères de la scène, et au plus 40 cartes Personnage, Lieu, Intrigue, Objet, Secret (type et titre seulement).

**Ce que MondoWrite garde** (`parseDirections`) : trois lignes de 200 caractères au plus. « En faire une carte » : une carte Idée à ce titre (`ia: ["title"]`), reliée à la scène par un fil « piste ». Rien n'est écrit dans le manuscrit.

### A4. Brouillon de la couverture

Couverture du projet (Bible), sous « Questionner » : « Proposer un brouillon » pour l'accroche, la logline, le résumé, les comparables et la note d'intention restés vides.

```
You help a writer draft the cover page of their {novel | screenplay} project, which they will rework. Draft only the fields asked for, from what the cards and the fields already filled say. Do not invent characters, events or an ending the cards do not give. Leave out a field you cannot draft honestly. {règle commune} Answer with a JSON object only, with these keys: {"logline": "one sentence: who wants what, against what obstacle, with what at stake", …}.
```

Repères donnés par champ : tagline « a one-line hook for the cover, at most 15 words » ; logline ci-dessus ; résumé « a summary of the story in one or two short paragraphs, in the present tense, ending included if the cards say it » ; comparables « two or three comparable published works or films, as "Title (Author or director)", separated by commas » ; note d'intention « a short statement of intent, in the first person, about why this story and what it is about, using only what the cards say ».

**Données** : titre du projet, champs déjà remplis, au plus 80 cartes (type, titre, 300 caractères de texte).

**Ce que MondoWrite garde** (`parsePitchDraft`) : seulement les champs demandés, bornés (160, 400, 2 500, 400, 2 500 caractères), paragraphes gardés pour le résumé et la note. Chaque champ s'accepte à part (Ajouter, ou Remplacer avec la valeur actuelle sous les yeux, ou Ignorer). Accepté : `pitch.ia` (« logline,resume »), retiré quand l'auteur retouche le champ ou dit « Je l'ai repris ».

### A5. Fiche d'un personnage secondaire

Bible, fiche d'un personnage presque vide (au plus deux champs remplis, 120 mots de notes au plus) qui a des notes ou des fils : « Proposer une fiche ».

```
You help a writer flesh out a minor character of their story, from the few notes they wrote and the character's links to other cards. Suggest a short value for some of the sheet fields below (a few words, at most two sentences each), consistent with the notes and links. Never invent or guess ethnicity, origin, religion, health, disability or sexual orientation, and do not change what the notes already say. Leave out a field you have no basis for. {règle commune} Answer with a JSON object only: {"fields": {<key>: "<value>"}}, keys among: {"metier": "Métier", …}.
```

Champs permis (`SHEET_DRAFT_FIELDS`), parmi les vides : accroche, rôle, âge, métier, surnoms, apparence, personnalité, voix, objectif, peur, secret, relations. Jamais le genre ni l'origine, ni les champs à choix (arc, principal, certitude).

**Données** : nom, notes (1 500 caractères), fiche, au plus 30 fils (étiquette, titre et type de la carte au bout).

**Ce que MondoWrite garde** (`parseSheetDraft`) : seulement les champs permis et demandés, 400 caractères au plus (60 pour l'âge). Acceptés un à un comme la description d'une photo ; marqués par `ia` dans la carte, retirés au premier changement de l'auteur.

## Recherche par le sens (1.9.0)

Fenêtre de recherche (Cmd/Ctrl + F), mode « Par le sens » : retrouve les passages qui parlent de la même chose que la question, même avec d'autres mots (« Où ai-je parlé de la lettre ? » trouve « une enveloppe glissée sous la porte »). Code : `src/ai/semantic.ts`, `src/components/SemanticSearch.tsx`.

**Pas de consigne** : aucun modèle de conversation n'est appelé, rien n'est rédigé. Le service ne fait que changer des textes en vecteurs de nombres (embeddings) ; le classement se fait dans l'app (cosinus).

**Seulement un service local** (Ollama, LM Studio) : la recherche lit tout le projet, qui ne doit pas partir en ligne. Avec Claude, OpenAI ou OpenRouter, le mode n'apparaît pas, et les Réglages disent pourquoi en une phrase. Modèle : « Modèle de la recherche par le sens » dans les Réglages (`settings.ai.embedModels[service]`, réglage de l'appareil), proposé d'office s'il y a un modèle installé dont le nom contient « embed » (par exemple `nomic-embed-text`).

**Ce qui est envoyé, et où** :

- Ollama : `POST {adresse}/api/embed` avec `{ "model", "input": [textes], "truncate": true }`.
- LM Studio : `POST {adresse}/v1/embeddings` avec `{ "model", "input": [textes] }`, et le jeton facultatif en `Authorization: Bearer`.
- Les textes : les passages du projet, 16 par requête, puis la question seule. Passages : un paragraphe du manuscrit (roman), ou une suite de paragraphes courts (répliques) jusqu'à 600 caractères ; dans un scénario, l'en-tête de la scène puis un petit bloc d'éléments (action, nom et réplique ensemble, didascalie, transition, synopsis ; jamais les notes ni le texte mis de côté) ; pour une carte, son titre, les valeurs de sa fiche écrites par l'auteur (pas les codes : statut, certitude, arc…) et son texte. Au plus 1 500 caractères par passage (coupé entre deux phrases).
- Préfixes attendus par certains modèles : `search_document: ` et `search_query: ` pour nomic-embed-text, `passage: ` et `query: ` pour la famille e5.

**Ce que MondoWrite garde** (`readEmbeddings`) : exactement un vecteur par texte envoyé, nombres finis, tous de la même taille ; sinon la réponse est refusée (message « ce modèle ne sait pas lire le texte en vecteurs »). L'index vit en mémoire le temps de la session (`SemanticIndex`) : seuls les passages nouveaux ou changés (empreinte du texte) sont recalculés, ceux qui ne sont plus dans le projet sont oubliés, et changer de service, d'adresse ou de modèle repart de zéro. **Rien n'est écrit dans le projet**, ni ailleurs sur le disque. Lecture du projet avec progression et « Annuler ».

**Résultats** : classés par proximité, une carte une seule fois (son meilleur passage), les passages trop loin du meilleur écartés. Choisir un passage du manuscrit l'ouvre et le sélectionne (`openInManuscript(scène, début du paragraphe)`) ; un passage du scénario ouvre l'élément (`@` + rang) ; une carte est montrée sur le canevas (`revealCard`).

## 9. Relecture par l'IA (1.9.0)

Bouton IA › groupe « Relecture par l'IA », quatre actions, roman et scénario. Elles lisent **tout le récit** et rendent des questions, jamais des corrections ; les questions arrivent en tête de l'onglet « Vérifier » du Manuscrit ou du Scénario, sous « Questions de l'IA » (la vue s'y ouvre au lancement). Chacune mène à sa scène (et sélectionne le passage cité quand il est retrouvé tel quel dans le texte), se garde en carte Question reliée aux scènes et aux cartes en jeu (« Garder en question »), ou s'ignore pour la session. Rien n'est enregistré dans le projet hormis une question gardée. Un appel par paquet, avec l'avancement (« partie 2 sur 5 ») et « Annuler » ; les questions déjà reçues restent. Consignes et lecteurs : `src/ai/review.ts`.

**Scènes envoyées** : dans l'ordre du récit (roman : `bookOrder`, sans les pages de titre, mentions légales, dédicace, épigraphe, remerciements et « l'auteur » ; scénario : ordre du fichier Fountain), chacune avec une référence `s1`, `s2`… qui ne sert qu'à l'IA. Une scène est `{ ref, title, time?, synopsis?, text }` : `time` est le moment de l'en-tête d'un scénario (« NUIT »), `text` le texte brut (scénario : les noms des personnages devant leurs répliques).

Toutes les consignes finissent par la même règle (`answerRule`) :

```
Do not propose fixes, do not rewrite and do not complete anything: phrase each point as one short question to the writer, in {langue}. {règle des cartes nommées par leur titre, voir « Règles communes »} Name a scene by its title in quotation marks, never by its ref ("s3"): refs belong only in the "scenes" field. Answer with a JSON object only: {"items": [{"scenes": ["<scene ref>"], "cards": ["<card id>"], "question": "<question>", "quote": "<up to 12 words copied exactly from the scene text, or empty>"}]}. "scenes" lists the refs of the scenes involved, exactly as given; "cards" the ids of the cards involved (may be empty). At most 12 items. If you find nothing, answer {"items": []}.
```

**Ce que MondoWrite garde** (`parseReview`) : au plus douze questions par réponse, chacune rattachée à au moins une scène connue (référence `s3`, numéro, titre de la scène ou identifiant de sa carte Scène ; pour les voix, une carte connue suffit). Les cartes par identifiant ou par titre, rien d'inconnu. Une référence `s3` restée dans la question devient le titre de la scène entre guillemets, un identifiant de carte devient « Titre (type) » (`nameCards`). Le passage cité (`quote`) n'est gardé que s'il se retrouve dans le texte d'une des scènes (casse et espaces repliées), sinon la question reste sans lui. Une même question n'est gardée qu'une fois.

### R1. Cohérence scène par scène

```
You are a continuity reader for a {novel | screenplay}. You get scenes in story order with their text, the sheets of the cards they involve (characters, places, objects, secrets, events, groups) and a short summary of the scenes before them. Look for continuity slips: an age, eye or hair colour or other physical detail that changes; a season, weather, time of day or date that does not fit the scene before; a character who knows something before they could have learnt it, or forgets what they know; a character in two places at the same time; an object where it cannot be. Report only real inconsistencies in what is written (between scenes, or between a scene and a sheet), never missing information, style, taste or plot advice. {règle commune}
```

**Données** (`continuityPrompts`, un envoi par paquet) : les scènes écrites, découpées en paquets (`packScenes`, dans l'ordre) qui tiennent dans 60 % des 30 000 caractères, chaque scène bornée à 9 000 caractères ; pour chaque paquet, `earlier` (référence, titre et synopsis des scènes d'avant, 3 000 caractères au plus, les plus proches d'abord gardées), `cards` (fiches des Personnages, Lieux, Objets, Secrets, Événements et Groupes que le paquet nomme, par titre, prénom ou surnom, ou qu'un fil relie à une de ses scènes ; au plus 40, 10 000 caractères, sous la même forme que pour la cohérence) et les fils entre elles.

```json
{"earlier":[{"ref":"s1","title":"L’arrivée","synopsis":"…"}],
 "cards":[{"id":"p1","type":"personnage","title":"Inès Morvan","text":"…","sheet":{"age":"34 ans"}}],
 "links":[], "scenes":[{"ref":"s2","title":"La tempête","synopsis":"…","text":"…"}]}
```

### R2. Chronologie

Les repères de temps sont relevés **sans IA** (`timeMarkers`, français et anglais : « trois jours plus tard », « le lendemain matin », « la veille », « à l’aube », « vers midi », jours de la semaine, « le 3 mars 1942 », « en hiver », « 19 h 30 », “the next morning”, “two weeks later”, “at dawn”, “in March”, “7:30 pm”, dates en chiffres…). Sans aucun repère ni moment d'en-tête, rien n'est envoyé et l'auteur en est averti.

```
You check the timeline of a {novel | screenplay}. For each scene, in story order, you get its title{, the time of day written in its heading (scénario)}, the time markers found in its text ("three days later", "at dawn", "the next day", dates, seasons, weekdays), its synopsis and its opening. Work out the time line from these markers and report only what cannot hold: an impossible order (a scene marked "the next morning" after one that already happens two days later; night followed by "the same afternoon"), a duration that does not add up (a journey, an age, a pregnancy, a countdown), a date, weekday or season that contradicts another. A flashback or a time jump is fine when the text marks it. Never ask for markers that are missing. {règle commune}
```

**Données** (`timelinePrompts`) : `{"scenes": [{"ref", "title", "time"?, "markers": [...], "synopsis"? (200), "opening" (300)}]}`, en paquets de 28 000 caractères au plus.

### R3. Voix des personnages

```
You read the dialogue of a screenplay to help the writer hear their characters. For each character who speaks you get what the writer says of them (sheet field "voice", personality, notes, when a card exists) and lines they speak, each with the ref of its scene.
```
ou, pour un roman :
```
You read the dialogue of a novel to help the writer hear their characters. You get the characters' cards (sheet field "voice", personality, notes) and, scene by scene, the passages between quotation marks or after a dialogue dash, with the characters the scene names. The lines are not attributed: attribute one only when the text makes it clear; when unsure, say nothing about it.
```
suivi de :
```
Report only two kinds of points: two characters who sound alike (same vocabulary, rhythm, verbal tics, register) when nothing the writer wrote says they should; a character whose lines in a scene leave what the writer says of their voice (register, accent, way of speaking). Never rewrite a line and never suggest a better one. Put the scene where it shows in "scenes" and a few words of the line in "quote". {règle commune}
```

**Données** (`voicesPrompt`, un envoi) : scénario, `{"characters": [{"name": "INÈS", "id"?, "title"?, "voice"?, "personality"?, "notes"?, "lines": ["s3: Encore une nuit.", …]}]}` pour les seize personnages qui parlent le plus (au moins deux répliques), la carte retrouvée par son nom (titre, prénom, surnoms), une part égale du budget pour chacun, répliques prises dans tout le récit. Roman : `{"characters": [fiches, 30 au plus], "scenes": [{"ref", "title", "names": [personnages nommés dans la scène], "lines": [12 passages au plus]}]}` ; les passages sont ceux entre « », “ ” ou " " et les paragraphes ouverts par un tiret (`proseLines`), jamais attribués par MondoWrite. Sans répliques, rien n'est envoyé.

### R4. Lecteur bêta

```
You are a beta reader of a {novel | screenplay}. You get the whole story, scene by scene, in story order: the title, synopsis and opening of each scene. Tell the writer, honestly and specifically: where you lose interest (a scene or stretch where the tension drops), what you did not understand (a motive, a jump, someone who appears without introduction), and what you expected that never comes (a promise, a set-up, a question the story raises and drops). Tie each point to the scene where it happens. Do not praise, do not rewrite, do not suggest scenes or events. Give each item a "kind": "lost" (where you lose interest), "unclear" (what you did not understand) or "expected" (what you expected). {règle commune, avec "kind" dans le format}
```

**Données** (`betaPrompt`, un envoi) : `{"scenes": [{"ref", "title", "synopsis"?, "opening"}]}`, toutes les scènes écrites ; la part de chacune (entre 20 et 700 caractères, synopsis puis début du texte) est calculée pour que l'ensemble tienne dans les 30 000 caractères. Le `kind` n'est gardé que s'il vaut `lost`, `unclear` ou `expected` (affiché « Je décroche », « Pas compris », « J'attendais »).
