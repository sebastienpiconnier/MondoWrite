// Fiche d'un fil entre deux cartes (lot 7 de la Bible v2) : leur histoire commune, ce qui se joue entre elles,
// comment ça évolue. Le fil garde son étiquette (« soupçonne ») ; la fiche dit le reste. Fonctions pures.
//
// Dans cosmos.json, un bloc facultatif, à part des fils pour que les versions d'avant (qui réécrivent les fils
// avec leurs seules clés connues) ne le perdent pas : il est gardé tel quel comme clé inconnue.
//   "wires": { "<id du fil>": { "histoire": "…", "enjeu": "…", "evolution": "…" } }
// Les clés sont écrites dans le fichier : ne jamais les renommer.

export const WIRE_FIELDS = ["histoire", "enjeu", "evolution"] as const;
export type WireField = (typeof WIRE_FIELDS)[number];
export type WireFiche = Partial<Record<WireField, string>>;

const MAX_VALUE = 2000;

/** Une fiche de fil lue d'ailleurs (corbeille, presse-papiers) : seulement les champs connus, en texte. */
export function readWireFiche(value: unknown): WireFiche | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const fiche: WireFiche = {};
  for (const key of WIRE_FIELDS) {
    const v = (value as Record<string, unknown>)[key];
    if (typeof v === "string" && v.trim()) fiche[key] = v.slice(0, MAX_VALUE);
  }
  return Object.keys(fiche).length > 0 ? fiche : undefined;
}

/** Fiches lues dans cosmos.json, pour les fils qui existent encore (un fil supprimé emporte sa fiche). */
export function readWires(raw: unknown, linkIds: ReadonlySet<string>): Map<string, WireFiche> {
  const out = new Map<string, WireFiche>();
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return out;
  for (const [id, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!linkIds.has(id) || !value || typeof value !== "object" || Array.isArray(value)) continue;
    const fiche: WireFiche = {};
    for (const key of WIRE_FIELDS) {
      const v = (value as Record<string, unknown>)[key];
      if (typeof v === "string" && v.trim()) fiche[key] = v.slice(0, MAX_VALUE);
    }
    if (Object.keys(fiche).length > 0) out.set(id, fiche);
  }
  return out;
}

/** Bloc `wires` à écrire, ou undefined quand aucun fil n'a de fiche. */
export function wiresToMeta(edges: readonly { id: string; data?: Record<string, unknown> }[]): Record<string, WireFiche> | undefined {
  const out: Record<string, WireFiche> = {};
  for (const e of edges) {
    const fiche = e.data?.fiche as WireFiche | undefined;
    if (fiche && Object.keys(fiche).length > 0) out[e.id] = fiche;
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

/** Fiche après modification d'un champ (vidé : retiré). undefined quand plus rien n'est rempli. */
export function setWireField(fiche: WireFiche | undefined, key: WireField, value: string): WireFiche | undefined {
  const next = { ...(fiche ?? {}) };
  if (value.trim()) next[key] = value.slice(0, MAX_VALUE);
  else delete next[key];
  return Object.keys(next).length > 0 ? next : undefined;
}

export const wireFicheOf = (edge: { data?: Record<string, unknown> }): WireFiche | undefined => edge.data?.fiche as WireFiche | undefined;
