// Images de référence générées (lot IA 3, 1.10.0), en mode Atelier seulement : un portrait, un décor, un
// objet ou une ambiance tirés de ce que l'auteur a écrit dans la fiche, à la place d'une photo libre.
//
// Services qui génèrent des images par API (octobre 2026) :
// - OpenAI : API Images (`/v1/images/generations`), modèles gpt-image-* (réponse en base64) ;
// - OpenRouter : point d'entrée Images (`/api/v1/images`), même forme de réponse (`data[].b64_json`).
// Claude ne génère pas d'images. Ollama ne le fait qu'en essai, sur macOS, sans API documentée ; LM Studio pas du
// tout : pour ces services la fonction est absente (une phrase le dit).
//
// Garde-fous : la consigne ne porte jamais de nom propre du projet (titres des cartes, prénoms, surnoms), seulement
// la description ; elle demande une personne fictive, sans ressemblance avec une personne réelle, et aucun texte ni
// logo dans l'image. Nombre borné (1 à IMAGE_MAX). Les réponses ne sont jamais crues sur parole : seuls des octets
// d'image reconnus à leur signature (PNG, JPEG, WebP), de taille raisonnable, ou une adresse https d'un hôte
// attendu, sont gardés. Rien n'entre dans le projet sans le clic « Garder » (store, `keepGeneratedImage`).

import type { CardData, CardType } from "../types";
import { plainText } from "../search";
import { isMediaName } from "../media";
import { base, headers, send, type AiConfig, type HttpRequest } from "./providers";

// ---------- Services ----------

export type ImageProvider = "openai" | "openrouter";
/** Le service génère-t-il des images ? (Toute autre valeur, y compris un service ajouté plus tard : non.) */
export const canGenerateImages = (provider: string | null | undefined): provider is ImageProvider => provider === "openai" || provider === "openrouter";

/** Modèle d'image proposé quand l'auteur n'en a pas choisi (réglage facultatif `ai.imageModels`). */
export const DEFAULT_IMAGE_MODELS: Record<ImageProvider, string> = { openai: "gpt-image-2", openrouter: "openai/gpt-image-2" };
export const imageModelOf = (provider: ImageProvider, chosen?: string) => chosen?.trim() || DEFAULT_IMAGE_MODELS[provider];

/** Nombre d'images proposées d'un coup : 1 à 4 (l'auteur en garde 0 ou 1). */
export const IMAGE_MAX = 4;
export const clampCount = (n: number) => Math.min(IMAGE_MAX, Math.max(1, Math.round(Number.isFinite(n) ? n : 1)));

/** Une image générée peut être longue à venir (plusieurs images, modèle chargé) : 3 minutes au plus. */
export const IMAGE_TIMEOUT_MS = 180_000;

// ---------- Ce que l'image doit montrer ----------

export type ImageSubject = "portrait" | "place" | "object" | "mood";
export const subjectOf = (type: CardType | undefined): ImageSubject => (type === "personnage" ? "portrait" : type === "lieu" ? "place" : type === "objet" ? "object" : "mood");

/** Champs de la fiche lus pour chaque sujet (jamais l'origine, le rôle ni le caractère d'un personnage). */
export const DESCRIBED_FIELDS: Record<ImageSubject, readonly string[]> = {
  portrait: ["genre", "age", "apparence", "metier"],
  place: ["epoque", "ambiance"],
  object: ["usage", "emplacement", "origine"],
  mood: ["retenir"],
};

/** Longueur de la description envoyée, bornée. */
export const DESCRIPTION_MAX = 1200;
const NOTES_MAX = 600;

const clip = (text: string, max: number) => (text.length <= max ? text : `${text.slice(0, max).replace(/\s+\S*$/, "")}…`);
const oneLine = (text: string) => text.replace(/\s+/g, " ").trim();

/**
 * Description préremplie à partir de la carte, que l'auteur voit et peut retoucher avant l'envoi : les champs
 * utiles de la fiche (« Âge : 34 ans »), puis le début de ses notes. Une carte Image ou une ambiance donne aussi son
 * titre. Les noms propres sont retirés ensuite (`stripNames`), ici comme à l'envoi.
 */
