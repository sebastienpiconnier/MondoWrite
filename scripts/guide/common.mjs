// Préparation commune du guide (PDF et site web) : texte de la langue, version et date posées, typographie
// française, identifiant sur chaque titre et liste des titres pour le sommaire.

import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";

export const root = resolve(import.meta.dirname, "../..");
export const dir = join(root, "docs/guide");

const slug = (s) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const strip = (s) => s.replace(/<span class="num">.*?<\/span>/, "").replace(/<[^>]+>/g, "").replace(/&nbsp;/g, " ").trim();

/** Le guide d'une langue, prêt à composer : `html` (avec {{TOC}} à remplir) et ses titres `heads`. */
export function prepare(lang) {
  const version = JSON.parse(readFileSync(join(root, "package.json"), "utf8")).version;
  const date = new Intl.DateTimeFormat(lang === "fr" ? "fr-FR" : "en-US", { month: "long", year: "numeric" }).format(new Date());
  let html = readFileSync(join(dir, `guide.${lang}.html`), "utf8").replaceAll("{{VERSION}}", version).replaceAll("{{DATE}}", date);
  // Typographie française : espaces insécables dans les guillemets et avant : ; ? ! (hors balises).
  if (lang === "fr") {
    html = html.replace(/>([^<]+)</g, (m, t) => ">" + t.replace(/« /g, "«\u00a0").replace(/ »/g, "\u00a0»").replace(/ ([:;?!])(?=\s|$|<)/g, "\u00a0$1") + "<");
  }
  // Titres : un identifiant pour chaque h3, la liste pour le sommaire.
  const heads = [];
  html = html.replace(/<h([23])( id="([^"]+)")?>([\s\S]*?)<\/h\1>/g, (m, lvl, _a, id, inner) => {
    const text = strip(inner);
    if (!text || /^(Sommaire|Contents)$/.test(text)) return m;
    const key = id || `${slug(text)}-${heads.length}`;
    heads.push({ lvl: Number(lvl), text, id: key });
    return `<h${lvl} id="${key}">${inner}</h${lvl}>`;
  });
  return { html, heads, version };
}
