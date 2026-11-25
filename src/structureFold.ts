// Actes et séquences repliés (#142) dans le séquencier et la liste des scènes : un état de l'appareil, jamais du
// projet. Clé de chaque partie : son identifiant (note du Fountain), sinon « @rang » (section venue d'ailleurs).

import { useSyncExternalStore } from "react";

const KEY = "mondowrite.structure.folded";
const LIMIT = 400;

let folded: ReadonlySet<string> = read();
const listeners = new Set<() => void>();

function read(): ReadonlySet<string> {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? "[]") as unknown;
    return new Set(Array.isArray(raw) ? raw.filter((x): x is string => typeof x === "string").slice(-LIMIT) : []);
  } catch {
    return new Set();
  }
}

export function toggleFoldedPart(key: string): void {
  const next = new Set(folded);
  if (!next.delete(key)) next.add(key);
  folded = next;
  try {
    localStorage.setItem(KEY, JSON.stringify([...next].slice(-LIMIT)));
  } catch {
    // Stockage refusé : le pli vaut pour la session.
  }
  for (const l of listeners) l();
}

/** Parties repliées en ce moment (hors de React). */
export const foldedPartsNow = (): ReadonlySet<string> => folded;

/** Parties repliées (même ensemble tant que rien ne change). */
export function useFoldedParts(): ReadonlySet<string> {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => folded,
  );
}
