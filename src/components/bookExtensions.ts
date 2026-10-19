// Extensions TipTap du manuscrit en un seul document (voir bookDoc.ts) : le repère de scène, ses décorations
// (pages hors récit, lettrine, premier paragraphe d'une scène), la garde qui empêche de perdre un repère, et les
// touches Entrée / Retour arrière / Suppr du chapitrage.

import { Extension, Node, getHTMLFromFragment } from "@tiptap/react";
import { Fragment, Slice, type Node as PMNode } from "@tiptap/pm/model";
import { Mapping } from "@tiptap/pm/transform";
import { Plugin, PluginKey, type EditorState } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import { useCosmos } from "../store";
import { fmt, getT } from "../i18n";
import { QUIET_PAGES, isPageKind } from "../book";
import { SCENE_MARK, sceneAt, sceneGroups } from "../bookDoc";

/** Ce que le chapitrage demande à l'écran (la logique, qui touche au plan et aux cartes, vit dans Manuscript). */
export interface BookHandlers {
  /** Entrée sur une ligne vide au milieu d'une scène (le texte de la suite, déjà retiré de l'éditeur, part dans une nouvelle scène). */
  onSceneBreak: (id: string, rest: string) => boolean;
  /** Entrée au début d'une scène encore vide : elle ouvre un nouveau chapitre. */
  onChapterBreak: (id: string) => boolean;
  /** Retour arrière au début d'une scène (ou Suppr à la fin de la précédente) : la scène `from` rejoint `into`. `offset` : où remettre le curseur, à partir du repère de `into`. */
  onJoin: (from: string, into: string, offset: number) => boolean;
}

/** Repère qui ouvre chaque scène : invisible, ou « * * * », ou ouverture de chapitre (numéro, titre modifiable). */
export const SceneMark = Node.create({
  name: SCENE_MARK,
  group: "block",
  atom: true,
  selectable: false,
  draggable: false,
  addAttributes() {
    const attr = (name: string, parse: (v: string | null) => unknown = (v) => v) => ({ default: null, parseHTML: (el: HTMLElement) => parse(el.getAttribute(name)), rendered: false });
    return {
      id: attr("data-scene"),
      chapterId: attr("data-chapter-id"),
      chapterN: { default: 0, parseHTML: (el: HTMLElement) => Number(el.getAttribute("data-chapter-n")) || 0, rendered: false },
      page: attr("data-page"),
      newPage: { default: false, parseHTML: (el: HTMLElement) => el.hasAttribute("data-new-page"), rendered: false },
      breakBefore: { default: false, parseHTML: (el: HTMLElement) => el.hasAttribute("data-break"), rendered: false },
    };
  },
  parseHTML: () => [{ tag: "div[data-scene-mark]" }],
  renderHTML: ({ node }) => ["div", { "data-scene-mark": "1", "data-scene": String(node.attrs.id) }],
  addNodeView() {
    return ({ node }) => {
      let current: PMNode = node;
      const dom = document.createElement("div");
      dom.contentEditable = "false";
      let unsubscribe: (() => void) | null = null;

      const chapterTitle = (chapterId: string) => useCosmos.getState().plan.chapters?.find((c) => c.id === chapterId)?.title ?? "";
      const render = () => {
        unsubscribe?.();
        unsubscribe = null;
        const a = current.attrs;
        const t = getT();
        dom.replaceChildren();
        dom.className = `scene-mark${a.chapterId ? " opens-chapter" : ""}${a.newPage ? " new-page" : ""}`;
        dom.dataset.sceneId = String(a.id);
        if (a.page) dom.dataset.page = String(a.page);
        else delete dom.dataset.page;
        if (a.chapterId) {
          const chapterId = String(a.chapterId);
          const head = document.createElement("div");
          head.className = "ms-chapter-flow";
          const label = document.createElement("span");
          label.className = "ms-chapter-heading";
          label.textContent = fmt(t.chapters.numbered, { n: Number(a.chapterN) || 0 });
          const input = document.createElement("input");
          input.className = "ms-chapter-input";
          input.value = chapterTitle(chapterId);
          input.placeholder = t.chapters.titlePlaceholder;
          input.setAttribute("aria-label", t.book.chapterTitle);
          input.addEventListener("input", () => useCosmos.getState().renamePlanChapter(chapterId, input.value));
          const remove = document.createElement("button");
          remove.type = "button";
          remove.className = "icon-button ms-chapter-remove";
          remove.textContent = "×";
          remove.setAttribute("aria-label", t.book.removeChapter);
          remove.title = t.book.removeChapter;
          remove.addEventListener("click", () => useCosmos.getState().deletePlanChapter(chapterId));
          head.append(label, input, remove);
          dom.append(head);
          // Titre renommé ailleurs (plan) : le champ suit, sauf quand on y écrit.
          unsubscribe = useCosmos.subscribe((s, prev) => {
            if (s.plan === prev.plan || document.activeElement === input) return;
            input.value = s.plan.chapters?.find((c) => c.id === chapterId)?.title ?? "";
          });
        } else if (a.breakBefore) {
          const stars = document.createElement("div");
          stars.className = "scene-break";
          stars.setAttribute("aria-hidden", "true");
          stars.textContent = "* * *";
          dom.append(stars);
        }
      };
      render();
      return {
        dom,
        update(next) {
          if (next.type !== current.type) return false;
          if (JSON.stringify(next.attrs) !== JSON.stringify(current.attrs)) return false;
          current = next;
          return true;
        },
        stopEvent: (event) => event.target instanceof HTMLElement && !!event.target.closest("input, button"),
        ignoreMutation: () => true,
        destroy: () => unsubscribe?.(),
      };
    };
  },
});

