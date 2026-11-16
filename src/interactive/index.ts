// Roman interactif (lot 0, docs/plan-roman-interactif.md) : tout ce qui touche à la fiction à choix passe par ce
// module, pour qu'un roman ou un scénario ordinaire ne voie jamais rien changer.
//
// Format : un roman interactif est un roman (`kind` absent ou « roman ») dont `cosmos.json` porte en plus
// `interactive: true`. La clé n'est pas dans `KNOWN_META` : elle voyage dans `metaKeep` et toute version de
// MondoWrite depuis octobre 2026 la réécrit telle quelle. Une version qui ne connaît pas le module, ou une
// version où l'option est coupée, ouvre donc le projet comme un roman, sans rien perdre.

/**
 * Option de compilation : `VITE_NO_INTERACTIVE=1` fabrique une version sans le module (rien n'est proposé, même
 * avec l'option expérimentale). Lue une fois, à la construction.
 */
export const INTERACTIVE_BUILD: boolean = import.meta.env?.VITE_NO_INTERACTIVE !== "1";

/** Clé écrite dans cosmos.json, jamais traduite ni renommée (contrat de format). */
export const INTERACTIVE_KEY = "interactive";

/** Le projet est-il un roman interactif ? Lu dans les clés gardées telles quelles (`metaKeep`). */
export function isInteractiveMeta(meta: Record<string, unknown> | null | undefined): boolean {
  return !!meta && meta[INTERACTIVE_KEY] === true;
}

/** Ce qu'ajoute la création d'un roman interactif aux métadonnées d'un nouveau projet. */
export const interactiveMeta = (): Record<string, unknown> => ({ [INTERACTIVE_KEY]: true });

/**
 * Fonctions expérimentales : réglage de l'appareil, coupé par défaut. Chaque fonction a sa clé, pour pouvoir en
 * ajouter d'autres sans changer le format des réglages.
 */
export interface ExperimentalSettings {
  /** Roman interactif : type de projet proposé à la création. */
  interactive: boolean;
}

export const NO_EXPERIMENTS: ExperimentalSettings = { interactive: false };

/** Relit le réglage : seules les valeurs `true` comptent, tout le reste vaut « coupé ». */
export function readExperimental(raw: unknown): ExperimentalSettings {
  if (!raw || typeof raw !== "object") return NO_EXPERIMENTS;
  return { interactive: (raw as Record<string, unknown>).interactive === true };
}

/** Le roman interactif est-il proposé ici ? Il faut la version qui le contient ET l'option de l'auteur. */
export const interactiveOffered = (experimental: ExperimentalSettings, build = INTERACTIVE_BUILD): boolean => build && experimental.interactive;

/**
 * Le projet ouvert se montre-t-il en roman interactif ? Seulement si c'est un roman interactif ET que la fonction
 * est proposée ; sinon c'est un roman, et le fichier garde sa clé pour plus tard.
 */
export const showsInteractive = (meta: Record<string, unknown> | null | undefined, experimental: ExperimentalSettings, build = INTERACTIVE_BUILD): boolean =>
  interactiveOffered(experimental, build) && isInteractiveMeta(meta);
