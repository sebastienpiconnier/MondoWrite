// Lecture d'un fichier Word (.docx) pour l'import d'un manuscrit : ses paragraphes, avec gras et italique,
// ses titres (styles « heading N » / « Title ») et ses sauts de page. Rien d'autre (ni images, ni notes).
// Règles adaptées de NEO de Hugh Howey (main.js, docxStyleFormats et docxParagraphToMarkdown, licence MIT),
// qui produisent ici du HTML plutôt que du Markdown.
// Fonctions pures, sauf `readDocx`, qui décompresse l'archive (fflate, chargé seulement ici).

import type { ImportedPara } from "./manuscript";

interface StyleFormat {
  name: string;
  bold: boolean;
  italic: boolean;
}

/** Une propriété de mise en forme (<w:b/>, <w:i w:val="0"/>) : vraie, fausse, ou absente (undefined). */
function formatOn(rpr: string, tag: string): boolean | undefined {
  const m = rpr.match(new RegExp(`<${tag}(?:\\s+w:val="([^"]*)")?\\s*/>`));
  if (!m) return undefined;
  return !(m[1] === "0" || m[1] === "false" || m[1] === "none");
}

/** Gras et italique de chaque style, héritage (`basedOn`) compris, et son nom anglais. */
export function styleFormats(stylesXml: string): Record<string, StyleFormat> {
  const raw: Record<string, { basedOn?: string; name: string; bold?: boolean; italic?: boolean }> = {};
  for (const m of stylesXml.matchAll(/<w:style\s[^>]*w:styleId="([^"]+)"[^>]*>([\s\S]*?)<\/w:style>/g)) {
    const body = m[2];
    const rpr = (body.match(/<w:rPr>[\s\S]*?<\/w:rPr>/) ?? [""])[0];
    raw[m[1]] = {
      basedOn: body.match(/<w:basedOn\s+w:val="([^"]+)"/)?.[1],
      // Le nom est toujours anglais dans le fichier (« heading 1 »), l'identifiant suit la langue de Word.
      name: body.match(/<w:name\s+w:val="([^"]*)"/)?.[1] ?? "",
      bold: formatOn(rpr, "w:b"),
      italic: formatOn(rpr, "w:i"),
    };
  }
  const out: Record<string, StyleFormat> = {};
  const resolve = (id: string, depth: number): StyleFormat => {
    if (out[id]) return out[id];
    const st = raw[id];
    if (!st || depth > 8) return { name: "", bold: false, italic: false };
    const base = st.basedOn ? resolve(st.basedOn, depth + 1) : { name: "", bold: false, italic: false };
    out[id] = { name: st.name, bold: st.bold ?? base.bold, italic: st.italic ?? base.italic };
    return out[id];
  };
  for (const id of Object.keys(raw)) resolve(id, 0);
  return out;
}

const xmlToText = (s: string) =>
  s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&#(\d+);/g, (_m, n) => String.fromCodePoint(Number(n))).replace(/&amp;/g, "&");
const escapeHtml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/**
 * Un paragraphe Word (<w:p>…</w:p>) : son texte, en HTML (gras, italique) et en texte simple. Un retour à
 * la ligne dans le paragraphe (poème, adresse) en fait plusieurs, comme dans NEO.
 */
export function docxParagraph(p: string, styles: Record<string, StyleFormat> = {}): ImportedPara[] {
  const pageBreak = /<w:br [^>]*w:type="page"/.test(p) || /<w:pageBreakBefore(?!\s+w:val="(?:0|false)")/.test(p);
  const pStyle = p.match(/<w:pStyle\s+w:val="([^"]*)"/)?.[1] ?? "";
  const sName = styles[pStyle]?.name ?? "";
  const heading = /^heading\s*\d*$/i.test(pStyle) || /^heading\s*\d*$/i.test(sName);
  const title = /^title$/i.test(pStyle) || /^title$/i.test(sName);
  const base = styles[pStyle] ?? { bold: false, italic: false };
  const runs = [...p.matchAll(/<w:r[ >][\s\S]*?<\/w:r>/g)].map((rm) => {
    const r = rm[0];
    const rpr = (r.match(/<w:rPr>[\s\S]*?<\/w:rPr>/) ?? [""])[0];
    const text = [...r.matchAll(/<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>|<w:tab\/>|<w:br(\s[^>]*)?\/>|<w:cr\/>|<w:noBreakHyphen\/>/g)]
      .map((t) => {
        if (t[1] !== undefined) return xmlToText(t[1]);
        if (t[0].startsWith("<w:tab")) return " ";
        if (t[0].startsWith("<w:noBreakHyphen")) return "‑";
        if (/w:type="(page|column)"/.test(t[0])) return "";
        return "\n";
      })
      .join("");
    const rStyle = rpr.match(/<w:rStyle\s+w:val="([^"]*)"/)?.[1];
    const rBase = rStyle && styles[rStyle] ? styles[rStyle] : base;
    const b = formatOn(rpr, "w:b");
    const i = formatOn(rpr, "w:i");
    return { text, bold: b ?? !!rBase.bold, italic: i ?? !!rBase.italic };
  });
  // Un titre est en gras par son style : ce gras-là n'est pas gardé.
  const keepBold = !heading && !title;
  const lines: { html: string; text: string }[] = [{ html: "", text: "" }];
  for (const run of runs) {
    run.text.split("\n").forEach((piece, k) => {
      if (k > 0) lines.push({ html: "", text: "" });
      const line = lines[lines.length - 1];
      line.text += piece;
      const m = piece.match(/^(\s*)([\s\S]*?)(\s*)$/)!;
      let inner = escapeHtml(m[2]);
      if (inner) {
        if (run.bold && keepBold) inner = `<strong>${inner}</strong>`;
        if (run.italic) inner = `<em>${inner}</em>`;
      }
      line.html += escapeHtml(m[1]) + inner + escapeHtml(m[3]);
    });
  }
  return lines.map((line, k) => ({
    // Deux balises identiques qui se touchent n'en font qu'une.
    html: line.html.replace(/<\/strong><strong>|<\/em><em>/g, "").trim(),
    text: line.text.replace(/\s+/g, " ").trim(),
    pageBreak: pageBreak && k === 0,
    heading: heading && k === 0,
    title: title && k === 0,
  }));
}

/** Tous les paragraphes du document, dans l'ordre (tableaux compris, lus comme du texte). */
export function docxParagraphs(documentXml: string, stylesXml = ""): ImportedPara[] {
  const styles = styleFormats(stylesXml);
  return [...documentXml.matchAll(/<w:p[ >][\s\S]*?<\/w:p>/g)].flatMap((m) => docxParagraph(m[0], styles));
}

/** Un .docx (archive ZIP) → ses paragraphes. Null si ce n'est pas un document Word. */
export async function readDocx(data: Uint8Array): Promise<ImportedPara[] | null> {
  const { unzipSync, strFromU8 } = await import("fflate");
  let files: Record<string, Uint8Array>;
  try {
    files = unzipSync(data, { filter: (f) => f.name === "word/document.xml" || f.name === "word/styles.xml" });
  } catch {
    return null;
  }
  const doc = files["word/document.xml"];
  if (!doc) return null;
  return docxParagraphs(strFromU8(doc), files["word/styles.xml"] ? strFromU8(files["word/styles.xml"]) : "");
}
