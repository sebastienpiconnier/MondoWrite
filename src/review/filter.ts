// Filtre par personnage du Scénario : « Ses scènes » ne garde que les scènes où il parle ou est nommé dans
// l'action ; « Ses répliques » estompe en plus tout ce qu'il ne dit pas. C'est un affichage : rien n'est écrit,
// et le texte estompé reste modifiable. Fonctions pures.

import type { ElementType } from "../screenplay/model";
import { characterName } from "../screenplay/scenes";
import { foldName } from "./names";

export type CharacterFilterMode = "scenes" | "lines";
export interface CharacterFilter {
  name: string;
  mode: CharacterFilterMode;
  /** Second personnage (« Qui croise qui ») : seulement les scènes où les deux paraissent. */
  with?: string;
}

/** Ce que devient chaque élément : montré, estompé ou caché. */
export type Visibility = "show" | "dim" | "hide";

interface El {
  type: ElementType | string;
  text: string;
}

const isSpeaker = (el: El, key: string) => el.type === "character" && foldName(characterName(el.text)) === key;
const DIALOGUE = new Set(["parenthetical", "dialogue"]);

/** Repli pour chercher un nom dans l'action : sans casse ni accents, le trait d'union garde les mots liés. */
const foldText = (text: string) =>
  text
    .normalize("NFD")
    .replace(/\p{M}+/gu, "")
    .toUpperCase()
    .replace(/[^\p{L}\p{N}-]+/gu, " ");

/** Le nom figure-t-il, mot entier, dans un texte ? « la Mère » n'est pas cité dans « la Mère-grand ». */
function names(text: string, name: string): boolean {
  const key = foldText(name).trim();
  return key !== "" && ` ${foldText(text)} `.includes(` ${key} `);
}

/** Index des en-têtes des scènes où le personnage parle, ou est nommé dans l'action. */
export function scenesWith(elements: El[], name: string): number[] {
  const key = foldName(name);
  const out: number[] = [];
  let heading = -1;
  let found = false;
  const close = () => {
    if (heading >= 0 && found) out.push(heading);
  };
  elements.forEach((el, i) => {
    if (el.type === "sceneHeading") {
      close();
      heading = i;
      found = false;
      return;
    }
    if (heading < 0 || found) return;
    if (isSpeaker(el, key) || (el.type === "action" && names(el.text, name))) found = true;
  });
  close();
  return out;
}

/** Index des en-têtes des scènes gardées par un filtre (les deux personnages ensemble, s'il y en a deux). */
export function keptScenes(elements: El[], filter: CharacterFilter): number[] {
  const own = scenesWith(elements, filter.name);
  if (!filter.with?.trim()) return own;
  const other = new Set(scenesWith(elements, filter.with));
  return own.filter((i) => other.has(i));
}

/** Visibilité de chaque élément pour un filtre donné (tout « show » sans filtre). */
export function filterElements(elements: El[], filter: CharacterFilter | null): Visibility[] {
  if (!filter || !filter.name.trim()) return elements.map(() => "show");
  const key = foldName(filter.name);
  const withKey = filter.with?.trim() ? foldName(filter.with) : null;
  const kept = new Set(keptScenes(elements, filter));
  const out: Visibility[] = [];
  let inKept = false;
  let speaking = false;
  elements.forEach((el, i) => {
    if (el.type === "sceneHeading") inKept = kept.has(i);
    // Avant la première scène, sections et notes de plan : cachées, comme les scènes sans lui.
    if (!inKept) {
      out.push("hide");
      return;
    }
    if (filter.mode === "scenes") {
      out.push("show");
      return;
    }
    // « Ses répliques » : son nom et ce qui le suit (didascalies, répliques) en pleine encre, le reste estompé.
    if (el.type === "character") speaking = isSpeaker(el, key) || (withKey !== null && isSpeaker(el, withKey));
    else if (!DIALOGUE.has(el.type)) speaking = false;
    out.push(speaking ? "show" : "dim");
  });
  return out;
}

/** Personnages qui parlent, dans l'ordre de leur première réplique (choix du filtre). */
export function speakingNames(elements: El[], locale = "fr"): string[] {
  const seen = new Map<string, string>();
  for (const el of elements) {
    if (el.type !== "character") continue;
    const name = characterName(el.text).toLocaleUpperCase(locale);
    if (name && !seen.has(foldName(name))) seen.set(foldName(name), name);
  }
  return [...seen.values()];
}

/** Index des en-têtes des scènes dont l'action ou les répliques nomment une chose (objet, lieu…), mot entier. */
export function scenesNaming(elements: El[], name: string): number[] {
  const out: number[] = [];
  let heading = -1;
  for (const [i, el] of elements.entries()) {
    if (el.type === "sceneHeading") heading = i;
    else if (heading >= 0 && out[out.length - 1] !== heading && (el.type === "action" || el.type === "dialogue") && names(el.text, name)) out.push(heading);
  }
  return out;
}
