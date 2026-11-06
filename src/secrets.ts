// Clés de l'auteur (services d'IA, Pixabay, Unsplash) dans le trousseau du système (#30) : Trousseau d'accès sur Mac,
// trousseau protégé sur iPhone et iPad, gestionnaire d'identifiants sous Windows, Secret Service sous Linux
// (commandes secret_* de src-tauri/src/secrets.rs). Une seule entrée, en JSON, qui porte toutes les clés.
//
// Les clés restent en mémoire dans les réglages (`useSettings`), comme avant ; seul l'endroit où elles sont gardées
// change. Elles ne quittent `cosmos:reglages` (localStorage) qu'une fois écrites ET relues dans le trousseau ; si une
// écriture échoue ensuite, elles y reviennent (`setKeysInKeychain(false)`). On ne perd jamais une clé.
// Android, navigateur, Linux sans Secret Service : le trousseau ne répond pas, rien ne change.

import { AI_PROVIDERS, type AiProvider } from "./ai/providers";
import { setKeysInKeychain, useSettings } from "./settings";

export interface Secrets {
  ai: Partial<Record<AiProvider, string>>;
  photos: { pixabay: string; unsplash: string };
}

const NONE: Secrets = { ai: {}, photos: { pixabay: "", unsplash: "" } };
const clean = (v: unknown) => (typeof v === "string" ? v.trim().slice(0, 200) : "");

/** Clés lues dans le trousseau (JSON) ; ce qui n'a pas la bonne forme est ignoré. null si le texte est illisible. */
export function readSecrets(text: string | null): Secrets | null {
  if (text === null) return NONE;
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return null;
  }
  if (!raw || typeof raw !== "object") return null;
  const { ai, photos } = raw as { ai?: unknown; photos?: unknown };
  const out: Secrets = { ai: {}, photos: { pixabay: "", unsplash: "" } };
  if (ai && typeof ai === "object") {
    for (const p of AI_PROVIDERS) {
      const key = clean((ai as Record<string, unknown>)[p]);
      if (key) out.ai[p] = key;
    }
  }
  if (photos && typeof photos === "object") {
    out.photos.pixabay = clean((photos as Record<string, unknown>).pixabay);
    out.photos.unsplash = clean((photos as Record<string, unknown>).unsplash);
  }
  return out;
}

/** Clés non vides seulement, dans un ordre fixe : deux jeux égaux s'écrivent pareil. */
export function writeSecrets(s: Secrets): string {
  const ai: Record<string, string> = {};
  for (const p of AI_PROVIDERS) if (s.ai[p]) ai[p] = s.ai[p]!;
  const photos: Record<string, string> = {};
  if (s.photos.pixabay) photos.pixabay = s.photos.pixabay;
  if (s.photos.unsplash) photos.unsplash = s.photos.unsplash;
  return JSON.stringify({ ai, photos });
}

export const hasSecrets = (s: Secrets) => writeSecrets(s) !== writeSecrets(NONE);
export const sameSecrets = (a: Secrets, b: Secrets) => writeSecrets(a) === writeSecrets(b);

/** Clés que montrent les réglages de l'appareil. */
export function secretsOf(state: { ai: { keys: Partial<Record<AiProvider, string>> }; photos: { keys: { pixabay: string; unsplash: string } } }): Secrets {
  return { ai: { ...state.ai.keys }, photos: { ...state.photos.keys } };
}

/**
 * Clés à garder au démarrage : celles du trousseau, et par-dessus celles des réglages qui ne sont pas vides (avant la
 * migration, ou tapées pendant que le trousseau ne répondait plus : ce sont les plus récentes).
 */
export function mergeSecrets(stored: Secrets, local: Secrets): Secrets {
  const ai = { ...stored.ai };
  for (const p of AI_PROVIDERS) if (local.ai[p]) ai[p] = local.ai[p];
  return { ai, photos: { pixabay: local.photos.pixabay || stored.photos.pixabay, unsplash: local.photos.unsplash || stored.photos.unsplash } };
}

/** Accès au trousseau : les commandes Tauri dans l'app, un faux trousseau dans les tests. */
export interface Keychain {
  get(): Promise<string | null>;
  set(text: string): Promise<void>;
  remove(): Promise<void>;
}

const tauriKeychain: Keychain = {
  get: async () => (await import("@tauri-apps/api/core")).invoke<string | null>("secret_get"),
  set: async (value) => (await import("@tauri-apps/api/core")).invoke("secret_set", { value }),
  remove: async () => (await import("@tauri-apps/api/core")).invoke("secret_delete"),
};

/** Délai après la dernière frappe dans un champ de clé avant d'écrire dans le trousseau. */
export const KEYCHAIN_DELAY_MS = 600;

/** Écrit puis relit : vrai seulement si le trousseau rend exactement ce qu'on y a mis. */
async function store(keychain: Keychain, s: Secrets): Promise<boolean> {
  try {
    if (hasSecrets(s)) await keychain.set(writeSecrets(s));
    else await keychain.remove();
    const back = readSecrets(await keychain.get());
    return !!back && sameSecrets(back, s);
  } catch {
    return false;
  }
}

/**
 * Branche le trousseau (app de bureau et mobile, après `initSettings`). Rend une fonction qui arrête de le suivre
 * (tests). Ne lève jamais : un trousseau absent laisse les clés dans les réglages.
 */
export async function initKeychain(keychain: Keychain = tauriKeychain): Promise<() => void> {
  let text: string | null;
  try {
    text = await keychain.get();
  } catch {
    return () => {}; // pas de trousseau ici (Android, Linux sans Secret Service) : rien ne change
  }
  const stored = readSecrets(text);
  if (!stored) return () => {}; // entrée abîmée : on ne l'écrase pas, les clés restent dans les réglages
  const merged = mergeSecrets(stored, secretsOf(useSettings.getState()));
  if (!sameSecrets(merged, stored) && !(await store(keychain, merged))) return () => {};

  let written = merged;
  // D'abord les clés en mémoire (toutes), puis seulement on les retire de cosmos:reglages.
  apply(merged);
  setKeysInKeychain(true);

  let timer: ReturnType<typeof setTimeout> | null = null;
  const unsubscribe = useSettings.subscribe((state) => {
    const now = secretsOf(state);
    if (sameSecrets(now, written)) return;
    if (timer) clearTimeout(timer);
    timer = setTimeout(async () => {
      timer = null;
      const wanted = secretsOf(useSettings.getState());
      if (await store(keychain, wanted)) written = wanted;
      // Écriture refusée : les clés reviennent dans les réglages de l'appareil, et on cesse d'écrire au trousseau.
      else {
        setKeysInKeychain(false);
        unsubscribe();
      }
    }, KEYCHAIN_DELAY_MS);
  });
  return () => {
    if (timer) clearTimeout(timer);
    unsubscribe();
  };
}

function apply(s: Secrets) {
  const state = useSettings.getState();
  if (sameSecrets(secretsOf(state), s)) return;
  useSettings.setState({ ai: { ...state.ai, keys: { ...s.ai } }, photos: { ...state.photos, keys: { ...s.photos } } });
}