export function describeCard(card: Pick<CardData, "type" | "title" | "html" | "fiche">, labels: Record<string, string>, sep = ": "): string {
  const subject = subjectOf(card.type);
  const lines: string[] = [];
  if (subject === "mood" && card.title.trim()) lines.push(oneLine(card.title));
  for (const key of DESCRIBED_FIELDS[subject]) {
    const value = oneLine(card.fiche?.[key] ?? "");
    if (value) lines.push(`${labels[key] ?? key}${sep}${value}`);
  }
  const notes = oneLine(plainText(card.html ?? ""));
  if (notes) lines.push(clip(notes, NOTES_MAX));
  return lines.join("\n");
}

// ---------- Noms propres ----------

/** Articles et particules qu'on ne retire jamais seuls (« Le », « de », « The »…). */
const SMALL = new Set(["le", "la", "les", "l", "un", "une", "des", "de", "du", "d", "the", "a", "an", "of", "van", "von", "der", "den", "di", "da", "del", "el", "los", "las"]);

export interface ProperNames {
  /** Titres entiers des lieux, groupes, objets, évènements (retirés sans tenir compte de la casse). */
  whole: string[];
  /**
   * Noms de personne : nom entier, prénom, nom, surnom, retirés seulement tels qu'écrits (avec leur majuscule) :
   * « Rose », pas « une broche rose ».
   */
  words: string[];
}

