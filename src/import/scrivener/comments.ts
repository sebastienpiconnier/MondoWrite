// Commentaires et notes de bas de page de l'inspecteur de Scrivener : le fichier content.comments d'un document
// (XML), où chaque commentaire porte son identifiant (celui du champ scrivcmt:// qui entoure le passage) et son texte
// en RTF. Une note de bas de page de l'inspecteur suit le même chemin, marquée comme telle. Pur.

import { rtfText } from "./rtf";

export interface InspectorNote {
  id: string;
  text: string;
  footnote: boolean;
}

/** Commentaires d'un document, par identifiant. Un fichier illisible n'en donne aucun. */
export function readInspectorNotes(xml: string): Map<string, InspectorNote> {
  const out = new Map<string, InspectorNote>();
  if (!xml.trim()) return out;
  let doc: Document;
  try {
    doc = new DOMParser().parseFromString(xml, "application/xml");
  } catch {
    return out;
  }
  if (doc.getElementsByTagName("parsererror").length > 0) return out;
  for (const el of Array.from(doc.getElementsByTagName("*"))) {
    if (el.tagName !== "Comment" && el.tagName !== "Footnote") continue;
    const id = el.getAttribute("ID") ?? el.getAttribute("UUID") ?? "";
    if (!id) continue;
    const raw = el.textContent ?? "";
    const text = (raw.trimStart().startsWith("{\\rtf") ? rtfText(raw) : raw).trim();
    const flag = [el.getAttribute("Footnote"), el.getAttribute("Type"), el.getAttribute("Kind")].join(" ").toLowerCase();
    out.set(id, { id, text, footnote: el.tagName === "Footnote" || /yes|true|foot/.test(flag) });
  }
  return out;
}