const structureKey = new PluginKey<{ focused: boolean; set: DecorationSet }>("bookStructure");

/** Classes posées sur les blocs : premier paragraphe d'une scène, pages hors récit, lettrine d'ouverture de chapitre. */
function decorate(state: EditorState, focused: boolean): DecorationSet {
  const decorations: Decoration[] = [];
  let mark: PMNode | null = null;
  let first = false;
  const { from, to } = state.selection;
  state.doc.forEach((node, offset) => {
    if (node.type.name === SCENE_MARK) {
      mark = node;
      first = true;
      return;
    }
    const classes: string[] = [];
    const page = mark?.attrs.page;
    if (first) classes.push("scene-first");
    if (isPageKind(page)) classes.push("pg", `pg-${page}`, ...(QUIET_PAGES.has(page) ? ["is-quiet"] : []));
    // Lettrine : seulement au premier paragraphe d'un chapitre, et pas pendant qu'on y écrit (le curseur se perdait dans WebKit).
    if (first && !page && mark?.attrs.chapterId && node.type.name === "paragraph" && node.textContent.trim() !== "" && !(focused && from < offset + node.nodeSize && to > offset)) {
      classes.push("has-dropcap");
    }
    first = false;
    if (classes.length) decorations.push(Decoration.node(offset, offset + node.nodeSize, { class: classes.join(" ") }));
  });
  return DecorationSet.create(state.doc, decorations);
}

/** Retire les repères d'un texte copié : coller ou déposer du texte ne duplique jamais une scène. */
function withoutMarks(fragment: Fragment): Fragment {
  const kept: PMNode[] = [];
  fragment.forEach((node) => {
    if (node.type.name !== SCENE_MARK) kept.push(node);
  });
  return Fragment.fromArray(kept);
}

