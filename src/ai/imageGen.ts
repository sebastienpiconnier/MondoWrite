// Images de référence générées (lot IA 3, 1.10.0), en mode Atelier seulement : un portrait, un décor, un
// objet ou une ambiance tirés de ce que l'auteur a écrit dans la fiche, à la place d'une photo libre.
//
// Services qui génèrent des images par API (octobre 2026) :
// - OpenAI : API Images (`/v1/images/generations`), modèles gpt-image-* (réponse en base64) ;
// - OpenRouter : point d'entrée Images (`/api/v1/images`), même forme de réponse (`data[].b64_json`).
// Claude ne génère pas d'images. Ollama ne le fait qu'en essai, sur macOS, sans API documentée ; LM Studio pas du
// tout : pour ces services la fonction est absente (une phrase le dit).
//
// #52 (novembre 2026) : couverture ou affiche du projet (sujet `cover`, tirée de la couverture de la Bible), scène
// illustrée (`scene`) avec ses personnages : leurs portraits partent comme images de référence (OpenAI : API
// d'édition `/v1/images/edits` en multipart ; OpenRouter : chat avec `modalities`), pour garder les mêmes visages.
//
// Garde-fous : la consigne ne porte jamais de nom de personne du projet (personnages, prénoms, surnoms, auteur) ;
// les titres des lieux, objets, groupes et scènes y entrent depuis #52 (sans risque de ressemblance) ; elle demande une personne fictive, sans ressemblance avec une personne réelle, et aucun texte ni
// logo dans l'image. Nombre borné (1 à IMAGE_MAX). Les réponses ne sont jamais crues sur parole : seuls des octets
// d'image reconnus à leur signature (PNG, JPEG, WebP), de taille raisonnable, ou une adresse https d'un hôte
// attendu, sont gardés. Rien n'entre dans le projet sans le clic « Garder » (store, `keepGeneratedImage`).

import type { CardData, CardType } from "../types";
import type { Pitch } from "../pitch";
import type { ScreenplayElement } from "../screenplay/model";
import { characterName } from "../screenplay/scenes";
import { detectCards, namesOf } from "../manuscript";
import { plainText } from "../search";
import { isMediaName } from "../media";
import { base, headers, send, type AiConfig, type FormRequest, type HttpRequest } from "./providers";

// ---------- Services ----------

export type ImageProvider = "openai" | "openrouter";
/** Le service génère-t-il des images ? (Toute autre valeur, y compris un service ajouté plus tard : non.) */
export const canGenerateImages = (provider: string | null | undefined): provider is ImageProvider => provider === "openai" || provider === "openrouter";

/**
 * Modèles d'image proposés dans les Réglages (#66, novembre 2026) : GPT Image 2.6, Flare (rapide, par défaut) et
 * Sunburst (plus soigné, visages plus fidèles d'une image à l'autre). Mêmes points d'entrée, même prix au token.
 * « Autre modèle… » garde le champ libre.
 */
export type ImageModelChoice = "flare" | "sunburst";
export const IMAGE_MODEL_CHOICES: Record<ImageProvider, Record<ImageModelChoice, string>> = {
  openai: { flare: "gpt-image-2.6-flare", sunburst: "gpt-image-2.6-sunburst" },
  openrouter: { flare: "openai/gpt-image-2.6-flare", sunburst: "openai/gpt-image-2.6-sunburst" },
};
/** Modèle d'image proposé quand l'auteur n'en a pas choisi (réglage facultatif `ai.imageModels`). */
export const DEFAULT_IMAGE_MODELS: Record<ImageProvider, string> = { openai: IMAGE_MODEL_CHOICES.openai.flare, openrouter: IMAGE_MODEL_CHOICES.openrouter.flare };
/** Modèles qu'OpenAI arrête (GPT-Image-2 le 10 février 2027) : encore enregistrés, ils valent le modèle par défaut. */
const RETIRED_IMAGE_MODELS = /^(openai\/)?gpt-image-2$/i;
export const isRetiredImageModel = (model: string) => RETIRED_IMAGE_MODELS.test(model.trim());
export const imageModelOf = (provider: ImageProvider, chosen?: string) => {
  const model = chosen?.trim() ?? "";
  return model && !isRetiredImageModel(model) ? model : DEFAULT_IMAGE_MODELS[provider];
};
/** Choix affiché dans les Réglages pour un modèle enregistré : un modèle proposé, ou « autre ». */
export function imageModelChoice(provider: ImageProvider, chosen?: string): ImageModelChoice | "other" {
  const model = imageModelOf(provider, chosen);
  const found = (Object.keys(IMAGE_MODEL_CHOICES[provider]) as ImageModelChoice[]).find((k) => IMAGE_MODEL_CHOICES[provider][k] === model);
  return found ?? "other";
}

