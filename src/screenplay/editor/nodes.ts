// Schéma de l'éditeur de scénario : un nœud bloc par élément, sans mise en forme.
// Le texte d'un élément peut contenir des retours à la ligne (« \n », gardés tels quels).

import { Node, mergeAttributes } from "@tiptap/react";
import { sectionLabel } from "../template";
import { EDITABLE_TYPES, type ElementType } from "../model";

export type EditableType = (typeof EDITABLE_TYPES)[number];
export const isEditableType = (name: string): name is EditableType =>
  (EDITABLE_TYPES as readonly string[]).includes(name);

/** Éléments conservés tels quels (note, section, texte mis de côté…) : affichés, non éditables. */
export const PRESERVED = "preserved";
export type PreservedKind = Exclude<ElementType, EditableType>;

const text = (name: string) => ({
  default: null as string | null,
  parseHTML: (el: HTMLElement) => el.getAttribute(`data-${name}`),
  renderHTML: (attrs: Record<string, unknown>) => (attrs[name] ? { [`data-${name}`]: String(attrs[name]) } : {}),
});

const flag = (name: string) => ({
  default: false,
  parseHTML: (el: HTMLElement) => el.hasAttribute(`data-${name}`),
  renderHTML: (attrs: Record<string, unknown>) => (attrs[name] ? { [`data-${name}`]: "" } : {}),
});

/** Marque de l'IA (mode Atelier) : jamais reprise par l'élément qui naît d'un Entrée. */
const iaFlag = () => ({ ...flag("ia"), keepOnSplit: false });

function element(name: EditableType, attributes: Record<string, ReturnType<typeof text> | ReturnType<typeof flag> | ReturnType<typeof iaFlag>>) {
  return Node.create({
    name,
    group: "block",
    content: "text*",
    marks: "",
    whitespace: "pre",
    defining: true,
    addAttributes: () => attributes,
    parseHTML() {
      const own = { tag: `p[data-el="${name}"]`, preserveWhitespace: "full" as const };
      // Texte collé depuis ailleurs : chaque paragraphe devient de l'action.
      return name === "action" ? [own, { tag: "p", priority: 10 }, { tag: "div", priority: 10 }] : [own];
    },
    renderHTML({ HTMLAttributes }) {
      return ["p", mergeAttributes(HTMLAttributes, { "data-el": name, class: `sp-el sp-${name}` }), 0];
    },
  });
}

export const Doc = Node.create({ name: "doc", topNode: true, content: "block+" });

// L'action est déclarée en premier : c'est le type par défaut d'un document vide.
// « ia » (mode Atelier) : texte proposé par l'IA et accepté, note [[ia]] dans le fichier, souligné en pointillé.
export const Action = element("action", { forced: flag("forced"), ia: iaFlag() });
// « known » : l'élément est déjà connu du projet (lu dans le fichier, ou sa carte a été créée).
// Un en-tête ou un personnage écrit à l'instant ne l'est pas encore : sa carte est à créer.
export const SceneHeading = element("sceneHeading", {
  cardId: text("card"),
  sceneNumber: text("number"),
  forced: flag("forced"),
  known: flag("known"),
});
export const Character = element("character", { dual: flag("dual"), forced: flag("forced"), known: flag("known") });
export const Parenthetical = element("parenthetical", { ia: iaFlag() });
export const Dialogue = element("dialogue", { ia: iaFlag() });
export const Transition = element("transition", { forced: flag("forced") });

// Le libellé de chaque sorte (« Note », « Section »…) est posé en CSS : il suit la langue sans redessiner.
export const Preserved = Node.create({
  name: PRESERVED,
  group: "block",
  atom: true,
  selectable: true,
  addAttributes() {
    return {
      kind: {
        default: "note",
        parseHTML: (el: HTMLElement) => el.getAttribute("data-preserved"),
        renderHTML: () => ({}),
      },
      text: {
        default: "",
        parseHTML: (el: HTMLElement) => el.getAttribute("data-text") ?? "",
        renderHTML: () => ({}),
      },
      depth: {
        default: null as number | null,
        parseHTML: (el: HTMLElement) => Number(el.getAttribute("data-depth")) || null,
        renderHTML: () => ({}),
      },
      // Synopsis proposé par l'IA (mode Atelier) : gardé tel quel, comme le texte.
      ia: {
        default: false,
        parseHTML: (el: HTMLElement) => el.hasAttribute("data-ia"),
        renderHTML: () => ({}),
      },
    };
  },
  parseHTML: () => [{ tag: "div[data-preserved]" }],
  renderHTML({ node }) {
    const { kind, text: content, depth, ia } = node.attrs as { kind: PreservedKind; text: string; depth: number | null; ia: boolean };
    const attrs: Record<string, string> = {
      "data-preserved": kind,
      "data-text": content,
      class: "sp-preserved",
      contenteditable: "false",
    };
    if (depth) attrs["data-depth"] = String(depth);
    if (ia) attrs["data-ia"] = "";
    return ["div", attrs, kind === "section" ? sectionLabel(content) : content.trim()];
  },
});
