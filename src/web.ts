// Lire une page web : titre, site, auteur, date et image d'une source. Dans l'app, la requête passe par le
// plugin HTTP de Tauri (pas de CORS) ; dans le navigateur, la plupart des sites refusent, et la carte
// garde simplement le nom du site. Seule l'adresse que l'auteur a collée est lue, rien d'autre.

import { isTauri } from "./platform";
import { pageInfo } from "./research";
import { APP_AGENT, viaWebView } from "./imageSources";

const TIMEOUT_MS = 20_000;
const MAX_BYTES = 2_000_000;

export async function readPage(url: string): Promise<ReturnType<typeof pageInfo>> {
  if (!/^https?:\/\//i.test(url)) throw new Error("adresse");
  const doFetch: typeof fetch = isTauri() ? ((await import("@tauri-apps/plugin-http")).fetch as typeof fetch) : fetch;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await doFetch(url, { method: "GET", headers: { accept: "text/html" }, signal: controller.signal });
    if (!response.ok) throw new Error(String(response.status));
    const html = (await response.text()).slice(0, MAX_BYTES);
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
  const tauri = isTauri();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    // Vignette d'Openverse : par le navigateur intégré d'abord (voir imageSources.ts), sinon par le plugin HTTP.
    let response = tauri && viaWebView(url) ? await fetch(url, { method: "GET", headers: { accept: "image/*" }, signal: controller.signal }).catch(() => null) : null;
    if (!response?.ok) {
      const doFetch: typeof fetch = tauri ? ((await import("@tauri-apps/plugin-http")).fetch as typeof fetch) : fetch;
      response = await doFetch(url, { method: "GET", headers: tauri ? { accept: "image/*", "user-agent": APP_AGENT } : { accept: "image/*" }, signal: controller.signal });
    }
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
