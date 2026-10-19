// Le livre entier dans un seul éditeur, mis en pages comme un livre ou un fichier Word (voir bookDoc.ts).
// Les scènes se suivent sans coupure ; le volet de gauche mène à une scène ou à un chapitre (on y défile).
// Chaque scène garde son fichier : ce qu'on écrit est rangé dans la scène où se trouve le curseur.

import { useEffect, useMemo, useRef, useState } from "react";
import { EditorContent, createDocument, getHTMLFromFragment, useEditor, type Editor } from "@tiptap/react";
import { Fragment, type Node as PMNode } from "@tiptap/pm/model";
import Placeholder from "@tiptap/extension-placeholder";
import { EditorState, Selection } from "@tiptap/pm/state";
import { richTextExtensions } from "./editorKit";
import { FormatBar } from "./FormatBar";
import { FocusWriting, focusKey } from "./focusWriting";
import { BookKeys, BookUndo, BookStructure, SceneMark, type BookHandlers } from "./bookExtensions";
import { Pages } from "../screenplay/editor/pages";
import { SCENE_MARK, bookBlocks, changedRange, composeBook, sceneAt, sceneGroups, structureSignature } from "../bookDoc";
import { isBlank } from "../manuscript";
import { isPageKind } from "../book";
import { useCosmos } from "../store";
import { useSettings } from "../settings";
import { getT, useT } from "../i18n";
import type { CardData } from "../types";
import type { Plan } from "../plan";

/** Page du manuscrit à l'écran, en em : format livre (2:3), environ 250 mots par page. */
export const PAGE = { width: 34, height: 51, marginTop: 5, marginBottom: 5, lineHeight: 1.6 };
/** En dessous de cette largeur (px), la feuille redevient continue. */
const PAGE_MIN_WIDTH = 460;

/** Ce que Manuscript peut demander à l'éditeur. */
export interface BookApi {
  /** Défile jusqu'au début d'une scène (sans placer le curseur : pas de clavier qui s'ouvre sur tablette). */
  scrollToScene: (id: string) => void;
  /** Place le curseur au début du texte d'une scène, au prochain redessin si la structure change. */
  focusScene: (id: string, offset?: number, later?: boolean) => void;
}

/** Premier ancêtre qui défile vraiment (null : c'est la fenêtre qui défile). */
export function scrollParent(el: HTMLElement): HTMLElement | null {
  for (let node: HTMLElement | null = el; node && node !== document.body; node = node.parentElement) {
    const overflow = getComputedStyle(node).overflowY;
    if ((overflow === "auto" || overflow === "scroll") && node.scrollHeight > node.clientHeight + 1) return node;
  }
  return null;
}

const norm = (html: string | undefined) => (isBlank(html) ? "" : (html ?? ""));

