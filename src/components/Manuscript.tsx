// Manuscrit (vue Manuscrit d'un projet roman) : on écrit une scène à la fois, dans l'ordre du Plan.
// À gauche les scènes, regroupées par chapitre, et leur nombre de mots ; au centre le texte, mis en
// pages comme un livre (la numérotation continue d'une scène à l'autre) ; à droite les statistiques
// et objectifs, puis « Dans cette scène » : les personnages et lieux cités, et les notes de la carte.
// Le titre reste celui de la carte ; le texte vit dans manuscrit/<id>.md.
//
// Chapitrage à la manière de NEO : Entrée deux fois (sur une ligne vide) coupe la scène, la suite du texte
// part dans une nouvelle scène du même chapitre ; Entrée une troisième fois, au début de cette nouvelle
// scène encore vide, en fait l'ouverture d'un nouveau chapitre. Retour arrière dans la scène vide annule
// la coupure. Une scène peut aussi devenir une page du livre (page de titre, dédicace, prologue…, voir book.ts).

import { sceneStatus } from "../character";
import { SceneStatusPicker, StatusDot } from "./SceneStatusPicker";
import { ContinuousBook } from "./ContinuousBook";
import { SynopsisField } from "./SynopsisField";
import { DropCap } from "./dropCap";
import { TrashIcon } from "./TrashIcon";
import { useEffect, useMemo, useRef, useState } from "react";
import { EditorContent, Extension, getHTMLFromFragment, useEditor } from "@tiptap/react";
import { richTextExtensions } from "./editorKit";
import { FormatBar } from "./FormatBar";
import { FocusWriting, focusKey } from "./focusWriting";
import { FOCUS_HIGHLIGHTS } from "../focusText";
import Placeholder from "@tiptap/extension-placeholder";
import { useCosmos } from "../store";
import { useSettings } from "../settings";
import { fmt, getT, useT } from "../i18n";
import { typeColor } from "../types";
import { chapterNumbers, chapterOf, chapterStep, groupByChapter, type Chapter } from "../plan";
import { PAGE_KINDS, QUIET_PAGES, bookOrder, isPageKind, type PageKind } from "../book";
import { countWords, detectCards, orphanTexts } from "../manuscript";
import { plainText } from "../search";
import { Pages } from "../screenplay/editor/pages";
import { dayKey, firstPageOf, manuscriptStats, pagesFor, streak, wordsOn, WORDS_PER_PAGE } from "../stats";

/** Page du manuscrit à l'écran, en em : format livre (2:3), environ 250 mots par page. */
const PAGE = { width: 34, height: 51, marginTop: 5, marginBottom: 5, lineHeight: 1.6 };
/** En dessous de cette largeur (px), la feuille redevient continue. */
const PAGE_MIN_WIDTH = 460;

/** Éditeur du texte d'une scène. Remonté à chaque changement de scène (`key`), pour repartir d'un historique vide. */
interface BreakHandlers {
  /** Entrée sur une ligne vide (deuxième Entrée) : coupe la scène ; reçoit le HTML de la suite. Faux : Entrée normale. */
  onSceneBreak: (rest: string) => boolean;
  /** Entrée au début d'une scène tout juste coupée et encore vide (troisième Entrée). */
  onChapterBreak: () => boolean;
  /** Retour arrière dans une scène tout juste coupée et encore vide : on revient à la scène d'avant. */
  onUndoBreak: () => boolean;
}

/** Entrée et Retour arrière du chapitrage (la logique vit dans Manuscript, passée par une ref). */
const BookKeys = Extension.create<{ handlers: { current: BreakHandlers | null } }>({
  name: "cosmosBookKeys",
  addOptions: () => ({ handlers: { current: null } }),
  addKeyboardShortcuts() {
    const handlers = () => this.options.handlers.current;
    const isEmptyDoc = () => this.editor.state.doc.childCount === 1 && this.editor.state.doc.textContent === "";
    return {
      Enter: () => {
        const h = handlers();
        const { state } = this.editor;
        const { $from, empty } = state.selection;
        if (!h || !empty || $from.depth !== 1 || $from.parent.type.name !== "paragraph" || $from.parent.content.size > 0) return false;
        if (isEmptyDoc()) return h.onChapterBreak();
        if ($from.index(0) === 0) return false;
        // Deuxième Entrée : la ligne vide disparaît, tout ce qui la suit part dans la nouvelle scène.
        const start = $from.before(1);
        const after = $from.after(1);
        const rest = state.doc.content.size > after ? getHTMLFromFragment(state.doc.slice(after, state.doc.content.size).content, state.schema) : "";
        if (!h.onSceneBreak(rest)) return false;
        this.editor.chain().deleteRange({ from: start, to: state.doc.content.size }).run();
        return true;
      },
      Backspace: () => {
        const h = handlers();
        return !!h && isEmptyDoc() && h.onUndoBreak();
      },
    };
  },
});

