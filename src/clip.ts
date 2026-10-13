// Coller sur le canevas (hors d'un champ) : un lien ou un texte devient une carte, pour garder la trace
// d'une recherche. Fonctions pures, testées. Le texte passe ensuite par markdownToHtml / sanitizeHtml.

import { CARD_TYPES, type CardType } from "./types";
import { isNaturalHeading } from "./screenplay/rules";
import { imageExtension } from "./media";

export interface Clip {
  /** Titre proposé (le site, pour un lien). */
  title: string;
  /** Adresse de la source, pour un lien. */
  url?: string;
  /** Contenu en Markdown. */
  markdown: string;
  /** Type de carte reconnu dans le texte (en-tête de scène) ; absent : Lien pour une adresse, Idée sinon. */
  type?: CardType;
  /** L'adresse mène à une image : on essaie de la télécharger pour en faire une carte Image. */
  image?: true;
}

/** Adresse d'un fichier image (le chemin finit par .jpg, .png…), requête et ancre ignorées. */
const isImageUrl = (url: string) => {
  try {
    return imageExtension(new URL(url).pathname) !== null;
  } catch {
    return false;
  }
};

/** Le titre d'un texte Markdown : sa première ligne si c'est un intertitre (`# Titre`). */
const HEADING_MD = /^#{1,3}\s+(.+?)\s*#*$/;

const URL_RE = /^https?:\/\/[^\s<>"]+$/i;

/** Un lien copié traîne parfois une ponctuation ou un guillemet (`'`, `"`, `»`, `)`, `.`) : on les retire. */
const trimLink = (text: string) => text.replace(/^[\s'"«“‘(<]+/, "").replace(/[\s'"»”’)>.,;]+$/, "");

export function clipFromText(raw: string): Clip | null {
  let text = raw.replace(/\r\n/g, "\n").trim();
  if (!text) return null;
  const link = trimLink(text);
  if (!/\s/.test(link) && URL_RE.test(link)) text = link;
  if (URL_RE.test(text)) {
    let host = "";
    try {
      host = new URL(text).hostname.replace(/^www\./, "");
    } catch {
      return null;
    }
    return { title: host, url: text, markdown: "", ...(isImageUrl(text) ? { image: true as const } : {}) };
  }
  // Un lien accompagné de son seul titre (certains navigateurs donnent « titre, puis adresse ») : un lien.
  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
  const links = lines.map(trimLink).filter((l) => !/\s/.test(l) && URL_RE.test(l));
  const others = lines.filter((l) => !links.includes(trimLink(l)));
  if (links.length === 1 && others.length === 1 && others[0].length <= 200) {
    const titled = clipFromText(links[0]);
    if (titled) return { ...titled, title: others[0] };
  }
  // Un en-tête de scène (« INT. PHARE - NUIT ») en première ligne : une carte Scène, la suite en texte.
  const [first, ...rest] = text.split("\n");
  if (first.trim().length <= 120 && isNaturalHeading(first)) {
    return { title: first.trim(), markdown: rest.join("\n").trim(), type: "scene" };
  }
  // Un intertitre Markdown en première ligne : il devient le titre de la carte.
  const heading = first.trim().match(HEADING_MD);
  const title = heading && heading[1].length <= 200 ? heading[1] : "";
  const body = title ? rest.join("\n").trim() : text;
  // Un texte copié d'ailleurs : gardé tel quel, en citation (Markdown déjà présent compris).
  return { title, markdown: body ? quote(body) : "" };
}

const quote = (text: string) => text.split("\n").map((l) => (l.trim() ? `> ${l}` : ">")).join("\n");

/** Fichiers texte qu'on peut déposer ou coller sur le canevas. */
export const TEXT_FILE_RE = /\.(md|markdown|txt)$/i;

export interface TextFileCard {
  type: CardType;
  title: string;
  /** Contenu en Markdown (le texte de l'auteur, pas une citation). */
  markdown: string;
  fiche?: Record<string, string>;
}

const FRONT_RE = /^---\n([\s\S]*?)\n---\n?([\s\S]*)$/;

/**
 * Un fichier texte déposé (.md, .txt) : une carte. Le titre vient de l'en-tête du fichier (`title:`), sinon
 * de son premier intertitre, sinon du nom du fichier ; le type, d'un `type:` reconnu (une carte de MondoWrite,
 * une note Obsidian), sinon d'un en-tête de scène en première ligne, sinon Idée. Fonction pure.
 */
export function cardFromTextFile(fileName: string, raw: string): TextFileCard | null {
  let text = raw.replace(/^\uFEFF/, "").replace(/\r\n/g, "\n");
  if (!text.trim()) return null;
  const fields: Record<string, string> = {};
  const front = text.match(FRONT_RE);
  if (front) {
    for (const line of front[1].split("\n")) {
      const i = line.indexOf(":");
      if (i > 0) fields[line.slice(0, i).trim().toLowerCase()] = line.slice(i + 1).trim();
    }
    text = front[2];
  }
  const unquote = (v: string) => {
    try {
      const parsed = JSON.parse(v);
      return typeof parsed === "string" ? parsed : v;
    } catch {
      return v.replace(/^['"]|['"]$/g, "");
    }
  };
  let type: CardType = CARD_TYPES.includes(fields.type as CardType) ? (fields.type as CardType) : "idee";
  let title = fields.title ? unquote(fields.title).trim() : "";
  let body = text.trim();
  const [first, ...rest] = body.split("\n");
  if (!title && type === "idee" && first.trim().length <= 120 && isNaturalHeading(first)) {
    type = "scene";
    title = first.trim();
    body = rest.join("\n").trim();
  } else if (!title) {
    const heading = first.trim().match(HEADING_MD);
    if (heading) {
      title = heading[1];
      body = rest.join("\n").trim();
    } else title = fileName.replace(TEXT_FILE_RE, "").replace(/[_-]+/g, " ").trim();
  }
  let fiche: Record<string, string> | undefined;
  if (fields.fiche) {
    try {
      const parsed = JSON.parse(fields.fiche);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        fiche = Object.fromEntries(Object.entries(parsed).filter((e): e is [string, string] => typeof e[1] === "string" && e[1].trim() !== ""));
        if (Object.keys(fiche).length === 0) fiche = undefined;
      }
    } catch {
      /* fiche illisible : ignorée */
    }
  }
  return { type, title: title.slice(0, 200), markdown: body, ...(fiche ? { fiche } : {}) };
}
