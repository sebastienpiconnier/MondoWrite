# Guide de l’utilisateur

Le guide complet de MondoWrite, en français et en anglais, illustré de captures d’écran : `guide.fr.html` et `guide.en.html` (le texte), `guide.css` (la mise en page A4), `images/fr/` et `images/en/` (les captures), `exemples/` (le court scénario importé pour les captures du chapitre Scénario).

Les PDF (`MondoWrite-guide-fr.pdf`, `MondoWrite-guide-en.pdf`) ne sont pas versionnés : on les fabrique, puis on les joint à la Release.

## Fabriquer les PDF

```bash
npm run guide
```

Chromium compose les pages (Google Chrome installé sur la machine, ou celui indiqué par la variable `CHROMIUM`). Un premier passage trouve la page de chaque titre, le second écrit le sommaire ; la couverture est ajoutée sans numéro, avec un signet par chapitre. La version et le mois viennent de `package.json` et de la date du jour.

## Refaire les captures

Après un changement visible de l’interface :

```bash
npm run build
npx vite preview --port 4319     # dans un autre terminal
npm run guide:shots
npm run guide
```

`scripts/guide/shots.mjs` ouvre l’app comme un auteur : profil « Charles Perrault », projet d’exemple, puis le scénario de `exemples/`. Chaque capture porte le nom utilisé dans le guide ; un libellé d’interface changé fait échouer l’étape concernée (message « ÉCHEC »), à corriger dans le script. `node scripts/guide/shots.mjs fr nom1,nom2` ne réécrit que ces captures.

## Écrire

- Une fonction nouvelle ou changée se décrit dans les deux langues, avec les libellés exacts de l’interface (`src/i18n/fr.ts`, `en.ts`) écrits en `<span class="ui">…</span>`.
- Pas de tiret cadratin. En français, le script pose lui-même les espaces insécables des guillemets et avant `: ; ? !`.
- Une image : `<figure><img src="images/fr/nom.jpg"><figcaption>…</figcaption></figure>` ; `class="small"` ou `"medium"` pour une capture étroite, `<div class="pair">` pour deux côte à côte.
