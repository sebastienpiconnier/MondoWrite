// Agrandisseur d'images sur l'appareil (#78, lot 4, docs/plan-couverture-kdp.md) : Real-ESRGAN compact
// (realesr-general-x4v3, licence BSD 3 clauses) exécuté par onnxruntime-web (MIT), WebGPU si l'appareil l'a,
// sinon WebAssembly. Ni le modèle (4,9 Mo) ni le moteur WebAssembly (29 Mo) ne sont dans l'installeur : ils sont
// téléchargés à la première utilisation depuis mondowrite.app (liste upscaler.json, fabriquée par
// scripts/upscaler/), vérifiés par leur empreinte SHA-256 et gardés sur l'appareil (IndexedDB), comme les
// synonymes. L'image est découpée en tuiles avec une marge (le réseau voit 33 pixels autour de chacun), chaque
// tuile agrandie ×4 dans un worker (upscaleWorker.ts), puis réduite ×2 : le résultat fait deux fois la taille
// d'origine, assez pour imprimer tous les formats proposés à 300 DPI. Rien ne part de l'appareil.

import { isTauri } from "./platform";

export const UPSCALER_ORIGIN = "https://mondowrite.app";
export const UPSCALER_URL = `${UPSCALER_ORIGIN}/upscaler/upscaler.json`;
/** Version d'onnxruntime-web embarquée : le moteur WebAssembly téléchargé doit être exactement le même. */
export const ORT_VERSION = "1.31.1";
/** Plus gros fichier accepté. */
export const UPSCALER_MAX_BYTES = 60_000_000;
/** Agrandissement du modèle, puis du résultat gardé. */
export const MODEL_SCALE = 4;
export const OUTPUT_SCALE = 2;
/** Côté d'une tuile (pixels d'origine) et marge lue autour, que le réseau a besoin de voir. */
export const TILE = 192;
export const TILE_PAD = 24;
/** Plus grande image acceptée (côté le plus long, pixels d'origine) : au-delà, elle n'a pas besoin d'être agrandie. */
export const MAX_SIDE = 4096;

const TIMEOUT_MS = 180_000;

export interface UpscalerFile {
  url: string;
  size: number;
  sha256: string;
}
export interface UpscalerManifest {
  model: UpscalerFile;
  /** Moteur WebAssembly d'onnxruntime-web pour cette version de l'app (ORT_VERSION). */
  runtime: UpscalerFile;
}

function readFile(raw: unknown, base: string, ext: string): UpscalerFile | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const sha256 = typeof o.sha256 === "string" ? o.sha256.toLowerCase() : "";
  const size = typeof o.size === "number" && Number.isFinite(o.size) ? o.size : 0;
  let url = "";
  try {
    const u = new URL(String(o.file ?? ""), base);
    if (u.origin === UPSCALER_ORIGIN && u.protocol === "https:" && u.pathname.endsWith(ext)) url = u.href;
  } catch {
    /* adresse illisible */
  }
  if (!url || !/^[0-9a-f]{64}$/.test(sha256) || size <= 0 || size > UPSCALER_MAX_BYTES) return null;
  return { url, size, sha256 };
}

/** Liste lue sur le site : le modèle et le moteur de cette version, sur le site, en https, empreinte et taille bornée. */
export function readUpscalerManifest(raw: unknown, version = ORT_VERSION, base = UPSCALER_URL): UpscalerManifest | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const model = readFile(o.model, base, ".onnx");
  const runtimes = o.runtime && typeof o.runtime === "object" ? (o.runtime as Record<string, unknown>) : {};
  const runtime = readFile(runtimes[version], base, ".wasm");
  return model && runtime ? { model, runtime } : null;
}

/** Une tuile : la partie gardée (x, y, w, h) et la partie lue, marge comprise (sx, sy, sw, sh), en pixels d'origine. */
export interface Tile {
  x: number;
  y: number;
  w: number;
  h: number;
  sx: number;
  sy: number;
  sw: number;
  sh: number;
}

/** Découpage d'une image en tuiles qui la couvrent sans se chevaucher, chacune lue avec sa marge. */
export function tileGrid(width: number, height: number, tile = TILE, pad = TILE_PAD): Tile[] {
  const out: Tile[] = [];
  for (let y = 0; y < height; y += tile)
    for (let x = 0; x < width; x += tile) {
      const w = Math.min(tile, width - x);
      const h = Math.min(tile, height - y);
      const sx = Math.max(0, x - pad);
      const sy = Math.max(0, y - pad);
      out.push({ x, y, w, h, sx, sy, sw: Math.min(width, x + w + pad) - sx, sh: Math.min(height, y + h + pad) - sy });
    }
  return out;
}

