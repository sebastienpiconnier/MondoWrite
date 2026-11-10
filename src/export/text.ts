// Exports en texte balisé : Markdown, Word (.docx) et EPUB. Fonctions pures à partir du modèle de doc.ts.
// Le .docx et le .epub sont des archives ZIP de fichiers XML, fabriquées ici sans dépendance.

import { footnotesOf, type Block, type DocImage, type ExportDoc, type Run } from "./doc";
import { zip } from "./zip";

const xml = (text: string) => text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** Puce ou numéro d'un élément de liste, écrit en clair (pas de numérotation automatique à déclarer). */
const marker = (block: Block) => (block.kind === "paragraph" && block.list ? (block.list === "number" ? `${block.index ?? 1}. ` : "• ") : "");

// ---------- Markdown ----------

const mdEscape = (text: string) => text.replace(/([\\*_`[\]#])/g, "\\$1");
const mdRun = (run: Run) => {
  // Les espaces restent hors des marqueurs, sinon le gras ou l'italique ne s'applique pas.
  const [, before, core, after] = /^(\s*)([\s\S]*?)(\s*)$/.exec(run.text)!;
  if (!core) return run.text;
  const mark = run.bold && run.italic ? "***" : run.bold ? "**" : run.italic ? "*" : "";
  return `${before}${mark}${mdEscape(core).replace(/\n/g, "  \n")}${mark}${after}`;
};
const mdRuns = (runs: Run[], link?: (id: string) => string | null) =>
  runs
    .map((run) => {
      // Appel de note : la syntaxe Markdown connue, la note est écrite en fin de chapitre.
      if (run.footnote !== undefined) return `[^${run.text}]`;
      const url = run.ref && link ? link(run.ref) : null;
      if (!url) return mdRun(run);
      // Le lien enveloppe le texte sans ses espaces de bord.
      const [, before, core, after] = /^(\s*)([\s\S]*?)(\s*)$/.exec(run.text)!;
      return core ? `${before}[${mdRun({ ...run, text: core })}](${url})${after}` : run.text;
    })
    .join("");

export interface MarkdownOptions {
  /** Chemin des images depuis le fichier écrit (« medias/ » pour un export à la racine du projet). */
  media?: string;
  /** Adresse du lien vers une carte citée (mention, carte reliée), ou null pour du texte simple. */
  link?: (id: string) => string | null;
  /** Ligne d'avertissement sous le titre (copies générées par l'app). */
  note?: string;
}

/** Titres d'un document, dans l'ordre du fichier Markdown (titre, chapitres, puis titres de blocs). */
function headingTexts(doc: ExportDoc): { text: string; anchor?: string }[] {
  return [
    { text: doc.title },
    ...doc.chapters.flatMap((c) => [{ text: c.title }, ...c.blocks.flatMap((b) => (b.kind === "heading" ? [{ text: b.runs.map((r) => r.text).join(""), anchor: b.anchor }] : []))]),
  ];
}

/** Ancre d'un titre à la façon de GitHub (aussi Typora, VS Code…) : minuscules, sans ponctuation, tirets. */
export const headingSlug = (text: string) =>
  text
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{M}\p{N}\s_-]/gu, "")
    .replace(/\s/g, "-");

/** Ancre de chaque fiche (titre marqué `anchor`) dans le fichier Markdown, doublons numérotés comme GitHub. */
export function markdownAnchors(doc: ExportDoc): Map<string, string> {
  const seen = new Map<string, number>();
  const anchors = new Map<string, string>();
  for (const h of headingTexts(doc)) {
    const base = headingSlug(h.text);
    const n = seen.get(base) ?? 0;
    seen.set(base, n + 1);
    if (h.anchor && !anchors.has(h.anchor)) anchors.set(h.anchor, n === 0 ? base : `${base}-${n}`);
  }
  return anchors;
}

export function toMarkdown(doc: ExportDoc, options: MarkdownOptions = {}): string {
  const media = options.media ?? "medias/";
  const out: string[] = [`# ${mdEscape(doc.title)}`];
  if (options.note) out.push(`> ${mdEscape(options.note)}`);
  if (doc.author) out.push(mdEscape(doc.author));
  if (doc.contact?.length) out.push(doc.contact.map(mdEscape).join("  \n"));
  for (const chapter of doc.chapters) {
    out.push(`## ${mdEscape(chapter.title)}`);
    let list: string[] = [];
    const flush = () => {
      if (list.length > 0) out.push(list.join("\n"));
      list = [];
    };
    for (const block of chapter.blocks) {
      if (block.kind === "heading") {
        flush();
        out.push(`### ${mdRuns(block.runs)}`);
      } else if (block.kind === "image") {
        // Adresse relative au fichier écrit : l'image reste dans medias/.
        flush();
        out.push(`![](${media}${encodeURI(block.name)})`);
      } else if (block.list) {
        list.push(`${block.quote ? "> " : ""}${block.list === "number" ? `${block.index ?? 1}.` : "-"} ${mdRuns(block.runs, options.link)}`);
      } else {
        flush();
        out.push(`${block.quote ? "> " : ""}${mdRuns(block.runs, options.link)}`);
      }
    }
    flush();
    const notes = footnotesOf(chapter.blocks);
    if (notes.length > 0) out.push(notes.map((x) => `[^${x.n}]: ${x.text.replace(/\s+/g, " ")}`).join("\n"));
  }
  return `${out.join("\n\n")}\n`;
}

// ---------- Word (.docx) ----------

function docxRuns(runs: Run[], prefix = ""): string {
  const all = prefix ? [{ text: prefix }, ...runs] : runs;
  return all
    .map((run) => {
      // Appel de note : une vraie note de bas de page de Word (son texte est dans footnotes.xml).
      if (run.footnote !== undefined) return `<w:r><w:rPr><w:rStyle w:val="FootnoteReference"/></w:rPr><w:footnoteReference w:id="${footnoteId(run.text)}"/></w:r>`;
      const props = `${run.bold ? "<w:b/>" : ""}${run.italic ? "<w:i/>" : ""}`;
      const content = run.text
        .split("\n")
        .map((part) => `<w:t xml:space="preserve">${xml(part)}</w:t>`)
        .join("<w:br/>");
      return `<w:r>${props ? `<w:rPr>${props}</w:rPr>` : ""}${content}</w:r>`;
    })
    .join("");
}

/** Identifiant Word d'une note : 0 et 1 sont aux séparateurs, la note n est la n + 1. */
const footnoteId = (n: string) => (Number.parseInt(n, 10) || 0) + 1;

/** footnotes.xml : séparateurs puis une note par appel du document, ou null s'il n'y en a pas. */
export function footnotesXml(doc: ExportDoc): string | null {
  const notes = doc.chapters.flatMap((c) => footnotesOf(c.blocks));
  if (notes.length === 0) return null;
  const sep = (id: number, tag: string) => `<w:footnote w:type="${id === 0 ? "separator" : "continuationSeparator"}" w:id="${id}"><w:p><w:r><w:${tag}/></w:r></w:p></w:footnote>`;
  return (
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:footnotes xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">` +
    sep(0, "separator") +
    sep(1, "continuationSeparator") +
    notes
      .map((x) => `<w:footnote w:id="${footnoteId(x.n)}"><w:p><w:pPr><w:pStyle w:val="FootnoteText"/></w:pPr><w:r><w:rPr><w:rStyle w:val="FootnoteReference"/></w:rPr><w:footnoteRef/></w:r><w:r><w:t xml:space="preserve"> ${xml(x.text)}</w:t></w:r></w:p></w:footnote>`)
      .join("") +
    `</w:footnotes>`
  );
}

const docxPara = (style: string, inner: string, extra = "") => `<w:p><w:pPr><w:pStyle w:val="${style}"/>${extra}</w:pPr>${inner}</w:p>`;

/** Taille d'une image dans un document : 3 pouces au plus de côté, proportions gardées (points). */
export const IMAGE_BOX = 216;
export function imageSize(image: Pick<DocImage, "width" | "height">, box = IMAGE_BOX): { width: number; height: number } {
  const scale = Math.min(box / Math.max(image.width, 1), box / Math.max(image.height, 1));
  return { width: Math.max(1, Math.round(image.width * scale)), height: Math.max(1, Math.round(image.height * scale)) };
}

/** Images du .docx : identifiant de relation et fichier, dans l'ordre de première apparition. */
function docxImages(doc: ExportDoc): { name: string; rel: string; path: string; image: DocImage }[] {
  const out: { name: string; rel: string; path: string; image: DocImage }[] = [];
  for (const chapter of doc.chapters)
    for (const block of chapter.blocks) {
      const image = block.kind === "image" ? doc.images?.[block.name] : undefined;
      if (block.kind === "image" && image && !out.some((x) => x.name === block.name)) {
        const n = out.length + 1;
        out.push({ name: block.name, rel: `rImg${n}`, path: `media/image${n}.jpeg`, image });
      }
    }
  return out;
}

const EMU = 12700; // par point
function docxDrawing(rel: string, n: number, image: DocImage): string {
  const { width, height } = imageSize(image);
  const cx = width * EMU;
  const cy = height * EMU;
  return (
    `<w:p><w:pPr><w:spacing w:after="160"/></w:pPr><w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="${cx}" cy="${cy}"/><wp:docPr id="${n}" name="Image ${n}"/>` +
    `<a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture">` +
    `<pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:nvPicPr><pic:cNvPr id="${n}" name="image${n}.jpeg"/><pic:cNvPicPr/></pic:nvPicPr>` +
    `<pic:blipFill><a:blip r:embed="${rel}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill>` +
    `<pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic>` +
    `</a:graphicData></a:graphic></wp:inline></w:drawing></w:r></w:p>`
  );
}

export function documentXml(doc: ExportDoc): string {
  const images = docxImages(doc);
  const body: string[] = [docxPara("Title", docxRuns([{ text: doc.title }]))];
  if (doc.author) body.push(docxPara("Subtitle", docxRuns([{ text: doc.author }])));
  for (const line of doc.contact ?? []) body.push(docxPara("Normal", docxRuns([{ text: line }])));
  for (const chapter of doc.chapters) {
    body.push(docxPara("Heading1", docxRuns([{ text: chapter.title }])));
    for (const block of chapter.blocks) {
      if (block.kind === "heading") body.push(docxPara("Heading2", docxRuns(block.runs)));
      else if (block.kind === "image") {
        const i = images.findIndex((x) => x.name === block.name);
        if (i >= 0) body.push(docxDrawing(images[i].rel, i + 1, images[i].image));
      } else body.push(docxPara(block.quote ? "Quote" : "Normal", docxRuns(block.runs, marker(block)), block.list ? '<w:ind w:left="360"/>' : ""));
    }
  }
  return (
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"><w:body>${body.join("")}` +
    `<w:sectPr><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440" w:header="720" w:footer="720" w:gutter="0"/></w:sectPr></w:body></w:document>`
  );
}

const docxStyle = (id: string, name: string, size: number, opts: { bold?: boolean; italic?: boolean; center?: boolean; before?: number; after?: number; left?: number; keep?: boolean; level?: number } = {}) =>
  `<w:style w:type="paragraph" w:styleId="${id}"${id === "Normal" ? ' w:default="1"' : ""}><w:name w:val="${name}"/>${id === "Normal" ? "" : '<w:basedOn w:val="Normal"/><w:next w:val="Normal"/>'}<w:qFormat/>` +
  `<w:pPr>${opts.keep ? "<w:keepNext/>" : ""}<w:spacing w:before="${opts.before ?? 0}" w:after="${opts.after ?? 160}" w:line="340" w:lineRule="auto"/>${opts.left ? `<w:ind w:left="${opts.left}"/>` : ""}${opts.center ? '<w:jc w:val="center"/>' : ""}${opts.level !== undefined ? `<w:outlineLvl w:val="${opts.level}"/>` : ""}</w:pPr>` +
  `<w:rPr>${opts.bold ? "<w:b/>" : ""}${opts.italic ? "<w:i/>" : ""}<w:sz w:val="${size * 2}"/></w:rPr></w:style>`;

function stylesXml(lang: string): string {
  return (
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">` +
    `<w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman" w:cs="Times New Roman"/><w:sz w:val="24"/><w:lang w:val="${xml(lang)}"/></w:rPr></w:rPrDefault></w:docDefaults>` +
    docxStyle("Normal", "Normal", 12) +
    docxStyle("Title", "Title", 26, { bold: true, center: true, before: 2400, after: 240 }) +
    docxStyle("Subtitle", "Subtitle", 14, { center: true, after: 1200 }) +
    docxStyle("Heading1", "heading 1", 18, { bold: true, before: 480, after: 200, keep: true, level: 0 }) +
    docxStyle("Heading2", "heading 2", 14, { bold: true, before: 320, after: 120, keep: true, level: 1 }) +
    docxStyle("Quote", "Quote", 12, { italic: true, left: 720 }) +
    docxStyle("FootnoteText", "footnote text", 10, { after: 0 }) +
    `<w:style w:type="character" w:styleId="FootnoteReference"><w:name w:val="footnote reference"/><w:rPr><w:vertAlign w:val="superscript"/></w:rPr></w:style>` +
    `</w:styles>`
  );
}

export function toDocx(doc: ExportDoc): Uint8Array {
  const images = docxImages(doc);
  const footnotes = footnotesXml(doc);
  return zip([
    {
      path: "[Content_Types].xml",
      data:
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
        `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Default Extension="jpeg" ContentType="image/jpeg"/>` +
        `<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>` +
        `<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>` +
        (footnotes ? `<Override PartName="/word/footnotes.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.footnotes+xml"/>` : "") +
        `</Types>`,
    },
    {
      path: "_rels/.rels",
      data:
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
        `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`,
    },
    {
      path: "word/_rels/document.xml.rels",
      data:
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
        `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>` +
        (footnotes ? `<Relationship Id="rIdFootnotes" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/footnotes" Target="footnotes.xml"/>` : "") +
        images.map((x) => `<Relationship Id="${x.rel}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="${x.path}"/>`).join("") +
        `</Relationships>`,
    },
    ...images.map((x) => ({ path: `word/${x.path}`, data: x.image.data })),
    { path: "word/document.xml", data: documentXml(doc) },
    { path: "word/styles.xml", data: stylesXml(doc.lang) },
    ...(footnotes ? [{ path: "word/footnotes.xml", data: footnotes }] : []),
  ]);
}

// ---------- EPUB 3 ----------

const htmlRuns = (runs: Run[]) =>
  runs
    .map((run) => {
      // Appel de note : lien vers la note, en fin de chapitre (les liseuses l'ouvrent en fenêtre).
      if (run.footnote !== undefined) return `<sup><a epub:type="noteref" id="ref-${xml(run.text)}" href="#fn-${xml(run.text)}">${xml(run.text)}</a></sup>`;
      let text = xml(run.text).replace(/\n/g, "<br/>");
      if (run.italic) text = `<em>${text}</em>`;
      if (run.bold) text = `<strong>${text}</strong>`;
      return text;
    })
    .join("");

/** Corps XHTML d'un chapitre : les listes et les citations retrouvent leurs balises. */
export function chapterXhtml(blocks: Block[], image?: (name: string) => string | null): string {
  const out: string[] = [];
  let open: "" | "ul" | "ol" = "";
  const close = () => {
    if (open) out.push(`</${open}>`);
    open = "";
  };
  for (const block of blocks) {
    // Les images ne vont pas dans un EPUB (seul le manuscrit s'y exporte, et il n'en a pas) ; la page HTML les embarque.
    if (block.kind === "image") {
      const src = image?.(block.name);
      if (src) {
        close();
        out.push(`<figure><img src="${src}" alt=""/></figure>`);
      }
      continue;
    }
    if (block.kind === "heading") {
      close();
      out.push(`<h2>${htmlRuns(block.runs)}</h2>`);
    } else if (block.list) {
      const tag = block.list === "number" ? "ol" : "ul";
      if (open !== tag) {
        close();
        out.push(`<${tag}>`);
        open = tag;
      }
      out.push(`<li>${htmlRuns(block.runs)}</li>`);
    } else {
      close();
      out.push(block.quote ? `<blockquote><p>${htmlRuns(block.runs)}</p></blockquote>` : `<p>${htmlRuns(block.runs)}</p>`);
    }
  }
  close();
  const notes = footnotesOf(blocks);
  if (notes.length > 0) {
    out.push(`<section epub:type="footnotes" class="notes">`);
    for (const x of notes) out.push(`<aside epub:type="footnote" id="fn-${xml(x.n)}"><p><a href="#ref-${xml(x.n)}">${xml(x.n)}.</a> ${xml(x.text)}</p></aside>`);
    out.push(`</section>`);
  }
  return out.join("\n");
}

const page = (lang: string, title: string, body: string) =>
  `<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE html>\n<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" lang="${xml(lang)}" xml:lang="${xml(lang)}">\n` +
  `<head><meta charset="UTF-8"/><title>${xml(title)}</title><link rel="stylesheet" type="text/css" href="style.css"/></head>\n<body>\n${body}\n</body>\n</html>\n`;

const EPUB_CSS =
  "body { font-family: serif; line-height: 1.5; margin: 5%; }\nh1 { text-align: center; margin: 2em 0 1em; }\nh2 { margin: 1.5em 0 0.5em; }\n" +
  "p { margin: 0; text-indent: 1.2em; }\nh1 + p, h2 + p, blockquote p { text-indent: 0; }\nblockquote { margin: 1em 2em; font-style: italic; }\n" +
  ".cover { text-align: center; margin-top: 30%; }\n.cover p { text-indent: 0; margin-top: 1em; }\n" +
  ".notes { margin-top: 2em; border-top: 1px solid #999; font-size: 0.9em; }\n.notes p { text-indent: 0; margin-top: 0.5em; }\n";

export interface EpubMeta {
  /** Identifiant unique du livre (urn:uuid:…). */
  id: string;
  /** Date de modification, au format 2026-10-08T12:00:00Z. */
  modified: string;
  /** Titre de la table des matières. */
  contents: string;
}

export function toEpub(doc: ExportDoc, meta: EpubMeta): Uint8Array {
  const files = doc.chapters.map((chapter, i) => ({
    id: `ch${i + 1}`,
    href: `ch${i + 1}.xhtml`,
    title: chapter.title,
    data: page(doc.lang, chapter.title, `<h1>${xml(chapter.title)}</h1>\n${chapterXhtml(chapter.blocks)}`),
  }));
  const cover = page(doc.lang, doc.title, `<div class="cover"><h1>${xml(doc.title)}</h1>${doc.author ? `<p>${xml(doc.author)}</p>` : ""}</div>`);
  const nav = page(
    doc.lang,
    meta.contents,
    `<nav epub:type="toc"><h1>${xml(meta.contents)}</h1><ol>\n${files.map((f) => `<li><a href="${f.href}">${xml(f.title)}</a></li>`).join("\n")}\n</ol></nav>`,
  );
  const opf =
    `<?xml version="1.0" encoding="UTF-8"?>\n<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="id" xml:lang="${xml(doc.lang)}">\n` +
    `<metadata xmlns:dc="http://purl.org/dc/elements/1.1/">\n<dc:identifier id="id">${xml(meta.id)}</dc:identifier>\n<dc:title>${xml(doc.title)}</dc:title>\n` +
    `<dc:language>${xml(doc.lang)}</dc:language>\n${doc.author ? `<dc:creator>${xml(doc.author)}</dc:creator>\n` : ""}<meta property="dcterms:modified">${xml(meta.modified)}</meta>\n</metadata>\n` +
    `<manifest>\n<item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>\n<item id="css" href="style.css" media-type="text/css"/>\n` +
    `<item id="cover" href="cover.xhtml" media-type="application/xhtml+xml"/>\n${files.map((f) => `<item id="${f.id}" href="${f.href}" media-type="application/xhtml+xml"/>`).join("\n")}\n</manifest>\n` +
    `<spine>\n<itemref idref="cover"/>\n${files.map((f) => `<itemref idref="${f.id}"/>`).join("\n")}\n</spine>\n</package>\n`;
  return zip([
    // Toujours en premier, et sans compression : c'est ce qui fait reconnaître un EPUB.
    { path: "mimetype", data: "application/epub+zip" },
    {
      path: "META-INF/container.xml",
      data: `<?xml version="1.0" encoding="UTF-8"?>\n<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>\n`,
    },
    { path: "OEBPS/content.opf", data: opf },
    { path: "OEBPS/nav.xhtml", data: nav },
    { path: "OEBPS/style.css", data: EPUB_CSS },
    { path: "OEBPS/cover.xhtml", data: cover },
    ...files.map((f) => ({ path: `OEBPS/${f.href}`, data: f.data })),
  ]);
}

// ---------- Page HTML ----------

/** Octets en base64, par morceaux (une image peut dépasser la pile d'un `apply`). */
function base64(data: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < data.length; i += 0x8000) bin += String.fromCharCode(...data.subarray(i, i + 0x8000));
  return btoa(bin);
}

// Feuille de la page exportée : un fichier à lire hors de l'app (couleurs propres au fichier, pas aux jetons de l'app),
// claire ou sombre selon le système du lecteur.
const HTML_CSS =
  ":root { color-scheme: light dark; --ink: #1f2128; --soft: #5b5f6b; --rule: #d6d8de; --paper: #fdfcf9; }\n" +
  "@media (prefers-color-scheme: dark) { :root { --ink: #d4d6de; --soft: #a3a7b3; --rule: #3a3e4c; --paper: #181a22; } }\n" +
  "body { margin: 0; background: var(--paper); color: var(--ink); font: 1.125rem/1.65 Georgia, \"Iowan Old Style\", \"Times New Roman\", serif; }\n" +
  "main { max-width: 38em; margin: 0 auto; padding: 3em 1.25em 5em; }\n" +
  "header.cover { text-align: center; margin: 3em 0 4em; }\nheader.cover h1 { font-size: 2.2em; line-height: 1.2; margin: 0 0 0.5em; }\n" +
  "header.cover p { margin: 0.25em 0; color: var(--soft); text-indent: 0; }\n" +
  "nav { margin: 0 0 3em; }\nnav h2 { font-size: 1em; text-transform: uppercase; letter-spacing: 0.08em; color: var(--soft); }\nnav ol { padding-left: 1.4em; }\nnav a { color: inherit; }\n" +
  "section.chapter { margin-top: 3.5em; }\nh2.chapter-title { font-size: 1.5em; margin: 0 0 1em; }\nh2 { font-size: 1.2em; margin: 1.5em 0 0.5em; }\n" +
  "p { margin: 0; text-indent: 1.4em; }\nh2 + p, figure + p, blockquote p, li p { text-indent: 0; }\n" +
  "blockquote { margin: 1em 2em; font-style: italic; }\nfigure { margin: 1.5em 0; text-align: center; }\nimg { max-width: 100%; height: auto; }\n" +
  ".notes { margin-top: 2em; padding-top: 0.5em; border-top: 1px solid var(--rule); font-size: 0.9em; }\n.notes p { text-indent: 0; margin-top: 0.4em; }\n" +
  "sup a { text-decoration: none; }\n@media print { body { background: none; } section.chapter { break-before: page; } nav { display: none; } }\n";

export interface HtmlOptions {
  /** Titre du sommaire (affiché à partir de deux chapitres). */
  contents: string;
}

/**
 * Une seule page HTML autonome (discussion #61) : titre, auteur, sommaire, chapitres, notes, images embarquées.
 * Elle s'ouvre dans tout navigateur, s'imprime, se colle dans un site. Mêmes blocs que l'EPUB.
 */
export function toHtml(doc: ExportDoc, options: HtmlOptions): string {
  const image = (name: string) => {
    const img = doc.images?.[name];
    return img ? `data:image/jpeg;base64,${base64(img.data)}` : null;
  };
  const chapters = doc.chapters.map(
    (chapter, i) =>
      `<section class="chapter" id="ch-${i + 1}">\n<h2 class="chapter-title">${xml(chapter.title)}</h2>\n${chapterXhtml(chapter.blocks, image)}\n</section>`,
  );
  const toc =
    doc.chapters.length > 1
      ? `<nav aria-labelledby="toc">\n<h2 id="toc">${xml(options.contents)}</h2>\n<ol>\n${doc.chapters.map((c, i) => `<li><a href="#ch-${i + 1}">${xml(c.title)}</a></li>`).join("\n")}\n</ol>\n</nav>`
      : "";
  const cover =
    `<header class="cover">\n<h1>${xml(doc.title)}</h1>\n${doc.author ? `<p>${xml(doc.author)}</p>\n` : ""}` +
    `${(doc.contact ?? []).map((line) => `<p>${xml(line)}</p>`).join("\n")}\n</header>`;
  // Les attributs propres à l'EPUB (epub:type) n'ont pas de sens dans une page web.
  const body = [cover, toc, ...chapters].filter(Boolean).join("\n").replace(/ epub:type="[^"]*"/g, "");
  return (
    `<!DOCTYPE html>\n<html lang="${xml(doc.lang)}">\n<head>\n<meta charset="utf-8"/>\n<meta name="viewport" content="width=device-width, initial-scale=1"/>\n` +
    `<title>${xml(doc.title)}</title>\n${doc.author ? `<meta name="author" content="${xml(doc.author)}"/>\n` : ""}<meta name="generator" content="MondoWrite"/>\n` +
    `<style>\n${HTML_CSS}</style>\n</head>\n<body>\n<main>\n${body}\n</main>\n</body>\n</html>\n`
  );
}
