// Texte d'une carte tant qu'on n'y écrit pas : le HTML que l'éditeur afficherait, sans éditeur.
// Créer un éditeur TipTap coûte une dizaine de millisecondes ; un projet de 400 cartes en créait 400 à
// l'ouverture. Le texte est passé par le schéma des cartes (mêmes nœuds : cases à cocher, mentions, liens),
// puis rendu comme le ferait l'éditeur. Les résultats sont gardés : le même texte n'est converti qu'une fois.

import { getSchema } from "@tiptap/react";
import { DOMParser as PMDOMParser, DOMSerializer, type Schema } from "@tiptap/pm/model";
import { richTextExtensions } from "./editorKit";
import { MentionNode } from "./MentionNode";

export interface StaticBody {
  /** HTML à afficher (déjà nettoyé : il vient de l'éditeur ou de `sanitizeHtml`, puis du schéma). */
  html: string;
  /** Aucun texte : la carte montre son texte indicatif. */
  empty: boolean;
}

const LIMIT = 4000;
const cache = new Map<string, StaticBody>();
let schema: Schema | null = null;

export function cardStaticBody(html: string): StaticBody {
  const known = cache.get(html);
  if (known) return known;
  schema ??= getSchema([...richTextExtensions(), MentionNode]);
  // Document inerte (rien ne s'y charge ni ne s'y exécute), comme pour sanitizeHtml.
  const source = new DOMParser().parseFromString(`<body>${html}</body>`, "text/html").body;
  const doc = PMDOMParser.fromSchema(schema).parse(source);
  const first = doc.firstChild;
  const empty = doc.childCount === 1 && !!first && first.type.name === "paragraph" && first.content.size === 0;
  let out = "";
  if (!empty) {
    const target = document.createElement("div");
    target.appendChild(DOMSerializer.fromSchema(schema).serializeFragment(doc.content, { document }));
    // Rien ne doit s'y focaliser au clavier : c'est une image du texte (au pointeur, voir .card-static input).
    target.querySelectorAll("input").forEach((input) => input.setAttribute("tabindex", "-1"));
    out = target.innerHTML;
  }
  const result = { html: out, empty };
  if (cache.size >= LIMIT) cache.delete(cache.keys().next().value!);
  cache.set(html, result);
  return result;
}