/** Nombre d'images proposées d'un coup : 1 à 4 (l'auteur en garde 0 ou 1). */
export const IMAGE_MAX = 4;
export const clampCount = (n: number) => Math.min(IMAGE_MAX, Math.max(1, Math.round(Number.isFinite(n) ? n : 1)));

/** Une image générée peut être longue à venir (plusieurs images, modèle chargé) : 3 minutes au plus. */
export const IMAGE_TIMEOUT_MS = 180_000;

// ---------- Ce que l'image doit montrer ----------

export type ImageSubject = "portrait" | "place" | "object" | "mood" | "scene" | "cover";
export const subjectOf = (type: CardType | undefined): ImageSubject =>
  type === "personnage" ? "portrait" : type === "lieu" ? "place" : type === "objet" ? "object" : type === "scene" ? "scene" : "mood";

/** Champs de la fiche lus pour chaque sujet (jamais l'origine, le rôle ni le caractère d'un personnage). */
export const DESCRIBED_FIELDS: Record<ImageSubject, readonly string[]> = {
  portrait: ["genre", "age", "apparence", "metier"],
  place: ["epoque", "ambiance"],
  object: ["usage", "emplacement", "origine"],
  mood: ["retenir"],
  scene: [],
  cover: [],
};

/** Longueur de la description envoyée, bornée. */
export const DESCRIPTION_MAX = 1200;
const NOTES_MAX = 600;

const clip = (text: string, max: number) => (text.length <= max ? text : `${text.slice(0, max).replace(/\s+\S*$/, "")}…`);
const oneLine = (text: string) => text.replace(/\s+/g, " ").trim();

/**
 * Description préremplie à partir de la carte, que l'auteur voit et peut retoucher avant l'envoi : son titre
 * (sauf un personnage, dont le nom ne part jamais), les champs utiles de la fiche (« Âge : 34 ans »), puis le
 * début de ses notes, ou pour une scène son synopsis et le début de son texte (`sceneText`). Les noms de
 * personnes sont retirés ensuite (`stripNames`), ici comme à l'envoi.
 */