export const BookStructure = Extension.create({
  name: "cosmosBookStructure",
  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: structureKey,
        state: {
          init: (_config, state) => ({ focused: false, set: decorate(state, false) }),
          apply: (tr, value, _old, state) => {
            const meta = tr.getMeta(structureKey) as boolean | undefined;
            const focused = meta === undefined ? value.focused : meta;
            if (!tr.docChanged && !tr.selectionSet && meta === undefined) return value;
            return { focused, set: decorate(state, focused) };
          },
        },
        props: {
          decorations: (state) => structureKey.getState(state)?.set,
          transformPasted: (slice) => new Slice(withoutMarks(slice.content), slice.openStart, slice.openEnd),
          handleDOMEvents: {
            focus: (view) => {
              view.dispatch(view.state.tr.setMeta(structureKey, true));
              return false;
            },
            blur: (view) => {
              view.dispatch(view.state.tr.setMeta(structureKey, false));
              return false;
            },
          },
        },
        // Un repère emporté par une suppression de plusieurs scènes revient (la scène garde sa carte) ; une scène vidée garde un paragraphe.
        appendTransaction: (transactions, oldState, newState) => {
          if (!transactions.some((t) => t.docChanged)) return null;
          const now = new Set<string>();
          newState.doc.forEach((n) => {
            if (n.type.name === SCENE_MARK) now.add(String(n.attrs.id));
          });
          const lost: { node: PMNode; pos: number }[] = [];
          oldState.doc.forEach((n, offset) => {
            if (n.type.name === SCENE_MARK && !now.has(String(n.attrs.id))) lost.push({ node: n, pos: offset });
          });
          const tr = newState.tr;
          if (lost.length) {
            const mapping = new Mapping();
            transactions.forEach((t) => t.mapping.maps.forEach((m) => mapping.appendMap(m)));
            for (const { node, pos } of lost) {
              let at = tr.mapping.map(mapping.map(pos, 1), 1);
              const $at = tr.doc.resolve(at);
              if ($at.depth > 0) {
                if ($at.parentOffset === 0) at = $at.before(1);
                else if ($at.parentOffset === $at.parent.content.size) at = $at.after(1);
                else {
                  tr.split(at);
                  at = tr.mapping.map(at, 1);
                }
              }
              tr.insert(at, node);
            }
          }
          // Chaque scène garde au moins un paragraphe (sinon on ne peut plus y écrire).
          const empty: number[] = [];
          tr.doc.forEach((n, offset, index) => {
            if (n.type.name !== SCENE_MARK) return;
            const next = index + 1 < tr.doc.childCount ? tr.doc.child(index + 1) : null;
            if (!next || next.type.name === SCENE_MARK) empty.push(offset + n.nodeSize);
          });
          for (const at of empty.reverse()) tr.insert(at, newState.schema.nodes.paragraph.create());
          return tr.docChanged ? tr : null;
        },
      }),
    ];
  },
});

/** Entrée, Retour arrière et Suppr du chapitrage (la logique du plan vit dans Manuscript, passée par une fonction). */
export const BookKeys = Extension.create<{ handlers: () => BookHandlers | null }>({
  name: "cosmosBookKeys",
  // Une fonction, pas la ref : TipTap copie les objets d'options, et la copie garderait des gestionnaires périmés.
  addOptions: () => ({ handlers: () => null }),
  addKeyboardShortcuts() {
    const handlers = () => this.options.handlers();
    return {
      Enter: () => {
        const h = handlers();
        const { state } = this.editor;
        const { $from, empty } = state.selection;
        if (!h || !empty || $from.depth !== 1 || $from.parent.type.name !== "paragraph" || $from.parent.content.size > 0) return false;
        const groups = sceneGroups(state.doc);
        const g = sceneAt(groups, $from.pos);
        if (!g) return false;
        const index = $from.index(0);
        // Troisième Entrée : au début d'une scène encore vide, elle ouvre un chapitre.
        if (index === g.first) return g.last === g.first + 1 && h.onChapterBreak(g.id);
        // Une page hors récit (dédicace, titre…) garde ses lignes vides.
        if (state.doc.nodeAt(g.markerPos)?.attrs.page) return false;
        // Deuxième Entrée : la ligne vide disparaît, tout ce qui la suit part dans la nouvelle scène.
        const start = $from.before(1);
        const after = $from.after(1);
        const rest = after < g.end ? getHTMLFromFragment(state.doc.slice(after, g.end).content, state.schema) : "";
        if (!h.onSceneBreak(g.id, rest)) return false;
        this.editor.chain().deleteRange({ from: start, to: g.end }).run();
        return true;
      },
      Backspace: () => {
        const h = handlers();
        const { state } = this.editor;
        const { $from, empty } = state.selection;
                if (!h || !empty || $from.depth !== 1 || $from.parentOffset !== 0) return false;
        const groups = sceneGroups(state.doc);
        const g = sceneAt(groups, $from.pos);
        if (!g || $from.index(0) !== g.first) return false;
        const at = groups.indexOf(g);
        // Au tout début du livre : rien à rejoindre, et le repère ne doit pas être touché.
        if (at === 0) return true;
        const previous = groups[at - 1];
        h.onJoin(g.id, previous.id, g.markerPos - previous.markerPos);
        return true;
      },
      Delete: () => {
        const h = handlers();
        const { state } = this.editor;
        const { $from, empty } = state.selection;
        if (!h || !empty || $from.depth !== 1 || $from.parentOffset !== $from.parent.content.size) return false;
        const groups = sceneGroups(state.doc);
        const g = sceneAt(groups, $from.pos);
        if (!g || $from.index(0) !== g.last - 1) return false;
        const at = groups.indexOf(g);
        const next = groups[at + 1];
        if (!next) return false;
        h.onJoin(next.id, g.id, $from.pos - g.markerPos);
        return true;
      },
    };
  },
});
