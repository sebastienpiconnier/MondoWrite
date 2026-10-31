// Screenplay ↔ document de l'éditeur (JSON ProseMirror). Un élément = un nœud de premier niveau,
// dans le même ordre : l'index d'un nœud est l'index de son élément.
// Le document n'est jamais la source de vérité sur disque : c'est scenario.fountain.

import type { JSONContent } from "@tiptap/react";
import type { Screenplay, ScreenplayElement } from "../model";
import { IA_TYPES } from "../../atelier";
import { PRESERVED, isEditableType, type PreservedKind } from "./nodes";

export function toDoc(screenplay: Screenplay): JSONContent {
  const content = screenplay.elements.map(toNode);
  // Un document ne peut pas être vide : un scénario commence par un en-tête de scène à remplir.
  return { type: "doc", content: content.length > 0 ? content : [{ type: "sceneHeading" }] };
}

function toNode(el: ScreenplayElement): JSONContent {
  if (!isEditableType(el.type)) {
    return { type: PRESERVED, attrs: { kind: el.type, text: el.text, depth: el.depth ?? null, ia: el.ia === true } };
  }
  const attrs: Record<string, unknown> = {};
  if (el.type === "sceneHeading") {
    attrs.cardId = el.cardId ?? null;
    attrs.sceneNumber = el.sceneNumber ?? null;
  }
  if (el.type === "character") attrs.dual = el.dual === true;
  // Ce qui vient du modèle est connu du projet : aucune carte à créer pour lui.
  if (el.type === "sceneHeading" || el.type === "character") attrs.known = true;
  if (el.type !== "parenthetical" && el.type !== "dialogue") attrs.forced = el.forced === true;
  if (IA_TYPES.has(el.type)) attrs.ia = el.ia === true;
  const node: JSONContent = { type: el.type, attrs };
  if (el.text !== "") node.content = [{ type: "text", text: el.text }];
  return node;
}

export function fromDoc(doc: JSONContent, titlePage: Screenplay["titlePage"]): Screenplay {
  return { titlePage, elements: (doc.content ?? []).map(fromNode) };
}

function fromNode(node: JSONContent): ScreenplayElement {
  const attrs = node.attrs ?? {};
  if (node.type === PRESERVED) {
    const el: ScreenplayElement = { type: attrs.kind as PreservedKind, text: String(attrs.text ?? "") };
    if (typeof attrs.depth === "number") el.depth = attrs.depth;
    if (attrs.ia && IA_TYPES.has(el.type)) el.ia = true;
    return el;
  }
  const type = node.type && isEditableType(node.type) ? node.type : "action";
  const el: ScreenplayElement = { type, text: (node.content ?? []).map((child) => child.text ?? "").join("") };
  if (type === "sceneHeading") {
    if (attrs.cardId) el.cardId = String(attrs.cardId);
    if (attrs.sceneNumber) el.sceneNumber = String(attrs.sceneNumber);
  }
  if (type === "character" && attrs.dual) el.dual = true;
  if (attrs.forced) el.forced = true;
  if (attrs.ia && IA_TYPES.has(type)) el.ia = true;
  return el;
}