export function describeCard(
  card: Pick<CardData, "type" | "title" | "html" | "fiche">,
  labels: Record<string, string>,
  sep = ": ",
  sceneText?: { synopsis?: string; text?: string },
): string {
  const subject = subjectOf(card.type);
  const lines: string[] = [];
  if (subject !== "portrait" && card.title.trim()) lines.push(oneLine(card.title));
  if (subject === "scene") {
    const synopsis = oneLine(sceneText?.synopsis ?? card.fiche?.synopsis ?? "");
    if (synopsis) lines.push(synopsis);
    const text = oneLine(sceneText?.text ?? "");
    if (text) lines.push(clip(text, NOTES_MAX));
    return lines.join("\n");
  }
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

/** Noms de personnes connus du projet : titres des personnages, prénoms, surnoms, et `extra` (l'auteur). */
export function properNames(cards: Pick<CardData, "type" | "title" | "fiche">[], extra: string[] = []): ProperNames {
  const whole = new Set<string>();
  const words = new Set<string>();
  const addPerson = (name: string) => {
    if (oneLine(name).length >= 2) words.add(oneLine(name));
    for (const w of name.split(/[\s'’-]+/)) if (w.length >= 2 && !SMALL.has(w.toLowerCase()) && /^\p{Lu}/u.test(w)) words.add(w);
  };
  for (const card of cards) {
    const title = oneLine(card.title);
    // Depuis #52, les titres des lieux, groupes, objets et évènements restent : seuls les noms de personnes partent.
    if (!title || card.type !== "personnage") continue;
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
  scene: "An illustration of a scene from a work of fiction, for the author's notes: the moment described below, its setting, light and atmosphere.",
  cover: "A book cover or film poster for a work of fiction, portrait format: one strong, evocative image that tells the genre and the mood described below, readable even as a small thumbnail (one clear focal subject, strong contrast, few details).",
};

/** Personnage d'une scène illustrée : sa description (jamais son nom), et s'il a une image de référence. */
export interface CastMember {
  description: string;
  reference: boolean;
}

export interface PromptOptions {
  /** Couverture : titre à écrire sur l'image, tel quel (case « Écrire le titre sur l'image »). */
  title?: string;
  /** Couverture : nom de l'auteur à écrire sur l'image, tel quel (case « Écrire ton nom », nom signé du profil). */
  author?: string;
  /** Couverture : style d'image choisi (déjà résolu : jamais « auto »). */
  style?: ImageStyle;
  /** Couverture : laisser un espace calme pour le titre et le nom qui ne sont pas écrits par l'IA. */
  space?: boolean;
  /** Scène : les personnages, dans l'ordre des images de référence jointes. */
  cast?: CastMember[];
}

/**
 * Consigne d'image : sujet, règles, puis la description de l'auteur (dans sa langue), sans aucun nom propre du
 * projet. Les règles sont en anglais, la langue que les modèles d'image suivent le mieux.
 */
export function imagePrompt(subject: ImageSubject, description: string, names: ProperNames, options: PromptOptions = {}): string {
  const text = clip(stripNames(description, names), DESCRIPTION_MAX);
  const title = oneLine(options.title ?? "").slice(0, 120);
  const author = oneLine(options.author ?? "").slice(0, 80);
  const quoted = (s: string) => `"${s.replace(/"/g, "'")}"`;
  const noOther = "No other text, letters, numbers, captions, signatures, watermarks or logos.";
  const textRule =
    title && author
      ? `Write the title ${quoted(title)} and the author's name ${quoted(author)} on the image, legibly, exactly as given and nowhere else: the title large and prominent, the author's name smaller, at the top or the bottom. ${noOther}`
      : title
        ? `Write this title on the image, legibly, exactly as given and nowhere else: ${quoted(title)}. ${noOther}`
        : author
          ? `Write only the author's name on the image, legibly, exactly as given, smaller than a title would be, at the top or the bottom: ${quoted(author)}. ${noOther}`
          : "No text, letters, numbers, captions, signatures, watermarks or logos anywhere in the image.";
  const parts = [SUBJECT_LINES[subject]];
  if (options.style) parts.push(`Style: ${STYLE_LINES[options.style]}`);
  parts.push(`Rules: every person shown is fictional and must not resemble any real person, celebrity or public figure. ${textRule}`);
  if (options.space && !(title && author)) {
    const room = !title && !author ? "in the top third for the title and along the bottom for the author's name" : !title ? "in the top third for the title" : "along the bottom for the author's name";
    parts.push(`Composition: leave calm, uncluttered space ${room}, to be added later; keep the main subject and any face away from those areas and from the edges.`);
  }
  const cast = (options.cast ?? []).map((c) => ({ ...c, description: clip(stripNames(c.description, names), 300) }));
  if (cast.length > 0) {
    let ref = 0;
    const lines = cast.map((c, i) => `Character ${i + 1}${c.reference ? ` (reference image ${++ref})` : ""}: ${c.description || "no description"}`);
    parts.push(
      `${ref > 0 ? "The attached reference images show some of the characters. Keep each one's face, hair, build and clothing exactly as in their reference image, so they are recognisable from one illustration to the next. Use the references only for these people, not for the setting or the composition.\n" : ""}Characters in the scene:\n${lines.join("\n")}`,
    );
  }
  parts.push(text ? `Description (written by the author, follow it faithfully, do not add names):\n${text}` : "No description: keep it simple and neutral.");
  return parts.join("\n\n");
}

/** Description d'un personnage pour une scène illustrée : les champs visibles de sa fiche, jamais son nom. */
export function castDescription(card: Pick<CardData, "fiche">, labels: Record<string, string>, sep = ": "): string {
  return DESCRIBED_FIELDS.portrait
    .map((key) => [key, oneLine(card.fiche?.[key] ?? "")] as const)
    .filter(([, value]) => value)
    .map(([key, value]) => `${labels[key] ?? key}${sep}${value}`)
    .join("; ");
}

/**
 * Personnages d'une scène, dans l'ordre où on les propose : le narrateur, ceux qui parlent (scénario), ceux que le
 * texte nomme, puis ceux qu'un fil relie à la scène. Seules des cartes Personnage existantes.
 */
export function sceneCast(
  scene: Pick<CardData, "id" | "fiche">,
  cards: CardData[],
  links: readonly { source: string; target: string }[],
  text: { html?: string; elements?: readonly Pick<ScreenplayElement, "type" | "text">[] },
): CardData[] {
  const people = cards.filter((c) => c.type === "personnage");
  const out: CardData[] = [];
  const add = (card: CardData | undefined) => {
    if (card && !out.includes(card)) out.push(card);
  };
  add(people.find((c) => c.id === scene.fiche?.pov));
  const fold = (s: string) => s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().replace(/\s+/g, " ").trim();
  for (const el of text.elements ?? []) {
    if (el.type !== "character") continue;
    const name = fold(characterName(el.text));
    add(people.find((c) => namesOf(c).includes(name)));
  }
  const prose = text.html ?? (text.elements ?? []).filter((el) => el.type === "action").map((el) => `<p>${el.text.replace(/[<&]/g, " ")}</p>`).join("");
  for (const card of detectCards(prose, people)) add(card);
  for (const l of links) add(people.find((c) => (l.source === scene.id && c.id === l.target) || (l.target === scene.id && c.id === l.source)));
  return out;
}

/**
 * Couverture ou affiche (#52) : ce que la couverture de la Bible en dit (tagline, logline, genre, ton, public,
 * thèmes), pour la description préremplie. Les noms de personnes en sont retirés ensuite, comme toujours.
 */
export function describeCover(pitch: Pitch, themes: string[], labels: Record<string, string>, sep = ": "): string {
  const lines: string[] = [];
  for (const key of ["tagline", "logline", "genre", "ton", "cible", "format"] as const) {
    const value = oneLine(pitch[key] ?? "");
    if (value) lines.push(key === "tagline" || key === "logline" ? value : `${labels[key] ?? key}${sep}${value}`);
  }
  if (themes.length > 0) lines.push(`${labels.themes ?? "themes"}${sep}${themes.map(oneLine).join(", ")}`);
  return lines.join("\n");
}

// ---------- Couverture : styles et conseils selon le genre ----------

/** Styles proposés pour une couverture ou une affiche (clés jamais traduites ; « auto » suit le genre). */
export const COVER_STYLES = ["auto", "photo", "painting", "illustration", "graphic", "watercolor", "engraving", "vintage", "noir"] as const;
export type CoverStyle = (typeof COVER_STYLES)[number];
export type ImageStyle = Exclude<CoverStyle, "auto">;

/** Consigne de chaque style, en anglais (la langue que les modèles d'image suivent le mieux). */
const STYLE_LINES: Record<ImageStyle, string> = {
  photo: "cinematic photograph, realistic, dramatic lighting, shallow depth of field.",
  painting: "rich digital painting, painterly brushwork, detailed and atmospheric, epic scale.",
  illustration: "modern flat illustration, bold simple shapes, bright harmonious colours, clean lines.",
  graphic: "minimalist graphic design, one strong symbolic element, large areas of flat colour, generous negative space.",
  watercolor: "soft watercolour painting, delicate washes, visible paper texture, light and airy.",
  engraving: "vintage engraving or woodcut, fine line work, cross-hatching, limited palette.",
  vintage: "retro mid-century poster, grainy print texture, limited bold palette, pulp atmosphere.",
  noir: "black and white, high contrast, deep shadows, film noir mood.",
};

/** Familles de genres reconnues dans la pastille Genre (puis Ton) de la couverture, dans l'ordre où on les cherche. */
export const COVER_GENRES = ["thriller", "horror", "romcom", "romance", "fantasy", "scifi", "historical", "youth", "literary"] as const;
export type CoverGenre = (typeof COVER_GENRES)[number];

/** Mots qui désignent chaque famille (français, anglais, espagnol), repliés : sans accents, en minuscules. */
const GENRE_WORDS: Record<CoverGenre, string[]> = {
  thriller: ["thriller", "polar", "policier", "crime", "criminal", "suspense", "enquete", "detective", "espionnage", "spy", "roman noir", "mystery", "mystere", "misterio", "novela negra"],
  horror: ["horreur", "horror", "epouvante", "gothique", "gothic", "terror", "terreur"],
  romcom: ["comedie romantique", "romantic comedy", "romcom", "rom com", "feel good", "feelgood", "chick lit", "comedia romantica"],
  romance: ["romance", "romantique", "romantic", "sentimental", "love story", "romantica"],
  fantasy: ["fantasy", "fantastique", "fantastico", "merveilleux", "magie", "magic", "magia", "conte", "fairy tale", "dragon", "fantasia"],
  scifi: ["science fiction", "sci fi", "sf", "anticipation", "dystopie", "dystopia", "distopia", "cyberpunk", "space opera", "post apocalyptique", "post apocalyptic", "ciencia ficcion"],
  historical: ["historique", "historical", "historico", "historia", "saga familiale", "epoque"],
  youth: ["jeunesse", "young adult", "ya", "ado", "adolescent", "enfant", "children", "middle grade", "teen", "juvenil", "infantil"],
  literary: ["litterature", "litteraire", "literary", "literaria", "drame", "drama", "contemporain", "contemporary", "general fiction", "autofiction"],
};

/** Styles conseillés pour chaque famille, du plus courant au moins courant ; le premier est celui d'« auto ». */
export const GENRE_STYLES: Record<CoverGenre, ImageStyle[]> = {
  thriller: ["photo", "noir", "graphic"],
  horror: ["photo", "noir", "engraving"],
  romcom: ["illustration", "watercolor"],
  romance: ["photo", "watercolor", "illustration"],
  fantasy: ["painting", "engraving", "illustration"],
  scifi: ["painting", "photo", "graphic"],
  historical: ["painting", "photo", "engraving"],
  youth: ["illustration", "painting"],
  literary: ["graphic", "watercolor", "photo"],
};

const foldWords = (s: string) => ` ${s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim()} `;

/** Famille du genre écrit par l'auteur (« Thriller psychologique » : thriller), ou null s'il n'y en a pas de connue. */
export function coverGenre(...texts: (string | undefined)[]): CoverGenre | null {
  for (const text of texts) {
    if (!text?.trim()) continue;
    const folded = foldWords(text);
    const found = COVER_GENRES.find((g) => GENRE_WORDS[g].some((w) => folded.includes(` ${w} `)));
    if (found) return found;
  }
  return null;
}

/** Style réellement demandé : « auto » prend le premier style conseillé pour le genre, sinon aucun. */
export const resolveStyle = (style: CoverStyle, genre: CoverGenre | null): ImageStyle | undefined => (style !== "auto" ? style : genre ? GENRE_STYLES[genre][0] : undefined);

// ---------- Requête ----------

/** Taille demandée selon le sujet : portrait en hauteur, lieu et ambiance en largeur, objet carré. */
const SHAPES: Record<ImageSubject, { size: string; ratio: string }> = {
  portrait: { size: "1024x1536", ratio: "2:3" },
  place: { size: "1536x1024", ratio: "3:2" },
  object: { size: "1024x1024", ratio: "1:1" },
  mood: { size: "1536x1024", ratio: "3:2" },
  scene: { size: "1536x1024", ratio: "3:2" },
  cover: { size: "1024x1536", ratio: "2:3" },
};

/** Image de référence jointe à la demande (portrait d'un personnage), déjà réduite. */
export interface ReferenceImage {
  mime: ImageMime;
  data: Uint8Array;
}

/** Au plus tant d'images de référence (OpenAI en accepte 16 ; au-delà, le modèle les mélange). */
export const REFERENCE_MAX = 6;

const toBase64 = (bytes: Uint8Array) => {
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
};

/**
 * Demande avec des images de référence. OpenAI : API d'édition, en multipart (`image[]`, un fichier par
 * personnage). OpenRouter : chat avec `modalities: ["image", "text"]`, les images en data URL ; une réponse par
 * image demandée (`count` requêtes). Les anciens modèles dall-e n'en acceptent pas : demande ordinaire.
 */
export function referenceRequest(config: AiConfig, model: string, prompt: string, count: number, subject: ImageSubject, refs: readonly ReferenceImage[]): HttpRequest | FormRequest {
  const images = refs.slice(0, REFERENCE_MAX);
  if (config.provider === "openrouter") {
    const content = [{ type: "text", text: prompt }, ...images.map((r) => ({ type: "image_url", image_url: { url: `data:${r.mime};base64,${toBase64(r.data)}` } }))];
    return {
      url: `${base(config)}/v1/chat/completions`,
      method: "POST",
      headers: headers(config),
      body: JSON.stringify({ model, modalities: ["image", "text"], messages: [{ role: "user", content }], image_config: { aspect_ratio: SHAPES[subject].ratio } }),
    };
  }
  const form = new FormData();
  form.append("model", model);
  form.append("prompt", prompt);
  form.append("n", String(clampCount(count)));
  form.append("size", SHAPES[subject].size);
  images.forEach((r, i) => form.append("image[]", new Blob([r.data as BlobPart], { type: r.mime }), `reference-${i + 1}.${IMAGE_EXT[r.mime]}`));
  // Le navigateur pose lui-même le type multipart et sa frontière : jamais de content-type JSON ici.
  const { "content-type": _json, ...rest } = headers(config);
  return { url: `${base(config)}/v1/images/edits`, method: "POST", headers: rest, body: form };
}

/** Images d'une réponse de chat d'OpenRouter : `choices[].message.images[].image_url.url` en data URL base64. */
export function readChatImages(json: unknown, max = IMAGE_MAX): GeneratedImage[] {
  const choices = (json as { choices?: unknown } | null)?.choices;
  if (!Array.isArray(choices)) return [];
  const out: GeneratedImage[] = [];
  for (const choice of choices) {
    const images = (choice as { message?: { images?: unknown } } | null)?.message?.images;
    if (!Array.isArray(images)) continue;
    for (const item of images) {
      if (out.length >= max) return out;
      const url = (item as { image_url?: { url?: unknown } } | null)?.image_url?.url;
      const match = typeof url === "string" ? /^data:image\/(?:png|jpeg|webp);base64,(.+)$/.exec(url) : null;
      const bytes = match ? decodeBase64(match[1]) : null;
      const mime = bytes && sniffImage(bytes);
      if (bytes && mime) out.push({ mime, data: bytes });
    }
  }
  return out;
}

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
export async function generateImages(
  config: AiConfig,
  model: string,
  prompt: string,
  count: number,
  subject: ImageSubject,
  signal?: AbortSignal,
  refs: readonly ReferenceImage[] = [],
): Promise<GeneratedImage[]> {
  const { AiError } = await import("./providers");
  const withRefs = refs.length > 0 && !/^dall-e/i.test(model);
  if (withRefs && config.provider === "openrouter") {
    // Une image par réponse : autant de requêtes que d'images demandées, en même temps.
    const replies = await Promise.all(Array.from({ length: clampCount(count) }, () => send(referenceRequest(config, model, prompt, 1, subject, refs), false, signal, IMAGE_TIMEOUT_MS)));
    const images = replies.flatMap((r) => readChatImages(r, 1)).slice(0, clampCount(count));
    if (images.length === 0) throw new AiError("empty");
    return images;
  }
  const request = withRefs ? referenceRequest(config, model, prompt, count, subject, refs) : imageRequest(config, model, prompt, count, subject);
  const items = readImages(await send(request, false, signal, IMAGE_TIMEOUT_MS), clampCount(count));
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

/** Valeur de la marque : « openai, gpt-image-2.6-flare ». */
export const iaImageSource = (provider: string, model: string) => [oneLine(provider), oneLine(model)].filter(Boolean).join(", ");

/** Service et modèle lus dans une marque, pour l'affichage (le service par son nom). */
export function readIaImageSource(value: string, providerNames: Record<string, string>): string {
  const [provider, ...rest] = value.split(", ");
  const model = rest.join(", ");
  return [providerNames[provider] ?? provider, model].filter(Boolean).join(", ");
}

/** Nombre d'images générées que les cartes portent encore (fenêtre Statistiques). */
export const iaImageCount = (cards: Pick<CardData, "image" | "images" | "iaImages">[]) => cards.reduce((sum, c) => sum + Object.keys(iaImagesOf(c) ?? {}).length, 0);
