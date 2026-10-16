// Fabrique le guide de l'utilisateur en PDF (docs/guide/guide.<langue>.html → docs/guide/MondoWrite-guide-<langue>.pdf).
// Chromium compose les pages ; un premier passage trouve la page de chaque titre, le second écrit le sommaire.
// Usage : node scripts/guide/build.mjs fr   (voir docs/guide/README.md)

import { chromium } from "playwright-core";
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from "node:fs";
import { dir, prepare } from "./common.mjs";
import { PDFDocument, PDFHexString, PDFName } from "pdf-lib";
import * as pdfjs from "pdfjs-dist/legacy/build/pdf.mjs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const lang = process.argv[2] || "fr";
const L = lang === "fr" ? { guide: "MondoWrite · Guide de l’utilisateur", title: "MondoWrite, guide de l’utilisateur" } : { guide: "MondoWrite · User guide", title: "MondoWrite, user guide" };
const { html, heads } = prepare(lang);
const toc = (pages) => heads.map((h, i) => `<li class="lvl${h.lvl}"><a href="#${h.id}">${h.text}</a><span class="dots"></span><span class="pg">${pages?.[i] ?? "00"}</span></li>`).join("\n");

const tmp = mkdtempSync(join(tmpdir(), "guide-"));
// Chromium : celui indiqué par CHROMIUM, sinon le Google Chrome installé sur la machine.
const browser = await chromium.launch(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM, args: ["--no-sandbox", "--disable-background-networking"] } : { channel: "chrome" });
const page = await browser.newPage();

async function render(source, out, { cover }) {
  const file = join(dir, `.build-${lang}.html`);
  writeFileSync(file, source);
  await page.goto(pathToFileURL(file).href, { waitUntil: "networkidle" });
  await page.evaluate(() => document.fonts.ready);
  if (cover) {
    await page.addStyleTag({ content: "@page { margin: 0 } body > *:not(.cover) { display: none !important; } .cover { break-after: auto !important; margin: 0 !important; height: 297mm !important; box-sizing: border-box; }" });
  } else {
    await page.addStyleTag({ content: ".cover { display: none !important; }" });
  }
  await page.pdf({
    path: out,
    ...(cover ? { pageRanges: "1" } : {}),
    format: "A4",
    printBackground: true,
    preferCSSPageSize: true,
    tagged: true,
    displayHeaderFooter: !cover,
    headerTemplate: `<div style="width:100%;font:7.5pt sans-serif;color:#8a8fa3;padding:0 18mm;display:flex;justify-content:flex-end">${L.guide}</div>`,
    footerTemplate: `<div style="width:100%;font:8pt sans-serif;color:#8a8fa3;text-align:center"><span class="pageNumber"></span></div>`,
  });
}

// Premier passage : le corps, pour savoir où tombe chaque titre.
const body1 = join(tmp, "body1.pdf");
await render(html.replace("{{TOC}}", toc()), body1, { cover: false });
const text = await pageTexts(body1);
const norm = (s) => s.replace(/\s+/g, " ").replace(/[’']/g, "'").trim();
const pages = [];
let at = 1; // après le sommaire
for (const h of heads) {
  const want = norm(h.text);
  let found = -1;
  for (let p = at; p < text.length; p++) if (norm(text[p]).includes(want)) { found = p; break; }
  if (found < 0) console.warn("titre introuvable :", h.text);
  else at = found;
  pages.push(found < 0 ? "" : String(found + 1));
}
// Le sommaire tient peut-être sur plus d'une page : le premier titre ne peut pas être avant.
const body = join(tmp, "body.pdf");
await render(html.replace("{{TOC}}", toc(pages)), body, { cover: false });
const cover = join(tmp, "cover.pdf");
await render(html, cover, { cover: true });
await browser.close();

// Couverture puis corps, et les signets : un par chapitre (pdf-lib ne les écrit pas, on pose /Outlines).
const out = join(dir, `MondoWrite-guide-${lang}.pdf`);
const doc = await PDFDocument.create();
for (const src of [cover, body]) {
  const from = await PDFDocument.load(readFileSync(src));
  for (const p of await doc.copyPages(from, from.getPageIndices())) doc.addPage(p);
}
const marks = heads.map((h, i) => ({ title: h.text, page: Number(pages[i]), lvl: h.lvl })).filter((m) => m.lvl === 2 && m.page > 0);
const all = doc.getPages();
const ctx = doc.context;
const rootRef = ctx.nextRef();
const refs = marks.map(() => ctx.nextRef());
marks.forEach((m, i) => {
  ctx.assign(refs[i], ctx.obj({
    Title: PDFHexString.fromText(m.title),
    Parent: rootRef,
    Dest: [all[m.page].ref, "XYZ", null, null, null], // page m.page du corps = page m.page + 1 du fichier (couverture)
    ...(i > 0 ? { Prev: refs[i - 1] } : {}),
    ...(i < marks.length - 1 ? { Next: refs[i + 1] } : {}),
  }));
});
if (marks.length) {
  ctx.assign(rootRef, ctx.obj({ Type: "Outlines", First: refs[0], Last: refs[refs.length - 1], Count: marks.length }));
  doc.catalog.set(PDFName.of("Outlines"), rootRef);
  doc.catalog.set(PDFName.of("PageMode"), PDFName.of("UseOutlines"));
}
doc.setTitle(L.title);
doc.setAuthor("Sébastien Piconnier");
doc.setCreator("MondoWrite");
doc.setLanguage(lang);
writeFileSync(out, await doc.save());
rmSync(join(dir, `.build-${lang}.html`), { force: true });
rmSync(tmp, { recursive: true, force: true });
console.log("écrit :", out);

/** Texte de chaque page d'un PDF (pdf.js). */
async function pageTexts(file) {
  const pdf = await pdfjs.getDocument({ data: new Uint8Array(readFileSync(file)), useSystemFonts: true }).promise;
  const texts = [];
  for (let i = 1; i <= pdf.numPages; i++) {
    const content = await (await pdf.getPage(i)).getTextContent();
    texts.push(content.items.map((it) => it.str).join(" "));
  }
  return texts;
}
