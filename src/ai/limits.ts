// Limites de chaque service d'IA (lot 1.10.0) : taille de ce qu'on peut lui envoyer, actions qu'il ne sait pas faire.
// Les services en ligne et les serveurs locaux (Ollama, LM Studio) reçoivent les budgets propres à chaque action.
// Le modèle d'Apple sur l'appareil (Apple Foundation Models, environ 3 milliards de paramètres) n'a qu'une fenêtre
// de 4 096 jetons, consigne, texte et réponse compris : les actions qui lisent tout le récit sont refusées avec une
// phrase claire, celles qui procèdent par paquets envoient des paquets plus petits, les autres sont bornées.
// Fonctions pures, testées (limits.test.ts).

import type { AiProvider } from "./providers";

/** Actions IA qu'un service peut refuser (clés internes, jamais affichées). */
export type AiAction =
  /** « Vérifier la cohérence » du menu IA : tout le projet en un envoi. */
  | "coherence"
  /** Relecture : cohérence scène par scène (une scène peut faire 9 000 caractères, avec les fiches qu'elle nomme). */
  | "continuity"
  /** Relecture : voix des personnages (répliques prises dans tout le récit). */
  | "voices"
  /** Relecture : lecteur bêta (tout le récit en un envoi). */
  | "beta"
  /** Rétro-bible : les passages de tout le récit qui parlent d'une fiche. */
  | "retro"
  /** Décrire une photo (le modèle doit lire les images). */
  | "photo";

export interface ProviderLimits {
  /** Fenêtre de contexte en jetons (consigne, texte et réponse) ; null : assez grande pour nos envois. */
  context: number | null;
  /** Longueur de réponse la plus grande qu'on demande, en jetons ; null : celle de l'action. */
  maxOutput: number | null;
  /** Caractères par jeton, compte prudent (le français et le JSON coûtent plus qu'un texte anglais). */
  charsPerToken: number;
  /** Actions refusées. */
  refused: readonly AiAction[];
  /** Taille d'un paquet (chronologie, dépouillement) ou des cartes envoyées (Ranger, fils), en caractères ; null : celle de l'action. */
  pack: number | null;
  /** « Du vrac aux cartes » : texte collé le plus long, en caractères ; null : VRAC_MAX. */
  vracMax: number | null;
}

const OPEN: ProviderLimits = { context: null, maxOutput: null, charsPerToken: 4, refused: [], pack: null, vracMax: null };

/** Fenêtre du modèle d'Apple sur l'appareil (SystemLanguageModel, iOS 26 et macOS 26). */
export const APPLE_CONTEXT = 4096;

export const PROVIDER_LIMITS: Record<AiProvider, ProviderLimits> = {
  anthropic: OPEN,
  openai: OPEN,
  openrouter: OPEN,
  ollama: OPEN,
  lmstudio: OPEN,
  apple: {
    context: APPLE_CONTEXT,
    maxOutput: 1024,
    charsPerToken: 3,
    refused: ["coherence", "continuity", "voices", "beta", "retro", "photo"],
    pack: 6000,
    vracMax: 1500,
  },
};

/**
 * Fenêtre du modèle chargé, lue auprès du serveur local (LM Studio : « Context Length » choisie au chargement,
 * souvent 4 096 ou 8 192). Inconnue : null, on garde les budgets de l'action. Mise à jour par `localContext`
 * (providers.ts) avant une action longue.
 */
const detected: Partial<Record<AiProvider, number>> = {};
export function setDetectedContext(provider: AiProvider, tokens: number | null) {
  if (tokens && tokens > 0) detected[provider] = tokens;
  else delete detected[provider];
}
export const detectedContext = (provider: AiProvider): number | null => detected[provider] ?? null;

/** Caractères par jeton pour une fenêtre lue sur un serveur local (compte prudent, comme pour Apple). */
export const LOCAL_CHARS_PER_TOKEN = 3;
/** Place gardée dans une fenêtre lue pour la consigne, les fiches jointes et la réponse, en jetons. */
export const LOCAL_ROOM = 5000;
/** Paquet le plus petit qu'on envoie, même dans une petite fenêtre (en caractères). */
export const MIN_PACK = 2000;

/** Ce service sait-il faire cette action ? */
export const allows = (provider: AiProvider, action: AiAction) => !PROVIDER_LIMITS[provider].refused.includes(action);

/** Budget en caractères d'un envoi par paquets : celui du service s'il est plus petit, sinon celui de l'action. */
export function packBudget(provider: AiProvider, fallback: number): number {
  const own = Math.min(fallback, PROVIDER_LIMITS[provider].pack ?? fallback);
  const ctx = detected[provider];
  if (!ctx) return own;
  return Math.min(own, Math.max(MIN_PACK, (ctx - LOCAL_ROOM) * LOCAL_CHARS_PER_TOKEN));
}

/**
 * Limite de réponse à demander à un serveur local dont on connaît la fenêtre (`ctx`) : ce qui reste après la
 * consigne et le texte, au plus `wanted`. Null si le texte seul ne laisse pas `MIN_REPLY` jetons (envoi refusé
 * avant de partir, avec un message qui dit d'agrandir la fenêtre).
 */
export function fitLocal(ctx: number, system: string, user: string, wanted: number): number | null {
  const room = ctx - CONTEXT_MARGIN - Math.ceil((system.length + user.length) / LOCAL_CHARS_PER_TOKEN);
  if (room < MIN_REPLY) return null;
  return Math.min(wanted, room);
}

/** Texte collé le plus long pour « Du vrac aux cartes ». */
export const vracLimit = (provider: AiProvider, fallback: number) => Math.min(fallback, PROVIDER_LIMITS[provider].vracMax ?? fallback);

/** Jetons estimés d'un texte, pour ce service (arrondi au-dessus). */
export const estimateTokens = (provider: AiProvider, text: string) => Math.ceil(text.length / PROVIDER_LIMITS[provider].charsPerToken);

/** Marge gardée dans la fenêtre (gabarit de conversation du modèle, erreur d'estimation). */
export const CONTEXT_MARGIN = 96;
/** Réponse la plus courte qui vaille d'être demandée : en dessous, l'envoi est trop long. */
export const MIN_REPLY = 200;

/**
 * Un envoi tient-il dans la fenêtre du service ? Rend la longueur de réponse à demander (celle de l'action,
 * bornée par `maxOutput` et par la place qui reste), ou null si le texte seul ne laisse pas `MIN_REPLY` jetons.
 */
export function fitReply(provider: AiProvider, system: string, user: string, maxTokens: number): number | null {
  const limits = PROVIDER_LIMITS[provider];
  const wanted = Math.min(maxTokens, limits.maxOutput ?? maxTokens);
  if (limits.context === null) return wanted;
  const room = limits.context - CONTEXT_MARGIN - estimateTokens(provider, system) - estimateTokens(provider, user);
  if (room < Math.min(MIN_REPLY, wanted)) return null;
  return Math.min(wanted, room);
}

/** Les premiers éléments dont la taille cumulée tient dans `budget` (au moins un, s'il y en a). Ordre gardé. */
export function takeWithin<T>(items: T[], size: (item: T) => number, budget: number): T[] {
  const kept: T[] = [];
  let used = 0;
  for (const item of items) {
    const s = size(item);
    if (kept.length > 0 && used + s > budget) break;
    kept.push(item);
    used += s;
  }
  return kept;
}
