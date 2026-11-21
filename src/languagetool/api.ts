// Vérification par LanguageTool (à la demande, jamais pendant la frappe) : un service au choix de l'auteur, l'API
// publique gratuite, son compte Premium (identifiant et clé d'API) ou son propre serveur (LanguageTool est
// open source, LGPL 2.1 : aucun code repris ici, seulement des appels à son API HTTP documentée,
// https://languagetool.org/http-api/).
//
// Limites de l'API publique (https://dev.languagetool.org/public-http-api) : 20 requêtes par minute, 75 Ko par
// minute, 20 Ko par requête, pas de requêtes automatiques. D'où la vérification sur un clic, d'une seule scène,
// découpée en morceaux sous la taille permise (`chunks`). Premium : 60 000 caractères par requête.
//
// Dans l'app, la requête passe par le plugin HTTP de Tauri (pas de CORS) ; un serveur local reçoit une origine
// vide, comme Ollama (voir ai/providers.ts).

import { isTauri } from "../platform";

export type LtServer = "off" | "public" | "premium" | "custom";
export const LT_SERVERS: readonly LtServer[] = ["off", "public", "premium", "custom"];
export const isLtServer = (v: unknown): v is LtServer => LT_SERVERS.includes(v as LtServer);

export interface LtSettings {
  server: LtServer;
  /** Compte Premium : l'adresse e-mail du compte LanguageTool. */
  username: string;
  /** Compte Premium : la clé d'API (gardée dans le trousseau, comme les clés d'IA). */
  key: string;
  /** Serveur personnel : son adresse (par exemple http://localhost:8081). */
  url: string;
  /** Vérifier pendant la frappe (compte Premium et serveur personnel seulement, voir `ltCanLive`). */
  live: boolean;
}

export const LT_NONE: LtSettings = { server: "off", username: "", key: "", url: "", live: false };
export const LT_PUBLIC_URL = "https://api.languagetool.org";
export const LT_PREMIUM_URL = "https://api.languagetoolplus.com";
export const LT_CUSTOM_DEFAULT = "http://localhost:8081";

const line = (v: unknown, max = 200) => (typeof v === "string" ? v.trim().slice(0, max) : "");

/** Réglages lus prudemment (localStorage) : rien de valide, la vérification reste coupée. */
export function readLt(raw: unknown): LtSettings {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  return { server: isLtServer(r.server) ? r.server : "off", username: line(r.username), key: line(r.key), url: line(r.url, 300), live: r.live === true };
}

/**
 * Vérifications automatiques (pendant la frappe, tout le livre) permises ? Pas avec l'API publique, dont les
 * conditions interdisent les requêtes automatiques ; oui avec un compte Premium ou un serveur personnel.
 */
export const ltCanBulk = (s: LtSettings) => (s.server === "premium" || s.server === "custom") && ltMissing(s) === null;
/** Vérification pendant la frappe : permise et cochée. */
export const ltLive = (s: LtSettings) => s.live && ltCanBulk(s);

/** Ce qui manque pour vérifier, ou null si tout est prêt. */
export function ltMissing(s: LtSettings): "off" | "account" | "url" | null {
  if (s.server === "off") return "off";
  if (s.server === "premium" && (!s.username || !s.key)) return "account";
  if (s.server === "custom" && !/^https?:\/\/\S+$/i.test(s.url)) return "url";
  return null;
}

/** Le texte quitte-t-il la machine ? Oui, sauf vers un serveur personnel sur cet ordinateur. */
export function ltLeavesDevice(s: LtSettings): boolean {
  if (s.server !== "custom") return s.server !== "off";
  return !/^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?(\/|$)/i.test(s.url);
}

/** Adresse de la vérification. */
export function checkUrl(s: LtSettings): string {
  const base = s.server === "premium" ? LT_PREMIUM_URL : s.server === "custom" ? s.url.trim().replace(/\/+$/, "") : LT_PUBLIC_URL;
  return /\/v2\/check$/.test(base) ? base : `${base.replace(/\/v2$/, "")}/v2/check`;
}

/** Caractères par requête : sous les limites documentées, avec de la marge (20 Ko public, 60 000 Premium). */
export const chunkLimit = (s: LtSettings) => (s.server === "public" ? 15_000 : 50_000);

/** Variante retenue quand la langue est détectée (anglais américain, allemand d'Allemagne…). */
export const AUTO_VARIANTS = "en-US,de-DE,pt-PT,ca-ES";

/** Corps de la requête (formulaire). La langue : un code (fr, en-US…) ou `auto`. */
export function checkBody(s: LtSettings, text: string, language: string): URLSearchParams {
  const body = new URLSearchParams();
  body.set("text", text);
  body.set("language", language || "auto");
  // Seulement des langues à variantes : « fr » ou « es » y font refuser la requête (erreur 400).
  if (language === "auto") body.set("preferredVariants", AUTO_VARIANTS);
  if (s.server === "premium") {
    body.set("username", s.username);
    body.set("apiKey", s.key);
  }
  return body;
}

/** Morceaux d'un texte trop long, coupés entre deux paragraphes, sinon entre deux phrases, sinon net. */
export function chunks(text: string, limit: number): { offset: number; text: string }[] {
  const out: { offset: number; text: string }[] = [];
  let start = 0;
  while (text.length - start > limit) {
    const window = text.slice(start, start + limit);
    let cut = window.lastIndexOf("\n\n");
    if (cut < limit / 2) {
      const sentence = Math.max(window.lastIndexOf(". "), window.lastIndexOf("! "), window.lastIndexOf("? "), window.lastIndexOf("\n"));
      cut = sentence >= limit / 2 ? sentence + 1 : cut > 0 ? cut : limit;
    }
    out.push({ offset: start, text: text.slice(start, start + cut) });
    start += cut;
  }
  if (start < text.length || out.length === 0) out.push({ offset: start, text: text.slice(start) });
  return out;
}

