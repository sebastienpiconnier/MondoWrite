// Classeur d'un projet Scrivener 3 (le fichier .scrivx, XML) : l'arbre des documents avec leur type, leur titre,
// leurs étiquette, statut et mots-clés, et les réglages du projet utiles à l'import (libellés des statuts et des
// étiquettes, mots-clés, objectif du manuscrit). Pur : DOMParser seulement.

import type { SceneStatus } from "../../character";

export type BinderType = "DraftFolder" | "ResearchFolder" | "TrashFolder" | "Folder" | "Text" | "PDF" | "Image" | "WebArchive" | "Media" | string;

export interface BinderItem {
  uuid: string;
  type: BinderType;
  title: string;
  labelId: string | null;
  statusId: string | null;
  /** Faux seulement si Scrivener l'exclut de la compilation (« Include in Compile » décoché). */
  includeInCompile: boolean;
  keywordIds: string[];
  children: BinderItem[];
}

export interface Keyword {
  id: string;
  title: string;
  /** Mot-clé parent (Scrivener 3 range les mots-clés en arbre), ou null. */
  parentId: string | null;
}

export interface Binder {
  /** Version du format (`Version` de ScrivenerProject : « 2.0 » pour Scrivener 3). */
  version: string;
  items: BinderItem[];
  statuses: Record<string, string>;
  labels: Record<string, string>;
  /** Titre de l'étiquette (« Label », ou ce que l'auteur en a fait : « POV », « Intrigue »…). */
  labelTitle: string;
  keywords: Record<string, Keyword>;
  /** Objectif du manuscrit en mots, s'il est fixé. */
  draftTarget: number | null;
  /** Dossier des modèles de documents (à ne pas importer). */
  templateFolder: string | null;
}

/** Enfant direct d'un élément par son nom de balise (jamais un descendant plus profond). */
const child = (el: Element, name: string): Element | undefined => Array.from(el.children).find((c) => c.tagName === name);
const childText = (el: Element, name: string) => child(el, name)?.textContent?.trim() ?? "";

function readItem(el: Element): BinderItem {
  const meta = child(el, "MetaData");
  const keywords = child(el, "Keywords");
  const children = child(el, "Children");
  const label = meta ? childText(meta, "LabelID") : "";
  const status = meta ? childText(meta, "StatusID") : "";
  return {
    uuid: el.getAttribute("UUID") ?? el.getAttribute("ID") ?? "",
    type: el.getAttribute("Type") ?? "Text",
    title: childText(el, "Title"),
    labelId: label && label !== "-1" ? label : null,
    statusId: status && status !== "-1" ? status : null,
    includeInCompile: !meta || childText(meta, "IncludeInCompile").toLowerCase() !== "no",
    keywordIds: keywords ? Array.from(keywords.children).filter((k) => k.tagName === "KeywordID").map((k) => k.textContent?.trim() ?? "").filter(Boolean) : [],
    children: children ? Array.from(children.children).filter((c) => c.tagName === "BinderItem").map(readItem) : [],
  };
}

function readKeywords(list: Element | undefined, parentId: string | null, into: Record<string, Keyword>) {
  if (!list) return;
  for (const el of Array.from(list.children)) {
    if (el.tagName !== "Keyword") continue;
    const id = el.getAttribute("ID") ?? "";
    if (!id) continue;
    into[id] = { id, title: childText(el, "Title"), parentId };
    readKeywords(child(el, "Children"), id, into);
  }
}

function readList(parent: Element | undefined, container: string, item: string): Record<string, string> {
  const out: Record<string, string> = {};
  const list = parent && child(parent, container);
  if (!list) return out;
  for (const el of Array.from(list.children)) {
    if (el.tagName !== item) continue;
    const id = el.getAttribute("ID") ?? "";
    if (id && id !== "-1") out[id] = el.textContent?.trim() ?? "";
  }
  return out;
}

/** Le classeur, ou null si le texte n'est pas un projet Scrivener lisible. */
export function readBinder(xml: string): Binder | null {
  let doc: Document;
  try {
    doc = new DOMParser().parseFromString(xml, "application/xml");
  } catch {
    return null;
  }
  const root = doc.documentElement;
  if (!root || root.tagName !== "ScrivenerProject" || doc.getElementsByTagName("parsererror").length > 0) return null;
  const binder = child(root, "Binder");
  if (!binder) return null;
  const items = Array.from(binder.children).filter((c) => c.tagName === "BinderItem").map(readItem);
  const labelSettings = child(root, "LabelSettings");
  const statusSettings = child(root, "StatusSettings");
  const keywords: Record<string, Keyword> = {};
  readKeywords(child(root, "Keywords"), null, keywords);
  const targets = child(root, "ProjectTargets");
  const draft = targets && child(targets, "DraftTarget");
  const target = draft && (draft.getAttribute("Type") ?? "Words") === "Words" ? Number(draft.textContent?.trim()) : NaN;
  return {
    version: root.getAttribute("Version") ?? "",
    items,
    statuses: readList(statusSettings, "StatusItems", "Status"),
    labels: readList(labelSettings, "Labels", "Label"),
    labelTitle: labelSettings ? childText(labelSettings, "Title") || "Label" : "Label",
    keywords,
    draftTarget: Number.isFinite(target) && target > 0 ? Math.round(target) : null,
    templateFolder: childText(root, "TemplateFolderUUID") || null,
  };
}

/** Statut Scrivener → statut d'une scène MondoWrite, d'après son libellé (français ou anglais), sinon rien. */
export function statusOf(label: string): SceneStatus | null {
  const s = label
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
  if (!s.trim()) return null;
  if (/final|done|termin|fini|complet/.test(s)) return "fini";
  if (/revis|second|deuxieme|relu/.test(s)) return "revisee";
  if (/revoir|a reprendre|to revise/.test(s)) return "revoir";
  if (/to ?do|a faire|a ecrire|to write|idee|idea|outline/.test(s)) return "aecrire";
  if (/first|premier|brouillon|draft|jet/.test(s)) return "brouillon";
  return null;
}
