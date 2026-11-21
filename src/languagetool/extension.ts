// Soulignements de LanguageTool dans un éditeur TipTap (manuscrit, scénario) : des décorations, jamais des marques,
// donc rien n'entre dans le texte enregistré. Un problème suit les modifications du texte et disparaît dès que son
// passage change (corrigé à la main ou par une proposition). Un clic sur un passage souligné l'ouvre dans la bulle
// (LanguageToolBubble), comme les touches Précédent et Suivant de celle-ci.

import { Extension } from "@tiptap/react";
import { Plugin, PluginKey, type EditorState, type Transaction } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import type { LtKind } from "./api";

export interface LtIssue {
  id: string;
  from: number;
  to: number;
  /** Le passage relevé : s'il change, le problème disparaît. */
  original: string;
  message: string;
  replacements: string[];
  kind: LtKind;
  rule: string;
}

export interface LtState {
  issues: LtIssue[];
  active: string | null;
  /** Demande de focus dans la bulle (ouverture au clavier), incrémentée à chaque demande. */
  focus: number;
}

type LtMeta =
  | { set: LtIssue[]; active?: string | null }
  /** Remarques neuves pour les parties relues (paragraphes, scène) : les anciennes de ces parties s'en vont. */
  | { within: { from: number; to: number }[]; add: LtIssue[]; active?: string | null } | { remove: string; active?: string | null } | { clear: true } | { active: string | null; focus?: boolean };

export const ltKey = new PluginKey<LtState>("languageTool");

const EMPTY: LtState = { issues: [], active: null, focus: 0 };

/** Problèmes suivis à travers une transaction : déplacés, et retirés si leur passage a changé. */
export function mapIssues(issues: LtIssue[], tr: Transaction): LtIssue[] {
  if (!tr.docChanged) return issues;
  const out: LtIssue[] = [];
  for (const i of issues) {
    const from = tr.mapping.map(i.from, 1);
    const to = tr.mapping.map(i.to, -1);
    if (to <= from || to > tr.doc.content.size) continue;
    if (tr.doc.textBetween(from, to, "\n", "") !== i.original) continue;
    out.push({ ...i, from, to });
  }
  return out;
}

function reduce(state: LtState, meta: LtMeta | undefined): LtState {
  if (!meta) return state;
  if ("clear" in meta) return EMPTY;
  if ("within" in meta) {
    const kept = state.issues.filter((i) => !meta.within.some((r) => i.from < r.to && i.to > r.from));
    const issues = [...kept, ...meta.add].sort((a, b) => a.from - b.from);
    const active = meta.active !== undefined ? meta.active : issues.some((i) => i.id === state.active) ? state.active : null;
    return { issues, active, focus: meta.active ? state.focus + 1 : state.focus };
  }
  if ("set" in meta) return { issues: meta.set, active: meta.active ?? null, focus: meta.active ? state.focus + 1 : state.focus };
  if ("remove" in meta) return { ...state, issues: state.issues.filter((i) => i.id !== meta.remove), active: meta.active ?? null };
  return { ...state, active: meta.active, focus: meta.focus ? state.focus + 1 : state.focus };
}

/** Pour les tests : le réducteur des remarques. */
export const reduceForTest = (state: LtState, meta: LtMeta) => reduce(state, meta);

export const ltState = (state: EditorState): LtState => ltKey.getState(state) ?? EMPTY;

/** Ordre de lecture : le problème qui suit (ou précède) `id`, en boucle. */
export function neighbour(issues: LtIssue[], id: string | null, step: 1 | -1): LtIssue | null {
  if (issues.length === 0) return null;
  const i = issues.findIndex((x) => x.id === id);
  if (i < 0) return step > 0 ? issues[0] : issues[issues.length - 1];
  return issues[(i + step + issues.length) % issues.length];
}

/** Le premier problème à partir d'une position (le curseur), sinon le premier du texte. */
export function firstFrom(issues: LtIssue[], pos: number): LtIssue | null {
  return issues.find((i) => i.to > pos) ?? issues[0] ?? null;
}

export const ltMeta = (tr: Transaction, meta: LtMeta) => tr.setMeta(ltKey, meta);

export const LanguageTool = Extension.create({
  name: "languageTool",
  // Avant les claviers des éditeurs : Échap ferme la bulle avant de quitter le mode focus ou de rendre la main à la barre.
  priority: 1000,
  addProseMirrorPlugins() {
    return [
      new Plugin<LtState>({
        key: ltKey,
        state: {
          init: () => EMPTY,
          apply(tr, value) {
            let next = value;
            if (tr.docChanged && value.issues.length > 0) {
              const issues = mapIssues(value.issues, tr);
              next = { ...value, issues, active: issues.some((i) => i.id === value.active) ? value.active : null };
            }
            return reduce(next, tr.getMeta(ltKey) as LtMeta | undefined);
          },
        },
        props: {
          decorations(state) {
            const { issues, active } = ltState(state);
            if (issues.length === 0) return null;
            return DecorationSet.create(
              state.doc,
              issues.map((i) => Decoration.inline(i.from, i.to, { class: `lt-issue is-${i.kind}${i.id === active ? " is-active" : ""}`, "data-lt": i.id })),
            );
          },
          // Échap dans le texte ferme d'abord la bulle ouverte (avant le mode focus).
          handleKeyDown(view, event) {
            if (event.key !== "Escape" || !ltState(view.state).active) return false;
            view.dispatch(ltMeta(view.state.tr, { active: null }));
            return true;
          },
          handleClick(view, pos) {
            const { issues, active } = ltState(view.state);
            const hit = issues.find((i) => i.from <= pos && pos <= i.to);
            if (!hit) {
              if (active) view.dispatch(ltMeta(view.state.tr, { active: null }));
              return false;
            }
            if (hit.id !== active) view.dispatch(ltMeta(view.state.tr, { active: hit.id }));
            return false; // le curseur se pose quand même : on peut corriger à la main
          },
        },
      }),
    ];
  },
});
