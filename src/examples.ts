// Projets d'exemple à télécharger depuis le site de MondoWrite (octobre 2026). Le Petit Chaperon rouge reste
// dans l'app (demo.ts) ; les grands exemples illustrés (Monte-Cristo, Baskerville…) pèsent plusieurs Mo : ils
// vivent sur https://mondowrite.app/exemples/, décrits par une liste `exemples.json`. Ajouter ou corriger un
// exemple ne demande donc pas de nouvelle version de l'app.
//
// Le zip téléchargé est importé comme « Importer un projet (.zip) » (store.importZipData) : nouveau projet,
// jamais par-dessus un autre, noms de fichiers vérifiés. Avant cela, le fichier doit venir du site, ne pas
// dépasser MAX_BYTES et avoir l'empreinte SHA-256 annoncée par la liste.

import { create } from "zustand";
import { isTauri } from "./platform";
import { isNewer } from "./updates";

/** Liste des exemples, sur le site de MondoWrite. */
export const EXAMPLES_URL = "https://mondowrite.app/exemples/exemples.json";
/** Seule origine acceptée pour la liste, les zip et les images. */
export const EXAMPLES_ORIGIN = "https://mondowrite.app";
/** Taille maximale d'un exemple : au-delà, le téléchargement est refusé. */
export const MAX_BYTES = 60_000_000;
const LIST_TIMEOUT_MS = 15_000;
const ZIP_TIMEOUT_MS = 5 * 60_000;

export interface ExampleEntry {
  id: string;
  title: string;
  /** Une ligne : « Long métrage, 110 min », « Roman, 117 chapitres »… */
  subtitle: string;
  kind: "roman" | "scenario";
  /** Langue du projet (« fr », « en ») : les exemples de la langue de l'interface viennent d'abord. */
  lang: string;
  /** Adresse absolue du zip, sur le site. */
  url: string;
  size: number;
  sha256: string;
  /** Adresse absolue d'une petite image, ou "". */
  cover: string;
  /** Plus ancienne version de l'app qui sait l'ouvrir. */
  minVersion: string;
}

const text = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");

/** Adresse relative à la liste, gardée seulement si elle reste sur le site, en https. */
export function siteUrl(path: string, base = EXAMPLES_URL): string {
  try {
    const url = new URL(path, base);
    return url.origin === EXAMPLES_ORIGIN && url.protocol === "https:" ? url.href : "";
  } catch {
    return "";
  }
}

/**
 * Liste lue sur le site : seules les entrées complètes et sûres sont gardées (zip sur le site, empreinte
 * SHA-256 en hexadécimal, taille raisonnable). Une liste illisible donne une liste vide.
 */
export function readExamples(raw: unknown, base = EXAMPLES_URL): ExampleEntry[] {
  const list = raw && typeof raw === "object" && Array.isArray((raw as { examples?: unknown }).examples) ? (raw as { examples: unknown[] }).examples : [];
  const seen = new Set<string>();
  const out: ExampleEntry[] = [];
  for (const item of list.slice(0, 50)) {
    if (!item || typeof item !== "object") continue;
    const o = item as Record<string, unknown>;
    const id = text(o.id, 60);
    const kind = o.kind === "roman" || o.kind === "scenario" ? o.kind : null;
    const url = siteUrl(text(o.file, 300), base);
    const sha256 = text(o.sha256, 64).toLowerCase();
    const size = typeof o.size === "number" && Number.isFinite(o.size) ? Math.round(o.size) : 0;
    if (!/^[a-z0-9-]+$/.test(id) || seen.has(id) || !kind || !url.endsWith(".zip") || !/^[0-9a-f]{64}$/.test(sha256) || size <= 0 || size > MAX_BYTES) continue;
    seen.add(id);
    out.push({
      id,
      title: text(o.title, 120) || id,
      subtitle: text(o.subtitle, 160),
      kind,
      lang: text(o.lang, 10).toLowerCase(),
      url,
      size,
      sha256,
      cover: o.cover ? siteUrl(text(o.cover, 300), base) : "",
      minVersion: text(o.minVersion, 20),
    });
  }
  return out;
}

