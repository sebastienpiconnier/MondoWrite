// Adresse affichable d'une image de medias/ (lue une fois par session, puis gardée en mémoire).
// Une image absente est redemandée quelques fois : avec iCloud, l'ouverture d'un projet n'attend plus les
// images (seulement les textes), elles arrivent ensuite.

import { useEffect, useState } from "react";
import { storage } from "../storage";

const cache = new Map<string, Promise<string | null>>();

/** Nouvel essai après 1,5 s, 3 s, 6 s, 12 s, 24 s : un peu moins d'une minute en tout. */
const RETRIES = 5;
const FIRST_RETRY_MS = 1500;

/** À appeler quand on ouvre un autre projet : deux projets peuvent avoir un fichier du même nom. */
export const forgetMediaUrls = () => cache.clear();

export function useMediaUrl(name: string | undefined): string | null {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!name) return setUrl(null);
    let alive = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const load = (attempt: number) => {
      let pending = cache.get(name);
      if (!pending) {
        pending = storage.mediaUrl(name).catch(() => null);
        cache.set(name, pending);
      }
      const asked = pending;
      void asked.then((value) => {
        if (!alive) return;
        setUrl(value);
        if (value !== null || attempt >= RETRIES) return;
        // Pas encore là : on oublie la réponse, le prochain essai relira le dossier.
        if (cache.get(name) === asked) cache.delete(name);
        timer = setTimeout(() => load(attempt + 1), FIRST_RETRY_MS * 2 ** attempt);
      });
    };
    load(0);
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [name]);
  return name ? url : null;
}
