// Recherche de photos libres pour le canevas et les galeries : Openverse (sans clé, images sous licence
// libre), Pixabay et Unsplash (clé gratuite de l'auteur, propre à l'appareil, jamais dans le projet).
// Dans l'app, les requêtes passent par le plugin HTTP de Tauri (pas de CORS) ; dans le navigateur, par fetch.
// Les réponses ne sont jamais crues sur parole : chaque source a son lecteur (`parse…`), qui ne garde que
// des adresses https aux hôtes attendus pour ce qui s'affiche (vignettes, dans `img-src` de la CSP).

import { isTauri } from "./platform";

export type PhotoSourceId = "openverse" | "pixabay" | "unsplash";
export const PHOTO_SOURCES: readonly PhotoSourceId[] = ["openverse", "pixabay", "unsplash"];

export interface PhotoSourceInfo {
  /** Nom propre de la source (ne se traduit pas). */
  name: string;
  /** Une clé de l'auteur est nécessaire. */
  needsKey: boolean;
  /** Page du site (crédit en pied de la recherche). */
  site: string;
  /** Page où l'auteur crée sa clé. */
  keyPage?: string;
}

export const SOURCE_INFO: Record<PhotoSourceId, PhotoSourceInfo> = {
  openverse: { name: "Openverse", needsKey: false, site: "https://openverse.org" },
  pixabay: { name: "Pixabay", needsKey: true, site: "https://pixabay.com", keyPage: "https://pixabay.com/api/docs/" },
  unsplash: { name: "Unsplash", needsKey: true, site: "https://unsplash.com", keyPage: "https://unsplash.com/oauth/applications" },
};

export interface Photo {
  source: PhotoSourceId;
  id: string;
  /** Page de la photo (crédit et licence). */
  page: string;
  author: string;
  alt: string;
  /** Vignette de la grille de résultats. */
  thumb: string;
  /** Adresses à télécharger, dans l'ordre (la suivante si la précédente échoue). */
  downloads: string[];
  /** Ce qui va dans « Publication » de la fiche : source, et licence s'il y en a une. */
  credit: string;
  /** Unsplash : adresse à appeler quand la photo est choisie (exigé par leurs règles). */
  track?: string;
}

export interface PhotoPage {
  photos: Photo[];
  total: number;
  /** Une page suivante existe. */
  more: boolean;
}

export type PhotoError = "key" | "limit" | "network";

export const PER_PAGE = 20;

const httpsOn = (value: unknown, host: RegExp): value is string => {
  if (typeof value !== "string") return false;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && host.test(url.hostname);
  } catch {
    return false;
  }
};
const ANY = /./;
const OPENVERSE_API = /^api\.openverse\.org$/;
const PIXABAY = /^(cdn\.)?pixabay\.com$/;
const PIXABAY_SITE = /^pixabay\.com$/;
const UNSPLASH_IMAGES = /^(images|plus)\.unsplash\.com$/;
const UNSPLASH_SITE = /^unsplash\.com$/;
const UNSPLASH_API = /^api\.unsplash\.com$/;

const record = (raw: unknown): Record<string, unknown> => (raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {});
const text = (value: unknown, max: number) => (typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, max) : "");
const capitalize = (s: string) => (s ? s[0].toUpperCase() + s.slice(1) : s);

/** Licence Creative Commons lisible : « by-sa » + « 2.0 » → « CC BY-SA 2.0 ». */
export function licenseName(license: unknown, version: unknown): string {
  const key = text(license, 20).toLowerCase();
  if (!/^[a-z0-9-]+$/.test(key)) return "";
  const v = text(version, 10);
  if (key === "pdm") return "Public Domain Mark";
  if (key === "cc0") return `CC0${v ? ` ${v}` : ""}`;
  return `CC ${key.toUpperCase()}${v && /^[0-9.]+$/.test(v) ? ` ${v}` : ""}`;
}