/** Exemples que cette version sait ouvrir, ceux de la langue de l'interface d'abord (ordre de la liste sinon). */
export function examplesFor(list: ExampleEntry[], lang: string, appVersion: string): ExampleEntry[] {
  const usable = list.filter((e) => !e.minVersion || !isNewer(e.minVersion, appVersion));
  return [...usable.filter((e) => e.lang === lang), ...usable.filter((e) => e.lang !== lang)];
}

/** Empreinte SHA-256 en hexadécimal. */
export async function sha256Hex(data: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", data as BufferSource);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function doFetch(): Promise<typeof fetch> {
  return isTauri() ? ((await import("@tauri-apps/plugin-http")).fetch as typeof fetch) : fetch;
}

/** La liste des exemples, sur le site (plugin HTTP de Tauri dans l'app : pas de CORS). */
export async function fetchExamples(): Promise<ExampleEntry[]> {
  const get = await doFetch();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), LIST_TIMEOUT_MS);
  try {
    const response = await get(EXAMPLES_URL, { method: "GET", headers: { accept: "application/json" }, signal: controller.signal, cache: "no-store" });
    if (!response.ok) throw new Error(String(response.status));
    return readExamples(await response.json());
  } finally {
    clearTimeout(timer);
  }
}

export class ExampleError extends Error {
  constructor(readonly reason: "network" | "size" | "checksum") {
    super(reason);
  }
}

/** Télécharge un exemple, vérifie sa taille et son empreinte. `onProgress` reçoit une part de 0 à 1. */
export async function downloadExample(entry: ExampleEntry, onProgress: (share: number) => void): Promise<Uint8Array> {
  if (!siteUrl(entry.url)) throw new ExampleError("network");
  const get = await doFetch();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ZIP_TIMEOUT_MS);
  let data: Uint8Array;
  try {
    const response = await get(entry.url, { method: "GET", signal: controller.signal });
    if (!response.ok) throw new ExampleError("network");
    const announced = Number(response.headers.get("content-length")) || entry.size;
    if (announced > MAX_BYTES) throw new ExampleError("size");
    const reader = response.body?.getReader();
    if (reader) {
      const chunks: Uint8Array[] = [];
      let received = 0;
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        received += value.length;
        if (received > MAX_BYTES) {
          controller.abort();
          throw new ExampleError("size");
        }
        chunks.push(value);
        onProgress(Math.min(1, received / announced));
      }
      data = new Uint8Array(received);
      let at = 0;
      for (const c of chunks) {
        data.set(c, at);
        at += c.length;
      }
    } else {
      data = new Uint8Array(await response.arrayBuffer());
      if (data.length > MAX_BYTES) throw new ExampleError("size");
    }
  } catch (err) {
    throw err instanceof ExampleError ? err : new ExampleError("network");
  } finally {
    clearTimeout(timer);
  }
  onProgress(1);
  if ((await sha256Hex(data)) !== entry.sha256) throw new ExampleError("checksum");
  return data;
}

/** État de l'écran d'accueil pour les exemples (affichage seulement, jamais enregistré). */
interface ExamplesState {
  status: "idle" | "loading" | "ready" | "offline";
  list: ExampleEntry[];
  /** Exemple en cours de téléchargement et sa progression (0 à 1). */
  busy: { id: string; share: number } | null;
  error: { id: string; reason: ExampleError["reason"] } | null;
}

export const useExamples = create<ExamplesState>(() => ({ status: "idle", list: [], busy: null, error: null }));

/** Charge la liste une fois par lancement (ou de nouveau après un échec). */
export async function loadExamples(): Promise<void> {
  const { status } = useExamples.getState();
  if (status === "loading" || status === "ready") return;
  useExamples.setState({ status: "loading" });
  try {
    useExamples.setState({ status: "ready", list: await fetchExamples() });
  } catch {
    useExamples.setState({ status: "offline", list: [] });
  }
}
