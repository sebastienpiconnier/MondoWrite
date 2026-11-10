// Polices installées sur l'appareil (discussion #61), pour « Une police de l'ordinateur » de Réglages › Écriture.
// App de bureau : la commande `system_fonts` (fonts.rs) ; navigateur qui le permet : l'API Local Font Access ;
// ailleurs (mobile, WebKit) : pas de liste, l'auteur tape le nom.

import { isMobileOS, isTauri } from "./platform";

let cache: Promise<string[]> | null = null;

/** Noms des familles, triés ; liste vide si l'appareil ne sait pas la donner. Lue une fois par lancement. */
export function systemFonts(): Promise<string[]> {
  cache ??= readFonts().catch(() => []);
  return cache;
}

async function readFonts(): Promise<string[]> {
  if (isTauri() && !isMobileOS()) {
    const { invoke } = await import("@tauri-apps/api/core");
    return await invoke<string[]>("system_fonts");
  }
  const query = (window as unknown as { queryLocalFonts?: () => Promise<{ family: string }[]> }).queryLocalFonts;
  if (!query) return [];
  return uniqueSorted((await query()).map((f) => f.family));
}

/** Familles sans doublon, triées sans tenir compte de la casse, sans les familles cachées du système (« .SF NS »). */
export function uniqueSorted(names: string[]): string[] {
  const seen = new Map<string, string>();
  for (const raw of names) {
    const name = raw.trim();
    if (name && !name.startsWith(".") && !seen.has(name.toLowerCase())) seen.set(name.toLowerCase(), name);
  }
  return [...seen.values()].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));
}