/** Openverse, /v1/images/ : vignette par le proxy d'Openverse, image d'origine (n'importe quel hôte https) puis vignette. */
export function parseOpenverse(raw: unknown): PhotoPage {
  const data = record(raw);
  const list = Array.isArray(data.results) ? data.results : [];
  const photos: Photo[] = [];
  for (const item of list) {
    const p = record(item);
    const id = text(p.id, 80);
    if (!id || !httpsOn(p.thumbnail, OPENVERSE_API)) continue;
    const origin = text(p.source, 40) || text(p.provider, 40);
    const license = licenseName(p.license, p.license_version);
    photos.push({
      source: "openverse",
      id,
      page: httpsOn(p.foreign_landing_url, ANY) ? p.foreign_landing_url : `https://openverse.org/image/${encodeURIComponent(id)}`,
      author: text(p.creator, 120),
      alt: text(p.title, 300),
      thumb: p.thumbnail,
      downloads: [...(httpsOn(p.url, ANY) ? [p.url] : []), p.thumbnail],
      credit: [origin ? `${capitalize(origin)} via Openverse` : "Openverse", license].filter(Boolean).join(", "),
    });
  }
  const total = typeof data.result_count === "number" ? data.result_count : photos.length;
  const page = typeof data.page === "number" ? data.page : 1;
  const pages = typeof data.page_count === "number" ? data.page_count : page;
  return { photos, total, more: page < pages };
}

/** Pixabay, /api/ : la vignette 640 px s'affiche, la grande image est téléchargée (Pixabay demande de copier, pas de lier). */
export function parsePixabay(raw: unknown, page = 1): PhotoPage {
  const data = record(raw);
  const list = Array.isArray(data.hits) ? data.hits : [];
  const photos: Photo[] = [];
  for (const item of list) {
    const p = record(item);
    if (typeof p.id !== "number") continue;
    const thumb = httpsOn(p.webformatURL, PIXABAY) ? p.webformatURL : httpsOn(p.previewURL, PIXABAY) ? p.previewURL : null;
    if (!thumb) continue;
    const big = httpsOn(p.largeImageURL, PIXABAY) ? [p.largeImageURL] : [];
    photos.push({
      source: "pixabay",
      id: String(p.id),
      page: httpsOn(p.pageURL, PIXABAY_SITE) ? p.pageURL : `https://pixabay.com/photos/id-${p.id}/`,
      author: text(p.user, 120),
      alt: text(p.tags, 300),
      thumb,
      downloads: [...big, thumb],
      credit: "Pixabay",
    });
  }
  // L'API ne sert jamais plus de `totalHits` résultats, même si `total` est plus grand.
  const hits = typeof data.totalHits === "number" ? data.totalHits : photos.length;
  return { photos, total: typeof data.total === "number" ? data.total : hits, more: page * PER_PAGE < hits };
}

/** Lien vers Unsplash avec la mention de l'app, comme le demandent leurs règles d'attribution. */
const utm = (url: string) => `${url}${url.includes("?") ? "&" : "?"}utm_source=cosmos&utm_medium=referral`;

/** Unsplash, /search/photos : vignette « small », image « regular » (1080 px), appel de suivi au choix. */
export function parseUnsplash(raw: unknown, page = 1): PhotoPage {
  const data = record(raw);
  const list = Array.isArray(data.results) ? data.results : [];
  const photos: Photo[] = [];
  for (const item of list) {
    const p = record(item);
    const id = text(p.id, 40);
    const urls = record(p.urls);
    const links = record(p.links);
    const user = record(p.user);
    const thumb = httpsOn(urls.small, UNSPLASH_IMAGES) ? urls.small : httpsOn(urls.thumb, UNSPLASH_IMAGES) ? urls.thumb : null;
    if (!id || !thumb) continue;
    const big = httpsOn(urls.regular, UNSPLASH_IMAGES) ? [urls.regular] : [];
    photos.push({
      source: "unsplash",
      id,
      page: utm(httpsOn(links.html, UNSPLASH_SITE) ? links.html : `https://unsplash.com/photos/${encodeURIComponent(id)}`),
      author: text(user.name, 120),
      alt: text(p.alt_description, 300) || text(p.description, 300),
      thumb,
      downloads: [...big, thumb],
      credit: "Unsplash",
      ...(httpsOn(links.download_location, UNSPLASH_API) ? { track: links.download_location } : {}),
    });
  }
  const pages = typeof data.total_pages === "number" ? data.total_pages : page;
  return { photos, total: typeof data.total === "number" ? data.total : photos.length, more: page < pages };
}

