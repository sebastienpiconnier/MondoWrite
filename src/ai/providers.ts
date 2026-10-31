// Services d'IA que l'auteur peut brancher (facultatif) : Claude, OpenAI, OpenRouter, ou un modèle local
// servi par Ollama ou LM Studio. Les requêtes partent directement de l'appareil vers le service choisi,
// uniquement quand l'auteur déclenche une action IA. La clé reste un réglage de l'appareil.
//
// Dans l'app (Tauri), les requêtes passent par le plugin HTTP, côté système : elles ne sont pas soumises
// au CORS du navigateur. C'est ce qui permet de joindre Ollama ou LM Studio sans réglage de leur côté
// (sous Windows, l'app se présente comme http://tauri.localhost, une origine qu'Ollama refuse par défaut).
// Le plugin ajoute l'en-tête Origin de l'app ; Ollama refuse les origines qu'il ne connaît pas (403), donc
// pour un serveur local on le retire (en-tête vide, fonction « unsafe-headers » du plugin).
// Ollama passe par son API native (/api/chat) : elle permet d'agrandir la fenêtre de contexte, que l'API
// compatible OpenAI laisse à quelques milliers de jetons (au-delà, les cartes étaient tronquées en silence),
// et de demander une réponse en JSON.
// Apple Foundation Models (1.10.0, `apple`) : le modèle d'Apple Intelligence de l'appareil, appelé par le pont Swift
// de l'app (ai/apple.ts), sans réseau, sans clé ni adresse ; ses limites sont dans ai/limits.ts.

import { isTauri } from "../platform";
import { appleComplete } from "./apple";
import { fitLocal, setDetectedContext } from "./limits";

export type AiProvider = "anthropic" | "openai" | "openrouter" | "ollama" | "lmstudio" | "apple";
export const AI_PROVIDERS: AiProvider[] = ["anthropic", "openai", "openrouter", "ollama", "lmstudio", "apple"];
export const isAiProvider = (v: unknown): v is AiProvider => AI_PROVIDERS.includes(v as AiProvider);

interface ProviderInfo {
  /** Service local : adresse modifiable, jeton facultatif (LM Studio « Require Authentication »), les textes ne quittent pas la machine. */
  local: boolean;
  /** Adresse de base par défaut (sans barre finale). */
  url: string;
  /** Modèle proposé par défaut ; vide : à choisir (la liste vient du service). */
  model: string;
  /** Modèle du système (Apple) : ni adresse, ni clé, ni liste de modèles ; proposé selon l'appareil (ai/apple.ts). */
  device?: true;
}

export const PROVIDERS: Record<AiProvider, ProviderInfo> = {
  anthropic: { local: false, url: "https://api.anthropic.com", model: "claude-sonnet-5-5" },
  openai: { local: false, url: "https://api.openai.com", model: "" },
  openrouter: { local: false, url: "https://openrouter.ai/api", model: "openrouter/auto" },
  ollama: { local: true, url: "http://localhost:11434", model: "" },
  lmstudio: { local: true, url: "http://localhost:1234", model: "" },
  // « local » au sens où rien ne quitte l'appareil ; le modèle est celui du système, sans nom à choisir.
  apple: { local: true, url: "", model: "on-device", device: true },
};

export interface AiConfig {
  provider: AiProvider;
  /** Clé d'API (services en ligne) ; jeton facultatif d'un serveur local qui en demande un. */
  key: string;
  model: string;
  /** Adresse du service local ; vide : adresse par défaut. */
  url: string;
}

/** Peut-on lancer une action IA avec ces réglages ? */
export function isReady(config: AiConfig | null): config is AiConfig {
  if (!config || !config.model.trim()) return false;
  return PROVIDERS[config.provider].local || config.key.trim() !== "";
}