export function BookEditor({
  order,
  cards,
  plan,
  current,
  onCurrent,
  handlers,
  api,
  onPlace,
}: {
  order: string[];
  cards: CardData[];
  plan: Plan;
  current: string;
  onCurrent: (id: string) => void;
  handlers: { current: BookHandlers | null };
  api: { current: BookApi | null };
  /** Pages occupées par la scène en cours (null : pas de mise en pages, écran étroit ou mode focus). */
  onPlace: (place: { first: number; last: number } | null) => void;
}) {
  const t = useT();
  const lang = useSettings((s) => s.lang);
  const manuscript = useCosmos((s) => s.manuscript);
  const focusMode = useCosmos((s) => s.focusMode);
  const writing = useSettings((s) => s.writing);

  const blocks = useMemo(() => bookBlocks(order, cards, plan), [order, cards, plan]);
  const sig = useMemo(() => structureSignature(blocks), [blocks]);
  const blocksRef = useRef(blocks);
  blocksRef.current = blocks;
  const sigRef = useRef(sig);
  sigRef.current = sig;
  const cardsRef = useRef(cards);
  cardsRef.current = cards;
  const currentRef = useRef(current);
  currentRef.current = current;
  const onCurrentRef = useRef(onCurrent);
  onCurrentRef.current = onCurrent;
  const onPlaceRef = useRef(onPlace);
  onPlaceRef.current = onPlace;

  // Ce que l'éditeur a lui-même écrit dans chaque scène : tout autre changement du texte vient de l'extérieur.
  const written = useRef<Map<string, string> | null>(null);
  const docSig = useRef("");
  const initial = useRef<string | null>(null);
  if (initial.current === null) {
    const store = useCosmos.getState().manuscript;
    written.current = new Map(blocks.map((b) => [b.id, norm(store[b.id])]));
    docSig.current = sig;
    initial.current = composeBook(blocks, store);
  }
  // Où remettre le curseur au prochain redessin : une scène et une distance depuis son repère.
  const pending = useRef<{ id: string; offset: number } | null>(null);
  const layout = useRef<{ pages: number; breaks: number[] }>({ pages: 0, breaks: [] });
  const lastGo = useRef(0);
  const editorRef = useRef<Editor | null>(null);

  const placeOf = (ed: Editor) => {
    const { pages, breaks } = layout.current;
    if (!pages) return null;
    const g = sceneGroups(ed.state.doc).find((x) => x.id === currentRef.current);
    if (!g) return null;
    const pageAt = (pos: number) => 1 + breaks.filter((b) => b <= pos).length;
    return { first: pageAt(g.markerPos), last: Math.max(pageAt(g.markerPos), pageAt(g.end - 1)) };
  };
  const reportPlace = () => {
    const ed = editorRef.current;
    if (ed && !ed.isDestroyed) onPlaceRef.current(placeOf(ed));
  };

  const editor = useEditor({
    extensions: [
      ...richTextExtensions({ link: false }),
      SceneMark,
      BookStructure,
      // Texte indicatif dans une scène encore vide, selon la scène (dédicace, prologue, synopsis…).
      Placeholder.configure({
        showOnlyCurrent: false,
        placeholder: ({ editor: ed, pos }) => {
          const groups = sceneGroups(ed.state.doc);
          const g = sceneAt(groups, pos);
          if (!g || g.last !== g.first + 1) return "";
          const card = cardsRef.current.find((c) => c.id === g.id);
          if (!card) return "";
          const m = getT();
          if (isPageKind(card.page)) return m.book.placeholders[card.page];
          const opens = !!blocksRef.current.find((b) => b.id === g.id)?.chapter;
          return card.fiche?.synopsis?.trim() || (opens ? m.book.chapterOpening : m.manuscript.placeholder);
        },
      }),
      // Vraies pages, comme dans un livre : la hauteur des blocs est mesurée à l'écran, le chapitre ouvre une page.
      Pages.configure({
        geometry: () => {
          const lines = (PAGE.height - PAGE.marginTop - PAGE.marginBottom) / PAGE.lineHeight;
          return { lines: lines * PAGE.lineHeight, pageLines: PAGE.height, marginTop: PAGE.marginTop };
        },
        enabled: (dom) => !useCosmos.getState().focusMode && (dom.closest(".ms-main")?.clientWidth ?? 0) - 32 > PAGE_MIN_WIDTH,
        item: (type, node) =>
          type === SCENE_MARK
            ? { margin: 0, keep: node.attrs.chapterId ? 4 : node.attrs.breakBefore ? 2 : 0, before: !!node.attrs.newPage }
            : { margin: 0, keep: type === "heading" ? 3 : 0 },
        firstPage: () => 1,
        label: (page) => String(page),
        numberAt: "bottom",
        onLayout: (pages, breaks) => {
          layout.current = { pages, breaks };
          reportPlace();
        },
      }),
      BookUndo,
      BookKeys.configure({ handlers: () => handlers.current }),
      // Mode focus : la phrase ou le paragraphe en cours en pleine encre, le reste estompé.
      FocusWriting.configure({ mode: () => (useCosmos.getState().focusMode ? useSettings.getState().writing.highlight : "off") }),
    ],
    content: initial.current,
    immediatelyRender: true,
    editorProps: { attributes: { class: "ms-editor", "aria-label": getT().manuscript.bookAria } },
    // On range le texte dans la ou les scènes touchées, pas dans tout le livre.
    onUpdate: ({ editor: ed, transaction }) => {
      const range = changedRange(transaction);
      if (!range) return;
      const memo = written.current!;
      for (const g of sceneGroups(ed.state.doc)) {
        if (g.markerPos > range.to || g.end < range.from) continue;
        const html = scenesHtml(ed, g.first, g.last);
        const text = norm(html);
        if (memo.get(g.id) === text) continue;
        memo.set(g.id, text);
        useCosmos.getState().setManuscriptText(g.id, html);
      }
    },
    onSelectionUpdate: ({ editor: ed }) => {
      const g = sceneAt(sceneGroups(ed.state.doc), ed.state.selection.head);
      if (g && g.id !== currentRef.current) onCurrentRef.current(g.id);
    },
  });
  editorRef.current = editor;

  /** Redessine le livre depuis les cartes : structure changée (scène coupée, chapitre ouvert…) ou texte modifié ailleurs. */
  const rebuild = () => {
    const ed = editorRef.current;
    if (!ed || ed.isDestroyed) return;
    const { state, view } = ed;
    let target = pending.current;
    pending.current = null;
    // Redessin sans destination (chapitre supprimé, ordre changé…) : le livre reste où il est, il ne saute pas au début.
    const keepScroll = !target;
    const scroller = keepScroll ? scrollParent(view.dom) : null;
    const scrollTop = scroller ? scroller.scrollTop : window.scrollY;
    if (!target) {
      const g = sceneAt(sceneGroups(state.doc), state.selection.head);
      if (g) target = { id: g.id, offset: state.selection.head - g.markerPos };
    }
    const store = useCosmos.getState().manuscript;
    const doc = createDocument(composeBook(blocksRef.current, store), ed.schema);
    written.current = new Map(blocksRef.current.map((b) => [b.id, norm(store[b.id])]));
    docSig.current = sigRef.current;
    let selection = Selection.atStart(doc);
    const g = target ? sceneGroups(doc).find((x) => x.id === target!.id) : undefined;
    if (g && target) selection = Selection.near(doc.resolve(target.offset < 0 ? g.end - 1 : Math.min(g.markerPos + Math.max(target.offset, 2), doc.content.size)), target.offset < 0 ? -1 : 1);
    // Un état neuf : l'historique d'annulation repart de zéro (il ne sait pas défaire une scène coupée).
    view.updateState(EditorState.create({ doc, plugins: state.plugins, selection }));
    // Les sauts de page sont recalculés juste après le redessin : la hauteur du livre change et, sur un long
    // livre, la vue reculait de plusieurs chapitres. On replace donc la vue maintenant, puis après la mise en page.
    const place = () => {
      if (ed.isDestroyed) return;
      if (keepScroll) {
        if (scroller) scroller.scrollTop = scrollTop;
        else window.scrollTo(0, scrollTop);
      } else if (g) view.dom.querySelector(`[data-scene-id="${CSS.escape(g.id)}"]`)?.scrollIntoView({ block: "center" });
    };
    place();
    requestAnimationFrame(() => {
      place();
      requestAnimationFrame(place);
    });
    window.setTimeout(place, 200);
  };

  // Structure changée (ordre, chapitres, pages hors récit) : on redessine.
  useEffect(() => {
    if (sig !== docSig.current) rebuild();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sig, editor]);

  // Texte changé hors de l'éditeur (case cochée depuis « À faire », Rechercher et remplacer, scène restaurée) : l'éditeur suit.
  useEffect(() => {
    if (!editor || editor.isDestroyed) return;
    const memo = written.current!;
    if (blocks.some((b) => norm(manuscript[b.id]) !== memo.get(b.id))) rebuild();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [manuscript, editor]);

  // Interface demandée par Manuscript : défiler jusqu'à une scène, y placer le curseur.
  useEffect(() => {
    api.current = {
      scrollToScene: (id) => {
        lastGo.current = Date.now();
        editorRef.current?.view.dom.querySelector(`[data-scene-id="${CSS.escape(id)}"]`)?.scrollIntoView({ block: "start" });
      },
      focusScene: (id, offset = 2, later = false) => {
        pending.current = { id, offset };
        // `later` : la structure va changer, le curseur se place au redessin.
        if (later) return;
        // La structure ne change pas toujours (scène déjà là) : on place le curseur tout de suite.
        const ed = editorRef.current;
        const g = ed && !ed.isDestroyed ? sceneGroups(ed.state.doc).find((x) => x.id === id) : undefined;
        if (ed && g) {
          pending.current = null;
          ed.chain().setTextSelection(offset < 0 ? g.end - 1 : Math.min(g.markerPos + offset, ed.state.doc.content.size)).focus().run();
        }
      },
    };
    return () => {
      api.current = null;
    };
  }, [api, editor]);

  // Défiler dans le livre : la scène en cours suit (le volet de gauche la montre), sauf juste après un choix dans ce volet.
  useEffect(() => {
    if (!editor || editor.isDestroyed) return;
    const main = editor.view.dom.closest<HTMLElement>(".ms-main");
    let frame = 0;
    const spy = () => {
      frame = 0;
      if (Date.now() - lastGo.current < 800 || editor.isDestroyed) return;
      const top = (main ? main.getBoundingClientRect().top : 0) + 96;
      let found: string | null = null;
      for (const el of editor.view.dom.querySelectorAll<HTMLElement>("[data-scene-id]")) {
        if (el.getBoundingClientRect().top <= top) found = el.dataset.sceneId ?? null;
        else break;
      }
      if (found && found !== currentRef.current) onCurrentRef.current(found);
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(spy);
    };
    const targets: EventTarget[] = [main ?? window, window];
    targets.forEach((target) => target.addEventListener("scroll", schedule, { passive: true }));
    return () => {
      targets.forEach((target) => target.removeEventListener("scroll", schedule));
      if (frame) cancelAnimationFrame(frame);
    };
  }, [editor]);

  // Langue changée : le texte indicatif et les repères se redessinent.
  useEffect(() => {
    if (!editor || editor.isDestroyed) return;
    editor.setOptions({ editorProps: { ...editor.options.editorProps, attributes: { class: "ms-editor", "aria-label": t.manuscript.bookAria } } });
    editor.view.dispatch(editor.state.tr.setMeta("cosmos:lang", lang));
  }, [lang, t, editor]);

  // Pages occupées par la scène en cours : à jour quand elle change.
  useEffect(() => {
    reportPlace();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current, editor, focusMode]);

  // Mode focus : mise en valeur redessinée quand le réglage change ; machine à écrire et voile de la ligne.
  const [veil, setVeil] = useState<{ top: number; bottom: number } | null>(null);
  useEffect(() => {
    if (!editor || editor.isDestroyed) return;
    editor.view.dispatch(editor.state.tr.setMeta(focusKey, Date.now()));
    const follow = () => {
      if (!focusMode || editor.isDestroyed) return setVeil(null);
      const { view } = editor;
      const page = view.dom.closest<HTMLElement>(".ms-page");
      const main = view.dom.closest<HTMLElement>(".ms-main");
      if (!page || !main) return;
      let caret: { top: number; bottom: number };
      try {
        caret = view.coordsAtPos(view.state.selection.head);
      } catch {
        return;
      }
      // Machine à écrire : la ligne du curseur se tient aux deux cinquièmes de la hauteur.
      // Sur iPad en portrait (et téléphone), ce n'est pas .ms-main qui défile mais un parent, voire la fenêtre :
      // on cherche le premier ancêtre réellement défilant, à défaut la fenêtre elle-même.
      if (writing.typewriter) {
        const scroller = scrollParent(main);
        const box = scroller ? scroller.getBoundingClientRect() : { top: 0, height: window.innerHeight };
        const delta = caret.top - (box.top + box.height * 0.4);
        if (Math.abs(delta) > 1) {
          if (scroller) scroller.scrollTop += delta;
          else window.scrollBy(0, delta);
          caret = view.coordsAtPos(view.state.selection.head);
        }
      }
      if (writing.highlight !== "line") return setVeil(null);
      const top = page.getBoundingClientRect().top;
      setVeil({ top: caret.top - top - 2, bottom: caret.bottom - top + 2 });
    };
    follow();
    editor.on("selectionUpdate", follow);
    editor.on("update", follow);
    editor.on("focus", follow);
    return () => {
      editor.off("selectionUpdate", follow);
      editor.off("update", follow);
      editor.off("focus", follow);
    };
  }, [editor, focusMode, writing]);

  return (
    <>
      <EditorContent editor={editor} />
      {editor && <FormatBar editor={editor} revisit />}
      {veil && (
        <>
          <div className="ms-veil" aria-hidden="true" style={{ top: 0, height: Math.max(0, veil.top) }} />
          <div className="ms-veil" aria-hidden="true" style={{ top: veil.bottom, bottom: 0 }} />
        </>
      )}
    </>
  );
}

/** HTML des blocs d'une scène (du premier bloc de texte au repère suivant). */
function scenesHtml(ed: Editor, first: number, last: number): string {
  const { doc, schema } = ed.state;
  const nodes: PMNode[] = [];
  for (let i = first; i < last; i++) nodes.push(doc.child(i));
  return getHTMLFromFragment(Fragment.fromArray(nodes), schema);
}