/** Langue de recherche pour la langue de l'interface (les mots-clés de l'auteur sont dans sa langue). */
export const searchLang = (lang: string) => (/^[a-z]{2}$/.test(lang) ? lang : "en");

/**
 * Nom envoyé aux services par le plugin HTTP : Openverse demande aux applications de s'identifier, et son pare-feu
 * refuse des requêtes anonymes (l'app iPhone recevait une erreur là où le Mac passait).
 */
export const APP_AGENT = "MondoWrite (+https://github.com/sebastienpiconnier/MondoWrite)";

/**
 * Openverse accepte les appels d'une page web (CORS ouvert) : dans l'app, on passe d'abord par le navigateur
 * intégré (même client que Safari, adresse permise par `connect-src`), puis par le plugin HTTP s'il refuse.
 */
export const viaWebView = (url: string) => httpsOn(url, OPENVERSE_API);

async function call(url: string, headers: Record<string, string>): Promise<Response> {
  const tauri = isTauri();
  // Sans réponse au bout de 20 s, on abandonne : la recherche ne reste pas suspendue.
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20_000);
  try {
    if (tauri && viaWebView(url)) {
      const direct = await fetch(url, { method: "GET", headers, signal: controller.signal }).catch(() => null);
      if (direct && direct.status !== 401 && direct.status !== 403) return direct;
    }
    const doFetch: typeof fetch = tauri ? ((await import("@tauri-apps/plugin-http")).fetch as typeof fetch) : fetch;
    return await doFetch(url, { method: "GET", headers: tauri ? { ...headers, "user-agent": APP_AGENT } : headers, signal: controller.signal });
  } catch {
    throw new Error("network" satisfies PhotoError);
  } finally {
    clearTimeout(timer);
  }
}

/** Erreur commune à partir du statut HTTP. Unsplash répond 403 quand la limite horaire est atteinte. */
export function statusError(source: PhotoSourceId, status: number, remaining: string | null): PhotoError | null {
  if (status >= 200 && status < 300) return null;
  if (status === 429) return "limit";
  if (source === "unsplash" && status === 403 && remaining === "0") return "limit";
  if (status === 401 || status === 403) return source === "openverse" ? "limit" : "key";
  // Pixabay répond 400 à une clé invalide (« Invalid or missing API key »).
  if (source === "pixabay" && status === 400) return "key";
  return "network";
}

/** Une page de résultats. Lève une erreur dont le message est un PhotoError. */
export async function searchPhotos(source: PhotoSourceId, key: string, query: string, page: number, lang: string): Promise<PhotoPage> {
  const q = query.trim().slice(0, 100);
  let url: string;
  let headers: Record<string, string> = { accept: "application/json" };
  if (source === "openverse") {
    url = `https://api.openverse.org/v1/images/?${new URLSearchParams({ q, page: String(page), page_size: String(PER_PAGE), mature: "false" })}`;
  } else if (source === "pixabay") {
    url = `https://pixabay.com/api/?${new URLSearchParams({ key, q, page: String(page), per_page: String(PER_PAGE), image_type: "photo", safesearch: "true", lang: searchLang(lang) })}`;
  } else {
    url = `https://api.unsplash.com/search/photos?${new URLSearchParams({ query: q, page: String(page), per_page: String(PER_PAGE), content_filter: "high", lang: searchLang(lang) })}`;
    headers = { ...headers, Authorization: `Client-ID ${key}`, "Accept-Version": "v1" };
  }
  const response = await call(url, headers);
  const error = statusError(source, response.status, response.headers.get("x-ratelimit-remaining"));
  if (error) throw new Error(error);
  const json: unknown = await response.json().catch(() => null);
  return source === "openverse" ? parseOpenverse(json) : source === "pixabay" ? parsePixabay(json, page) : parseUnsplash(json, page);
}

/** Unsplash demande d'appeler `download_location` quand une photo est utilisée. Sans effet pour les autres. */
export async function trackChoice(photo: Photo, key: string): Promise<void> {
  if (photo.source !== "unsplash" || !photo.track || !key) return;
  try {
    await call(photo.track, { Authorization: `Client-ID ${key}`, "Accept-Version": "v1" });
  } catch {
    // Le suivi ne doit jamais empêcher d'ajouter la photo.
  }
}