/** Adresse de base du service (exportée pour les embeddings, semantic.ts). */
export const base = (config: AiConfig) => {
  const info = PROVIDERS[config.provider];
  // Adresse collée telle que la documentation la donne (« …:1234/v1/ ») : sans la barre finale ni « /v1 »,
  // que les chemins ajoutent déjà (sinon « /v1/v1/… », que le serveur refuse en « modèle inconnu »).
  const custom = info.local ? config.url.trim().replace(/\/+$/, "").replace(/\/v1$/i, "").replace(/\/+$/, "") : "";
  return custom || info.url;
};

/** L'adresse vise-t-elle cet ordinateur ? (Vide : l'adresse par défaut, locale.) Sert au texte d'aide. */
export function isLoopback(url: string): boolean {
  const text = url.trim();
  if (!text) return true;
  try {
    const host = new URL(/^[a-z][a-z\d+.-]*:\/\//i.test(text) ? text : `http://${text}`).hostname.toLowerCase();
    return host === "localhost" || host === "[::1]" || /^127(\.\d{1,3}){3}$/.test(host);
  } catch {
    return false;
  }
}

export interface HttpRequest {
  url: string;
  method: "GET" | "POST";
  headers: Record<string, string>;
  body?: string;
}

export function headers(config: AiConfig): Record<string, string> {
  const key = config.key.trim();
  if (config.provider === "anthropic") {
    // L'en-tête d'accès direct autorise l'appel depuis une app sans serveur intermédiaire.
    return { "content-type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01", "anthropic-dangerous-direct-browser-access": "true" };
  }
  const out: Record<string, string> = { "content-type": "application/json" };
  // Un serveur local peut aussi demander un jeton (LM Studio 0.4 et après, « Require Authentication ») : envoyé s'il y en a un.
  if (key) out.authorization = `Bearer ${key}`;
  if (config.provider === "openrouter") out["x-title"] = "MondoWrite";
  return out;
}

/** Fenêtre de contexte demandée à Ollama (sa valeur par défaut est trop courte pour un projet entier). */
export const OLLAMA_CONTEXT = 16384;

export interface ChatOptions {
  maxTokens?: number;
  /** Images jointes au message (modèle qui lit les images), en base64. */
  images?: { mime: string; data: string }[];
  /** La réponse attendue est un objet JSON (Ollama le garantit alors avec `format: "json"`). */
  json?: boolean;
  /** Annulation par l'auteur (bouton « Annuler » pendant que l'IA réfléchit). */
  signal?: AbortSignal;
  /** Délai d'un service en ligne, si la réponse attendue est longue (« Du vrac aux cartes ») ; sinon TIMEOUT_MS. */
  timeoutMs?: number;
  /** Limite totale de la réponse (marge comprise), si la fenêtre du modèle local est plus petite. */
  cap?: number;
}

/**
 * Marge ajoutée à la limite de longueur pour les services autres que Claude : un modèle qui raisonne
 * (o1, Qwen 3, DeepSeek R1…) compte son raisonnement dans la limite, et rendrait sinon une réponse vide.
 * La limite reste là pour qu'un modèle local bavard ne tourne pas jusqu'au délai de 300 s.
 */
export const THINKING_MARGIN = 2048;

/**
 * Modèle d'OpenAI qui raisonne avant d'écrire (GPT-5, o1, o3, o4-mini…). Son raisonnement, invisible, compte
 * dans `max_completion_tokens` : à l'effort par défaut (« medium »), GPT-5 pouvait tout y passer et rendre une
 * réponse vide (1.10.1, cohérence scène par scène et voix des personnages). On lui demande un effort « low » et
 * on lui laisse une marge plus grande. GPT-5 Chat (sans raisonnement) et les versions « pro » (effort fixe) à part.
 */
export function isReasoningModel(model: string): boolean {
  const m = model.trim().toLowerCase().replace(/^openai\//, "");
  if (/chat|pro\b/.test(m)) return false;
  return /^(gpt-5|o\d)/.test(m);
}

/** Marge d'un modèle qui raisonne (voir isReasoningModel). */
export const REASONING_MARGIN = 8192;

/** Requête de complétion : une consigne (system) et un message de l'auteur (user). */
export function chatRequest(config: AiConfig, system: string, user: string, options: ChatOptions | number = {}): HttpRequest {
  const { maxTokens = 1500, json = false, images = [], cap } = typeof options === "number" ? { maxTokens: options } : options;
  const model = config.model.trim();
  if (config.provider === "ollama") {
    return {
      url: `${base(config)}/api/chat`,
      method: "POST",
      headers: headers(config),
      body: JSON.stringify({
        model,
        stream: false,
        messages: [{ role: "system", content: system }, { role: "user", content: user, ...(images.length > 0 ? { images: images.map((i) => i.data) } : {}) }],
        options: { num_ctx: OLLAMA_CONTEXT, temperature: 0.3, num_predict: maxTokens + THINKING_MARGIN },
        ...(json ? { format: "json" } : {}),
      }),
    };
  }
  if (config.provider === "anthropic") {
    return {
      url: `${base(config)}/v1/messages`,
      method: "POST",
      headers: headers(config),
      body: JSON.stringify({
        model,
        max_tokens: maxTokens,
        system,
        messages: [
          {
            role: "user",
            content:
              images.length > 0
                ? [...images.map((i) => ({ type: "image", source: { type: "base64", media_type: i.mime, data: i.data } })), { type: "text", text: user }]
                : user,
          },
        ],
      }),
    };
  }
  const reasoning = config.provider !== "lmstudio" && isReasoningModel(model);
  const limit = Math.min(maxTokens + (reasoning ? REASONING_MARGIN : THINKING_MARGIN), cap ?? Infinity);
  return {
    url: `${base(config)}/v1/chat/completions`,
    method: "POST",
    headers: headers(config),
    body: JSON.stringify({
      model,
      stream: false,
      // OpenAI n'accepte plus max_tokens pour ses modèles récents ; les autres (OpenRouter, LM Studio) le lisent.
      ...(config.provider === "openai" ? { max_completion_tokens: limit } : { max_tokens: limit }),
      // Raisonnement court (voir isReasoningModel) : OpenAI le lit à plat, OpenRouter dans `reasoning`.
      ...(reasoning ? (config.provider === "openai" ? { reasoning_effort: "low" } : { reasoning: { effort: "low" } }) : {}),
      messages: [
        { role: "system", content: system },
        {
          role: "user",
          content:
            images.length > 0
              ? [{ type: "text", text: user }, ...images.map((i) => ({ type: "image_url", image_url: { url: `data:${i.mime};base64,${i.data}` } }))]
              : user,
        },
      ],
    }),
  };
}

/** Texte de la réponse, quel que soit le service. Vide si la réponse n'a pas la forme attendue. */
export function readReply(provider: AiProvider, json: unknown): string {
  const data = json as {
    content?: { type?: string; text?: string }[];
    choices?: { message?: { content?: unknown } }[];
    message?: { content?: unknown };
  } | null;
  if (provider === "anthropic") {
    return (data?.content ?? []).filter((part) => part?.type === "text" && typeof part.text === "string").map((part) => part.text).join("").trim();
  }
  const content = provider === "ollama" && data?.message ? data.message.content : data?.choices?.[0]?.message?.content;
  return typeof content === "string" ? stripThinking(content) : "";
}

/**
 * La réponse a-t-elle été coupée par la limite de longueur ? (`finish_reason: "length"` d'OpenAI, d'OpenRouter
 * et de LM Studio, `stop_reason: "max_tokens"` de Claude, `done_reason: "length"` d'Ollama.)
 */
export function wasCut(provider: AiProvider, json: unknown): boolean {
  const data = json as { stop_reason?: unknown; done_reason?: unknown; choices?: { finish_reason?: unknown }[] } | null;
  if (provider === "anthropic") return data?.stop_reason === "max_tokens";
  if (provider === "ollama") return data?.done_reason === "length";
  return data?.choices?.[0]?.finish_reason === "length";
}

/**
 * Réponse sans le raisonnement que certains modèles locaux écrivent avant (<think>…</think>, DeepSeek R1,
 * Qwen 3…) : il contient souvent des questions et du JSON d'essai, qu'on prendrait pour la réponse.
 */
export function stripThinking(text: string): string {
  let out = text.replace(/<(think|thinking|reasoning)>[\s\S]*?<\/\1>/gi, "");
  // Raisonnement ouvert mais jamais refermé (réponse coupée) : on ne garde rien de lui.
  out = out.replace(/<(think|thinking|reasoning)>[\s\S]*$/i, "");
  // Balise fermante seule (le modèle a commencé sa réponse dans la balise ouvrante du gabarit).
  const close = out.search(/<\/(think|thinking|reasoning)>/i);
  if (close >= 0) out = out.slice(out.indexOf(">", close) + 1);
  return out.trim();
}

/** Liste des modèles du service (sert aussi à vérifier la clé ou que le serveur local répond). */
export function modelsRequest(config: AiConfig): HttpRequest {
  return { url: `${base(config)}/v1/models`, method: "GET", headers: headers(config) };
}

/** Modèles d'une réponse `/v1/models` (`data[].id`) ou de la liste native d'Ollama `/api/tags` (`models[].name`). */
export function readModels(json: unknown): string[] {
  const body = json as { data?: { id?: unknown }[]; models?: { name?: unknown; model?: unknown }[] } | null;
  const ids = Array.isArray(body?.data)
    ? body.data.map((m) => m?.id)
    : Array.isArray(body?.models)
      ? body.models.map((m) => m?.name ?? m?.model)
      : [];
  return [...new Set(ids.filter((id): id is string => typeof id === "string" && id !== ""))].sort((a, b) => a.localeCompare(b));
}

/** Ce qui a empêché une action IA, pour un message compréhensible. */
export type AiErrorCode = "network" | "timeout" | "cancelled" | "auth" | "token" | "model" | "limit" | "context" | "length" | "empty" | "other";

export class AiError extends Error {
  /** Raison donnée par le service lui-même (son message d'erreur), montrée à l'auteur à côté du nôtre. */
  reason = "";
  /** Message complet pour l'auteur, à la place du message du code (modèle d'Apple : texte trop long, garde-fous…). */
  text = "";
  constructor(public code: AiErrorCode, detail = "") {
    super(detail || code);
  }
}

/**
 * Message d'erreur du service, lu dans sa réponse : `{"error": {"message": …}}` (Claude, OpenAI, OpenRouter,
 * LM Studio) ou `{"error": "…"}` (Ollama). Vide si la réponse n'en a pas.
 */
export function serviceReason(body: string): string {
  try {
    const data = JSON.parse(body) as { error?: unknown; message?: unknown };
    const err = data?.error;
    const text = typeof err === "string" ? err : err && typeof err === "object" ? (err as { message?: unknown }).message : data?.message;
    return typeof text === "string" ? text.replace(/\s+/g, " ").trim().slice(0, 240) : "";
  } catch {
    return "";
  }
}

/** Texte d'erreur pour l'auteur : notre explication, puis celle du service s'il en a donné une. */
export function aiErrorText(err: unknown, errors: Record<AiErrorCode, string>): string {
  if (err instanceof AiError && err.text) return err.text;
  const code = err instanceof AiError ? err.code : "other";
  const reason = err instanceof AiError ? err.reason : "";
  // Jeton demandé : le message dit quoi faire, le texte du serveur (long, en anglais, coupé) n'apporte rien.
  return reason && code !== "token" ? `${errors[code]} (${reason})` : errors[code];
}

export const errorCode = (status: number): AiErrorCode =>
  status === 401 || status === 403 ? "auth" : status === 404 || status === 400 ? "model" : status === 429 || status === 402 ? "limit" : "other";

const TIMEOUT_MS = 90_000;
/** Un modèle local sur un ordinateur modeste peut mettre plusieurs minutes. */
const LOCAL_TIMEOUT_MS = 300_000;

/** fetch du système dans l'app (pas de CORS), celui du navigateur sinon. */
async function httpFetch(): Promise<typeof fetch> {
  if (!isTauri()) return fetch;
  try {
    return (await import("@tauri-apps/plugin-http")).fetch as typeof fetch;
  } catch {
    return fetch;
  }
}

export async function send(request: HttpRequest, local = false, signal?: AbortSignal, timeoutMs = TIMEOUT_MS): Promise<unknown> {
  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, local ? Math.max(LOCAL_TIMEOUT_MS, timeoutMs) : timeoutMs);
  // Annulation par l'auteur : elle coupe la même requête.
  const cancel = () => controller.abort();
  if (signal?.aborted) controller.abort();
  signal?.addEventListener("abort", cancel);
  let response: Response;
  try {
    const doFetch = await httpFetch();
    // Serveur local dans l'app : sans en-tête Origin (voir plus haut). Ignoré par le navigateur.
    const headers = local && isTauri() ? { ...request.headers, origin: "" } : request.headers;
    response = await doFetch(request.url, { method: request.method, headers, body: request.body, signal: controller.signal });
  } catch (err) {
    if (timedOut) throw new AiError("timeout", String(err));
    if (signal?.aborted) throw new AiError("cancelled", String(err));
    // Serveur local éteint, pas de réseau, ou appel refusé par le service (CORS).
    throw new AiError("network", String(err));
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", cancel);
  }
  if (!response.ok) {
    const body = await response.text().catch(() => "");
    // Un serveur local qui répond 403 refuse l'origine de l'app, ce n'est pas une affaire de clé ; sauf s'il
    // réclame un jeton (LM Studio avec « Require Authentication » : 401, message sur le jeton).
    // Texte trop long pour la fenêtre du modèle chargé : LM Studio répond « Channel Error » (MLX) ou parle de
    // contexte ; on le dit avant tout (le message du jeton parlait de « tokens » et trompait).
    const tooLong = local && isContextError(body);
    const wantsToken = local && !tooLong && (response.status === 401 || /api[ _-]?token|authoriz/i.test(body));
    const code: AiErrorCode = tooLong ? "context" : wantsToken ? "token" : local && response.status === 403 ? "network" : errorCode(response.status);
    const reason = serviceReason(body);
    // Claude répond 400 quand le crédit du compte est épuisé : c'est une limite, pas un modèle inconnu.
    const error = new AiError(/credit balance|billing|quota/i.test(reason) ? "limit" : code, `${response.status} ${body}`.slice(0, 300));
    error.reason = reason;
    throw error;
  }
  return response.json().catch(() => {
    throw new AiError("other", "réponse illisible");
  });
}

/**
 * Erreur d'un serveur local qui dit que le texte dépasse la fenêtre du modèle : « Channel Error » de LM Studio
 * (le moteur MLX s'arrête), « context length », « n_ctx », « exceeds »… Fonction pure, testée.
 */
export function isContextError(body: string): boolean {
  return /channel error|context (length|window|size|overflow)|n_ctx|num_ctx|exceed|too (long|many tokens)|tokens to keep/i.test(body);
}

/** Envoie une consigne et rend le texte de la réponse. */
export async function complete(config: AiConfig, system: string, user: string, options?: ChatOptions | number): Promise<string> {
  if (config.provider === "apple") return appleComplete(system, user, typeof options === "number" ? { maxTokens: options } : options);
  const local = PROVIDERS[config.provider].local;
  const signal = typeof options === "object" ? options.signal : undefined;
  const timeout = typeof options === "object" ? options.timeoutMs : undefined;
  const opts: ChatOptions = typeof options === "number" ? { maxTokens: options } : { ...options };
  // LM Studio : fenêtre du modèle chargé connue, l'envoi trop long est refusé avant de partir, et la réponse
  // demandée tient dans ce qui reste (le moteur MLX s'arrêtait sinon sur « Channel Error »).
  const ctx = await localContext(config);
  if (ctx) {
    const room = fitLocal(ctx, system, user, (opts.maxTokens ?? 1500) + THINKING_MARGIN);
    if (room === null) throw contextError(ctx);
    opts.cap = room;
  }
  let reply: unknown;
  try {
    reply = await send(chatRequest(config, system, user, opts), local, signal, timeout);
  } catch (err) {
    // Fenêtre peut-être changée (modèle rechargé) : relue au prochain envoi.
    if (err instanceof AiError && err.code === "context") forgetContext(config);
    throw err;
  }
  const text = readReply(config.provider, reply);
  if (!text) {
    // Erreur rendue dans une réponse 200 (certains serveurs locaux).
    if (local && isContextError(serviceReason(JSON.stringify(reply ?? {})))) throw new AiError("context");
    // Rien d'écrit et réponse coupée : le modèle a passé sa limite à raisonner (ou le texte remplissait sa fenêtre).
    throw new AiError(wasCut(config.provider, reply) ? "length" : "empty");
  }
  return text;
}

/** Erreur « texte trop long » avec la fenêtre lue, pour que l'auteur sache quoi changer. */
function contextError(ctx: number): AiError {
  const error = new AiError("context", `fenêtre ${ctx}`);
  error.reason = `Context Length ${ctx}`;
  return error;
}

/** Fenêtre du modèle chargé dans une réponse de `/api/v0/models` de LM Studio (`loaded_context_length`). Pure, testée. */
export function readLoadedContext(json: unknown, model: string): number | null {
  const data = (json as { data?: unknown } | null)?.data;
  if (!Array.isArray(data)) return null;
  const entries = data as { id?: unknown; state?: unknown; loaded_context_length?: unknown }[];
  const wanted = model.trim();
  const entry = wanted ? entries.find((e) => e?.id === wanted) : entries.find((e) => e?.state === "loaded");
  const n = entry?.loaded_context_length;
  return typeof n === "number" && Number.isFinite(n) && n > 0 ? Math.floor(n) : null;
}

/** Fenêtres lues, par serveur et modèle, gardées une minute (l'auteur peut recharger le modèle autrement). */
const contexts = new Map<string, { at: number; ctx: number | null }>();
const CONTEXT_TTL = 60_000;
const contextKey = (config: AiConfig) => `${base(config)}|${config.model.trim()}`;
const forgetContext = (config: AiConfig) => contexts.delete(contextKey(config));

/**
 * Fenêtre du modèle chargé dans LM Studio (null ailleurs, ou si le serveur ne la donne pas). Met aussi à jour
 * les budgets des envois par paquets (`setDetectedContext`, limits.ts) : à appeler avant `packBudget`.
 */
export async function localContext(config: AiConfig): Promise<number | null> {
  if (config.provider !== "lmstudio") return null;
  const key = contextKey(config);
  const known = contexts.get(key);
  if (known && Date.now() - known.at < CONTEXT_TTL) return known.ctx;
  let ctx: number | null = null;
  try {
    ctx = readLoadedContext(await send({ url: `${base(config)}/api/v0/models`, method: "GET", headers: headers(config) }, true), config.model);
  } catch {
    /* ancienne version de LM Studio, ou serveur qui ne la donne pas : budgets ordinaires */
  }
  contexts.set(key, { at: Date.now(), ctx });
  setDetectedContext(config.provider, ctx);
  return ctx;
}

export async function listModels(config: AiConfig): Promise<string[]> {
  // Modèle du système : rien à lister.
  if (PROVIDERS[config.provider].device) return [];
  const local = PROVIDERS[config.provider].local;
  // Ollama : sa liste native donne tous les modèles installés ; la liste compatible OpenAI en secours.
  if (config.provider === "ollama") {
    try {
      const list = readModels(await send({ ...modelsRequest(config), url: `${base(config)}/api/tags` }, local));
      if (list.length > 0) return list;
    } catch {
      /* ancienne version d'Ollama : on essaie /v1/models */
    }
  }
  return readModels(await send(modelsRequest(config), local));
}
