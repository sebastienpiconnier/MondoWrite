# Traduire MondoWrite / Translating MondoWrite

*English below.*

MondoWrite existe en français (langue de référence) et en anglais. Toute autre langue est la bienvenue, et **une traduction peut être partielle** : ce qui n'est pas encore traduit s'affiche en anglais. Une langue apparaît dans le menu des Réglages dès que la moitié de ses textes est traduite, avec la part traduite (« Deutsch · 72 % übersetzt ») tant qu'elle n'est pas complète.

## Avant de commencer

Ouvrez une [issue « Traduction »](https://github.com/sebastienpiconnier/MondoWrite/issues/new?template=traduction.yml) pour dire quelle langue vous prenez : deux personnes ne traduiront pas la même chose en même temps, et l'issue sert à poser vos questions sur le sens d'un texte.

## Deux façons de traduire

**Avec Node.js 22 ou plus récent** (le mieux : vous voyez votre traduction dans l'app) :

```bash
git clone https://github.com/<vous>/MondoWrite && cd MondoWrite
npm install
npm run i18n -- new de          # crée src/i18n/de.ts, tous les textes en anglais, et l'inscrit dans l'app
npm run dev                     # l'app dans le navigateur ; Réglages › Général › Langue
npm run i18n                    # part traduite de chaque langue
npm run i18n -- missing de      # ce qui reste à traduire, avec le texte anglais
npm test                        # vérifie entre autres la typographie de votre langue
git commit -s -m "Traduction allemande : accueil et réglages"
```

**Sans rien installer** : demandez dans l'issue que le fichier de votre langue soit créé. Ouvrez-le ensuite sur GitHub (`src/i18n/de.ts`), cliquez sur le crayon, traduisez, puis « Propose changes » : GitHub crée la copie du dépôt et la pull request pour vous. Ajoutez à la main la ligne `Signed-off-by: Prénom Nom <adresse>` dans la description du commit (voir plus bas).

Vous pouvez envoyer la traduction par morceaux : une pull request par partie (accueil, canevas, Bible…) est plus facile à relire.

## Ce qu'il faut traduire, et ce qu'il ne faut jamais toucher

Dans le fichier, seuls les **textes entre guillemets droits, à droite des deux-points**, se traduisent :

```ts
  settings: {
    language: "Sprache",                       // traduit
    languagePartial: "{name} · {percent} übersetzt",
  },
```

- Les **clés** (`settings`, `language`) ne changent jamais.
- Les **variables** entre accolades (`{name}`, `{n}`) restent telles quelles, vous pouvez les déplacer dans la phrase.
- Un texte retiré ou laissé en anglais s'affiche en anglais : rien ne casse.
- Un texte **voulu identique** à l'anglais (« Plan », « Sepia », « INT. ») compterait comme non traduit : listez son chemin dans `meta.same` (`same: ["settings.palettes.sepia"]`) pour qu'il compte comme fait.
- Les **listes** (`["…", "…"]`) gardent le même nombre d'éléments, sauf les suggestions (`pitch.suggest`, `pitch.suggestScenario`, `home.greeting`, `screenplay.moments`), que vous pouvez allonger ou raccourcir. Une liste d'une autre longueur est ignorée (l'anglais reste).
- Ne traduisez pas les noms de formats et de logiciels (Fountain, Final Draft, PDF, EPUB), ni « MondoWrite ».
- Le **projet d'exemple** (`demo`, « Le Petit Chaperon rouge » de Perrault, 1697) se traduit depuis le texte français, par vous : ne recopiez jamais une traduction publiée, elle est protégée par le droit d'auteur.

## Le ton

- Le français tutoie, l'anglais est direct et chaleureux. Prenez la forme familière de votre langue si elle en a une (du, tú, tu, ty…), sauf si l'usage des logiciels y est autre.
- Des phrases courtes, des verbes plutôt que des noms. Les libellés de boutons sont des actions (« Exporter », pas « Exportation »).
- Les textes peuvent être plus longs qu'en anglais (l'allemand compte 30 % de plus) : l'interface le supporte, mais visez court.
- Les termes du métier (scénario, séquencier, en-tête de scène) suivent l'usage des auteurs de votre pays.

## Typographie de chaque langue

Les règles de chaque langue sont dans [`src/typoRules.ts`](src/typoRules.ts). Elles servent à deux choses : la **typographie à la frappe** de l'auteur (Réglages › Écriture), et la **vérification de votre traduction** par `npm test`, qui signale apostrophe ou guillemets droits (`'`, `"`), trois points au lieu de `…`, guillemets d'une autre langue, et espaces avant `; : ! ?` absentes ou en trop.

| Code | Langue | Guillemets | Second niveau | Tiret | Espace avant ; : ! ? |
|---|---|---|---|---|---|
| `fr` | Français | « … » (insécables) | “…” | — | fine insécable avant ; ! ?, insécable avant : |
| `en` | English | “…” | ‘…’ | — | aucune |
| `en-GB` | British English | ‘…’ | “…” | – | aucune |
| `de` | Deutsch | „…“ | ‚…‘ | – | aucune |
| `de-CH` | Deutsch (Schweiz) | «…» | ‹…› | – | aucune |
| `es` | Español | «…» | “…” | — | aucune |
| `it` | Italiano | «…» | “…” | — | aucune |
| `pt` | Português | «…» | “…” | — | aucune |
| `pt-BR` | Português (Brasil) | “…” | ‘…’ | — | aucune |
| `ca` | Català | «…» | “…” | — | aucune |
| `nl` | Nederlands | “…” | ‘…’ | – | aucune |
| `sv` | Svenska | ”…” | ’…’ | – | aucune |
| `fi` | Suomi | ”…” | ’…’ | – | aucune |
| `da` | Dansk | »…« | ›…‹ | – | aucune |
| `nb` | Norsk bokmål | «…» | ‘…’ | – | aucune |
| `pl` | Polski | „…” | «…» | – | aucune |
| `cs` | Čeština | „…“ | ‚…‘ | – | aucune |
| `ro` | Română | „…” | «…» | — | aucune |
| `hu` | Magyar | „…” | »…« | – | aucune |
| `ru` | Русский | «…» | „…“ | — | aucune |
| `uk` | Українська | «…» | „…“ | — | aucune |
| `tr` | Türkçe | “…” | ‘…’ | — | aucune |

L'apostrophe est toujours `’` (U+2019). Les espaces insécables du français s'écrivent ` ` (insécable) et ` ` (fine insécable) si votre éditeur ne les montre pas.

**Votre langue n'est pas dans le tableau, ou une règle est fausse ?** Ajoutez ou corrigez sa ligne dans `TYPO_RULES` (`src/typoRules.ts`), avec un test dans `src/__tests__/typo-rules.test.ts`, et citez votre source (guide de typographie, académie, ouvrage de référence) dans la pull request. Sans ligne, l'anglais s'applique. La césure du livre broché n'est livrée qu'en français et en anglais : chaque jeu de motifs a sa propre licence, à vérifier avant de l'ajouter (`hyphen`, `THIRD-PARTY-NOTICES.md`).

## Ce qui reste en français et en anglais

Le guide de l'utilisateur (`docs/guide/`) et les consignes envoyées à l'IA restent pour l'instant en français et en anglais ; l'IA répond quand même dans la langue de l'auteur. Les fichiers d'un projet ne se traduisent jamais (`cartes/`, `cosmos.json`, valeurs de `type:`) : un projet s'ouvre dans toutes les langues.

## Licence et signature

Une traduction est une contribution comme une autre : elle suit les conditions de [CONTRIBUTING.md](CONTRIBUTING.md) (AGPL v3.0 ou ultérieure, plus une licence accordée à l'auteur de MondoWrite pour les boutiques d'applications). Chaque commit porte la ligne `Signed-off-by` (`git commit -s`) ; une vérification automatique la demande sur chaque pull request.

---

## English

MondoWrite ships in French (the reference language) and English. Any other language is welcome, and **a translation can be partial**: anything not translated yet shows in English. A language appears in the Settings menu once half of its texts are translated, with its progress (“Deutsch · 72 % übersetzt”) until it is complete.

### Before you start

Open a [“Translation” issue](https://github.com/sebastienpiconnier/MondoWrite/issues/new?template=traduction.yml) to say which language you are taking on: two people won't translate the same thing at once, and the issue is where to ask what a text means.

### Two ways to translate

**With Node.js 22 or later** (best: you see your translation in the app):

```bash
git clone https://github.com/<you>/MondoWrite && cd MondoWrite
npm install
npm run i18n -- new de          # creates src/i18n/de.ts, every text in English, and registers it in the app
npm run dev                     # the app in your browser; Settings › General › Language
npm run i18n                    # progress of each language
npm run i18n -- missing de      # what is left to translate, with the English text
npm test                        # checks, among other things, your language's typography
git commit -s -m "German translation: home and settings"
```

**Without installing anything**: ask in the issue for your language's file to be created. Then open it on GitHub (`src/i18n/de.ts`), click the pencil, translate, then “Propose changes”: GitHub makes the fork and the pull request for you. Add the line `Signed-off-by: First Last <address>` to the commit description by hand (see below).

You can send the translation in pieces: one pull request per area (home, canvas, Bible…) is easier to review.

### What to translate, and what never to touch

In the file, only the **texts in straight quotes, right of the colon**, are translated.

- **Keys** (`settings`, `language`) never change.
- **Variables** in braces (`{name}`, `{n}`) stay as they are; you may move them within the sentence.
- A text you remove or leave in English shows in English: nothing breaks.
- A text **meant to be identical** to English (“Plan”, “Sepia”, “INT.”) would count as untranslated: list its path in `meta.same` (`same: ["settings.palettes.sepia"]`) so it counts as done.
- **Lists** (`["…", "…"]`) keep the same number of items, except suggestions (`pitch.suggest`, `pitch.suggestScenario`, `home.greeting`, `screenplay.moments`), which may be longer or shorter. A list of another length is ignored (English stays).
- Don't translate format and software names (Fountain, Final Draft, PDF, EPUB), nor “MondoWrite”.
- The **example project** (`demo`, Perrault's “Little Red Riding Hood”, 1697) is translated by you, from the French text: never copy a published translation, it is protected by copyright.

### Tone

- French uses the familiar “tu”, English is direct and warm. Use the familiar form of your language if it has one (du, tú, tu, ty…), unless software there usually does otherwise.
- Short sentences, verbs rather than nouns. Button labels are actions (“Export”, not “Exportation”).
- Texts may run longer than in English (German is 30 % longer): the interface copes, but aim short.
- Craft terms (screenplay, outline, scene heading) follow what writers in your country say.

### Typography of each language

Each language's rules live in [`src/typoRules.ts`](src/typoRules.ts) (table above). They are used for two things: the writer's **typography as you type** (Settings › Writing), and **checking your translation** with `npm test`, which flags straight apostrophes or quotes (`'`, `"`), three dots instead of `…`, another language's quotes, and missing or extra spaces before `; : ! ?`.

The apostrophe is always `’` (U+2019).

**Your language isn't in the table, or a rule is wrong?** Add or fix its line in `TYPO_RULES` (`src/typoRules.ts`), with a test in `src/__tests__/typo-rules.test.ts`, and cite your source (style guide, academy, reference book) in the pull request. Without a line, English rules apply. Paperback hyphenation only ships for French and English: each pattern set has its own license, to check before adding it (`hyphen`, `THIRD-PARTY-NOTICES.md`).

### What stays in French and English

The user guide (`docs/guide/`) and the instructions sent to the AI stay in French and English for now; the AI still answers in the writer's language. Project files are never translated (`cartes/`, `cosmos.json`, `type:` values): a project opens in every language.

### License and sign-off

A translation is a contribution like any other: it follows the terms of [CONTRIBUTING.md](CONTRIBUTING.md) (AGPL v3.0 or later, plus a license granted to MondoWrite's author for app stores). Every commit carries the `Signed-off-by` line (`git commit -s`); an automatic check asks for it on every pull request.
