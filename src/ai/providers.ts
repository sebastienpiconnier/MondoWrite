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

import { isTauri } from "../platform";

export type AiProvider = "anthropic" | "openai" | "openrouter" | "ollama" | "lmstudio";
export const AI_PROVIDERS: AiProvider[] = ["anthropic", "openai", "openrouter", "ollama", "lmstudio"];
export const isAiProvider = (v: unknown): v is AiProvider => AI_PROVIDERS.includes(v as AiProvider);

interface ProviderInfo {
  /** Service local : pas de clé, adresse modifiable, les textes ne quittent pas la machine. */
  local: boolean;
  /** Adresse de base par défaut (sans barre finale). */
  url: string;
  /** Modèle proposé par défaut ; vide : à choisir (la liste vient du service). */
  model: string;
}

export const PROVIDERS: Record<AiProvider, ProviderInfo> = {
  anthropic: { local: false, url: "https://api.anthropic.com", model: "claude-sonnet-5-5" },
  openai: { local: false, url: "https://api.openai.com", model: "" },
  openrouter: { local: false, url: "https://openrouter.ai/api", model: "openrouter/auto" },
  ollama: { local: true, url: "http://localhost:11434", model: "" },
  lmstudio: { local: true, url: "http://localhost:1234", model: "" },
};

export interface AiConfig {
  provider: AiProvider;
  /** Clé d'API (services en ligne). */
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

const base = (config: AiConfig) => {
  const info = PROVIDERS[config.provider];
  const custom = info.local ? config.url.trim().replace(/\/+$/, "") : "";
  return custom || info.url;
};

export interface HttpRequest {
  url: string;
  method: "GET" | "POST";
  headers: Record<string, string>;
  body?: string;
}

function headers(config: AiConfig): Record<string, string> {
  const key = config.key.trim();
  if (config.provider === "anthropic") {
    // L'en-tête d'accès direct autorise l'appel depuis une app sans serveur intermédiaire.
    return { "content-type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01", "anthropic-dangerous-direct-browser-access": "true" };
  }
  const out: Record<string, string> = { "content-type": "application/json" };
  if (key && !PROVIDERS[config.provider].local) out.authorization = `Bearer ${key}`;
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
}

/** Requête de complétion : une consigne (system) et un message de l'auteur (user). */
export function chatRequest(config: AiConfig, system: string, user: string, options: ChatOptions | number = {}): HttpRequest {
  const { maxTokens = 1500, json = false, images = [] } = typeof options === "number" ? { maxTokens: options } : options;
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
        options: { num_ctx: OLLAMA_CONTEXT, temperature: 0.3 },
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
  return {
    url: `${base(config)}/v1/chat/completions`,
    method: "POST",
    headers: headers(config),
    body: JSON.stringify({
      model,
      stream: false,
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
export type AiErrorCode = "network" | "auth" | "model" | "limit" | "empty" | "other";

export class AiError extends Error {
  constructor(public code: AiErrorCode, detail = "") {
    super(detail || code);
  }
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

async function send(request: HttpRequest, local = false): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), local ? LOCAL_TIMEOUT_MS : TIMEOUT_MS);
  let response: Response;
  try {
    const doFetch = await httpFetch();
    // Serveur local dans l'app : sans en-tête Origin (voir plus haut). Ignoré par le navigateur.
    const headers = local && isTauri() ? { ...request.headers, origin: "" } : request.headers;
    response = await doFetch(request.url, { method: request.method, headers, body: request.body, signal: controller.signal });
  } catch (err) {
    // Serveur local éteint, pas de réseau, ou appel refusé par le service (CORS).
    throw new AiError("network", String(err));
  } finally {
    clearTimeout(timer);
  }
  // Un serveur local qui répond 403 refuse l'origine de l'app, ce n'est pas une affaire de clé.
  const code = local && response.status === 403 ? "network" : errorCode(response.status);
  if (!response.ok) throw new AiError(code, `${response.status} ${await response.text().catch(() => "")}`.slice(0, 300));
  return response.json().catch(() => {
    throw new AiError("other", "réponse illisible");
  });
}

/** Envoie une consigne et rend le texte de la réponse. */
export async function complete(config: AiConfig, system: string, user: string, options?: ChatOptions | number): Promise<string> {
  const local = PROVIDERS[config.provider].local;
  const text = readReply(config.provider, await send(chatRequest(config, system, user, options), local));
  if (!text) throw new AiError("empty");
  return text;
}

export async function listModels(config: AiConfig): Promise<string[]> {
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
