// Fabrique le guide de l'utilisateur en site web (aide en ligne de l'app, publiée par GitHub Pages) :
//   <sortie>/index.html            choix de la langue (celle du navigateur)
//   <sortie>/fr/index.html, en/    le guide, sommaire à gauche, une ancre par chapitre (F1 dans l'app y mène)
//   <sortie>/images, fonts, *.css  captures, polices et feuilles de style
//   <sortie>/MondoWrite-guide-*.pdf  les PDF, s'ils ont été fabriqués avant (npm run guide)
// Usage : node scripts/guide/site.mjs [dossier de sortie, par défaut docs/guide/.site]

import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { dir, prepare, root } from "./common.mjs";

const out = resolve(process.argv[2] || join(dir, ".site"));
rmSync(out, { recursive: true, force: true });
mkdirSync(join(out, "fonts"), { recursive: true });

// Feuille du guide : les polices sont copiées à côté, sous leur seul nom de fichier.
let css = readFileSync(join(dir, "guide.css"), "utf8");
css = css.replace(/url\("([^"]+)"\)/g, (_m, src) => {
  cpSync(join(dir, src), join(out, "fonts", basename(src)));
  return `url("fonts/${basename(src)}")`;
});
writeFileSync(join(out, "guide.css"), css);
cpSync(join(dir, "site.css"), join(out, "site.css"));
cpSync(join(dir, "images"), join(out, "images"), { recursive: true });
cpSync(join(root, "src-tauri/icons/sources/icon-32.svg"), join(out, "favicon.svg"));
cpSync(join(root, "src-tauri/icons/icon.svg"), join(out, "icon.svg"));

const LANGS = {
  fr: { other: "en", otherName: "English", pdf: "Télécharger le PDF", contents: "Sommaire", title: "MondoWrite, guide de l’utilisateur" },
  en: { other: "fr", otherName: "Français", pdf: "Download the PDF", contents: "Contents", title: "MondoWrite, user guide" },
};

for (const [lang, L] of Object.entries(LANGS)) {
  const { html } = prepare(lang);
  const pdfName = `MondoWrite-guide-${lang}.pdf`;
  const hasPdf = existsSync(join(dir, pdfName));
  if (hasPdf) cpSync(join(dir, pdfName), join(out, pdfName));
  // Sommaire du site : des liens, sans numéros de page.
  const toc = [...html.matchAll(/<h([23]) id="([^"]+)">([\s\S]*?)<\/h\1>/g)]
    .map(([, lvl, id, inner]) => [lvl, id, inner.replace(/<span class="num">.*?<\/span>/, "").replace(/<[^>]+>/g, "").trim()])
    .filter(([, , text]) => text && !/^(Sommaire|Contents)$/.test(text))
    .map(([lvl, id, text]) => `<li class="lvl${lvl}"><a href="#${id}">${text}</a></li>`)
    .join("\n");
  const tools = `<p class="site-tools"><a href="../${L.other}/" hreflang="${L.other}" lang="${L.other}">${L.otherName}</a>${hasPdf ? ` · <a href="../${pdfName}">${L.pdf}</a>` : ""}</p>`;
  const page = html
    .replace('<link rel="stylesheet" href="guide.css">', `<meta name="viewport" content="width=device-width, initial-scale=1">\n<link rel="icon" href="../favicon.svg" type="image/svg+xml">\n<link rel="stylesheet" href="../guide.css">\n<link rel="stylesheet" href="../site.css">`)
    .replace(/src="\.\.\/\.\.\/src-tauri\/icons\/icon\.svg"/g, 'src="../icon.svg"')
    .replace(/src="images\//g, 'src="../images/')
    .replace(/<nav class="toc">[\s\S]*?<\/nav>/, `<nav class="toc" aria-label="${L.contents}"><details open><summary>${L.contents}</summary><ol>${toc}</ol></details>${tools}</nav>\n<main>`)
    // Sur un petit écran, le sommaire commence replié (il passe au-dessus du texte).
    .replace("</body>", `</main>\n<script>if (matchMedia("(max-width: 960px)").matches) document.querySelector("nav.toc details")?.removeAttribute("open");</script>\n</body>`);
  mkdirSync(join(out, lang), { recursive: true });
  writeFileSync(join(out, lang, "index.html"), page);
}

// Accueil : la langue du navigateur, l'anglais sinon (le chapitre demandé dans l'adresse est gardé).
writeFileSync(
  join(out, "index.html"),
  `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>MondoWrite</title>
<meta name="viewport" content="width=device-width, initial-scale=1"><link rel="icon" href="favicon.svg" type="image/svg+xml">
<script>location.replace((/^fr\\b/i.test(navigator.language) ? "fr/" : "en/") + location.hash);</script></head>
<body><p><a href="fr/">Guide de l’utilisateur (français)</a> · <a href="en/">User guide (English)</a></p></body></html>`,
);
writeFileSync(join(out, ".nojekyll"), "");
console.log("site écrit :", out);