function SceneEditor({
  id,
  title,
  placeholder,
  firstPage,
  onPages,
  handlers,
  focusStart,
}: {
  id: string;
  title: string;
  /** Texte indicatif selon la page (dédicace, prologue…) ou la scène. */
  placeholder: string;
  firstPage: number;
  onPages: (n: number) => void;
  handlers: { current: BreakHandlers | null };
  focusStart: boolean;
}) {
  const lang = useSettings((s) => s.lang);
  const placeholderRef = useRef(placeholder);
  placeholderRef.current = placeholder;
  const firstRef = useRef(firstPage);
  firstRef.current = firstPage;
  const onPagesRef = useRef(onPages);
  onPagesRef.current = onPages;
  const editor = useEditor({
    extensions: [
      ...richTextExtensions({ link: false }),
      // Fonction : relue à chaque rendu, donc suit le changement de langue.
      Placeholder.configure({ placeholder: () => placeholderRef.current }),
      // Vraies pages, comme dans un livre : la hauteur des paragraphes est mesurée à l'écran.
      Pages.configure({
        geometry: () => {
          const lines = (PAGE.height - PAGE.marginTop - PAGE.marginBottom) / PAGE.lineHeight;
          return { lines: lines * PAGE.lineHeight, pageLines: PAGE.height, marginTop: PAGE.marginTop };
        },
        enabled: (dom) => (dom.closest(".ms-main")?.clientWidth ?? 0) - 32 > PAGE_MIN_WIDTH,
        item: (type) => ({ margin: 0, keep: type === "heading" ? 3 : 0 }),
        firstPage: () => firstRef.current,
        label: (page) => String(page),
        onLayout: (n) => onPagesRef.current(n),
      }),
      BookKeys.configure({ handlers }),
      DropCap,
      // Mode focus : la phrase ou le paragraphe en cours en pleine encre, le reste estompé.
      FocusWriting.configure({ mode: () => (useCosmos.getState().focusMode ? useSettings.getState().writing.highlight : "off") }),
    ],
    // Scène née d'une coupure : on continue d'écrire au début, sans quitter le clavier.
    autofocus: focusStart ? "start" : false,
    content: useCosmos.getState().manuscript[id] ?? "",
    immediatelyRender: true,
    editorProps: { attributes: { class: "ms-editor", "aria-label": fmt(getT().manuscript.editorAria, { title }) } },
    onUpdate: ({ editor: ed }) => useCosmos.getState().setManuscriptText(id, ed.getHTML()),
  });

  // Langue ou titre changés : on met à jour ce que TipTap a figé à la création.
  useEffect(() => {
    if (!editor || editor.isDestroyed) return;
    editor.setOptions({
      editorProps: { ...editor.options.editorProps, attributes: { class: "ms-editor", "aria-label": fmt(getT().manuscript.editorAria, { title }) } },
    });
    editor.view.dispatch(editor.state.tr.setMeta("cosmos:lang", lang));
  }, [lang, title, placeholder, editor]);

  // Texte changé hors de l'éditeur (case cochée depuis « À faire ») : l'éditeur suit.
  const stored = useCosmos((s) => s.manuscript[id] ?? "");
  useEffect(() => {
    if (!editor || editor.isDestroyed || stored === editor.getHTML() || (stored === "" && editor.isEmpty)) return;
    editor.commands.setContent(stored, { emitUpdate: false });
  }, [stored, editor]);

  // Mode focus : mise en valeur redessinée quand le réglage change ; machine à écrire et voile de la ligne.
  const focusMode = useCosmos((s) => s.focusMode);
  const writing = useSettings((s) => s.writing);
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

/** Premier ancêtre qui défile vraiment (null : c'est la fenêtre qui défile). */
function scrollParent(el: HTMLElement): HTMLElement | null {
  for (let node: HTMLElement | null = el; node && node !== document.body; node = node.parentElement) {
    const overflow = getComputedStyle(node).overflowY;
    if ((overflow === "auto" || overflow === "scroll") && node.scrollHeight > node.clientHeight + 1) return node;
  }
  return null;
}

export function Manuscript() {
  const t = useT();
  const m = t.manuscript;
  const lang = useSettings((s) => s.lang);
  const nodes = useCosmos((s) => s.nodes);
  const plan = useCosmos((s) => s.plan);
  const manuscript = useCosmos((s) => s.manuscript);
  const updateCard = useCosmos((s) => s.updateCard);
  const addTitledCard = useCosmos((s) => s.addTitledCard);
  const splitScene = useCosmos((s) => s.splitScene);
  const startChapterAt = useCosmos((s) => s.startChapterAt);
  const renamePlanChapter = useCosmos((s) => s.renamePlanChapter);
  const deletePlanChapter = useCosmos((s) => s.deletePlanChapter);
  const movePlanChapter = useCosmos((s) => s.movePlanChapter);
  // Chapitre qu'on glisse dans la colonne : une ref, le dépôt peut arriver avant le rendu suivant.
  const draggedRef = useRef<string | null>(null);
  const [dragged, setDragged] = useState<string | null>(null);
  const [over, setOver] = useState<string | null>(null);
  const setSceneChapter = useCosmos((s) => s.setSceneChapter);
  // Scène qu'on glisse dans la colonne (même raison : une ref) et l'endroit où elle irait.
  const sceneDragRef = useRef<string | null>(null);
  const [sceneDrag, setSceneDrag] = useState<string | null>(null);
  const [sceneOver, setSceneOver] = useState<{ id: string; side: "before" | "after" } | null>(null);
  const deleteCard = useCosmos((s) => s.deleteCard);
  const b = t.book;
  const focusMode = useCosmos((s) => s.focusMode);
  const setFocusMode = useCosmos((s) => s.setFocusMode);
  const writing = useSettings((s) => s.writing);
  const setWriting = useSettings((s) => s.setWriting);
  const target = useCosmos((s) => s.manuscriptTarget);
  const revealCard = useCosmos((s) => s.revealCard);
  const restoreScene = useCosmos((s) => s.restoreScene);

  const cards = useMemo(() => nodes.map((n) => n.data), [nodes]);
  // Tout le livre : pages de début, récit dans l'ordre du Plan, pages de fin.
  const order = useMemo(() => bookOrder(nodes, plan), [nodes, plan]);
  const orphans = useMemo(() => orphanTexts(manuscript, order), [manuscript, order]);

  const [chosen, setChosen] = useState<string | null>(null);
  const current = chosen && order.includes(chosen) ? chosen : (order[0] ?? null);
  const card = cards.find((c) => c.id === current);
  const currentRef = useRef<string | null>(null);
  currentRef.current = current;
  const [draft, setDraft] = useState("");
  const mainRef = useRef<HTMLDivElement>(null);
  // Scène tout juste née d'une coupure (deux fois Entrée) : une Entrée de plus en fait un chapitre.
  const [fresh, setFresh] = useState<{ id: string; from: string } | null>(null);
  const [said, setSaid] = useState("");
  // Coupure qu'on vient de faire (scène ou chapitre) : annoncée à l'écran, avec « Annuler ».
  const [notice, setNotice] = useState<{ text: string; undo: () => void } | null>(null);
  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(null), 10000);
    return () => window.clearTimeout(timer);
  }, [notice]);
  const handlers = useRef<BreakHandlers | null>(null);

  // Arrivée depuis « À faire » : la bonne scène.
  useEffect(() => {
    if (!target) return;
    useCosmos.getState().clearManuscriptTarget();
    setChosen(target);
    mainRef.current?.scrollTo(0, 0);
  }, [target]);

  // Rechercher et remplacer (Cmd/Ctrl + Maj + H) : la scène en cours est proposée.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && !e.altKey && e.key.toLowerCase() === "h") {
        e.preventDefault();
        useCosmos.getState().openReplace({ sceneId: currentRef.current });
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Mode focus : Cmd/Ctrl+Maj+F le bascule, Échap le quitte ; quitter la vue le termine.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && !e.altKey && e.key.toLowerCase() === "f") {
        e.preventDefault();
        setFocusMode(!useCosmos.getState().focusMode);
      } else if (e.key === "Escape" && useCosmos.getState().focusMode && !useCosmos.getState().dialog) {
        setFocusMode(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      setFocusMode(false);
    };
  }, [setFocusMode]);
  // Pages de la scène à l'écran, mesurées par l'éditeur (0 : feuille continue).
  const [measured, setMeasured] = useState(0);

  const stats = useMemo(() => manuscriptStats(manuscript, order), [manuscript, order]);
  const numbers = useMemo(() => chapterNumbers(plan, order), [plan, order]);
  const chapterName = (chapter: Chapter) => {
    const n = numbers.get(chapter.id) ?? 0;
    return chapter.title.trim() ? fmt(t.chapters.numberedTitle, { n, title: chapter.title.trim() }) : fmt(t.chapters.numbered, { n });
  };

  const num = (n: number) => new Intl.NumberFormat(lang).format(n);
  const words = (n: number) => fmt(new Intl.PluralRules(lang).select(n) === "one" ? m.wordsOne : m.wordsMany, { n: num(n) });
  const go = (id: string) => {
    setChosen(id);
    mainRef.current?.scrollTo(0, 0);
  };

  if (!current || !card) {
    return (
      <div className="empty-view ms-empty">
        <h1>{m.empty}</h1>
        <p>{m.emptyBody}</p>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (draft.trim()) setChosen(addTitledCard("scene", draft.trim()));
            setDraft("");
          }}
        >
          <input value={draft} placeholder={m.newScene} aria-label={m.newScene} onChange={(e) => setDraft(e.target.value)} />
          <button type="submit" disabled={!draft.trim()}>
            {m.add}
          </button>
        </form>
        <Orphans ids={orphans} manuscript={manuscript} onRestore={restoreScene} />
      </div>
    );
  }

  const pageKind: PageKind | null = isPageKind(card.page) ? card.page : null;
  const isFresh = fresh?.id === current;
  handlers.current = {
    onSceneBreak: (rest) => {
      // Une page hors récit (dédicace, titre…) garde ses lignes vides.
      if (pageKind) return false;
      const next = splitScene(current, rest);
      if (!next) return false;
      const from = current;
      setFresh({ id: next, from });
      go(next);
      setSaid(b.newScene);
      setNotice({
        text: b.newScene,
        undo: () => {
          useCosmos.getState().joinScenes(next, from);
          setFresh(null);
          go(from);
          setSaid(b.breakUndone);
        },
      });
      return true;
    },
    onChapterBreak: () => {
      if (!isFresh) return false;
      const chapter = startChapterAt(current);
      setFresh(null);
      setSaid(b.newChapter);
      if (chapter)
        setNotice({
          text: b.newChapter,
          undo: () => {
            deletePlanChapter(chapter);
            setSaid(b.breakUndone);
          },
        });
      return true;
    },
    onUndoBreak: () => {
      if (!isFresh || card.title.trim() || plainText(card.html)) return false;
      const back = fresh!.from;
      setFresh(null);
      deleteCard(current);
      go(back);
      return true;
    },
  };
  const story = order.filter((id) => !isPageKind(cards.find((c) => c.id === id)?.page));
  const storyNumber = (id: string) => story.indexOf(id) + 1;
  const pageLabel = (id: string) => {
    const kind = cards.find((c) => c.id === id)?.page;
    return isPageKind(kind) ? b.kinds[kind] : null;
  };
  // Page de titre encore vide : elle reçoit le titre du projet et le nom de l'auteur (profil de l'appareil).
  const fillTitlePage = (id: string) => {
    if (plainText(useCosmos.getState().manuscript[id] ?? "")) return;
    const esc = (x: string) => x.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    const { title: projectTitle } = useCosmos.getState();
    const author = useSettings.getState().author.trim();
    useCosmos.getState().setManuscriptText(id, `<h2>${esc(projectTitle.trim() || t.home.untitled)}</h2>${author ? `<p>${esc(author)}</p>` : ""}`);
  };
  const setPageKind = (value: string) => {
    if (isPageKind(value)) {
      setSceneChapter(current, null);
      if (value === "titre") fillTitlePage(current);
      updateCard(current, { page: value, ...(card.title.trim() ? {} : { title: b.kinds[value] }) });
    } else {
      updateCard(current, { page: undefined });
    }
  };
  const addPage = (value: string) => {
    if (!isPageKind(value)) return;
    const id = addTitledCard("scene", b.kinds[value]);
    updateCard(id, { page: value });
    if (value === "titre") fillTitlePage(id);
    go(id);
  };

  const at = order.indexOf(current);
  const title = card.title.trim() || m.untitled;
  const detected = detectCards(manuscript[current], cards);
  const before = order.slice(0, at).reduce((sum, id) => sum + (stats.perScene.get(id) ?? 0), 0);
  const chapter = chapterOf(plan, current);
  // La scène ouvre son chapitre : le titre du chapitre s'affiche au-dessus, comme dans un livre.
  const opensChapter = !pageKind && !!chapter && (at === 0 || chapterOf(plan, order[at - 1])?.id !== chapter.id);
  const sceneWords = countWords(manuscript[current]);

  return (
    <div className={`manuscript${focusMode ? " is-focus" : ""}${focusMode && writing.typewriter ? " is-typewriter" : ""}`}>
      {focusMode && (
        <div className="ms-focus-bar" role="toolbar" aria-label={t.focus.aria}>
          <button type="button" aria-pressed={writing.typewriter} onClick={() => setWriting({ ...writing, typewriter: !writing.typewriter })}>
            {t.focus.typewriter}
          </button>
          <label>
            <span>{t.focus.highlight}</span>
            <select value={writing.highlight} onChange={(e) => setWriting({ ...writing, highlight: e.target.value as typeof writing.highlight })}>
              {FOCUS_HIGHLIGHTS.map((h) => (
                <option key={h} value={h}>
                  {t.focus.highlights[h]}
                </option>
              ))}
            </select>
          </label>
          <button type="button" onClick={() => setFocusMode(false)}>
            {t.focus.exit}
          </button>
        </div>
      )}
      <nav className="sp-scenes ms-scenes" aria-label={m.scenesAria}>
        <h2 className="sp-box-title">{m.scenesTitle}</h2>
        <p className="ms-total">{words(stats.words)}</p>
        {groupByChapter(plan, order).map((group) => (
          <div
            key={`${group.chapter?.id ?? "none"}-${group.ids[0]}`}
            className={`${group.chapter ? "ms-chapter" : ""}${over === group.ids[0] ? " is-over" : ""}`}
            // Dépôt d'un chapitre sur un groupe : avant lui en remontant, après lui en descendant.
            onDragOver={(e) => {
              const id = draggedRef.current;
              if (!id || group.chapter?.id === id || !story.includes(group.ids[0])) return;
              e.preventDefault();
              e.dataTransfer.dropEffect = "move";
              setOver(group.ids[0]);
            }}
            onDragLeave={() => setOver((o) => (o === group.ids[0] ? null : o))}
            onDrop={(e) => {
              const id = draggedRef.current;
              setOver(null);
              if (!id) return;
              e.preventDefault();
              const groups = groupByChapter(plan, story);
              const from = groups.findIndex((g) => g.chapter?.id === id);
              const to = groups.findIndex((g) => g.ids[0] === group.ids[0]);
              if (from < 0 || to < 0) return;
              movePlanChapter(id, to < from ? groups[to].ids[0] : (groups[to + 1]?.ids[0] ?? null));
            }}
          >
            {group.chapter && (
              <h3
                className={`ms-chapter-title${dragged === group.chapter.id ? " is-dragged" : ""}`}
                draggable
                title={b.chapterDrag}
                onDragStart={(e) => {
                  draggedRef.current = group.chapter!.id;
                  setDragged(group.chapter!.id);
                  e.dataTransfer.effectAllowed = "move";
                  e.dataTransfer.setData("text/plain", chapterName(group.chapter!));
                }}
                onDragEnd={() => {
                  draggedRef.current = null;
                  setDragged(null);
                }}
              >
                <span>{chapterName(group.chapter)}</span>
                <span className="ms-words">{num(group.ids.reduce((sum, id) => sum + (stats.perScene.get(id) ?? 0), 0))}</span>
                {(["up", "down"] as const).map((way) => {
                  const to = chapterStep(plan, story, group.chapter!.id, way);
                  const label = fmt(way === "up" ? b.chapterUp : b.chapterDown, { title: chapterName(group.chapter!) });
                  return (
                    <button key={way} type="button" className="icon-button ms-chapter-move" disabled={to === undefined} aria-label={label} title={label} onClick={() => to !== undefined && movePlanChapter(group.chapter!.id, to)}>
                      <span aria-hidden="true">{way === "up" ? "↑" : "↓"}</span>
                    </button>
                  );
                })}
              </h3>
            )}
            <ol className="sp-scene-list">
              {group.ids.map((id) => {
                const c = cards.find((x) => x.id === id);
                const count = stats.perScene.get(id) ?? 0;
                const movable = story.includes(id);
                const name = c?.title.trim() || m.untitled;
                const step = (way: "up" | "down") => {
                  if (!useCosmos.getState().stepBookScene(id, way)) return false;
                  setSaid(fmt(m.sceneMoved, { title: name }));
                  return true;
                };
                const drop = sceneOver?.id === id && sceneDrag !== id ? ` is-drop-${sceneOver.side}` : "";
                return (
                  <li
                    key={id}
                    className={`${sceneDrag === id ? "is-dragged" : ""}${drop}`}
                    draggable={movable}
                    onDragStart={(e) => {
                      if (!movable) return;
                      e.stopPropagation();
                      sceneDragRef.current = id;
                      setSceneDrag(id);
                      e.dataTransfer.effectAllowed = "move";
                      e.dataTransfer.setData("text/plain", name);
                    }}
                    onDragEnd={() => {
                      sceneDragRef.current = null;
                      setSceneDrag(null);
                      setSceneOver(null);
                    }}
                    onDragOver={(e) => {
                      const from = sceneDragRef.current;
                      if (!from || !movable || from === id) return;
                      e.preventDefault();
                      e.stopPropagation();
                      e.dataTransfer.dropEffect = "move";
                      // Moitié haute : avant cette scène ; moitié basse : après (même chapitre qu'elle).
                      const box = e.currentTarget.getBoundingClientRect();
                      const side = e.clientY < box.top + box.height / 2 ? "before" : "after";
                      setSceneOver((o) => (o?.id === id && o.side === side ? o : { id, side }));
                    }}
                    onDragLeave={() => setSceneOver((o) => (o?.id === id ? null : o))}
                    onDrop={(e) => {
                      const from = sceneDragRef.current;
                      const side = sceneOver?.id === id ? sceneOver.side : "before";
                      sceneDragRef.current = null;
                      setSceneDrag(null);
                      setSceneOver(null);
                      if (!from || !movable) return;
                      e.preventDefault();
                      e.stopPropagation();
                      if (useCosmos.getState().moveBookScene(from, id, side)) setSaid(fmt(m.sceneMoved, { title: cards.find((x) => x.id === from)?.title.trim() || m.untitled }));
                    }}
                  >
                    <button
                      type="button"
                      className={id === current ? "is-current" : ""}
                      aria-current={id === current ? "true" : undefined}
                      aria-keyshortcuts={movable ? "Alt+ArrowUp Alt+ArrowDown" : undefined}
                      title={movable ? m.sceneDrag : undefined}
                      onClick={() => go(id)}
                      onKeyDown={(e) => {
                        // Au clavier : Alt + flèche déplace la scène d'un cran (le focus reste sur elle).
                        if (!movable || !e.altKey || (e.key !== "ArrowUp" && e.key !== "ArrowDown")) return;
                        e.preventDefault();
                        const button = e.currentTarget;
                        if (step(e.key === "ArrowUp" ? "up" : "down")) requestAnimationFrame(() => button.isConnected ? button.focus() : document.querySelector<HTMLButtonElement>(`[data-scene="${id}"]`)?.focus());
                      }}
                      data-scene={id}
                    >
                      <span className="ms-name">
                        {pageLabel(id) ? (
                          <em>{c?.title.trim() && c.title.trim() !== pageLabel(id) ? `${pageLabel(id)} · ${c.title.trim()}` : pageLabel(id)}</em>
                        ) : (
                          <>
                            {storyNumber(id)}. {c?.title.trim() || m.untitled}
                          </>
                        )}
                      </span>
                      {c && <StatusDot card={c} />}
                      {count > 0 && <span className="ms-words">{num(count)}</span>}
                    </button>
                    {/* Scène en cours : ses flèches (doigt, souris), en plus du glisser et d'Alt + flèche. */}
                    {id === current && movable && story.length > 1 && (
                      <span className="sp-scene-moves">
                        {(["up", "down"] as const).map((way) => {
                          const label = fmt(way === "up" ? t.plan.moveUp : t.plan.moveDown, { title: name });
                          const edge = way === "up" ? story[0] === id : story[story.length - 1] === id;
                          return (
                            <button key={way} type="button" className="icon-button" disabled={edge} aria-label={label} title={label} onClick={() => step(way)}>
                              <span aria-hidden="true">{way === "up" ? "↑" : "↓"}</span>
                            </button>
                          );
                        })}
                      </span>
                    )}
                  </li>
                );
              })}
            </ol>
          </div>
        ))}
        <label className="ms-add-page">
          <span className="sr-only">{b.addPage}</span>
          <select value="" onChange={(e) => addPage(e.target.value)}>
            <option value="">{b.addPage}</option>
            {PAGE_KINDS.map((k) => (
              <option key={k} value={k}>
                {b.kinds[k]}
              </option>
            ))}
          </select>
        </label>
        <Orphans ids={orphans} manuscript={manuscript} onRestore={restoreScene} />
      </nav>

      <div className="ms-main" ref={mainRef}>
        <div className="ms-sheet">
          {/* Une barre discrète : les compteurs sont dans les colonnes, la page ressemble à un livre. */}
          <div className="ms-meta" role="toolbar" aria-label={b.toolbar}>
            <button type="button" className="icon-button" disabled={at === 0} aria-label={m.previous} title={m.previous} onClick={() => go(order[at - 1])}>
              <span aria-hidden="true">←</span>
            </button>
            <button type="button" className="icon-button" disabled={at === order.length - 1} aria-label={m.next} title={m.next} onClick={() => go(order[at + 1])}>
              <span aria-hidden="true">→</span>
            </button>
            <input
              className="ms-title"
              value={card.title}
              placeholder={pageKind ? b.kinds[pageKind] : m.untitled}
              aria-label={m.sceneTitle}
              onChange={(e) => updateCard(current, { title: e.target.value })}
            />
            <label className="ms-kind">
              <span className="sr-only">{b.pageKind}</span>
              <select value={pageKind ?? ""} onChange={(e) => setPageKind(e.target.value)} title={b.pageKind}>
                <option value="">{b.scene}</option>
                {PAGE_KINDS.map((k) => (
                  <option key={k} value={k}>
                    {b.kinds[k]}
                  </option>
                ))}
              </select>
            </label>
            {!pageKind && <SceneStatusPicker card={card} />}
            {!pageKind && !opensChapter && (
              <button type="button" className="ghost-button ms-start-chapter" onClick={() => startChapterAt(current)}>
                {b.startChapter}
              </button>
            )}
            <button type="button" className="ghost-button ms-start-chapter" aria-keyshortcuts="Control+Shift+F Meta+Shift+F" onClick={() => setFocusMode(true)}>
              {t.focus.enter}
            </button>
            <button
              type="button"
              className="ghost-button ms-start-chapter"
              aria-pressed={writing.continuous}
              title={t.continuous.hint}
              onClick={() => setWriting({ ...writing, continuous: !writing.continuous })}
            >
              {writing.continuous ? t.continuous.off : t.continuous.on}
            </button>
            <button type="button" className="ghost-button ms-start-chapter" title={t.replace.buttonHint} aria-keyshortcuts="Control+Shift+H Meta+Shift+H" onClick={() => useCosmos.getState().openReplace({ sceneId: current })}>
              {t.replace.button}
            </button>
            {/* La carte part à la corbeille ; son texte reste dans manuscrit/ et revient avec elle. */}
            <button
              type="button"
              className="icon-button"
              aria-label={fmt(t.trash.removeAria, { title })}
              title={fmt(t.trash.removeAria, { title })}
              onClick={() => {
                const next = order[at + 1] ?? order[at - 1] ?? null;
                useCosmos.getState().deleteCard(current);
                if (next) go(next);
              }}
            >
              <TrashIcon />
            </button>
            <span className="sr-only" aria-live="polite">
              {words(sceneWords)}
            </span>
          </div>
          {writing.continuous ? (
            <ContinuousBook order={order} cards={cards} current={current} onCurrent={setChosen} />
          ) : (
          <div
            className={`ms-page${focusMode && (writing.highlight === "sentence" || writing.highlight === "paragraph") ? " is-dimmed" : ""}${opensChapter ? " opens-chapter" : ""}${pageKind && QUIET_PAGES.has(pageKind) ? " is-quiet" : ""}${!pageKind && !opensChapter && at > 0 ? " follows-scene" : ""}`}
            data-page={pageKind ?? undefined}
            style={{ ["--ms-width" as string]: PAGE.width, ["--ms-height" as string]: PAGE.height }}
          >
            {/* Ouverture de chapitre, dans la marge du haut comme dans un livre : rien ne bouge dans le texte. */}
            {opensChapter && chapter && (
              <div className="ms-chapter-edit">
                <span className="ms-chapter-heading">{fmt(t.chapters.numbered, { n: numbers.get(chapter.id) ?? 0 })}</span>
                <input
                  className="ms-chapter-input"
                  value={chapter.title}
                  placeholder={t.chapters.titlePlaceholder}
                  aria-label={b.chapterTitle}
                  onChange={(e) => renamePlanChapter(chapter.id, e.target.value)}
                />
                <button type="button" className="icon-button ms-chapter-remove" aria-label={b.removeChapter} title={b.removeChapter} onClick={() => deletePlanChapter(chapter.id)}>
                  <span aria-hidden="true">×</span>
                </button>
              </div>
            )}
            <SceneEditor
              key={current}
              id={current}
              title={title}
              placeholder={pageKind ? b.placeholders[pageKind] : card.fiche?.synopsis?.trim() || (opensChapter ? b.chapterOpening : m.placeholder)}
              firstPage={firstPageOf(before)}
              onPages={(n) => setMeasured((prev) => (prev === n ? prev : n))}
              handlers={handlers}
              focusStart={isFresh}
            />
          </div>
          )}
          {notice && (
            <div className="ms-notice" role="status">
              <span>{notice.text}</span>
              <button
                type="button"
                className="ghost-button"
                onClick={() => {
                  notice.undo();
                  setNotice(null);
                }}
              >
                {b.undoBreak}
              </button>
            </div>
          )}
          {!pageKind && !writing.continuous && <p className="ms-hint">{b.enterHint}</p>}
          <div className="sr-only" aria-live="polite">
            {said}
          </div>
        </div>
      </div>

      <aside className="sp-side">
        <StatsBox stats={stats} done={story.filter((id) => sceneStatus(cards.find((c) => c.id === id) ?? { type: "idee" }) === "fini").length} chapters={numbers.size} sceneWords={sceneWords} place={measured > 0 ? { first: firstPageOf(before), last: firstPageOf(before) + measured - 1 } : null} />
        <section className="sp-box">
          <h2 className="sp-box-title">{m.inScene}</h2>
          {detected.length === 0 ? (
            <p className="sp-empty">{m.nothingDetected}</p>
          ) : (
            <ul className="ms-chips">
              {detected.map((c) => (
                <li key={c.id}>
                  <button type="button" className="chip" title={fmt(m.show, { title: c.title })} onClick={() => revealCard(c.id)}>
                    <span className="card-dot" style={{ background: typeColor(c.type) }} />
                    {c.title}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
        <section className="sp-box">
          <h2 className="sp-box-title">{m.synopsis}</h2>
          {/* Le synopsis de la scène (ses anciennes notes y sont passées) : il s'affiche aussi en filigrane dans une scène vide. */}
          <SynopsisField
            value={card.fiche?.synopsis ?? ""}
            scene={title}
            onSave={(text) => updateCard(current, { fiche: { ...(card.fiche ?? {}), synopsis: text } })}
          />
          <button type="button" className="chip" onClick={() => revealCard(current)}>
            {fmt(m.show, { title })}
          </button>
        </section>
      </aside>
    </div>
  );
}

/** Statistiques et objectifs (idée reprise de NEO : objectif du jour, objectif du livre, jours d'affilée). */
function StatsBox({
  stats,
  chapters,
  sceneWords,
  place,
  done,
}: {
  stats: ReturnType<typeof manuscriptStats>;
  /** Scènes du récit marquées « terminée ». */
  done: number;
  chapters: number;
  sceneWords: number;
  /** Pages occupées par la scène dans le livre (mesurées à l'écran). */
  place: { first: number; last: number } | null;
}) {
  const t = useT();
  const s = t.stats;
  const lang = useSettings((x) => x.lang);
  const goals = useCosmos((x) => x.goals);
  const setGoals = useCosmos((x) => x.setGoals);
  const progress = useCosmos((x) => x.progress);
  const num = (n: number) => new Intl.NumberFormat(lang).format(n);
  const today = wordsOn(progress, dayKey(new Date()));
  const days = streak(progress, new Date());
  const hours = Math.floor(stats.minutes / 60);
  const reading = hours > 0 ? fmt(s.hours, { h: hours, m: String(stats.minutes % 60).padStart(2, "0") }) : fmt(s.minutes, { m: Math.max(stats.words > 0 ? 1 : 0, stats.minutes) });
  const bar = (value: number, goal: number | undefined, label: string) =>
    goal ? <progress className="ms-progress" max={goal} value={Math.min(value, goal)} aria-label={label} /> : null;
  const goalInput = (key: "daily" | "total", label: string) => (
    <label className="ms-goal">
      <span>{label}</span>
      <input
        type="number"
        min={0}
        step={key === "daily" ? 100 : 1000}
        inputMode="numeric"
        value={goals[key] ?? ""}
        placeholder={s.goalPlaceholder}
        onChange={(e) => setGoals({ ...goals, [key]: Number(e.target.value) || undefined })}
      />
    </label>
  );

  return (
    <section className="sp-box ms-stats" aria-label={s.title}>
      <h2 className="sp-box-title">{s.title}</h2>
      <dl>
        <div>
          <dt>{s.words}</dt>
          <dd>{num(stats.words)}</dd>
        </div>
        <div>
          <dt>{s.pages}</dt>
          <dd>≈ {num(stats.pages)}</dd>
        </div>
        <div>
          <dt>{s.reading}</dt>
          <dd>≈ {reading}</dd>
        </div>
        <div>
          <dt>{s.scenes}</dt>
          <dd>{fmt(s.of, { n: num(stats.written), total: num(stats.scenes) })}</dd>
        </div>
        {done > 0 && (
          <div>
            <dt>{t.sceneStatus.done}</dt>
            <dd>{fmt(s.of, { n: num(done), total: num(stats.scenes) })}</dd>
          </div>
        )}
        {chapters > 0 && (
          <div>
            <dt>{s.chapters}</dt>
            <dd>{num(chapters)}</dd>
          </div>
        )}
        <div>
          <dt>{s.average}</dt>
          <dd>{num(stats.average)}</dd>
        </div>
        <div>
          <dt>{s.thisScene}</dt>
          <dd>{fmt(s.sceneValue, { n: num(sceneWords), pages: num(pagesFor(sceneWords)) })}</dd>
        </div>
        {place && (
          <div>
            <dt>{s.scenePlace}</dt>
            <dd>{place.first === place.last ? fmt(s.onePage, { n: place.first }) : fmt(s.pagesFrom, { first: place.first, last: place.last })}</dd>
          </div>
        )}
      </dl>
      <div className="ms-goals">
        <p className="ms-today">
          <strong>{fmt(s.today, { n: num(today) })}</strong>
          {goals.daily ? ` · ${fmt(s.dailyProgress, { pct: Math.min(100, Math.round((today / goals.daily) * 100)), goal: num(goals.daily) })}` : ""}
          {days > 1 ? ` · ${fmt(s.streak, { n: days })}` : ""}
        </p>
        {bar(today, goals.daily, s.dailyGoal)}
        {goals.total ? (
          <p className="ms-today">{fmt(s.bookProgress, { n: num(stats.words), total: num(goals.total), pct: Math.min(100, Math.round((stats.words / goals.total) * 100)) })}</p>
        ) : null}
        {bar(stats.words, goals.total, s.bookGoal)}
        <div className="ms-goal-inputs">
          {goalInput("daily", s.dailyGoal)}
          {goalInput("total", s.bookGoal)}
        </div>
        <p className="sp-empty">{fmt(s.estimate, { n: WORDS_PER_PAGE })}</p>
      </div>
    </section>
  );
}

/** Textes dont la carte a été supprimée : jamais effacés, on peut recréer la carte. */
function Orphans({ ids, manuscript, onRestore }: { ids: string[]; manuscript: Record<string, string>; onRestore: (id: string) => void }) {
  const m = useT().manuscript;
  if (ids.length === 0) return null;
  return (
    <section aria-label={m.orphans}>
      <h2 className="sp-box-title">{m.orphans}</h2>
      <p className="sp-empty">{m.orphansHint}</p>
      {ids.map((id) => {
        const text = plainText(manuscript[id]);
        return (
          <div key={id} className="ms-orphan">
            <span>{text.length > 90 ? `${text.slice(0, 90)}…` : text}</span>
            <button type="button" onClick={() => onRestore(id)}>
              {m.restore}
            </button>
          </div>
        );
      })}
    </section>
  );
}
