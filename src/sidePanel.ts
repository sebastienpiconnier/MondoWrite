/**
 * Volet de droite du Manuscrit et du Scénario : ordre des rubriques, rubriques masquées et repliées.
 * Réglage de l'appareil (jamais le projet), commun aux deux vues : une rubrique absente d'une vue est ignorée.
 * Fonctions pures, sauf la lecture et l'écriture du localStorage.
 */
export interface SidePrefs {
  order: string[];
  hidden: string[];
  folded: string[];
  /** Rubriques masquées d'office que l'auteur a choisi de montrer. */
  shown: string[];
}

export const SIDE_PANEL_KEY = "mondowrite.sidePanel";
export const EMPTY_SIDE_PREFS: SidePrefs = { order: [], hidden: [], folded: [], shown: [] };
const KEY_RE = /^[a-z][a-z0-9-]{0,30}$/;

const keys = (raw: unknown): string[] =>
  Array.isArray(raw) ? [...new Set(raw.filter((k): k is string => typeof k === "string" && KEY_RE.test(k)))].slice(0, 40) : [];

/** Réglage relu prudemment : seules des listes de clés courtes. */
export function readSidePrefs(raw: unknown): SidePrefs {
  if (!raw || typeof raw !== "object") return EMPTY_SIDE_PREFS;
  const o = raw as Record<string, unknown>;
  return { order: keys(o.order), hidden: keys(o.hidden), folded: keys(o.folded), shown: keys(o.shown) };
}

/**
 * Rubriques de la vue dans l'ordre de l'auteur. Une rubrique que l'ordre enregistré ne connaît pas
 * se place après la plus basse de celles qui la précèdent dans l'ordre par défaut.
 */
export function orderParts(defaults: string[], prefs: SidePrefs): string[] {
  const known = prefs.order.filter((k) => defaults.includes(k));
  const out = [...known];
  defaults.forEach((k, i) => {
    if (out.includes(k)) return;
    // Après la plus basse des rubriques qui la précèdent par défaut : elle ne remonte jamais au-dessus de l'une d'elles.
    const at = Math.max(-1, ...defaults.slice(0, i).map((p) => out.indexOf(p)));
    out.splice(at + 1, 0, k);
  });
  return out;
}

/** Monter (-1) ou descendre (+1) une rubrique ; l'ordre écrit garde aussi les rubriques des autres vues. */
export function moveSidePart(prefs: SidePrefs, defaults: string[], key: string, dir: -1 | 1): SidePrefs {
  const shown = orderParts(defaults, prefs);
  const i = shown.indexOf(key);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= shown.length) return prefs;
  [shown[i], shown[j]] = [shown[j], shown[i]];
  const others = prefs.order.filter((k) => !defaults.includes(k));
  return { ...prefs, order: [...shown, ...others] };
}

const toggle = (list: string[], key: string, on: boolean) => (on ? (list.includes(key) ? list : [...list, key]) : list.filter((k) => k !== key));

/** Masquée : par l'auteur, ou d'office (`byDefault`) tant qu'il ne l'a pas montrée. */
export const isSideHidden = (prefs: SidePrefs, key: string, byDefault = false): boolean =>
  prefs.hidden.includes(key) || (byDefault && !prefs.shown.includes(key));
export const setSideHidden = (prefs: SidePrefs, key: string, hidden: boolean): SidePrefs => ({
  ...prefs,
  hidden: toggle(prefs.hidden, key, hidden),
  shown: toggle(prefs.shown, key, !hidden),
});
export const setSideFolded = (prefs: SidePrefs, key: string, folded: boolean): SidePrefs => ({ ...prefs, folded: toggle(prefs.folded, key, folded) });
/** Retour à l'ordre et à l'affichage par défaut de cette vue (les rubriques repliées le restent). */
export const resetSideParts = (prefs: SidePrefs, defaults: string[]): SidePrefs => ({
  ...prefs,
  order: prefs.order.filter((k) => !defaults.includes(k)),
  hidden: prefs.hidden.filter((k) => !defaults.includes(k)),
  shown: prefs.shown.filter((k) => !defaults.includes(k)),
});

export function loadSidePrefs(): SidePrefs {
  try {
    const raw = localStorage.getItem(SIDE_PANEL_KEY);
    return raw ? readSidePrefs(JSON.parse(raw)) : EMPTY_SIDE_PREFS;
  } catch {
    return EMPTY_SIDE_PREFS;
  }
}

export function saveSidePrefs(prefs: SidePrefs): void {
  try {
    localStorage.setItem(SIDE_PANEL_KEY, JSON.stringify(prefs));
  } catch {
    /* stockage plein ou refusé : le réglage vaut pour la séance */
  }
}
