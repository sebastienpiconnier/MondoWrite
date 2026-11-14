# Mentions tierces / Third-party notices

MondoWrite est distribué sous licence [GNU AGPL v3.0 ou ultérieure](LICENSE). Il reprend ou embarque des éléments d'autres auteurs, publiés sous des licences compatibles. Ce fichier regroupe leurs mentions de copyright et le texte de leurs licences, comme celles-ci l'exigent.

MondoWrite is released under the [GNU AGPL v3.0 or later](LICENSE). It reuses or bundles work by other authors, released under compatible licenses. This file gathers their copyright notices and license texts, as those licenses require.

## Sommaire / Contents

1. NEO (Hugh Howey) : MIT
2. hyphen et motifs de césure de TeX / hyphen and TeX hyphenation patterns : ISC, MIT, licence libre de G. Kuiken
3. Polices / Fonts : SIL Open Font License 1.1
4. Bibliothèques / Libraries : MIT, Apache-2.0, ISC
5. Domaine public / Public domain
6. Données de synonymes et de noms / Synonym and name data : LGPL 2.1 ou ultérieure (synonymes, téléchargés, hors installeur), MIT (noms)

---

## 1. NEO (Hugh Howey)

Source : <https://github.com/hughhowey/neo>

Certaines parties de MondoWrite reprennent ou adaptent des règles et du code de NEO :

