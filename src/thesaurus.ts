// Dictionnaire de synonymes (#16). Fonctions pures : le mot sous le curseur, ses formes de base possibles, la
// recherche et la casse du remplaçant. Les données ne sont pas dans l'installeur (licence LGPL du thésaurus,
// option 2 de docs/plan-synonymes.md) : elles sont téléchargées une fois depuis mondowrite.app/thesaurus/
// (fabriquées par scripts/thesaurus/build.mjs), vérifiées par leur empreinte SHA-256, gardées sur l'appareil
// (IndexedDB) et relues de là ensuite, hors ligne.

import { isTauri } from "./platform";

/** Un tableau par sens, du plus courant au plus rare. */
export type ThesaurusData = Record<string, string[][]>;

/** Langues pour lesquelles un dictionnaire est livré. */
export const THESAURUS_LANGS = ["fr"] as const;
export type ThesaurusLang = (typeof THESAURUS_LANGS)[number];

export const hasThesaurus = (lang: string): lang is ThesaurusLang => (THESAURUS_LANGS as readonly string[]).includes(lang.split("-")[0]);

const LETTER = /[\p{L}\p{M}'’-]/u;

/** Bornes du mot qui contient `offset` dans `text` (le curseur peut être collé à ses bords), ou null. */
export function wordBounds(text: string, offset: number): { from: number; to: number } | null {
  let from = Math.min(Math.max(offset, 0), text.length);
  let to = from;
  while (from > 0 && LETTER.test(text[from - 1])) from--;
  while (to < text.length && LETTER.test(text[to])) to++;
  // Tirets et apostrophes de bord ne font pas partie du mot.
  while (from < to && /['’-]/.test(text[from])) from++;
  while (to > from && /['’-]/.test(text[to - 1])) to--;
  return from < to ? { from, to } : null;
}

/** Formes à chercher dans le dictionnaire, de la plus probable à la moins probable (français : pluriels, féminins, verbes conjugués). */
export function candidates(word: string, lang: string): string[] {
  const w = word.toLowerCase().replace(/’/g, "'");
  const out = [w];
  if (lang.split("-")[0] === "fr") {
    const add = (x: string) => x.length > 2 && out.push(x);
    // Verbes : participes, présent, imparfait, futur, conditionnel, subjonctif, passé simple (cas réguliers).
    const er: Array<[string, string]> = [["ées", "er"], ["ée", "er"], ["és", "er"], ["é", "er"], ["aient", "er"], ["ais", "er"], ["ait", "er"], ["ons", "er"], ["ez", "er"], ["ent", "er"], ["es", "er"], ["e", "er"], ["ant", "er"], ["erons", "er"], ["erez", "er"], ["eront", "er"], ["erai", "er"], ["eras", "er"], ["era", "er"], ["erais", "er"], ["erait", "er"], ["èrent", "er"], ["a", "er"], ["as", "er"]];
    const ir: Array<[string, string]> = [["issent", "ir"], ["issons", "ir"], ["issez", "ir"], ["issait", "ir"], ["issant", "ir"], ["it", "ir"], ["is", "ir"], ["ie", "ir"], ["ies", "ir"], ["ira", "ir"], ["iront", "ir"]];
    // Noms et adjectifs : pluriel, féminin.
    const nouns: Array<[string, string]> = [["aux", "al"], ["eaux", "eau"], ["euses", "eux"], ["euse", "eux"], ["ives", "if"], ["ive", "if"], ["ères", "er"], ["ère", "er"], ["trices", "teur"], ["trice", "teur"], ["ennes", "en"], ["enne", "en"], ["elles", "el"], ["elle", "el"], ["ettes", "et"], ["ette", "et"], ["ées", "é"], ["ée", "é"], ["es", ""], ["e", ""], ["s", ""], ["x", ""]];
    for (const [suffix, to] of nouns) if (w.endsWith(suffix)) add(w.slice(0, -suffix.length) + to);
    for (const [suffix, to] of er) if (w.endsWith(suffix)) add(w.slice(0, -suffix.length) + to);
    for (const [suffix, to] of ir) if (w.endsWith(suffix)) add(w.slice(0, -suffix.length) + to);
    // Verbes en -re : prend, prennent, vend…
    if (/(d|ds|dent|dons|dez|dait|daient)$/.test(w)) add(w.replace(/(ds|dent|dons|dez|dait|daient|d)$/, "dre"));
    // Élision : « l'amie », « qu'elle » : on cherche le mot après l'apostrophe (wordBounds le garde déjà seul).
    const apostrophe = w.lastIndexOf("'");
    if (apostrophe >= 0) out.unshift(w.slice(apostrophe + 1));
  }
  return [...new Set(out)];
}

export interface Lookup {
  /** Forme trouvée dans le dictionnaire. */
  lemma: string;
  senses: string[][];
}

export function lookup(data: ThesaurusData, word: string, lang: string): Lookup | null {
  for (const c of candidates(word, lang)) {
    const senses = Object.prototype.hasOwnProperty.call(data, c) ? data[c] : undefined;
    if (senses?.length) return { lemma: c, senses };
  }
  return null;
}

/** Le remplaçant reprend la casse du mot : « Walk » → « Stroll », « WALK » → « STROLL », « walk » → « stroll ». */
export function matchCase(original: string, replacement: string): string {
  const letters = [...original].filter((c) => c.toLowerCase() !== c.toUpperCase());
  if (letters.length > 1 && letters.every((c) => c === c.toUpperCase())) return replacement.toUpperCase();
  const first = original[0];
  if (first && first.toLowerCase() !== first.toUpperCase() && first === first.toUpperCase()) return replacement.charAt(0).toUpperCase() + replacement.slice(1);
  return replacement;
}

/** Adresse des données, sur le site de MondoWrite (seule origine acceptée). */
export const THESAURUS_ORIGIN = "https://mondowrite.app";
export const THESAURUS_URL = `${THESAURUS_ORIGIN}/thesaurus/thesaurus.json`;
/** Taille maximale d'un dictionnaire : au-delà, le téléchargement est refusé. */
export const THESAURUS_MAX_BYTES = 20_000_000;
const TIMEOUT_MS = 2 * 60_000;

export interface ThesaurusEntry {
  lang: string;
  url: string;
  size: number;
  sha256: string;
}

/** Liste lue sur le site : seules les entrées complètes et sûres (sur le site, https, empreinte SHA-256, taille bornée) sont gardées. */
export function readManifest(raw: unknown, base = THESAURUS_URL): ThesaurusEntry[] {
  const list = raw && typeof raw === "object" && Array.isArray((raw as { thesaurus?: unknown }).thesaurus) ? (raw as { thesaurus: unknown[] }).thesaurus : [];
  const out: ThesaurusEntry[] = [];
  for (const item of list.slice(0, 20)) {
    if (!item || typeof item !== "object") continue;
    const o = item as Record<string, unknown>;
    const lang = typeof o.lang === "string" ? o.lang.toLowerCase() : "";
    const sha256 = typeof o.sha256 === "string" ? o.sha256.toLowerCase() : "";
    const size = typeof o.size === "number" && Number.isFinite(o.size) ? Math.round(o.size) : 0;
    let url = "";
    try {
      const u = new URL(typeof o.file === "string" ? o.file : "", base);
      if (u.origin === THESAURUS_ORIGIN && u.protocol === "https:" && u.pathname.endsWith(".json")) url = u.href;
    } catch {
      /* adresse illisible : entrée écartée */
    }
    if (!/^[a-z]{2,3}$/.test(lang) || !url || !/^[0-9a-f]{64}$/.test(sha256) || size <= 0 || size > THESAURUS_MAX_BYTES) continue;
    out.push({ lang, url, size, sha256 });
  }
  return out;
}

/** Lit des données téléchargées : un objet « mot → tableaux de synonymes », rien d'autre. */
export function readData(raw: unknown): ThesaurusData {
  const out: ThesaurusData = Object.create(null);
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return out;
  for (const [word, senses] of Object.entries(raw as Record<string, unknown>)) {
    if (!Array.isArray(senses)) continue;
    const groups = senses.filter((g): g is string[] => Array.isArray(g)).map((g) => g.filter((w): w is string => typeof w === "string"));
    const kept = groups.filter((g) => g.length);
    if (kept.length) out[word] = kept;
  }
  return out;
}

export class ThesaurusError extends Error {
  constructor(readonly reason: "network" | "size" | "checksum") {
    super(reason);
  }
}

async function sha256Hex(data: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", data as BufferSource);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

// Copie sur l'appareil : IndexedDB (marche dans l'app Tauri comme dans le navigateur). Une copie ne sert que si
// son empreinte est celle annoncée par la liste du site ; la relire ne demande aucun réseau.
const DB = "mondowrite-thesaurus";
function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore("data");
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
async function stored(lang: string): Promise<{ sha256: string; text: string } | null> {
  try {
    const db = await openDb();
    return await new Promise((resolve) => {
      const req = db.transaction("data").objectStore("data").get(lang);
      req.onsuccess = () => resolve((req.result as { sha256: string; text: string } | undefined) ?? null);
      req.onerror = () => resolve(null);
    });
  } catch {
    return null;
  }
}
async function keep(lang: string, value: { sha256: string; text: string }): Promise<void> {
  try {
    const db = await openDb();
    await new Promise<void>((resolve) => {
      const tx = db.transaction("data", "readwrite");
      tx.objectStore("data").put(value, lang);
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

async function download(entry: ThesaurusEntry): Promise<string> {
  const get = await doFetch();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await get(entry.url, { method: "GET", signal: controller.signal });
    if (!response.ok) throw new ThesaurusError("network");
    const data = new Uint8Array(await response.arrayBuffer());
    if (data.length > THESAURUS_MAX_BYTES) throw new ThesaurusError("size");
    if ((await sha256Hex(data)) !== entry.sha256) throw new ThesaurusError("checksum");
    return new TextDecoder().decode(data);
  } catch (err) {
    throw err instanceof ThesaurusError ? err : new ThesaurusError("network");
  } finally {
    clearTimeout(timer);
  }
}

async function fetchManifest(): Promise<ThesaurusEntry[]> {
  const get = await doFetch();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15_000);
  try {
    const response = await get(THESAURUS_URL, { method: "GET", headers: { accept: "application/json" }, signal: controller.signal, cache: "no-store" });
    if (!response.ok) throw new Error(String(response.status));
    return readManifest(await response.json());
  } finally {
    clearTimeout(timer);
  }
}

const loaded = new Map<string, Promise<ThesaurusData>>();

/**
 * Charge le dictionnaire d'une langue (une fois par session). Copie de l'appareil d'abord (hors ligne) ; sinon
 * téléchargement depuis le site, vérifié, puis gardé. Rejette si la langue n'en a pas ou si le réseau manque
 * la première fois.
 */
export function loadThesaurus(lang: string): Promise<ThesaurusData> {
  const key = lang.split("-")[0];
  if (!hasThesaurus(key)) return Promise.reject(new Error("no-thesaurus"));
  let p = loaded.get(key);
  if (!p) {
    p = (async () => {
      const copy = await stored(key);
      if (copy) {
        try {
          return readData(JSON.parse(copy.text));
        } catch {
          /* copie abîmée : on retélécharge */
        }
      }
      const entry = (await fetchManifest()).find((e) => e.lang === key);
      if (!entry) throw new ThesaurusError("network");
      const text = await download(entry);
      const data = readData(JSON.parse(text));
      await keep(key, { sha256: entry.sha256, text });
      return data;
    })();
    p.catch(() => loaded.delete(key));
    loaded.set(key, p);
  }
  return p;
}
