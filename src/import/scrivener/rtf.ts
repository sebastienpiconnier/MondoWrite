// Lecteur RTF maison, réduit à ce que Scrivener écrit (content.rtf, notes.rtf) : paragraphes, gras, italique,
// barré, liens web, accents (\'xx selon \ansicpg, \uN avec \ucN), espaces insécables. Tout le reste (polices,
// couleurs, tailles, retraits, tableaux de styles, images) est ignoré : la mise en page est celle de MondoWrite.
// Les marqueurs de styles de Scrivener (<$Scr_Ps::0>, <!$Scr_H::1>…) et les balises de compilation (<$n>, <$t>)
// sont retirés du texte ; un intertitre Scrivener (Scr_H) marque son paragraphe comme titre.
// Pur et sans dépendance : aucune bibliothèque RTF ne tient dans ce sous-ensemble sans apporter un moteur de rendu.

import type { ImportedPara } from "../manuscript";

/** Un morceau de texte d'un même aspect. */
interface Run {
  text: string;
  bold: boolean;
  italic: boolean;
  strike: boolean;
  href?: string;
}

interface GroupState {
  bold: boolean;
  italic: boolean;
  strike: boolean;
  /** Groupe ignoré (table des polices, couleurs, \*\…, image…). */
  skip: boolean;
  /** Caractères de repli à sauter après un \uN. */
  uc: number;
  /** Groupe d'une instruction de champ (\fldinst) : son texte est lu à part. */
  fldinst: boolean;
  /** Groupe du résultat d'un champ (\fldrslt) : lien à poser sur son texte. */
  href?: string;
}

/** Destinations dont le texte n'est jamais du contenu. */
const SKIPPED = new Set([
  "fonttbl", "colortbl", "stylesheet", "info", "pict", "header", "footer", "headerl", "headerr", "footerl", "footerr",
  "listtable", "listoverridetable", "expandedcolortbl", "rsidtbl", "generator", "xmlnstbl", "themedata", "colorschememapping",
  "latentstyles", "datastore", "object", "nonshppict", "shp", "filetbl", "revtbl", "pgdsctbl", "NeXTGraphic",
]);

/** Marqueurs de styles de Scrivener et balises de compilation : `<$Scr_Ps::0>`, `<!$Scr_H::1>`, `<$n>`, `<$t>`. */
const SCRIVENER_TAG = /<!?\$[A-Za-z_][^<>\s]{0,40}>/g;
const HEADING_TAG = /<\$Scr_H::\d+>/;

const escapeHtml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** Décodeur d'une page de codes Windows (1252 par défaut, la seule que Scrivener écrit en pratique). */
function decoderFor(codePage: number): TextDecoder {
  try {
    return new TextDecoder(`windows-${codePage}`);
  } catch {
    return new TextDecoder("windows-1252");
  }
}

/** Adresse d'un champ HYPERLINK, si c'en est un vers le web (les liens internes de Scrivener ne sont pas des adresses). */
function hyperlinkOf(instruction: string): string | undefined {
  const url = instruction.match(/HYPERLINK\s+"([^"]+)"/i)?.[1];
  return url && /^(https?:|mailto:)/i.test(url) ? url : undefined;
}

/** HTML d'une suite de morceaux : balises ouvertes et fermées seulement là où l'aspect change. */
function runsToHtml(runs: Run[]): string {
  let html = "";
  for (const run of runs) {
    if (!run.text) continue;
    let piece = escapeHtml(run.text).replace(/\n/g, "<br>");
    if (run.strike) piece = `<s>${piece}</s>`;
    if (run.italic) piece = `<em>${piece}</em>`;
    if (run.bold) piece = `<strong>${piece}</strong>`;
    if (run.href) piece = `<a href="${escapeHtml(run.href).replace(/"/g, "&quot;")}">${piece}</a>`;
    html += piece;
  }
  // Deux morceaux voisins de même aspect : une seule balise (</em><em> disparaît).
  return html.replace(/<\/(strong|em|s)><\1>/g, "");
}