/** Noms propres connus du projet : titres des personnages, lieux, groupes, objets et évènements, prénoms et surnoms. */
export function properNames(cards: Pick<CardData, "type" | "title" | "fiche">[], extra: string[] = []): ProperNames {
  const whole = new Set<string>();
  const words = new Set<string>();
  const addPerson = (name: string) => {
    if (oneLine(name).length >= 2) words.add(oneLine(name));
    for (const w of name.split(/[\s'’-]+/)) if (w.length >= 2 && !SMALL.has(w.toLowerCase()) && /^\p{Lu}/u.test(w)) words.add(w);
  };
  for (const card of cards) {
    const title = oneLine(card.title);
    if (!title || !["personnage", "lieu", "groupe", "objet", "evenement"].includes(card.type)) continue;
    if (card.type !== "personnage") {
      whole.add(title);
      continue;
    }
    addPerson(title);
    for (const nick of (card.fiche?.surnoms ?? "").split(/[,;]/)) addPerson(nick);
  }
  for (const name of extra) addPerson(name);
  // Les plus longs d'abord : « Yann Le Goff » avant « Yann ».
  return { whole: [...whole].sort((a, b) => b.length - a.length), words: [...words].sort((a, b) => b.length - a.length) };
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Texte sans les noms propres connus : un nom retiré ne laisse ni espace double ni ponctuation orpheline. */
export function stripNames(text: string, names: ProperNames): string {
  let out = text;
  const edge = (flags: string) => (name: string) => new RegExp(`(?<![\\p{L}\\p{N}])${escapeRe(name)}(?:['’]s)?(?![\\p{L}\\p{N}])`, flags);
  for (const name of names.whole) out = out.replace(edge("giu")(name), "");
  for (const word of names.words) out = out.replace(edge("gu")(word), "");
  return out
    .split("\n")
    .map((line) =>
      line
        .replace(/[ \t]{2,}/g, " ")
        .replace(/\s+([,.;:!?)])/g, "$1")
        .replace(/([(])\s+/g, "$1")
        .replace(/\(\s*\)/g, "")
        .replace(/^[\s,;:.-]+/, "")
        .replace(/([,;:])(?=[,;:.]|$)/g, "")
        .trim(),
    )
    .filter((line) => line !== "")
    .join("\n");
}

// ---------- Consigne ----------

const SUBJECT_LINES: Record<ImageSubject, string> = {
  portrait: "A reference portrait of a fictional character for a novelist's notes: one person, head and shoulders, natural light, realistic illustration.",
  place: "A reference image of a fictional place for a novelist's notes: a wide view of the setting, its light and atmosphere, no people in the foreground.",
  object: "A reference image of an object for a novelist's notes: the object alone, clearly visible, on a simple background.",
  mood: "A mood image for a novelist's notes: the atmosphere, colours and light described below.",
};

/**
 * Consigne d'image : sujet, règles, puis la description de l'auteur (dans sa langue), sans aucun nom propre du
 * projet. Les règles sont en anglais, la langue que les modèles d'image suivent le mieux.
 */
export function imagePrompt(subject: ImageSubject, description: string, names: ProperNames): string {
  const text = clip(stripNames(description, names), DESCRIPTION_MAX);
  return [
    SUBJECT_LINES[subject],
    "Rules: every person shown is fictional and must not resemble any real person, celebrity or public figure. No text, letters, numbers, captions, signatures, watermarks or logos anywhere in the image.",
    text ? `Description (written by the author, follow it faithfully, do not add names):\n${text}` : "No description: keep it simple and neutral.",
  ].join("\n\n");
}

// ---------- Requête ----------

/** Taille demandée selon le sujet : portrait en hauteur, lieu et ambiance en largeur, objet carré. */
const SHAPES: Record<ImageSubject, { size: string; ratio: string }> = {
  portrait: { size: "1024x1536", ratio: "2:3" },
  place: { size: "1536x1024", ratio: "3:2" },
  object: { size: "1024x1024", ratio: "1:1" },
  mood: { size: "1536x1024", ratio: "3:2" },
};

export function imageRequest(config: AiConfig, model: string, prompt: string, count: number, subject: ImageSubject): HttpRequest {
  const n = clampCount(count);
  if (config.provider === "openrouter") {
    return { url: `${base(config)}/v1/images`, method: "POST", headers: headers(config), body: JSON.stringify({ model, prompt, n, aspect_ratio: SHAPES[subject].ratio }) };
  }
  // OpenAI. Les modèles gpt-image rendent toujours du base64 ; les anciens dall-e, seulement si on le demande
  // (dall-e-3 : une image à la fois, tailles à lui).
  const dalle = /^dall-e/i.test(model);
  const body = dalle
    ? { model, prompt, n: /^dall-e-3/i.test(model) ? 1 : n, size: "1024x1024", response_format: "b64_json" }
    : { model, prompt, n, size: SHAPES[subject].size };
  return { url: `${base(config)}/v1/images/generations`, method: "POST", headers: headers(config), body: JSON.stringify(body) };
}

// ---------- Réponse ----------

/** Octets d'une image décodée : au plus 15 Mo. */
export const IMAGE_BYTES_MAX = 15_000_000;
/** Hôtes d'où une image peut être téléchargée quand le service rend une adresse (dall-e sans base64). */
const IMAGE_HOSTS = /^(oaidalleapiprodscus\.blob\.core\.windows\.net|[a-z0-9-]+\.openai\.com)$/i;

export type ImageMime = "image/png" | "image/jpeg" | "image/webp";
export const IMAGE_EXT: Record<ImageMime, string> = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp" };

/** Format reconnu à la signature des octets (jamais au type annoncé par le service). */
export function sniffImage(bytes: Uint8Array): ImageMime | null {
  if (bytes.length < 12) return null;
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return "image/png";
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  const ascii = (from: number, to: number) => String.fromCharCode(...bytes.subarray(from, to));
  if (ascii(0, 4) === "RIFF" && ascii(8, 12) === "WEBP") return "image/webp";
  return null;
}

/** Base64 (éventuellement en adresse data:) → octets ; null si ce n'est pas du base64 ou si c'est trop gros. */
export function decodeBase64(text: string): Uint8Array | null {
  const raw = text.trim().replace(/^data:image\/[a-z+.-]+;base64,/i, "").replace(/\s+/g, "");
  if (!raw || raw.length > (IMAGE_BYTES_MAX * 4) / 3 + 4 || !/^[A-Za-z0-9+/]+={0,2}$/.test(raw)) return null;
  try {
    const bin = atob(raw);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  } catch {
    return null;
  }
}

export interface GeneratedImage {
  mime: ImageMime;
  data: Uint8Array;
}

export type ImageItem = GeneratedImage | { url: string };

/** Adresse d'image acceptée : https, sur un hôte attendu. */
export function isImageUrl(value: unknown): value is string {
  if (typeof value !== "string") return false;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && IMAGE_HOSTS.test(url.hostname);
  } catch {
    return false;
  }
}

/** Images d'une réponse `{ data: [{ b64_json } | { url }] }` (OpenAI, OpenRouter), au plus `max`. */
export function readImages(json: unknown, max = IMAGE_MAX): ImageItem[] {
  const data = (json as { data?: unknown } | null)?.data;
  if (!Array.isArray(data)) return [];
  const out: ImageItem[] = [];
  for (const item of data) {
    if (out.length >= max) break;
    const entry = item as { b64_json?: unknown; url?: unknown } | null;
    if (typeof entry?.b64_json === "string") {
      const bytes = decodeBase64(entry.b64_json);
      const mime = bytes && sniffImage(bytes);
      if (bytes && mime) out.push({ mime, data: bytes });
    } else if (isImageUrl(entry?.url)) out.push({ url: entry.url });
  }
  return out;
}

/** Image téléchargée depuis une adresse vérifiée : même contrôle des octets que le base64. */
async function download(url: string): Promise<GeneratedImage | null> {
  const { fetchImage } = await import("../web");
  const file = await fetchImage(url).catch(() => null);
  const mime = file && sniffImage(file.data);
  return file && mime ? { mime, data: file.data } : null;
}

/** Demande les images et rend celles qui sont lisibles (au moins une, sinon AiError « empty »). */
export async function generateImages(config: AiConfig, model: string, prompt: string, count: number, subject: ImageSubject, signal?: AbortSignal): Promise<GeneratedImage[]> {
  const { AiError } = await import("./providers");
  const items = readImages(await send(imageRequest(config, model, prompt, count, subject), false, signal, IMAGE_TIMEOUT_MS), clampCount(count));
  const images: GeneratedImage[] = [];
  for (const item of items) {
    const image = "url" in item ? await download(item.url) : item;
    if (image) images.push(image);
  }
  if (images.length === 0) throw new AiError("empty");
  return images;
}

// ---------- Marque des images gardées ----------

/**
 * Frontmatter `iaImages` d'une carte : nom d'un fichier de medias/ → « service, modèle ». Seuls des noms sûrs
 * (`isMediaName`) et des textes d'une ligne courts sont relus.
 */
export function readIaImages(raw: unknown): Record<string, string> | undefined {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return undefined;
  const out: Record<string, string> = {};
  for (const [name, value] of Object.entries(raw as Record<string, unknown>).slice(0, 60)) {
    if (isMediaName(name) && typeof value === "string") out[name] = oneLine(value).slice(0, 160);
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

/** Marques des seules images que la carte porte encore (image principale, galerie). */
export function iaImagesOf(card: Pick<CardData, "image" | "images" | "iaImages">): Record<string, string> | undefined {
  const all = card.iaImages as Record<string, string> | undefined;
  if (!all) return undefined;
  const present = new Set([card.image, ...(card.images ?? [])].filter((n): n is string => !!n));
  const kept = Object.fromEntries(Object.entries(all).filter(([name]) => present.has(name)));
  return Object.keys(kept).length > 0 ? kept : undefined;
}

/** Valeur de la marque : « openai, gpt-image-2 ». */
export const iaImageSource = (provider: string, model: string) => [oneLine(provider), oneLine(model)].filter(Boolean).join(", ");

/** Service et modèle lus dans une marque, pour l'affichage (le service par son nom). */
export function readIaImageSource(value: string, providerNames: Record<string, string>): string {
  const [provider, ...rest] = value.split(", ");
  const model = rest.join(", ");
  return [providerNames[provider] ?? provider, model].filter(Boolean).join(", ");
}

/** Nombre d'images générées que les cartes portent encore (fenêtre Statistiques). */
export const iaImageCount = (cards: Pick<CardData, "image" | "images" | "iaImages">[]) => cards.reduce((sum, c) => sum + Object.keys(iaImagesOf(c) ?? {}).length, 0);
