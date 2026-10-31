// Lire une page web : titre, site, auteur, date et image d'une source. Dans l'app, la requête passe par le
// plugin HTTP de Tauri (pas de CORS) ; dans le navigateur, la plupart des sites refusent, et la carte
// garde simplement le nom du site. Seule l'adresse que l'auteur a collée est lue, rien d'autre.

import { isTauri } from "./platform";
import { pageInfo } from "./research";

const TIMEOUT_MS = 20_000;
const MAX_BYTES = 2_000_000;

/**
 * Texte d'une réponse, au plus `max` octets : la lecture s'arrête dès qu'ils sont là (une page énorme
 * n'est pas lue en entier). Sans corps lisible en flux, tout est lu puis coupé.
 */
export async function readText(response: Response, max: number): Promise<string> {
  const reader = response.body?.getReader?.();
  if (!reader) return (await response.text()).slice(0, max);
  const decoder = new TextDecoder();
  let out = "";
  let size = 0;
  while (size < max) {
    const { done, value } = await reader.read();
    if (done) break;
    const chunk = value.byteLength > max - size ? value.subarray(0, max - size) : value;
    size += chunk.byteLength;
    out += decoder.decode(chunk, { stream: true });
  }
  if (size >= max) void reader.cancel().catch(() => {});
  return out + decoder.decode();
}

export async function readPage(url: string): Promise<ReturnType<typeof pageInfo>> {
  if (!/^https?:\/\//i.test(url)) throw new Error("adresse");
  const doFetch: typeof fetch = isTauri() ? ((await import("@tauri-apps/plugin-http")).fetch as typeof fetch) : fetch;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await doFetch(url, { method: "GET", headers: { accept: "text/html" }, signal: controller.signal });
    if (!response.ok) throw new Error(String(response.status));
    const html = await readText(response, MAX_BYTES);
    return pageInfo(html, url);
  } finally {
    clearTimeout(timer);
  }
}

const MAX_IMAGE = 5_000_000;
const IMAGE_TYPES: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/gif": "gif" };

/** Image d'une page (og:image) : le fichier, s'il s'agit d'une vraie image de taille raisonnable. */
export async function fetchImage(url: string): Promise<{ name: string; data: Uint8Array } | null> {
  if (!/^https?:\/\//i.test(url)) return null;
  const doFetch: typeof fetch = isTauri() ? ((await import("@tauri-apps/plugin-http")).fetch as typeof fetch) : fetch;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await doFetch(url, { method: "GET", headers: { accept: "image/*" }, signal: controller.signal });
    if (!response.ok) return null;
    const type = (response.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
    const ext = IMAGE_TYPES[type];
    if (!ext) return null;
    const data = new Uint8Array(await response.arrayBuffer());
    if (data.byteLength === 0 || data.byteLength > MAX_IMAGE) return null;
    return { name: `page.${ext}`, data };
  } finally {
    clearTimeout(timer);
  }
}