export type LtKind = "spelling" | "grammar" | "style";

/** Un problème relevé, en positions du texte envoyé. */
export interface LtMatch {
  offset: number;
  length: number;
  message: string;
  replacements: string[];
  kind: LtKind;
  rule: string;
}

/** Famille d'un problème, pour la couleur du soulignement. */
export function kindOf(issueType: unknown, category: unknown): LtKind {
  const type = String(issueType ?? "").toLowerCase();
  const cat = String(category ?? "").toUpperCase();
  if (type === "misspelling" || cat === "TYPOS") return "spelling";
  if (type === "style" || type === "register" || type === "locale-violation" || cat === "STYLE" || cat === "REDUNDANCY" || cat === "COLLOQUIALISMS") return "style";
  return "grammar";
}

const MAX_REPLACEMENTS = 5;

/** Réponse de /v2/check lue prudemment ; ce qui n'a pas la bonne forme est ignoré. */
export function parseMatches(json: unknown, offset = 0): LtMatch[] {
  const list = (json as { matches?: unknown })?.matches;
  if (!Array.isArray(list)) return [];
  const out: LtMatch[] = [];
  for (const m of list) {
    if (!m || typeof m !== "object") continue;
    const r = m as Record<string, unknown>;
    if (typeof r.offset !== "number" || typeof r.length !== "number" || r.length <= 0) continue;
    const rule = (r.rule ?? {}) as Record<string, unknown>;
    const category = (rule.category ?? {}) as Record<string, unknown>;
    const replacements = Array.isArray(r.replacements)
      ? r.replacements.flatMap((x) => (x && typeof (x as { value?: unknown }).value === "string" ? [(x as { value: string }).value] : [])).slice(0, MAX_REPLACEMENTS)
      : [];
    const message = typeof r.message === "string" && r.message.trim() ? r.message.trim() : typeof r.shortMessage === "string" ? r.shortMessage.trim() : "";
    out.push({ offset: r.offset + offset, length: r.length, message, replacements, kind: kindOf(rule.issueType, category.id), rule: typeof rule.id === "string" ? rule.id : "" });
  }
  return out;
}

export type LtErrorCode = "network" | "auth" | "limit" | "server";

export class LtError extends Error {
  /** Ce que le service a répondu (code HTTP et début du message), affiché avec l'erreur pour aider l'auteur. */
  constructor(
    public code: LtErrorCode,
    public detail = "",
  ) {
    super(code);
  }
}

/** Détail lisible d'une réponse refusée : le code HTTP et la première ligne du message du service. */
export function errorDetail(status: number, body: string): string {
  const line = body.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim().slice(0, 160);
  return line ? `${status} : ${line}` : String(status);
}

/** Code d'erreur d'une réponse HTTP refusée. */
export const errorOf = (status: number): LtErrorCode => (status === 401 || status === 403 ? "auth" : status === 429 ? "limit" : "server");

const TIMEOUT_MS = 30_000;

async function http(): Promise<typeof fetch> {
  return isTauri() ? ((await import("@tauri-apps/plugin-http")).fetch as typeof fetch) : fetch;
}

/**
 * Vérifie un texte : tous ses morceaux l'un après l'autre (jamais en parallèle, pour rester sous la limite par
 * minute). Positions rendues dans le texte entier. Lève une `LtError`.
 */
export interface CheckOptions {
  /** Attente entre deux requêtes (vérification de tout le livre), en millisecondes. */
  pauseMs?: number;
  /** Avancement : morceau en cours (à partir de 1) et nombre de morceaux. */
  onProgress?: (done: number, total: number) => void;
}

const sleep = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((ok) => {
    const timer = setTimeout(ok, ms);
    signal?.addEventListener("abort", () => (clearTimeout(timer), ok()), { once: true });
  });

export async function checkText(s: LtSettings, text: string, language: string, signal?: AbortSignal, doFetch?: typeof fetch, options: CheckOptions = {}): Promise<LtMatch[]> {
  if (!text.trim()) return [];
  const send = doFetch ?? (await http());
  const url = checkUrl(s);
  const local = s.server === "custom" && !ltLeavesDevice(s);
  const out: LtMatch[] = [];
  const parts = chunks(text, chunkLimit(s)).filter((x) => x.text.trim());
  for (const [n, part] of parts.entries()) {
    if (n > 0 && options.pauseMs) await sleep(options.pauseMs, signal);
    if (signal?.aborted) throw new DOMException("aborted", "AbortError");
    options.onProgress?.(n + 1, parts.length);
    const controller = new AbortController();
    const stop = () => controller.abort();
    signal?.addEventListener("abort", stop);
    const timer = setTimeout(stop, TIMEOUT_MS);
    let response: Response;
    try {
      response = await send(url, {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded", accept: "application/json", ...(local ? { origin: "" } : {}) },
        body: checkBody(s, part.text, language).toString(),
        signal: controller.signal,
      });
    } catch (e) {
      if (signal?.aborted) throw e;
      throw new LtError("network");
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener("abort", stop);
    }
    if (!response.ok) {
      const text = await response.text().catch(() => "");
      throw new LtError(errorOf(response.status), errorDetail(response.status, text));
    }
    let json: unknown;
    try {
      json = await response.json();
    } catch {
      throw new LtError("server");
    }
    out.push(...parseMatches(json, part.offset));
  }
  return out;
}