/** RGBA (0 à 255) → tenseur CHW (0 à 1) que le modèle attend. */
export function toPlanar(rgba: Uint8ClampedArray, width: number, height: number): Float32Array {
  const n = width * height;
  const out = new Float32Array(3 * n);
  for (let i = 0; i < n; i++) {
    out[i] = rgba[i * 4] / 255;
    out[n + i] = rgba[i * 4 + 1] / 255;
    out[2 * n + i] = rgba[i * 4 + 2] / 255;
  }
  return out;
}

/** Tenseur CHW rendu par le modèle → RGBA opaque, en gardant seulement la fenêtre demandée. */
export function fromPlanar(data: Float32Array, width: number, height: number, crop: { x: number; y: number; w: number; h: number }): Uint8ClampedArray {
  const n = width * height;
  const out = new Uint8ClampedArray(crop.w * crop.h * 4);
  for (let y = 0; y < crop.h; y++)
    for (let x = 0; x < crop.w; x++) {
      const i = (crop.y + y) * width + crop.x + x;
      const o = (y * crop.w + x) * 4;
      out[o] = Math.round(data[i] * 255);
      out[o + 1] = Math.round(data[n + i] * 255);
      out[o + 2] = Math.round(data[2 * n + i] * 255);
      out[o + 3] = 255;
    }
  return out;
}

export class UpscaleError extends Error {
  constructor(readonly reason: "network" | "size" | "checksum" | "runtime" | "tooBig" | "cancelled") {
    super(reason);
  }
}