- import d'un manuscrit Word (`src/import/docx.ts`, d'après `docxStyleFormats` et `docxParagraphToMarkdown` de `main.js`) et découpage en chapitres et scènes (`src/import/manuscript.ts`, d'après `importFile` de `main.js`) ;
- export « livre broché » pour KDP (`src/export/paperback.ts`, d'après l'export « Paperback for KDP »).

Parts of MondoWrite reuse or adapt rules and code from NEO: Word manuscript import and chapter/scene splitting, and the KDP paperback export (files listed above).

```
MIT License

Copyright (c) 2026 Hugh Howey

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

Certaines idées de fonctions (objectifs d'écriture, pages du livre, passages « à reprendre », fiches de la Bible) viennent aussi de NEO ; une idée n'est pas couverte par le droit d'auteur, elles sont citées par courtoisie.

Some feature ideas (writing goals, book pages, highlighted passages, Bible sheets) also come from NEO; ideas are not covered by copyright and are credited as a courtesy.

---

## 2. hyphen et motifs de césure / hyphen and hyphenation patterns

La césure du livre broché utilise le paquet npm [`hyphen`](https://github.com/ytiurin/hyphen) (version 1.14) et ses motifs français, anglais américain et anglais britannique, portés depuis les motifs de TeX (projet [hyph-utf8](https://www.hyphenation.org/tex)).

Paperback hyphenation uses the [`hyphen`](https://github.com/ytiurin/hyphen) npm package and its French, US English and UK English patterns, ported from the TeX patterns (hyph-utf8 project).

### Paquet hyphen / hyphen package

```
ISC License (ISC)

Copyright (c) 2026, Yevhen Tiurin <yevhentiurin@gmail.com>

Permission to use, copy, modify, and/or distribute this software for any
purpose with or without fee is hereby granted, provided that the above
copyright notice and this permission notice appear in all copies.

THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES
WITH REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF
MERCHANTABILITY AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR
ANY SPECIAL, DIRECT, INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES
WHATSOEVER RESULTING FROM LOSS OF USE, DATA OR PROFITS, WHETHER IN AN
ACTION OF CONTRACT, NEGLIGENCE OR OTHER TORTIOUS ACTION, ARISING OUT OF
OR IN CONNECTION WITH THE USE OR PERFORMANCE OF THIS SOFTWARE.
```

### Motifs français / French patterns (`hyph-fr.tex`)

Copyright (C) 1994-2002 Daniel Flipo, Bernard Gaulle, 2016 Arthur Reutenauer. Licence MIT :

```
Permission is hereby granted, free of charge, to any person obtaining
a copy of this software and associated documentation files (the
"Software"), to deal in the Software without restriction, including
without limitation the rights to use, copy, modify, merge, publish,
distribute, sublicense, and/or sell copies of the Software, and to
permit persons to whom the Software is furnished to do so, subject to
the following conditions:

The above copyright notice and this permission notice shall be
included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND,
EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND
NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS
BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN
ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN
CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

### Motifs anglais américains / US English patterns (`hyph-en-us.tex`)

```
Copyright (C) 1990, 2004, 2005 Gerard D.C. Kuiken

Copying and distribution of this file, with or without modification,
are permitted in any medium without royalty provided the copyright
notice and this notice are preserved.
```

### Motifs anglais britanniques / UK English patterns (`hyph-en-gb.tex`)

Copyright (C) 1992, 1996, 2005, 2016 Dominik Wujastyk, Graham Toal. Licence MIT (même texte que ci-dessus / same text as above).

---

## 3. Polices / Fonts

Toutes ces polices sont publiées sous la [SIL Open Font License 1.1](https://openfontlicense.org). Elles sont embarquées dans l'app (interface, PDF et livre broché) et ne sont pas vendues seules.

All these fonts are released under the SIL Open Font License 1.1. They are bundled in the app (interface, PDF and paperback) and are not sold on their own.

| Police / Font | Copyright | Texte de la licence / License text |
|---|---|---|
| Courier Prime | Copyright 2015 The Courier Prime Project Authors (https://github.com/quoteunquoteapps/CourierPrime) | [src/assets/fonts/OFL.txt](src/assets/fonts/OFL.txt) |
| Crimson Text | Copyright 2010 The Crimson Text Project Authors (https://github.com/googlefonts/Crimson) | [src/assets/fonts/OFL-CrimsonText.txt](src/assets/fonts/OFL-CrimsonText.txt) |
| IBM Plex Sans | Copyright 2019 IBM Corp. All rights reserved. | SIL OFL 1.1, via `@fontsource/ibm-plex-sans` |
| IBM Plex Serif | Copyright 2020 IBM Corp. All rights reserved. | SIL OFL 1.1, via `@fontsource/ibm-plex-serif` |
| Literata (police de la page au choix / page font option) | Copyright 2017 The Literata Project Authors (https://github.com/googlefonts/literata) | SIL OFL 1.1, via `@fontsource/literata` |
| EB Garamond (police de la page au choix / page font option) | Copyright 2017 The EB Garamond Project Authors (https://github.com/octaviopardo/EBGaramond12) | SIL OFL 1.1, via `@fontsource/eb-garamond` |
| Atkinson Hyperlegible (police de la page au choix / page font option) | Copyright 2020 Braille Institute of America, Inc. | SIL OFL 1.1, via `@fontsource/atkinson-hyperlegible` |
| Playfair Display | Copyright 2017 The Playfair Display Project Authors (https://github.com/clauseggers/Playfair-Display), with Reserved Font Name "Playfair Display" | SIL OFL 1.1, via `@fontsource/playfair-display` |
| Oswald (couverture complète du livre broché / paperback full cover) | Copyright 2016 The Oswald Project Authors (https://github.com/googlefonts/OswaldFont) | SIL OFL 1.1, via `@fontsource/oswald` |
| Dancing Script (couverture complète / full cover) | Copyright 2016 The Dancing Script Project Authors (https://github.com/googlefonts/DancingScript), with Reserved Font Name 'Dancing Script' | SIL OFL 1.1, via `@fontsource/dancing-script` |
| Cinzel (couverture complète / full cover) | Copyright 2020 The Cinzel Project Authors (https://github.com/NDISCOVER/Cinzel) | SIL OFL 1.1, via `@fontsource/cinzel` |
| Space Grotesk | Copyright 2020 The Space Grotesk Project Authors (https://github.com/floriankarsten/space-grotesk) | SIL OFL 1.1, via `@fontsource/space-grotesk` |

Le texte complet de la SIL OFL 1.1 est identique pour toutes ces polices : voir [src/assets/fonts/OFL.txt](src/assets/fonts/OFL.txt).

The full SIL OFL 1.1 text is the same for all of these fonts: see [src/assets/fonts/OFL.txt](src/assets/fonts/OFL.txt).

---

## 4. Bibliothèques / Libraries

MondoWrite utilise les bibliothèques suivantes, intégrées à l'app. Le texte complet de chaque licence est fourni avec le paquet correspondant (`node_modules/<paquet>/LICENSE`, ou le dépôt de la bibliothèque).

MondoWrite uses the following libraries, bundled in the app. Each license's full text ships with the corresponding package.

| Bibliothèque / Library | Licence / License |
|---|---|
| React, React DOM | MIT |
| Tauri (`@tauri-apps/api`, plugins, crates `tauri`, `tauri-plugin-*`) | MIT ou / or Apache-2.0 |
| TipTap (`@tiptap/*`) et / and ProseMirror | MIT |
| React Flow (`@xyflow/react`) | MIT |
| Zustand | MIT |
| marked | MIT |
| Turndown | MIT |
| pdf-lib, `@pdf-lib/fontkit` | MIT |
| PDF.js (`pdfjs-dist`) | Apache-2.0 |
| fflate | MIT |
| html-to-image | MIT |
| nanoid | MIT |
| serde, serde_json, log (crates Rust / Rust crates) | MIT ou / or Apache-2.0 |
| swift-rs (crate Rust, compilation du pont Swift d'Apple Intelligence, Copyright The swift-rs contributors / build of the Apple Intelligence Swift bridge) | MIT ou / or Apache-2.0 |
| keyring (crate Rust, clés dans le trousseau du système, Copyright (c) 2016 keyring Developers / keys in the system keychain), et sous Linux / and on Linux secret-service, zbus | MIT ou / or Apache-2.0 (zbus : MIT) |
| fontdb (crate Rust, liste des polices de l'ordinateur, Copyright (c) 2020 Yevhenii Reizner / list of the computer's fonts), avec / with fontconfig-parser, roxmltree, memmap2, slotmap, tinyvec | MIT (fontconfig-parser, roxmltree, memmap2 : MIT ou / or Apache-2.0 ; slotmap : Zlib ; tinyvec : Zlib, MIT ou / or Apache-2.0) |

---

## 5. Domaine public / Public domain

Le projet d'exemple reprend « Le Petit Chaperon rouge » de Charles Perrault (1697) et trois gravures de Gustave Doré, gravées sur bois par Pannemaker (édition Hetzel, 1862), tous du domaine public.

The example project uses Charles Perrault's "Le Petit Chaperon rouge" (1697) and three engravings by Gustave Doré (Hetzel edition, 1862), all in the public domain.

---

## 6. Données de synonymes et de noms / Synonym and name data

Ces fichiers de données sont fabriqués par `scripts/thesaurus/build.mjs` et `scripts/names/build.mjs` et livrés dans `src/assets/thesaurus/` et `src/assets/names/`. Seules les données sont reprises, aucune bibliothèque.

These data files are built by `scripts/thesaurus/build.mjs` and `scripts/names/build.mjs` and shipped in `src/assets/thesaurus/` and `src/assets/names/`. Only data is reused, no library.

- **Synonymes français / French synonyms** : « Dictionnaire des synonymes français myThes » (`thes_fr`), version 2.3, par Frédéric Labbé, repris par Dicollecte / Grammalecte (https://grammalecte.net/), **LGPL 2.1 ou ultérieure**. Ce fichier n'est **pas dans l'installeur** : `scripts/thesaurus/build.mjs` le convertit en `fr.json`, publié à part sur https://mondowrite.app/thesaurus/ avec le texte de sa licence (`LICENSE-thes_fr.txt`) ; l'app le télécharge une fois, le vérifie (SHA-256) et le garde sur l'appareil. Il reste un fichier de données séparé et remplaçable, jamais mêlé au code. / The French thesaurus (`thes_fr`, myThes dictionary by Frédéric Labbé, maintained by Dicollecte / Grammalecte) is under the **LGPL 2.1 or later**. It is **not bundled** with the app: it is converted by `scripts/thesaurus/build.mjs`, published separately on mondowrite.app with its license text, downloaded once, verified (SHA-256) and kept on the device. It stays a separate, replaceable data file, never mixed into the code. Texte de la LGPL 2.1 : https://www.gnu.org/licenses/old-licenses/lgpl-2.1.html
- **Prénoms et noms par pays / First and last names by country** : listes de données de Faker (`@faker-js/faker`), MIT, reproduite ci-dessous / Faker data lists, MIT license reproduced below.

### Prénoms français (INSEE) / French first names (INSEE)

Registre `src/assets/names/registers/FR.json`, fabriqué par `scripts/names/build-insee.mjs` d'après le « Fichier des prénoms » de l'INSEE (naissances par sexe, prénom et année). Source : INSEE, https://www.insee.fr/fr/statistiques/2540004 ; réutilisation libre avec mention de la source (Licence Ouverte Etalab 2.0). Seuls les prénoms donnés au moins 300 fois depuis 1900 sont repris, regroupés par décennie. Noms de famille : « Fichier des noms de famille 1891-2000 », https://www.insee.fr/fr/statistiques/3536630, mêmes conditions, noms d'au moins 2 000 porteurs. / Register built from the INSEE first-name file; free reuse with attribution (Licence Ouverte Etalab 2.0). Only names given at least 300 times since 1900 are kept, grouped by decade.

### Prénoms et noms américains (SSA, Census) / US names (SSA, Census)

Registre `src/assets/names/registers/US.json`, fabriqué par `scripts/names/build-us.mjs`. Prénoms : Social Security Administration, « Popular Baby Names » (https://www.ssa.gov/oact/babynames/), 1900-2025, prénoms donnés au moins 2 000 fois. Noms de famille : US Census Bureau, « Frequently Occurring Surnames from the 2010 Census » (https://www.census.gov/topics/population/genealogy/data/2010_surnames.html), noms d'au moins 20 000 porteurs, sans les colonnes d'origine. Données du gouvernement fédéral américain, domaine public. / US federal government data, public domain.

### Faker

```
Faker - Copyright (c) 2022-2025

This software consists of voluntary contributions made by many individuals.
For exact contribution history, see the revision history
available at https://github.com/faker-js/faker

Permission is hereby granted, free of charge, to any person obtaining
a copy of this software and associated documentation files (the
"Software"), to deal in the Software without restriction, including
without limitation the rights to use, copy, modify, merge, publish,
distribute, sublicense, and/or sell copies of the Software, and to
permit persons to whom the Software is furnished to do so, subject to
the following conditions:

The above copyright notice and this permission notice shall be
included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND,
EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND
NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE
LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION
OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION
WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.

===

From: https://github.com/faker-js/faker/commit/a9f98046c7d5eeaabe12fc587024c06d683800b8
To: https://github.com/faker-js/faker/commit/29234378807c4141588861f69421bf20b5ac635e

Based on faker.js, copyright Marak Squires and contributor, what follows below is the original license.

===

faker.js - Copyright (c) 2011-2020
Marak Squires
http://github.com/marak/faker.js/

faker.js was inspired by and has used data definitions from:

 * https://github.com/stympy/faker/ - Copyright (c) 2007-2010 Benjamin Curtis
 * http://search.cpan.org/~jasonk/Data-Faker-0.07/ - Copyright 2004-2005 by Jason Kohles

Permission is hereby granted, free of charge, to any person obtaining
a copy of this software and associated documentation files (the
"Software"), to deal in the Software without restriction, including
without limitation the rights to use, copy, modify, merge, publish,
distribute, sublicense, and/or sell copies of the Software, and to
permit persons to whom the Software is furnished to do so, subject to
the following conditions:

The above copyright notice and this permission notice shall be
included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND,
EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND
NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE
LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION
OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION
WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
```
