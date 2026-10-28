# Mentions tierces / Third-party notices

MondoWrite est distribué sous licence [GNU AGPL v3.0 ou ultérieure](LICENSE). Il reprend ou embarque des éléments d'autres auteurs, publiés sous des licences compatibles. Ce fichier regroupe leurs mentions de copyright et le texte de leurs licences, comme celles-ci l'exigent.

MondoWrite is released under the [GNU AGPL v3.0 or later](LICENSE). It reuses or bundles work by other authors, released under compatible licenses. This file gathers their copyright notices and license texts, as those licenses require.

## Sommaire / Contents

1. NEO (Hugh Howey) : MIT
2. hyphen et motifs de césure de TeX / hyphen and TeX hyphenation patterns : ISC, MIT, licence libre de G. Kuiken
3. Polices / Fonts : SIL Open Font License 1.1
4. Bibliothèques / Libraries : MIT, Apache-2.0, ISC
5. Domaine public / Public domain

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
| Playfair Display | Copyright 2017 The Playfair Display Project Authors (https://github.com/clauseggers/Playfair-Display), with Reserved Font Name "Playfair Display" | SIL OFL 1.1, via `@fontsource/playfair-display` |
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

---

## 5. Domaine public / Public domain

Le projet d'exemple reprend « Le Petit Chaperon rouge » de Charles Perrault (1697) et trois gravures de Gustave Doré, gravées sur bois par Pannemaker (édition Hetzel, 1862), tous du domaine public.

The example project uses Charles Perrault's "Le Petit Chaperon rouge" (1697) and three engravings by Gustave Doré (Hetzel edition, 1862), all in the public domain.
