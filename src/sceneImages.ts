// Images dans le texte d'une scène (#87) : fonctions pures.
//
// Le fichier est dans medias/, comme les images des cartes (jamais supprimé par l'app). Dans le texte :
//   en mémoire : <img data-media="k3x9a7.jpg" alt="Le phare au crépuscule" data-place="page">
//   sur disque : ![Le phare au crépuscule](../medias/k3x9a7.jpg "page")
// Le chemin relatif fait voir l'image dans tout éditeur Markdown ouvert sur manuscrit/. Le titre Markdown porte
// la place (absent = dans le texte) : les autres logiciels l'affichent en infobulle, sans plus.

import { isMediaName } from "./media";

/** Places d'une image : dans le texte (défaut, jamais écrit), seule sur sa page, en tête de chapitre. Clés jamais traduites. */
export const IMAGE_PLACES = ["inline", "page", "chapter"] as const;
export type ImagePlace = (typeof IMAGE_PLACES)[number];
export const isImagePlace = (v: unknown): v is ImagePlace => typeof v === "string" && (IMAGE_PLACES as readonly string[]).includes(v);

/** Description d'une image : une ligne, bornée, sans les signes qui casseraient le Markdown. */
export const ALT_MAX = 300;
export function cleanAlt(raw: unknown): string {
  if (typeof raw !== "string") return "";
  return raw.replace(/[\r\n\t]+/g, " ").replace(/[[\]]/g, "").replace(/\s+/g, " ").trim().slice(0, ALT_MAX);
}

/**
 * Nom du fichier de medias/ désigné par l'adresse d'une image du Markdown : `../medias/x.jpg`, `medias/x.jpg`
 * ou `x.jpg`. Tout le reste (adresse web, autre dossier, « .. » ailleurs, `data:`) est refusé : null.
 */
export function mediaFromSrc(src: string | null | undefined): string | null {
  if (!src) return null;
  let path = src.trim();
  try {
    path = decodeURIComponent(path);
  } catch {
    return null;
  }
  const m = /^(?:(?:\.\.\/)*medias\/)?([^/\\]+)$/.exec(path);
  return m && isMediaName(m[1]) ? m[1] : null;
}

/** Une image écrite en Markdown, sur sa ligne. */
export function imageMarkdown(name: string, alt: string, place: ImagePlace = "inline"): string {
  const title = place === "inline" ? "" : ` "${place}"`;
  return `![${cleanAlt(alt)}](../medias/${encodeURI(name)}${title})`;
}

/** Noms des images citées dans un HTML de scène, dans l'ordre, sans doublon (sauvegardes, exports). */
export function sceneImagesIn(html: string | undefined): string[] {
  if (!html || !html.includes("data-media")) return [];
  const out: string[] = [];
  for (const m of html.matchAll(/<img\b[^>]*\bdata-media="([^"]+)"/g)) if (isMediaName(m[1]) && !out.includes(m[1])) out.push(m[1]);
  return out;
}

/** Toutes les images citées par le manuscrit (`manuscrit/<id>.md` relus en HTML). */
export const manuscriptImages = (manuscript: Record<string, string>): string[] => [...new Set(Object.values(manuscript).flatMap(sceneImagesIn))];
