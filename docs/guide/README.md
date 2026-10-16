# Guide de l’utilisateur

Le guide complet de MondoWrite, en français et en anglais, illustré de captures d’écran : `guide.fr.html` et `guide.en.html` (le texte), `guide.css` (la mise en page A4), `images/fr/` et `images/en/` (les captures), `exemples/` (le court scénario importé pour les captures du chapitre Scénario).

Le guide est publié par la CI (workflow `.github/workflows/guide.yml`, à chaque changement de `docs/guide/` sur `main`) sur GitHub Pages : https://sebastienpiconnier.github.io/MondoWrite/ (`fr/`, `en/`, et les deux PDF à la racine). C'est l'aide en ligne de l'app : F1 l'ouvre au chapitre de la vue en cours (`src/help.ts`, `GUIDE_SECTIONS` : ne pas changer l'identifiant d'un chapitre sans mettre ce tableau à jour, un test le vérifie). Les PDF et le site ne sont pas versionnés.

Pour Pages, une seule fois : dans le dépôt, Settings > Pages > Source : « GitHub Actions ».

## Fabriquer les PDF

```bash
npm run guide
```

Chromium compose les pages (Google Chrome installé sur la machine, ou celui indiqué par la variable `CHROMIUM`). Un premier passage trouve la page de chaque titre, le second écrit le sommaire ; la couverture est ajoutée sans numéro, avec un signet par chapitre. La version et le mois viennent de `package.json` et de la date du jour.

## Voir le site en local

```bash
npm run guide        # les PDF (facultatif : le site les propose s'ils existent)
npm run guide:site   # docs/guide/.site/, à ouvrir avec n'importe quel petit serveur web
```

`docs/guide/site.css` adapte la mise en page à l'écran (sommaire à gauche, une colonne sur téléphone) ; `guide.css` reste celle du PDF.

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
