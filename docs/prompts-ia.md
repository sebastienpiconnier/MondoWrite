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
