// Ce qui se décide pendant la frappe :
// - « int. », « ext. », « int./ext. », « i/e » en début d'action, de personnage ou de transition → en-tête de scène
//   (après une réplique, Entrée mène au personnage : c'est là qu'on tape souvent la scène suivante) ;
// - « ( » au début d'un dialogue vide → didascalie ;
// - en-têtes, personnages et transitions passent en majuscules à mesure qu'on les écrit.
// Chaque détection est une seule étape d'historique : Ctrl/Cmd+Z l'annule.

import { Extension, InputRule } from "@tiptap/react";
import { Plugin, PluginKey, TextSelection } from "@tiptap/pm/state";
import type { EditorView } from "@tiptap/pm/view";

export const UPPERCASE = new Set(["sceneHeading", "character", "transition"]);

/** Posée par un changement de type (Tab, barre d'éléments) : la casse d'avant est alors retenue. */
export const RETYPE_META = "screenplayRetype";

/**
 * Texte d'avant les majuscules : une action passée en personnage (ou en-tête, transition) puis remise en
 * action, sans avoir été retouchée, retrouve sa casse. Oublié dès que le texte de l'élément change.
 */
export interface CaseMemory {
  pos: number;
  original: string;
  upper: string;
}
export const caseMemory = new PluginKey<CaseMemory | null>("screenplayCaseMemory");
/** Éléments où « int. » ou « ext. » tapés en tête font un en-tête de scène. */
const HEADING_FROM = new Set(["action", "character", "transition"]);

export interface AutodetectOptions {
  /** Langue courante, pour les majuscules accentuées (É, À, Ç). */
  locale: () => string;
}

export const Autodetect = Extension.create<AutodetectOptions>({
  name: "screenplayAutodetect",
  addOptions: () => ({ locale: () => "fr" }),

  addInputRules() {
    return [
      new InputRule({
        find: /^(?:int\.?\/ext\.?|int\.|ext\.|est\.|i\/e)\s$/i,
        handler: ({ state, range, match }) => {
          const { tr, schema } = state;
          // Seulement si le préfixe (espace tapée comprise) est tout ce que contient l'élément.
          const $from = tr.doc.resolve(range.from);
          if (!HEADING_FROM.has($from.parent.type.name) || $from.parent.content.size !== range.to - range.from) return null;
          tr.insertText(match[0].toUpperCase(), range.from, range.to);
          tr.setBlockType(range.from, range.from, schema.nodes.sceneHeading);
        },
      }),
      new InputRule({
        find: /^\($/,
        handler: ({ state, range }) => {
          const { tr, schema } = state;
          // La parenthèse tapée est déjà dans la transaction : elle doit être tout le dialogue.
          const $from = tr.doc.resolve(range.from);
          if ($from.parent.type.name !== "dialogue" || $from.parent.content.size !== range.to - range.from) return null;
          const pos = $from.before(1);
          tr.replaceWith(pos, pos + $from.parent.nodeSize, schema.nodes.parenthetical.create(null, schema.text("()")));
          tr.setSelection(TextSelection.create(tr.doc, pos + 2));
        },
      }),
    ];
  },

  addProseMirrorPlugins() {
    const locale = this.options.locale;
    let view: EditorView | null = null;
    return [
      new Plugin<CaseMemory | null>({
        key: caseMemory,
        state: {
          init: () => null,
          apply(tr, value) {
            const set = tr.getMeta(caseMemory) as CaseMemory | null | undefined;
            if (set !== undefined) return set;
            if (!value || !tr.docChanged) return value;
            const pos = tr.mapping.map(value.pos, -1);
            const node = tr.doc.nodeAt(pos);
            return node && node.textContent === value.upper ? { ...value, pos } : null;
          },
        },
      }),
      new Plugin({
        key: new PluginKey("screenplayAutodetect"),
        view(editorView) {
          view = editorView;
          return {};
        },
        props: {
          // Taper « ) » devant la parenthèse fermante d'une didascalie : on passe par-dessus.
          handleTextInput(editorView, from, to, text) {
            const { $from } = editorView.state.selection;
            if (text !== ")" || from !== to || $from.parent.type.name !== "parenthetical") return false;
            if (editorView.state.doc.textBetween(from, Math.min(from + 1, $from.end())) !== ")") return false;
            editorView.dispatch(editorView.state.tr.setSelection(TextSelection.create(editorView.state.doc, from + 1)));
            return true;
          },
        },
        appendTransaction(transactions, _old, state) {
          // Ni au chargement d'un fichier, ni en annulant, ni pendant une saisie composée (accents, IME).
          if (!transactions.some((tr) => tr.docChanged)) return null;
          if (transactions.some((tr) => tr.getMeta("preventUpdate") || tr.getMeta("history$"))) return null;
          if (view?.composing) return null;

          // Seul l'élément en cours d'écriture change : un texte venu d'ailleurs n'est pas réécrit.
          const { $from, anchor, head } = state.selection;
          if ($from.depth !== 1 || !UPPERCASE.has($from.parent.type.name)) return null;
          const text = $from.parent.textContent;
          const upper = text.toLocaleUpperCase(locale());
          if (upper === text) return null;

          const start = $from.start(1);
          const tr = state.tr.insertText(upper, start, start + text.length);
          // Changement de type : on retient le texte d'avant, rendu si l'élément revient à un type en casse libre.
          if (transactions.some((t) => t.getMeta(RETYPE_META))) tr.setMeta(caseMemory, { pos: start - 1, original: text, upper });
          const keep = upper.length === text.length;
          return tr.setSelection(
            keep ? TextSelection.create(tr.doc, anchor, head) : TextSelection.create(tr.doc, start + upper.length),
          );
        },
      }),
    ];
  },
});