/** Fusionne les morceaux voisins de même aspect, puis retire les marqueurs de Scrivener du texte. */
function cleanRuns(runs: Run[]): { runs: Run[]; heading: boolean } {
  const merged: Run[] = [];
  for (const run of runs) {
    const last = merged[merged.length - 1];
    if (last && last.bold === run.bold && last.italic === run.italic && last.strike === run.strike && last.href === run.href) last.text += run.text;
    else merged.push({ ...run });
  }
  const heading = merged.some((r) => HEADING_TAG.test(r.text));
  for (const run of merged) run.text = run.text.replace(SCRIVENER_TAG, "");
  return { runs: merged.filter((r) => r.text), heading };
}

/**
 * Paragraphes d'un texte RTF. Les paragraphes vides sont gardés comme lignes vides (text vide) : ils séparent les
 * scènes dans certains manuscrits ; c'est le découpage qui décide de les garder ou non.
 */
export function rtfParagraphs(rtf: string): ImportedPara[] {
  const paras: ImportedPara[] = [];
  let runs: Run[] = [];
  let decoder = decoderFor(1252);
  const stack: GroupState[] = [];
  let state: GroupState = { bold: false, italic: false, strike: false, skip: false, uc: 1, fldinst: false };
  /** Texte de l'instruction du champ en cours (\fldinst), pour y lire un HYPERLINK. */
  let instruction = "";
  let pendingHref: string | undefined;
  /** Caractères de repli encore à sauter après un \uN. */
  let toSkip = 0;
  /** Octets \'xx qui se suivent : décodés ensemble (pages de codes à plusieurs octets). */
  let bytes: number[] = [];
  let i = 0;
  const n = rtf.length;

  const emit = (text: string) => {
    if (!text) return;
    if (state.fldinst) {
      instruction += text;
      return;
    }
    if (state.skip) return;
    const last = runs[runs.length - 1];
    const href = state.href;
    if (last && last.bold === state.bold && last.italic === state.italic && last.strike === state.strike && last.href === href) last.text += text;
    else runs.push({ text, bold: state.bold, italic: state.italic, strike: state.strike, href });
  };
  const flushBytes = () => {
    if (bytes.length === 0) return;
    emit(decoder.decode(new Uint8Array(bytes)));
    bytes = [];
  };
  const endParagraph = () => {
    flushBytes();
    const { runs: clean, heading } = cleanRuns(runs);
    const html = runsToHtml(clean);
    const text = clean.map((r) => r.text).join("");
    paras.push({ html: html.trim() ? html : "", text: text.trim(), ...(heading ? { heading: true } : {}) });
    runs = [];
  };
  /** Un caractère de repli à sauter (après \uN) : rend vrai s'il a été mangé. */
  const skipFallback = () => {
    if (toSkip > 0) {
      toSkip -= 1;
      return true;
    }
    return false;
  };

  while (i < n) {
    const c = rtf[i];
    if (c === "{") {
      flushBytes();
      stack.push(state);
      state = { ...state };
      i += 1;
      continue;
    }
    if (c === "}") {
      flushBytes();
      const closing = state;
      state = stack.pop() ?? state;
      // Fin de l'instruction d'un champ : son adresse ira sur le résultat qui suit.
      if (closing.fldinst && !state.fldinst) {
        pendingHref = hyperlinkOf(instruction);
        instruction = "";
      }
      i += 1;
      continue;
    }
    if (c === "\r" || c === "\n") {
      i += 1;
      continue;
    }
    if (c !== "\\") {
      // Texte brut jusqu'au prochain caractère spécial.
      let j = i;
      while (j < n && rtf[j] !== "\\" && rtf[j] !== "{" && rtf[j] !== "}" && rtf[j] !== "\r" && rtf[j] !== "\n") j += 1;
      flushBytes();
      let text = rtf.slice(i, j);
      while (text && toSkip > 0) {
        text = text.slice(1);
        toSkip -= 1;
      }
      emit(text);
      i = j;
      continue;
    }
    // Barre oblique inverse : symbole ou mot de contrôle.
    const next = rtf[i + 1];
    if (next === undefined) break;
    if (next === "'") {
      const hex = rtf.slice(i + 2, i + 4);
      i += 4;
      if (skipFallback()) continue;
      const value = parseInt(hex, 16);
      if (!Number.isNaN(value)) bytes.push(value);
      continue;
    }
    if (!/[a-zA-Z]/.test(next)) {
      i += 2;
      if (next === "\r" || next === "\n") {
        // « \ » en fin de ligne : un saut de paragraphe (ancienne écriture de \par).
        if (!state.skip && !state.fldinst) endParagraph();
        continue;
      }
      if (skipFallback()) continue;
      if (next === "*") {
        // Destination facultative : ignorée, sauf l'instruction d'un champ (lue pour ses liens).
        const word = rtf.slice(i).match(/^\\([a-zA-Z]+)/)?.[1];
        if (word === "fldinst") state.fldinst = true;
        else state.skip = true;
        continue;
      }
      flushBytes();
      if (next === "~") emit(" ");
      else if (next === "_") emit("‑");
      else if (next === "\\" || next === "{" || next === "}") emit(next);
      // \- (césure facultative) et le reste : rien.
      continue;
    }
    const match = rtf.slice(i + 1, i + 40).match(/^([a-zA-Z]+)(-?\d+)? ?/);
    if (!match) {
      i += 1;
      continue;
    }
    const word = match[1];
    const param = match[2] === undefined ? undefined : Number(match[2]);
    i += 1 + match[0].length;
    if (word === "bin" && param && param > 0) {
      // Données binaires : sautées telles quelles.
      i += param;
      continue;
    }
    if (word !== "u") flushBytes();
    switch (word) {
      case "ansicpg":
        if (param) decoder = decoderFor(param);
        break;
      case "par":
      case "sect":
        if (!state.skip && !state.fldinst) endParagraph();
        break;
      case "line":
        emit("\n");
        break;
      case "tab":
        emit("\t");
        break;
      case "emdash":
        emit("—");
        break;
      case "endash":
        emit("–");
        break;
      case "lquote":
        emit("‘");
        break;
      case "rquote":
        emit("’");
        break;
      case "ldblquote":
        emit("“");
        break;
      case "rdblquote":
        emit("”");
        break;
      case "bullet":
        emit("•");
        break;
      case "uc":
        state.uc = param ?? 1;
        break;
      case "u": {
        if (skipFallback()) break;
        flushBytes();
        const code = param === undefined ? 0 : param < 0 ? param + 65536 : param;
        if (code) emit(String.fromCharCode(code));
        toSkip = state.uc;
        break;
      }
      case "b":
        state.bold = param !== 0;
        break;
      case "i":
        state.italic = param !== 0;
        break;
      case "strike":
      case "striked":
        state.strike = param !== 0;
        break;
      case "plain":
        state.bold = false;
        state.italic = false;
        state.strike = false;
        break;
      case "fldinst":
        state.fldinst = true;
        break;
      case "fldrslt":
        state.href = pendingHref;
        pendingHref = undefined;
        break;
      default:
        if (SKIPPED.has(word)) state.skip = true;
    }
  }
  flushBytes();
  if (runs.some((r) => r.text.trim())) endParagraph();
  return paras;
}

/** Texte brut d'un RTF (notes, synopsis en RTF) : paragraphes non vides séparés par des retours. */
export function rtfText(rtf: string): string {
  return rtfParagraphs(rtf)
    .map((p) => p.text)
    .filter(Boolean)
    .join("\n");
}