async function sha256Hex(data: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", data as BufferSource);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

// Copie sur l'appareil, rangée par empreinte : une copie ne sert que si la liste du site annonce cette empreinte.
const DB = "mondowrite-upscaler";
function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore("files");
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
async function stored(sha256: string): Promise<ArrayBuffer | null> {
  try {
    const db = await openDb();
    return await new Promise((resolve) => {
      const req = db.transaction("files").objectStore("files").get(sha256);
      req.onsuccess = () => resolve((req.result as ArrayBuffer | undefined) ?? null);
      req.onerror = () => resolve(null);
    });
  } catch {
    return null;
  }
}
async function keep(sha256: string, data: ArrayBuffer): Promise<void> {
  try {
    const db = await openDb();
    await new Promise<void>((resolve) => {
      const tx = db.transaction("files", "readwrite");
      tx.objectStore("files").put(data, sha256);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    });
  } catch {
    /* pas de copie : il faudra retélécharger la prochaine fois */
  }
}

async function doFetch(): Promise<typeof fetch> {
  return isTauri() ? ((await import("@tauri-apps/plugin-http")).fetch as typeof fetch) : fetch;
}

async function fetchManifest(signal?: AbortSignal): Promise<UpscalerManifest> {
  const get = await doFetch();
  try {
    const response = await get(UPSCALER_URL, { method: "GET", headers: { accept: "application/json" }, signal, cache: "no-store" });
    if (!response.ok) throw new Error(String(response.status));
    const manifest = readUpscalerManifest(await response.json());
    if (!manifest) throw new Error("manifest");
    return manifest;
  } catch {
    throw new UpscaleError(signal?.aborted ? "cancelled" : "network");
  }
}

/** Un fichier vérifié : copie de l'appareil si son empreinte est la bonne, sinon téléchargé puis gardé. */
async function fileBytes(file: UpscalerFile, signal?: AbortSignal): Promise<ArrayBuffer> {
  const copy = await stored(file.sha256);
  if (copy && (await sha256Hex(new Uint8Array(copy))) === file.sha256) return copy;
  const get = await doFetch();
  const controller = new AbortController();
  const stop = () => controller.abort();
  signal?.addEventListener("abort", stop);
  const timer = setTimeout(stop, TIMEOUT_MS);
  try {
    const response = await get(file.url, { method: "GET", signal: controller.signal });
    if (!response.ok) throw new UpscaleError("network");
    const data = await response.arrayBuffer();
    if (data.byteLength > UPSCALER_MAX_BYTES) throw new UpscaleError("size");
    if ((await sha256Hex(new Uint8Array(data))) !== file.sha256) throw new UpscaleError("checksum");
    await keep(file.sha256, data);
    return data;
  } catch (err) {
    if (signal?.aborted) throw new UpscaleError("cancelled");
    throw err instanceof UpscaleError ? err : new UpscaleError("network");
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", stop);
  }
}

export type UpscaleStep = { kind: "download" } | { kind: "start"; backend: string } | { kind: "tile"; done: number; total: number };

type WorkerReply = { type: "ready"; backend: string } | { type: "done"; id: number; data: Float32Array; width: number; height: number } | { type: "error"; message: string };

/**
 * Agrandit une image ×2 sur l'appareil. `onStep` suit le téléchargement (première fois) puis les tuiles ; `signal`
 * arrête tout (le worker est fermé). Rend un JPEG de qualité élevée.
 */
export async function upscaleImage(img: HTMLImageElement, onStep: (s: UpscaleStep) => void, signal?: AbortSignal): Promise<Blob> {
  const width = img.naturalWidth;
  const height = img.naturalHeight;
  if (!width || !height) throw new UpscaleError("runtime");
  if (Math.max(width, height) > MAX_SIDE) throw new UpscaleError("tooBig");
  onStep({ kind: "download" });
  const manifest = await fetchManifest(signal);
  const [model, runtime] = await Promise.all([fileBytes(manifest.model, signal), fileBytes(manifest.runtime, signal)]);
  if (signal?.aborted) throw new UpscaleError("cancelled");

  const source = document.createElement("canvas");
  source.width = width;
  source.height = height;
  const sctx = source.getContext("2d", { willReadFrequently: true });
  if (!sctx) throw new UpscaleError("runtime");
  sctx.drawImage(img, 0, 0);
  const out = document.createElement("canvas");
  out.width = width * OUTPUT_SCALE;
  out.height = height * OUTPUT_SCALE;
  const octx = out.getContext("2d");
  if (!octx) throw new UpscaleError("runtime");
  octx.imageSmoothingEnabled = true;
  octx.imageSmoothingQuality = "high";
  const piece = document.createElement("canvas");
  const pctx = piece.getContext("2d");
  if (!pctx) throw new UpscaleError("runtime");

  const worker = new Worker(new URL("./upscaleWorker.ts", import.meta.url), { type: "module" });
  const stop = () => worker.terminate();
  signal?.addEventListener("abort", stop);
  let next = 0;
  const waiting = new Map<number, { resolve: (r: WorkerReply & { type: "done" }) => void; reject: (e: Error) => void }>();
  let ready: { resolve: (backend: string) => void; reject: (e: Error) => void } | null = null;
  const fail = (e: Error) => {
    ready?.reject(e);
    for (const w of waiting.values()) w.reject(e);
    waiting.clear();
  };
  worker.onmessage = (e: MessageEvent<WorkerReply>) => {
    const m = e.data;
    if (m.type === "ready") ready?.resolve(m.backend);
    else if (m.type === "done") {
      waiting.get(m.id)?.resolve(m);
      waiting.delete(m.id);
    } else fail(new UpscaleError("runtime"));
  };
  worker.onerror = () => fail(new UpscaleError("runtime"));
  try {
    const backend = await new Promise<string>((resolve, reject) => {
      ready = { resolve, reject };
      worker.postMessage({ type: "init", model, runtime }, [model, runtime]);
    });
    onStep({ kind: "start", backend });
    const tiles = tileGrid(width, height);
    for (let i = 0; i < tiles.length; i++) {
      if (signal?.aborted) throw new UpscaleError("cancelled");
      const t = tiles[i];
      const input = toPlanar(sctx.getImageData(t.sx, t.sy, t.sw, t.sh).data, t.sw, t.sh);
      const id = next++;
      const reply = await new Promise<WorkerReply & { type: "done" }>((resolve, reject) => {
        waiting.set(id, { resolve, reject });
        worker.postMessage({ type: "run", id, data: input, width: t.sw, height: t.sh }, [input.buffer]);
      });
      const s = MODEL_SCALE;
      const rgba = fromPlanar(reply.data, reply.width, reply.height, { x: (t.x - t.sx) * s, y: (t.y - t.sy) * s, w: t.w * s, h: t.h * s });
      piece.width = t.w * s;
      piece.height = t.h * s;
      pctx.putImageData(new ImageData(rgba as Uint8ClampedArray<ArrayBuffer>, t.w * s, t.h * s), 0, 0);
      octx.drawImage(piece, t.x * OUTPUT_SCALE, t.y * OUTPUT_SCALE, t.w * OUTPUT_SCALE, t.h * OUTPUT_SCALE);
      onStep({ kind: "tile", done: i + 1, total: tiles.length });
    }
    const blob = await new Promise<Blob | null>((resolve) => out.toBlob(resolve, "image/jpeg", 0.95));
    if (!blob) throw new UpscaleError("runtime");
    return blob;
  } catch (err) {
    if (signal?.aborted) throw new UpscaleError("cancelled");
    throw err instanceof UpscaleError ? err : new UpscaleError("runtime");
  } finally {
    signal?.removeEventListener("abort", stop);
    worker.terminate();
  }
}
