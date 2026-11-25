// Scènes proposées pour « Prépare… » et « Payée par… » (lot 17) : dans l'ordre du récit, avec leur numéro, leur
// titre et le début de leur synopsis (à défaut, de leur texte), pour retrouver la bonne scène parmi des dizaines.
// Recherche sans casse ni accents sur ces trois champs. Fonctions pures.

import { junctionOrder } from "./projectJunctions";
import { sceneNumbers } from "./sceneNumbers";
import { listScenes, sceneSynopsis } from "./screenplay/scenes";
import { sceneBody, sceneText } from "./screenplay/sceneText";
import { foldSameLength, plainText } from "./search";
import type { CosmosState } from "./store";

type Source = Pick<CosmosState, "kind" | "nodes" | "plan" | "screenplay" | "manuscript">;

export interface SceneChoice {
  id: string;
  number: string;
  title: string;
  /** Début du synopsis, sinon du texte de la scène, sur une ligne. */
  hint: string;
}

/** Longueur du début de synopsis montré. */
export const HINT_CHARS = 90;

const oneLine = (s: string) => s.replace(/\[\[[^\]]*\]\]/g, "").replace(/\s+/g, " ").trim();
export const shorten = (s: string, max = HINT_CHARS) => (s.length <= max ? s : `${s.slice(0, max).replace(/\s+\S*$/, "")}…`);

export function sceneChoices(s: Source, untitled: string): SceneChoice[] {
  const numbers = sceneNumbers(s);
  const els = s.screenplay?.elements ?? [];
  const heads = new Map<string, number>();
  if (s.kind === "scenario") for (const sc of listScenes(els)) if (sc.cardId && !heads.has(sc.cardId)) heads.set(sc.cardId, sc.index);
  return junctionOrder(s.kind, s.nodes, s.plan, s.screenplay).map((id) => {
    const card = s.nodes.find((n) => n.id === id);
    const at = heads.get(id);
    let hint = "";
    if (s.kind === "scenario" && at !== undefined) hint = oneLine(sceneSynopsis(els, at)) || oneLine(sceneText(sceneBody(els, at)));
    else hint = oneLine(card?.data.fiche?.synopsis ?? "") || oneLine(plainText(s.manuscript[id] ?? ""));
    return { id, number: numbers.get(id) ?? "", title: card?.data.title.trim() || untitled, hint: shorten(hint) };
  });
}

/** Un numéro tapé (« 12 », « 12A ») donne cette scène ; sinon les scènes dont le titre ou le début du synopsis
 *  contient la saisie. */
export function matchChoices(list: SceneChoice[], query: string): SceneChoice[] {
  const raw = query.trim();
  if (!raw) return list;
  if (/^\d+[a-z]*$/i.test(raw)) return list.filter((c) => c.number.toLowerCase() === raw.toLowerCase());
  const q = foldSameLength(raw).toLowerCase();
  return list.filter((c) => foldSameLength(`${c.title} ${c.hint}`).toLowerCase().includes(q));
}
