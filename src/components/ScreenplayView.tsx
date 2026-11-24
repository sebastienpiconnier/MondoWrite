// Vue Scénario d'un projet scénario : liste des scènes, feuille au format cinéma, panneau
// « Dans cette scène ». Le texte vit dans scenario.fountain (store.screenplay) : l'éditeur en est
// une lecture, reconvertie en modèle un court instant après chaque modification.

import { useTouchGestures } from "./useTouchGestures";
import { panelAfterSwipe } from "../touchGestures";
import { useStoryFindings } from "./useStoryFindings";
import { useStableEditor } from "./useStableEditor";
import { usePageSpell } from "./usePageSpell";
import { StatusDot } from "./SceneStatusPicker";
import { EdgeHandle } from "./EdgeHandle";
import { StatsBox } from "./StatsBox";
import { Chutier } from "./Chutier";
import { usePanels } from "./usePanels";
import { useFocusFollow } from "./useFocusFollow";
import { nanoid } from "nanoid";
import { createPortal } from "react-dom";
import { NodeSelection } from "@tiptap/pm/state";
import { portalRoot } from "./portalRoot";
import { placePassage, takePassage, type Passage } from "../chutier";
import { screenplayGroups } from "../screenplay/groups";
import { screenplayWords, sceneWords as wordsOfScene } from "../screenplay/words";
import { sceneStatus } from "../character";
import type { ManuscriptStats } from "../stats";
import { blocks, moveBlock } from "../screenplay/sequence";
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { SuggestionMenu } from "./SuggestionMenu";
import { SceneSetupsBox } from "./SceneSetups";
import { SceneLinks } from "./LinkedCards";
import { ScenePlace } from "./ScenePlace";
import { SideParts, type SidePart } from "./SideParts";
import { usePlotColor } from "./usePlotColor";
import { SynopsisField } from "./SynopsisField";
import { TitlePage } from "./TitlePage";
import { LAYOUTS } from "../screenplay/layout";
import { checkScreenplay, type Finding } from "../review/checks";
import { keptScenes as keptBy, speakingNames, type CharacterFilter } from "../review/filter";
import { setCharacterFilter } from "../screenplay/editor/characterFilter";
import { ReviewPanel, SideTabs, useOpenFindings, type SideTab } from "./ReviewPanel";
import { CommentsPanel } from "./CommentsPanel";
import { commentStyle } from "./commentMark";
import { COMMENT_TYPES, commentIdsInElements, openCount } from "../comments";
import { useAiReviewReveal, useOpenAiQuestions } from "./AiReview";
import { elementFor, type SceneRef } from "../ai/review";
import { useCommand } from "../commands";
import { ReaderBar, useReaderItems } from "./ReaderBar";
import { StoryRibbon } from "./StoryRibbon";
import { startReading } from "./useReader";
import { screenplayUtterances, type ReadNode } from "../reading";
import { PRESERVED } from "../screenplay/editor/nodes";
import { startGap } from "../screenplay/editor/keymap";
import { TAB_USES, noteUse } from "../learn";
import { GapCursor } from "@tiptap/pm/gapcursor";
import type { ResolvedPos } from "@tiptap/pm/model";
import type { TitleField } from "../screenplay/titlePage";
import { minutesFor, usePagination } from "./usePagination";
import { eighthsBetween } from "../screenplay/eighths";
import { SceneLength, useSceneEighths } from "./SceneLength";
import { keptByThread, threadGaps, threadPresence, THREAD_TYPES } from "../threadFilter";
import { setThreadFold, type ThreadFold } from "../screenplay/editor/threadFold";
import { ThreadBanner, gapText } from "./ThreadBanner";
import { screenplaySceneTexts } from "../timeline";
import { suggest, type Suggestion } from "../screenplay/editor/autocomplete";
import { ADOPT_META, adoptNew } from "../screenplay/editor/adopt";
import { EditorContent, type Editor } from "@tiptap/react";
import { TextSelection } from "@tiptap/pm/state";
import type { Node as PMNode } from "@tiptap/pm/model";
import { SCENE_AT, currentScript, scriptOffset, useCosmos, type CosmosState } from "../store";
import { openNames } from "../namesState";
import { setCaretSource } from "../resume";
import { newId } from "../projectState";
import { plainSection, resolveEpisode, seriesOf } from "../screenplay/series";
import { insertionPoint, nextNumber, partLabel, renameStructure, structureMark, structureOf, structureSection, type StructureKind } from "../screenplay/structure";
import { customizeRange, scopeAt, usedCaseKeys } from "../screenplay/structureCases";
import { SCREENPLAY_TEMPLATES, beatOf } from "../screenplay/template";
import { PLAN_TEMPLATES, isCustomBeat, nextCustomKey, type PlanBeat } from "../plan";
import { toggleFoldedPart, useFoldedParts } from "../structureFold";
import { useEpisodeLabel } from "./EpisodePicker";
import { EpisodePicker } from "./EpisodePicker";
import { useSettings } from "../settings";
import { fmt, getT, useT } from "../i18n";
import { foldName } from "../review/names";
import { FocusBar, FocusButton, FocusCounter, useFocusChrome } from "./FocusBar";
import { FOCUS_SCRIPT_CH } from "../focusText";
import { MoreMenu, useKeyHint } from "./MoreMenu";
import { colorFor, currentSet, setOf } from "../screenplay/revisions";
import { revisionName, revisionVar } from "../revisionsText";
import { usePhone } from "./usePhone";
import { useVocab } from "../vocab";
import { isTouch } from "../platform";
import { EDITABLE_TYPES } from "../screenplay/model";
import { cardsWithoutScene, type SceneCard } from "../screenplay/link";
import {
  headingParts,
  listScenes,
  sceneAt,
  sceneCharacters,
  sceneSynopsis,
  scenesInLocation,
  synopsisIsIa,
  type Scene,
} from "../screenplay/scenes";
import { ScreenplayAtelier, ScreenplayDirections, screenplaySceneText } from "./Atelier";
import { findInText, nthMatch } from "../search";
import { centerSelection } from "./centerSelection";
import { LanguageTool } from "../languagetool/extension";
import { LanguageToolBubble, LanguageToolLive, LanguageToolStatus, useLanguageTool, type LtScope } from "./LanguageToolBubble";
import {
  currentElement,
  fromDoc,
  toNode,
  screenplayExtensions,
  setElementType,
  toDoc,
  type EditableType,
} from "../screenplay/editor";

/** Sous cette largeur (px), une page entière serait illisible : la feuille redevient continue (voir styles.css). */
const PAGE_MIN_WIDTH = 640;
const EMIT_DELAY = 250; // ms après la dernière frappe, avant de reconvertir le document en modèle

/** Position, dans le document, du nœud de premier niveau d'index donné. */
function posOf(doc: PMNode, index: number): number {
  let pos = 0;
  for (let i = 0; i < index && i < doc.childCount; i++) pos += doc.child(i).nodeSize;
  return pos;
}

/**
 * Un texte qui ne commence que par des sections (gabarit posé, épisode encore vide) : le curseur se pose sous la
 * première case, et la frappe y commence l'en-tête de la première scène (keymap.ts, `insertAtGap`). Sans scène
 * du tout, l'éditeur prend aussi le focus, sauf si l'auteur écrit dans un autre champ.
 */
// `valid` existe dans prosemirror-gapcursor sans être déclaré : un curseur entre deux blocs non éditables.
const isGap = ($pos: ResolvedPos) => (GapCursor as unknown as { valid($p: ResolvedPos): boolean }).valid($pos);

function placeStart(editor: Editor) {
  const at = startGap(editor.state.doc);
  if (at === null) return;
  const $pos = editor.state.doc.resolve(at);
  if (!isGap($pos)) return;
  editor.view.dispatch(editor.state.tr.setSelection(new GapCursor($pos)));
  let editable = false;
  editor.state.doc.forEach((node) => {
    if (node.type.name !== PRESERVED) editable = true;
  });
  // Sans scène du tout, on écrit ici : le focus vient à l'éditeur, sauf si l'auteur est dans un autre champ.
  const active = document.activeElement as HTMLElement | null;
  const typing = !!active && active !== editor.view.dom && (active.matches("input, textarea, select") || active.isContentEditable);
  if (!editable && !typing) {
    editor.view.focus();
    // Le focus peut relire la sélection du DOM : le curseur revient sous la première case.
    const again = editor.state.doc.resolve(at);
    if (!(editor.state.selection instanceof GapCursor)) editor.view.dispatch(editor.state.tr.setSelection(new GapCursor(again)));
  }
}

/** Éléments relus par LanguageTool : l'action et le dialogue (avec ses didascalies), pas les en-têtes ni les noms. */
const LT_ELEMENTS = new Set(["action", "dialogue", "parenthetical", "centered"]);

/** La scène du curseur : de son en-tête au suivant (ou tout ce qui précède le premier en-tête). */
function scriptScope(ed: Editor): LtScope | null {
  const doc = ed.state.doc;
  const at = ed.state.selection.$from.index(0);
  let start = 0;
  let end = doc.childCount;
  doc.forEach((node, _offset, index) => {
    if (node.type.name !== "sceneHeading") return;
    if (index <= at) start = index;
    else if (index < end) end = index;
  });
  let from = 0;
  let to = 0;
  doc.forEach((node, offset, index) => {
    if (index === start) from = offset;
    if (index === end - 1) to = offset + node.nodeSize;
  });
  return to > from ? { from, to, accept: ltAccept } : null;
}

const ltAccept = (block: PMNode) => LT_ELEMENTS.has(block.type.name);

export function ScreenplayView() {
  const { t, types } = useVocab();
  const sp = t.screenplay;
  const lang = useSettings((s) => s.lang);
  const num = (n: number) => new Intl.NumberFormat(lang).format(n);
  // Série : le texte de l'épisode ouvert (season.ts) ; les rangs d'éléments de cette vue sont ceux de ce texte.
  const screenplay = useCosmos(currentScript);
  const currentEpisode = useCosmos((s) => resolveEpisode(s.screenplay, s.currentEpisode));
  const nodes = useCosmos((s) => s.nodes);
  const revealCard = useCosmos((s) => s.revealCard);
  const paper = useCosmos((s) => s.paper);
  const sceneNumbers = useCosmos((s) => s.sceneNumbers);
  const underlineHeadings = useCosmos((s) => s.underlineHeadings);
  const revisions = useCosmos((s) => s.revisions);
  const focusMode = useCosmos((s) => s.focusMode);
  const setFocusMode = useCosmos((s) => s.setFocusMode);
  const writing = useSettings((s) => s.writing);
  const chutier = useCosmos((s) => s.chutier);
  // Volets escamotables (scènes à gauche, infos à droite), correcteur à la demande, message en bas de page.
  const [panels, togglePanel] = usePanels();
  // Présentation › volets (barre des menus du Mac, 1.11.1).
  useCommand("toggle-scenes", () => togglePanel("scenes"));
  useCommand("toggle-side", () => togglePanel("side"));
  // Correcteur : seulement si les Réglages le veulent aussi dans le scénario (suivi en direct).
  const spell = usePageSpell();
  const [notice, setNotice] = useState<{ text: string; undo?: () => void } | null>(null);
  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(null), 10000);
    return () => window.clearTimeout(timer);
  }, [notice]);

  // À l'ouverture d'un scénario déjà commencé, on arrive sur le texte : la page de titre est juste au-dessus.
  useEffect(() => {
    if ((currentScript(useCosmos.getState())?.elements.length ?? 0) === 0) return;
    const sheet = pageRef.current;
    const scroller = sheet?.closest<HTMLElement>(".sp-scroll");
    if (sheet && scroller && scroller.scrollHeight > scroller.clientHeight) scroller.scrollTop = sheet.offsetTop - scroller.offsetTop - 16;
  }, []);

  // Le format de page a changé : les pages se recoupent.
  useEffect(() => {
    const ed = editorRef.current;
    if (ed && !ed.isDestroyed) ed.view.dispatch(ed.state.tr.setMeta("cosmos:paper", paper));
  }, [paper]);

  // Mode focus : Cmd/Ctrl+Maj+F le bascule ; quitter la vue le termine.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && !e.altKey && e.key.toLowerCase() === "f") {
        e.preventDefault();
        setFocusMode(!useCosmos.getState().focusMode);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      setFocusMode(false);
    };
  }, [setFocusMode]);
  const pagination = usePagination();

  const barRef = useRef<HTMLDivElement>(null);
  const [current, setCurrent] = useState<{ index: number; type: EditableType | null }>({ index: 0, type: null });

  // Complétion ouverte sous le curseur (personnages, décors, moments).
  const pageRef = useRef<HTMLDivElement>(null);
  const [menu, setMenu] = useState<{ items: Suggestion[]; active: number; style: CSSProperties } | null>(null);
  const menuRef = useRef(menu);
  menuRef.current = menu;

  /** Recalcule les suggestions pour l'élément en cours ; ferme le menu s'il n'y a rien à proposer. */
  const refreshMenu = (ed: Editor) => {
    const element = currentElement(ed.state);
    const { $from, empty } = ed.state.selection;
    // Seulement en fin d'élément : on complète ce qu'on est en train d'écrire.
    if (!element || !empty || $from.parentOffset !== element.node.content.size) return setMenu(null);
    if (element.type !== "character" && element.type !== "sceneHeading") return setMenu(null);
    const state = useCosmos.getState();
    const t = getT().screenplay;
    const titles = (type: string) => state.nodes.filter((n) => n.data.type === type && n.data.title.trim()).map((n) => n.data.title);
    const result = suggest(element.type, element.node.textContent, {
      characterCards: titles("personnage"),
      locationCards: titles("lieu"),
      // Le document de l'éditeur, plus frais que le store (reconverti avec un léger délai).
      elements: fromDoc(ed.state.doc.toJSON(), {}).elements,
      currentIndex: $from.index(0),
      locale: useSettings.getState().lang,
      moments: t.moments,
      extensions: t.extensions,
      labels: t.suggest,
    });
    const page = pageRef.current;
    if (result.items.length === 0 || !page) return setMenu(null);

    const caret = ed.view.coordsAtPos($from.pos);
    const box = page.getBoundingClientRect();
    const left = Math.max(8, Math.min(caret.left - box.left, box.width - 240));
    // Près du bas de l'écran (ou du clavier virtuel), le menu s'ouvre vers le haut.
    const visible = window.visualViewport?.height ?? window.innerHeight;
    const style: CSSProperties =
      caret.bottom > visible * 0.6
        ? { left, top: "auto", bottom: box.bottom - caret.top + 4 }
        : { left, top: caret.bottom - box.top + 4 };
    setMenu({ ...result, style });
  };
  const refreshRef = useRef(refreshMenu);
  refreshRef.current = refreshMenu;

  // Dernier modèle échangé avec le store : s'il change sans nous (autre dossier ouvert), on recharge.
  const synced = useRef(screenplay);
  // Série : épisode dont le texte est dans l'éditeur.
  const editorEpisode = useRef(currentEpisode);
  // Document modifié mais pas encore reconverti.
  const pending = useRef<PMNode | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const emit = useCallback(() => {
    clearTimeout(timer.current);
    let doc = pending.current;
    if (!doc) return;
    pending.current = null;
    const ed = editorRef.current;
    // Une scène ou un personnage écrits à l'instant reçoivent leur carte sur le canevas.
    if (ed && !ed.isDestroyed && ed.state.doc === doc) {
      const host = {
        addCard: (type: "scene" | "personnage" | "lieu", title: string) => useCosmos.getState().addTitledCard(type, title),
        locationCards: () =>
          useCosmos
            .getState()
            .nodes.filter((n) => n.data.type === "lieu")
            .map((n) => ({ id: n.id, title: n.data.title })),
        linkSceneToLocation: (sceneId: string, locationId: string) =>
          useCosmos.getState().linkCards(sceneId, locationId, getT().screenplay.linkSetIn),
        characterCards: () =>
          useCosmos
            .getState()
            .nodes.filter((n) => n.data.type === "personnage")
            .map((n) => n.data.title),
        locale: useSettings.getState().lang,
      };
      doc = adoptNew(ed, host) ?? doc;
    }
    const next = fromDoc(doc.toJSON(), synced.current?.titlePage ?? {});
    synced.current = next;
    // Toujours dans l'épisode que montre l'éditeur, même si un autre vient d'être ouvert.
    useCosmos.getState().setScript(next, false, editorEpisode.current);
  }, []);

  const pickRef = useRef<(index: number) => void>(() => {});
  const editorRef = useRef<Editor | null>(null);
  const openSheetRenameRef = useRef<(el: HTMLElement) => boolean>(() => false);

  const track = (ed: Editor) => {
    const index = ed.state.selection.$from.index(0);
    const type = currentElement(ed.state)?.type ?? null;
    setCurrent((prev) => (prev.index === index && prev.type === type ? prev : { index, type }));
  };

  const extensions = useMemo(
    () => [
      ...screenplayExtensions({
        locale: () => useSettings.getState().lang,
        placeholder: (type) => getT().screenplay.placeholders[type],
        // Tab est pris par l'éditeur : Échap rend la main au clavier, sur la barre d'éléments.
        // Vraies pages (A4 ou Letter) quand l'écran est assez large, feuille continue sinon.
        pages: {
          geometry: () => {
            const l = LAYOUTS[useCosmos.getState().paper];
            return { lines: l.linesPerPage, pageLines: l.pageLines, marginTop: l.margin.top * 6 };
          },
          // Pas de pages en mode focus (comme dans le manuscrit) : le texte seul, sans coupures de page.
          // Filtre par personnage : des scènes sont cachées, la feuille passe en continu (les pages mentiraient).
          enabled: (dom) => !useCosmos.getState().focusMode && !useCosmos.getState().charFilter && !useCosmos.getState().threadFilter && (dom.closest(".sp-scroll")?.clientWidth ?? 0) - 32 > PAGE_MIN_WIDTH,
          // Réplique coupée par la page : (À SUIVRE) et (SUITE), comme dans le PDF (réglage du projet).
          lock: () => useCosmos.getState().revisions.locked,
          continued: () => (useCosmos.getState().scriptPdf.breaks ? { more: getT().screenplay.more, contd: getT().screenplay.contd } : null),
        },
        continued: { resumes: () => useCosmos.getState().scriptPdf.resumes, contd: () => getT().screenplay.contd },
        // Passe de révision ouverte : ce qui est tapé reçoit sa marque (#18).
        revision: () => useCosmos.getState().revisions.current,
        // Mode focus : Échap le quitte, comme dans le manuscrit. Sinon il rend la main à la barre d'éléments.
        onEscape: () => {
          if (useCosmos.getState().focusMode) return setFocusMode(false);
          (
            barRef.current?.querySelector<HTMLButtonElement>('button[aria-pressed="true"]') ??
            barRef.current?.querySelector<HTMLButtonElement>("button")
          )?.focus();
        },
        // Mise en valeur et machine à écrire : les réglages d'écriture, comme dans le manuscrit.
        focus: {
          mode: () => (useCosmos.getState().focusMode ? useSettings.getState().writing.highlight : "off"),
          typewriter: () => useCosmos.getState().focusMode && useSettings.getState().writing.typewriter,
        },
      }),
      // Remarques de LanguageTool (à la demande, menu ⋯) : des décorations, rien n'entre dans le Fountain.
      LanguageTool,
    ],
    [setFocusMode],
  );

  const editor = useStableEditor({
    extensions,
    content: screenplay ? toDoc(screenplay) : undefined,
    immediatelyRender: true,
    editorProps: {
      attributes: { class: "sp-editor", role: "textbox", "aria-multiline": "true", "aria-label": getT().screenplay.editorAria, spellcheck: String(spell) },
      // Menu de complétion ouvert : flèches, Entrée et Échap sont pour lui (avant le clavier de l'éditeur).
      handleKeyDown: (_view, event) => {
        // Touches du scénario (#59) : au cinquième changement d'élément par Tab, leur rappel quitte la barre.
        if (event.key === "Tab" && !event.ctrlKey && !event.metaKey && !event.altKey) noteUse("screenplayKeys", TAB_USES);
        if (event.key === "Enter" && !event.shiftKey && _view.state.selection instanceof NodeSelection) {
          const dom = _view.nodeDOM(_view.state.selection.from);
          if (dom instanceof HTMLElement && dom.matches('.sp-preserved[data-series="act"], .sp-preserved[data-series="seq"]') && openSheetRenameRef.current(dom)) return true;
        }
        const open = menuRef.current;
        if (!open) return false;
        const count = open.items.length;
        if (event.key === "ArrowDown" || event.key === "ArrowUp") {
          const step = event.key === "ArrowDown" ? 1 : -1;
          const from = open.active === -1 && step === -1 ? 0 : open.active;
          setMenu({ ...open, active: (from + step + count) % count });
          return true;
        }
        if (event.key === "Enter" && !event.shiftKey && open.active >= 0) {
          pickRef.current(open.active);
          return true;
        }
        if (event.key === "Escape") {
          setMenu(null);
          return true;
        }
        return false;
      },
    },
    // Le menu suit la frappe ; déplacer le curseur sans rien écrire le referme.
    onTransaction: ({ editor: ed, transaction }) => {
      if (transaction.docChanged) refreshRef.current(ed);
      else if (transaction.selectionSet) setMenu(null);
    },
    // En quittant le texte (pour exporter, par exemple), ce qui attend part tout de suite dans le store.
    onBlur: () => {
      setMenu(null);
      emit();
    },
    onCreate: ({ editor: ed }) => track(ed),
    onSelectionUpdate: ({ editor: ed }) => track(ed),
    onUpdate: ({ editor: ed, transaction }) => {
      // Les liens posés par adoptNew ne sont pas une frappe : rien à reconvertir une seconde fois.
      if (transaction.getMeta(ADOPT_META)) return;
      pending.current = ed.state.doc;
      clearTimeout(timer.current);
      timer.current = setTimeout(emit, EMIT_DELAY);
      track(ed);
    },
  });

  editorRef.current = editor;
  // LanguageTool (à la demande) : la scène du curseur, sans en-têtes, noms ni transitions (tous seraient soulignés).
  const getScriptEditor = useCallback(() => editorRef.current, []);
  const lt = useLanguageTool(getScriptEditor, scriptScope, ltAccept);

  // En quittant la vue, et avant Cmd/Ctrl+S, ce qui attend part tout de suite dans le store.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s") emit();
    };
    window.addEventListener("keydown", onKey, true);
    return () => {
      window.removeEventListener("keydown", onKey, true);
      emit();
    };
  }, [emit]);

  // Le scénario a été remplacé ailleurs (ouverture d'un autre dossier) : on recharge l'éditeur.
  useEffect(() => {
    if (!editor || editor.isDestroyed || !screenplay || screenplay === synced.current) return;
    // Un autre épisode s'ouvre : ce qui attendait part d'abord dans le sien.
    if (pending.current && editorEpisode.current !== currentEpisode) emit();
    editorEpisode.current = currentEpisode;
    synced.current = screenplay;
    pending.current = null;
    clearTimeout(timer.current);
    editor.commands.setContent(toDoc(screenplay), { emitUpdate: false });
    placeStart(editor);
  }, [editor, screenplay, currentEpisode, emit]);
  // Premier texte de l'éditeur : même chose qu'à chaque rechargement.
  useEffect(() => {
    if (editor && !editor.isDestroyed) placeStart(editor);
  }, [editor]);

  // Changement de langue : ce que TipTap a figé à la création (libellé, textes indicatifs).
  useEffect(() => {
    if (!editor || editor.isDestroyed) return;
    editor.setOptions({
      editorProps: {
        ...editor.options.editorProps,
        attributes: { class: "sp-editor", role: "textbox", "aria-multiline": "true", "aria-label": sp.editorAria, spellcheck: String(spell) },
      },
    });
    editor.view.dom.setAttribute("spellcheck", String(spell));
    editor.view.dispatch(editor.state.tr.setMeta("cosmos:lang", lang));
  }, [lang, editor, sp.editorAria, spell]);

  // Mode focus : machine à écrire, voile de la ligne (mêmes réglages et même comportement que le manuscrit).
  const veil = useFocusFollow(editor, focusMode, writing.typewriter, writing.highlight);

  // Écran tactile : la barre d'éléments se pose juste au-dessus du clavier virtuel.
  const rootRef = useRef<HTMLDivElement>(null);
  // Au doigt (iPhone, iPad) : écarter deux doigts entre en mode focus, les pincer en sort ; glisser un doigt de côté
  // ouvre ou ferme les volets.
  useTouchGestures(rootRef, {
    onPinch: (kind) => setFocusMode(kind === "spread"),
    onSwipe: (dir) => {
      if (useCosmos.getState().focusMode) return;
      const move = panelAfterSwipe(dir, { left: panels.scenes, right: panels.side });
      if (move) togglePanel(move.side === "left" ? "scenes" : "side");
    },
  });
  const chrome = useFocusChrome(focusMode, rootRef);
  const key = useKeyHint();
  const phone = usePhone();
  // Scène glissée dans la liste (ref : le dépôt peut arriver avant le rendu suivant).
  const dragRef = useRef<number | null>(null);
  const [dragScene, setDragScene] = useState<number | null>(null);
  const [overScene, setOverScene] = useState<number | null>(null);
  const [announce, setAnnounce] = useState("");
  useEffect(() => {
    const viewport = window.visualViewport;
    if (!viewport || !isTouch()) return;
    const place = () => {
      const hidden = Math.max(0, window.innerHeight - viewport.height - viewport.offsetTop);
      rootRef.current?.style.setProperty("--sp-keyboard", `${Math.round(hidden)}px`);
    };
    place();
    viewport.addEventListener("resize", place);
    viewport.addEventListener("scroll", place);
    return () => {
      viewport.removeEventListener("resize", place);
      viewport.removeEventListener("scroll", place);
    };
  }, []);

  const elements = useMemo(() => screenplay?.elements ?? [], [screenplay]);
  const scenes = useMemo(() => listScenes(elements), [elements]);
  // Tout le scénario d'une série : la liste des scènes reprend le découpage en saisons et en épisodes (un épisode
  // encore vide y paraît aussi, on y va d'un clic). Dans un épisode ouvert, ses seules scènes.
  const episodeLabel = useEpisodeLabel();
  const foldedParts = useFoldedParts();
  const plotColor = usePlotColor();
  const sceneRows = useMemo(() => {
    type Row =
      | { kind: "season"; id: string; at: number; title: string }
      | { kind: "episode"; id: string; at: number; title: string }
      | { kind: "omitted"; id: string; at: number; title: string; number: number }
      | { kind: "act" | "seq"; id: string; at: number; title: string; count: number }
      | { kind: "scene"; at: number; k: number };
    const rows: Row[] = scenes.map((sc, k) => ({ kind: "scene", at: sc.index, k }));
    // Scènes omises (#46) : « OMIS » à sa place, en grisé, avec son rang.
    for (const o of listScenes(elements, true)) if (o.omitted) rows.push({ kind: "omitted", id: String(o.index), at: o.index, title: o.text, number: o.number });
    const seasons = seriesOf(elements);
    const named = seasons.filter((x) => x.id !== null).length;
    seasons.forEach((season, i) => {
      if (season.id !== null && named > 0) rows.push({ kind: "season", id: season.id, at: season.at, title: season.title || fmt(t.season.seasonDefault, { n: i + 1 - (seasons[0].id === null ? 1 : 0) }) });
      for (const ep of season.episodes) rows.push({ kind: "episode", id: ep.id, at: ep.at, title: episodeLabel(ep) });
    });
    // Actes et séquences (#140, #142) : un intertitre repliable ; une partie repliée cache ses scènes.
    for (const p of structureOf(elements)) rows.push({ kind: p.kind, id: p.key, at: p.at, title: partLabel(p, t.screenplay.preserved), count: p.scenes.length });
    const hiddenBy = structureOf(elements).filter((p) => foldedParts.has(p.key));
    return rows.sort((a, b) => a.at - b.at).filter((r) => !hiddenBy.some((p) => r.at > p.at && r.at < p.end));
  }, [scenes, elements, episodeLabel, t, foldedParts]);
  // Scène en cours pour le ruban : la dernière dont l'en-tête est avant le curseur.
  const ribbonScene = scenes.filter((s) => s.index <= current.index).pop();
  const ribbonCurrent = ribbonScene ? (ribbonScene.cardId ?? `@${ribbonScene.index}`) : null;
  const sceneCards = useMemo<SceneCard[]>(
    () => nodes.filter((n) => n.data.type === "scene").map((n) => ({ id: n.id, title: n.data.title })),
    [nodes],
  );
  // Série : une scène écrite dans un autre épisode n'est pas « à écrire » ici (toute la saison compte).
  const season = useCosmos((s) => s.screenplay);
  const toWrite = useMemo(
    () => (season ? cardsWithoutScene(season, sceneCards) : []),
    [season, sceneCards],
  );
  // Le curseur sur « OMIS » (#46), ou sous lui, n'est dans aucune scène : pas celle d'avant, qu'on omettrait par erreur.
  const allScenes = useMemo(() => listScenes(elements, true), [elements]);
  const at = sceneAt(allScenes, current.index);
  const scene = at?.omitted ? null : at;
  // Statistiques du volet de droite : mots, pages (mise en page cinéma), scènes écrites.
  const stats = useMemo<ManuscriptStats>(() => {
    const words = screenplayWords(screenplay);
    const pages = pagination?.pages ?? 0;
    const body = scenes.map((s) => (screenplay ? wordsOfScene(screenplay, s.index + 1, s.end) : 0));
    const written = body.filter((n) => n > 0).length;
    return {
      words,
      pages,
      minutes: minutesFor(pages),
      scenes: scenes.length,
      written,
      average: written > 0 ? Math.round(words / written) : 0,
      perScene: new Map(),
    };
  }, [screenplay, scenes, pagination]);
  const sceneWordCount = screenplay && scene ? wordsOfScene(screenplay, scene.index, scene.end) : 0;
  // Statut des scènes (pastille dans la liste) : lu dans la fiche de leur carte.
  const statusCards = useMemo(() => new Map(nodes.filter((n) => n.data.type === "scene").map((n) => [n.id, n.data])), [nodes]);
  // Rechercher et remplacer (Cmd/Ctrl + Maj + H) : la scène en cours est proposée ; la frappe en attente part d'abord.
  const openReplace = () => {
    emit();
    useCosmos.getState().openReplace({ sceneId: scene?.cardId ?? null });
  };
  const openReplaceRef = useRef(openReplace);
  openReplaceRef.current = openReplace;
  // Versions de la scène en cours : la frappe en attente part d'abord, pour garder le texte tel qu'on le voit.
  const openVersions = (keep: boolean) => {
    emit();
    if (scene?.cardId) useCosmos.getState().openVersions(scene.cardId, keep);
  };
  // « Fusionner avec la scène suivante » (#23) : ce qui attend dans l'éditeur part d'abord dans le store.
  const mergeNext = () => {
    emit();
    if (scene?.cardId) useCosmos.getState().mergeWithNext(scene.cardId);
  };
  const mergeNextRef = useRef(mergeNext);
  mergeNextRef.current = mergeNext;
  useCommand("merge-next", () => mergeNextRef.current());
  // « Omettre la scène » (#46) : pages verrouillées seulement ; ce qui attend dans l'éditeur part d'abord.
  const locked = useCosmos((s) => !!s.revisions.locked);
  const omitCurrent = () => {
    if (!scene || !useCosmos.getState().revisions.locked) return;
    emit();
    const state = useCosmos.getState();
    state.omitScreenplayScene(scriptOffset(state) + scene.index);
  };
  const omitRef = useRef(omitCurrent);
  omitRef.current = omitCurrent;
  useCommand("omit-scene", () => omitRef.current());
  const openVersionsRef = useRef(openVersions);
  openVersionsRef.current = openVersions;
  // Acte ou séquence (#140) : une section notée, posée au-dessus de la scène du curseur, par une transaction de
  // l'éditeur (le texte reste la source). Titre « Séquence 3 », renommé dans le séquencier.
  const insertPart = (kind: StructureKind) => {
    const ed = editorRef.current;
    if (!ed || ed.isDestroyed) return;
    const { elements: els } = fromDoc(ed.getJSON(), {});
    // Le curseur d'après la page : juste après un clic, ProseMirror n'a pas toujours relu la sélection.
    const anchor = window.getSelection()?.anchorNode ?? null;
    let block: Node | null = anchor && ed.view.dom.contains(anchor) ? anchor : null;
    while (block && block.parentNode !== ed.view.dom) block = block.parentNode;
    let from = ed.state.selection.from;
    let caret: number | null = null;
    try {
      if (block && !(block as HTMLElement).classList?.contains("ProseMirror-widget")) from = ed.view.posAtDOM(block, 0);
      if (block && anchor) caret = ed.view.posAtDOM(anchor, window.getSelection()?.anchorOffset ?? 0);
    } catch {
      // Nœud inconnu de ProseMirror : la sélection de l'éditeur.
    }
    const top = ed.state.doc.resolve(Math.min(from, ed.state.doc.content.size)).index(0);
    const at = insertionPoint(els, top);
    const label = kind === "act" ? sp.preserved.act : sp.preserved.seq;
    // #148 : l'acte ou la séquence est aussi une case de la structure de l'auteur. Une structure livrée de cet
    // épisode devient d'abord la sienne (« d'après » elle), ses cases gardent leurs scènes.
    const st = useCosmos.getState();
    const tp = t.plan;
    const used = [...usedCaseKeys(st.screenplay?.elements ?? [], st.plan.scriptBeats), ...usedCaseKeys(els)];
    const [scopeStart, scopeEnd] = scopeAt(els, at);
    const firstBuiltIn = els.slice(scopeStart, scopeEnd).flatMap((el) => {
      const k = el.type === "section" && !structureMark(el) ? beatOf(el.text) : null;
      return k && !isCustomBeat(k) ? [k] : [];
    })[0];
    const builtIn = firstBuiltIn ? SCREENPLAY_TEMPLATES.find((tpl) => (PLAN_TEMPLATES[tpl] as readonly string[]).includes(firstBuiltIn)) : undefined;
    const custom = customizeRange(els, scopeStart, scopeEnd, used, {
      label: (k) => tp.beats[k as PlanBeat]?.label ?? k,
      hint: (k) => tp.beats[k as PlanBeat]?.hint ?? "",
      tplName: builtIn ? fmt(tp.structureFrom, { name: tp.templates[builtIn] }) : "",
    });
    const caseKey = nextCustomKey([...used, ...Object.keys(custom.entries)]);
    const section = structureSection(custom.elements, at, kind, newId(), `${label} ${nextNumber(custom.elements, at, kind)}`, caseKey);
    let tr = ed.state.tr;
    if (custom.elements !== els) {
      let p = 0;
      for (let i = 0; i < ed.state.doc.childCount; i++) {
        const node = ed.state.doc.child(i);
        const changed = custom.elements[i];
        if (changed !== els[i] && changed?.type === "section") tr = tr.setNodeMarkup(p, undefined, { ...node.attrs, text: changed.text });
        p += node.nodeSize;
      }
    }
    let pos = 0;
    for (let i = 0; i < at && i < tr.doc.childCount; i++) pos += tr.doc.child(i).nodeSize;
    const node = ed.schema.nodeFromJSON(toNode(section));
    tr = tr.insert(pos, node);
    // Le curseur reste où il était (et non à la sélection que ProseMirror n'avait pas encore relue).
    if (caret !== null) {
      try {
        tr.setSelection(TextSelection.near(tr.doc.resolve(Math.min(tr.mapping.map(caret), tr.doc.content.size))));
      } catch {
        // Position introuvable : la sélection suit d'elle-même.
      }
    }
    ed.view.dispatch(tr.scrollIntoView());
    // Tout de suite dans le store : séquencier, liste des scènes et onglet Scène la voient sans attendre.
    emit();
    if (Object.keys(custom.entries).length > 0) useCosmos.getState().addScriptBeats(custom.entries);
    ed.view.focus();
    setAnnounce(fmt(sp.partAdded, { title: plainSection(section.text) }));
  };
  // Renommer un acte ou une séquence depuis la liste des scènes (lot 17) : la section de la feuille, ses notes gardées.
  const [renamingPart, setRenamingPart] = useState<string | null>(null);
  const renamePart = (at: number, title: string) => {
    const ed = editorRef.current;
    if (!ed || ed.isDestroyed || at >= ed.state.doc.childCount) return;
    const node = ed.state.doc.child(at);
    const text = String(node.attrs.text ?? "");
    const next = renameStructure([{ type: "section", depth: 1, text }], 0, title)[0].text;
    if (next === text || !title.trim()) return;
    let pos = 0;
    for (let i = 0; i < at; i++) pos += ed.state.doc.child(i).nodeSize;
    ed.view.dispatch(ed.state.tr.setNodeMarkup(pos, undefined, { ...node.attrs, text: next }));
    emit();
  };
  // Renommer un acte ou une séquence dans la feuille même : double-clic sur sa ligne, ou Entrée quand elle est choisie.
  const [sheetRename, setSheetRename] = useState<{ at: number; title: string; top: number; left: number; width: number } | null>(null);
  const openSheetRename = (el: HTMLElement) => {
    const ed = editorRef.current;
    if (!ed || ed.isDestroyed) return false;
    let pos = 0;
    for (let i = 0; i < ed.state.doc.childCount; i++) {
      const node = ed.state.doc.child(i);
      if (ed.view.nodeDOM(pos) === el) {
        if (!structureMark({ type: "section", text: String(node.attrs.text ?? "") })) return false;
        const r = el.getBoundingClientRect();
        const open = { at: i, title: plainSection(String(node.attrs.text ?? "")), top: r.top, left: r.left, width: r.width };
        // Après le geste : l'éditeur reprend le focus à la fin d'un double-clic et refermerait le champ aussitôt.
        setTimeout(() => setSheetRename(open), 0);
        return true;
      }
      pos += node.nodeSize;
    }
    return false;
  };
  openSheetRenameRef.current = openSheetRename;
  // La feuille défile : le champ posé sur la ligne la quitterait, il enregistre et se ferme.
  useEffect(() => {
    if (!sheetRename) return;
    const close = () => {
      const el = document.querySelector(".sp-sheet-rename");
      if (el instanceof HTMLElement) el.blur();
    };
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    return () => {
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
    };
  }, [sheetRename]);
  useEffect(() => {
    const dom = editor?.view.dom;
    if (!dom) return;
    const onDbl = (e: MouseEvent) => {
      const el = (e.target as HTMLElement | null)?.closest?.('.sp-preserved[data-series="act"], .sp-preserved[data-series="seq"]');
      if (el instanceof HTMLElement && openSheetRenameRef.current(el)) e.preventDefault();
    };
    dom.addEventListener("dblclick", onDbl);
    return () => dom.removeEventListener("dblclick", onDbl);
  }, [editor]);
  const insertPartRef = useRef(insertPart);
  insertPartRef.current = insertPart;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && !e.altKey && e.key.toLowerCase() === "h") {
        e.preventDefault();
        openReplaceRef.current();
      }
      if ((e.metaKey || e.ctrlKey) && e.altKey && !e.shiftKey && e.code === "KeyS") {
        e.preventDefault();
        openVersionsRef.current(true);
      }
      // Acte et séquence (#140) : Cmd/Ctrl + Alt + Maj + A ou S (Maj : jamais une lettre d'AltGr sous Windows).
      if ((e.metaKey || e.ctrlKey) && e.altKey && e.shiftKey && (e.code === "KeyA" || e.code === "KeyS")) {
        e.preventDefault();
        insertPartRef.current(e.code === "KeyA" ? "act" : "seq");
      }
      // Commenter l'élément où est le curseur (Cmd/Ctrl + Alt + M, comme dans le manuscrit).
      if ((e.metaKey || e.ctrlKey) && e.altKey && !e.shiftKey && e.code === "KeyM") {
        e.preventDefault();
        commentElementRef.current();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  /** La scène où se trouve le curseur (pour remettre un passage quand sa scène n'existe plus). */
  const currentGroup = (ed: Editor) => {
    const head = ed.state.selection.head;
    let found: string | null = null;
    for (const g of screenplayGroups(ed.state.doc)) {
      if (g.markerPos <= head) found = g.id;
      else break;
    }
    return found;
  };
  const b = t.book;
  /** Remet un passage du chutier dans le texte, à sa place d'origine si on la retrouve. */
  const putBack = (p: Passage) => {
    const ed = editorRef.current;
    if (!ed || ed.isDestroyed) return;
    const placed = placePassage(ed.state, p, currentGroup(ed), screenplayGroups);
    if (!placed) return;
    const size = placed.tr.doc.content.size;
    try {
      // Le passage remis est sélectionné : on voit tout de suite où il est revenu.
      placed.tr.setSelection(TextSelection.create(placed.tr.doc, Math.min(placed.from, size), Math.min(placed.to, size)));
    } catch {
      /* positions hors d'un texte : le curseur reste où il est */
    }
    ed.view.dispatch(placed.tr.scrollIntoView());
    ed.view.focus();
    useCosmos.getState().removePassage(p.id);
    const text = placed.where === "exact" ? b.chutier.back : placed.where === "near" ? b.chutier.backNear : b.chutier.backElsewhere;
    setAnnounce(text);
    setNotice(placed.where === "exact" ? null : { text });
  };
  /** Retire le passage sélectionné du scénario et le met au chutier. */
  const sendToChutier = () => {
    const ed = editorRef.current;
    if (!ed || ed.isDestroyed) return;
    const out = takePassage(ed.state, nanoid(), new Date().toISOString(), screenplayGroups);
    if ("error" in out) {
      const text = out.error === "scene" ? b.chutier.oneScene : b.chutier.nothing;
      setAnnounce(text);
      setNotice({ text });
      return;
    }
    ed.view.dispatch(out.tr.scrollIntoView());
    ed.view.focus();
    useCosmos.getState().addPassage(out.passage);
    setAnnounce(b.chutier.sent);
    setNotice({ text: b.chutier.sent, undo: () => putBack(out.passage) });
  };
  const sendRef = useRef(sendToChutier);
  sendRef.current = sendToChutier;
  // Raccourcis : Cmd/Ctrl + Maj + K (chutier) et Cmd/Ctrl + ; (correcteur), quand le curseur est dans le texte.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey) || e.altKey || !editorRef.current?.isFocused) return;
      if (e.shiftKey && e.key.toLowerCase() === "k") {
        e.preventDefault();
        sendRef.current();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Onglet « Vérifier » : points à regarder dans le scénario (rien n'est corrigé tout seul).
  const [sideTab, setSideTab] = useState<SideTab>("scene");
  // Téléphone : la barre d'éléments est un volet replié en haut de la feuille (sur iPad et ordinateur, toujours ouverte).
  const [toolsOpen, setToolsOpen] = useState(false);
  // Le mode focus commence volet fermé : seule la feuille compte.
  useEffect(() => {
    if (focusMode) setToolsOpen(false);
  }, [focusMode]);
  const storyFindings = useStoryFindings();
  // Comme au Manuscrit : « Vérifier » ne calcule que l'onglet ouvert, et le compteur n'est donné qu'alors.
  const reviewOpen = sideTab === "review";
  const findings = useMemo(
    () => [...(reviewOpen ? checkScreenplay(elements, LAYOUTS[paper], nodes.map((n) => n.data), lang) : []), ...storyFindings],
    [reviewOpen, elements, paper, nodes, lang, storyFindings],
  );
  const counted = useOpenFindings(findings) + useOpenAiQuestions();
  const openFindings = reviewOpen ? counted : 0;
  const openReview = () => {
    setSideTab("review");
    if (!panels.side) togglePanel("side");
  };
  useCommand("review", openReview);
  // Une relecture par l'IA vient de partir : ses questions arrivent dans l'onglet « Vérifier ».
  useAiReviewReveal(openReview);

  // Commentaires ancrés (1.13.0) : un commentaire porte sur un élément entier (action, réplique), noté dans le
  // Fountain par [[cosmos:comment:<id>]] ; le texte du commentaire est dans commentaires/<carte de la scène>.md.
  const comments = useCosmos((s) => s.comments);
  const commentFocus = useCosmos((s) => s.commentFocus);
  const openCommentsTab = () => {
    setSideTab("comments");
    if (!panels.side) togglePanel("side");
  };
  const sceneEnd = scene ? scene.end : 0;
  const commentAnchors = useMemo(() => (scene ? commentIdsInElements(elements.slice(scene.index + 1, sceneEnd)) : []), [elements, scene, sceneEnd]);
  const openCommentIds = useMemo(() => Object.values(comments).flatMap((list) => list.filter((c) => !c.resolved).map((c) => c.id)), [comments]);
  const commentHighlight = useMemo(() => commentStyle(openCommentIds, commentFocus?.id ?? null), [openCommentIds, commentFocus]);
  const commentElement = () => {
    emit();
    const { state } = editor;
    const index = state.selection.$from.index(0);
    if (index >= state.doc.childCount) return;
    const node = state.doc.child(index);
    if (!COMMENT_TYPES.has(node.type.name) || !node.textContent.trim()) {
      setNotice({ text: t.comments.elementOnly });
      return;
    }
    // La scène de l'élément : l'en-tête qui le précède, et sa carte (où le commentaire est rangé).
    let cardId: string | null = null;
    for (let i = index; i >= 0 && !cardId; i--) {
      const n = state.doc.child(i);
      if (n.type.name === "sceneHeading") cardId = (n.attrs.cardId as string | null) ?? "";
    }
    if (!cardId || !useCosmos.getState().nodes.some((n) => n.id === cardId)) {
      setNotice({ text: t.comments.noCard });
      return;
    }
    const id = nanoid(12);
    const pos = posOf(state.doc, index);
    const ids = Array.isArray(node.attrs.comments) ? (node.attrs.comments as string[]) : [];
    editor.view.dispatch(state.tr.setNodeMarkup(pos, undefined, { ...node.attrs, comments: [...ids, id] }));
    // Le scénario du store reçoit la note tout de suite : le commentaire et son élément s'enregistrent ensemble.
    emit();
    useCosmos.getState().addComment(cardId, id, node.textContent);
    openCommentsTab();
  };
  const commentElementRef = useRef(commentElement);
  commentElementRef.current = commentElement;
  /** Sélectionne l'élément d'un commentaire et le fait défiler ; faux s'il n'est plus dans le texte. */
  const goToComment = (id: string) => {
    if (editor.isDestroyed) return false;
    let found = -1;
    editor.state.doc.forEach((node, offset) => {
      if (found < 0 && Array.isArray(node.attrs.comments) && (node.attrs.comments as string[]).includes(id)) found = offset;
    });
    if (found < 0) return false;
    const node = editor.state.doc.nodeAt(found)!;
    editor.chain().focus().setTextSelection({ from: found + 1, to: found + 1 + node.content.size }).scrollIntoView().run();
    const owner = Object.entries(useCosmos.getState().comments).find(([, list]) => list.some((c) => c.id === id))?.[0];
    if (owner) useCosmos.getState().setCommentFocus({ cardId: owner, id });
    return true;
  };
  const goToCommentRef = useRef(goToComment);
  goToCommentRef.current = goToComment;
  // Choisi depuis « À faire » : la scène est ouverte (openInManuscript), puis le volet et l'élément.
  useEffect(() => {
    if (!commentFocus?.reveal) return;
    const { cardId, id } = commentFocus;
    openCommentsTab();
    useCosmos.getState().setCommentFocus({ cardId, id });
    window.requestAnimationFrame(() => window.requestAnimationFrame(() => goToCommentRef.current(id)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [commentFocus]);
  // Un clic ou un toucher dans un élément commenté ouvre son commentaire dans le volet.
  const openCommentsTabRef = useRef(openCommentsTab);
  openCommentsTabRef.current = openCommentsTab;
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      const el = e.target instanceof Element ? e.target.closest("[data-comments]") : null;
      const ed = editorRef.current;
      if (!el || !ed || ed.isDestroyed || !ed.view.dom.contains(el)) return;
      const s = useCosmos.getState();
      for (const id of (el.getAttribute("data-comments") ?? "").split(" ")) {
        const owner = Object.entries(s.comments).find(([, list]) => list.some((c) => c.id === id && !c.resolved));
        if (!owner) continue;
        s.setCommentFocus({ cardId: owner[0], id });
        openCommentsTabRef.current();
        return;
      }
    };
    document.addEventListener("click", onClick);
    return () => document.removeEventListener("click", onClick);
  }, []);
  // Filtre par personnage : ses scènes, ou ses répliques (le reste estompé). Affichage seulement.
  // Les scènes reliées par un fil à la carte du personnage comptent aussi (#137 : un personnage muet ajouté à la main).
  const charFilter = useCosmos((s) => withLinkedScenes(s, s.charFilter));
  const setCharFilter = useCosmos((s) => s.setCharFilter);
  // Ceux qui parlent, puis les personnages reliés à une scène sans y parler (#137), pour les filtrer aussi.
  const wiredKey = useCosmos((s) => wiredCharacters(s));
  const speakingList = useMemo(() => {
    const speaking = speakingNames(elements, lang);
    const known = new Set(speaking.map(foldName));
    const silent = wiredKey ? wiredKey.split("\n").filter((n) => !known.has(foldName(n))) : [];
    return [...speaking, ...silent.sort((x, y) => x.localeCompare(y, lang))];
  }, [elements, lang, wiredKey]);
  const keptScenes = useMemo(() => (charFilter ? new Set(keptBy(elements, charFilter)) : null), [elements, charFilter]);
  useEffect(() => {
    if (!editor || editor.isDestroyed) return;
    editor.view.dispatch(setCharacterFilter(editor.state, charFilter));
  }, [editor, charFilter]);
  // Lire le récit fil par fil (#117) : seulement les scènes d'une carte, l'écart entre elles en pages.
  const threadFilter = useCosmos((s) => s.threadFilter);
  // Cartes qu'on peut suivre depuis le volet des scènes (lot 17), par type, sauf les personnages (filtre à part).
  const filterGroups = useMemo(
    () =>
      THREAD_TYPES.filter((type) => type !== "personnage")
        .map((type) => ({
          type,
          cards: nodes
            .filter((n) => n.data.type === type && n.data.title.trim())
            .map((n) => ({ id: n.id, title: n.data.title.trim() }))
            .sort((a, b) => a.title.localeCompare(b.title, lang)),
        }))
        .filter((g) => g.cards.length > 0),
    [nodes, lang],
  );
  const edges = useCosmos((s) => s.edges);
  const eighths = useSceneEighths();
  const threadCard = threadFilter ? nodes.find((n) => n.id === threadFilter.id)?.data : undefined;
  const sceneIds = useMemo(() => scenes.flatMap((x) => (x.cardId ? [x.cardId] : [])), [scenes]);
  const threadKeptIds = useMemo(() => {
    if (!threadFilter || !threadCard) return null;
    // Le texte ne compte que pour « aussi celles qui la citent ».
    const texts = threadFilter.cited ? screenplaySceneTexts(elements) : {};
    return keptByThread(threadPresence(threadFilter.id, nodes.map((n) => n.data), edges, texts, sceneIds), sceneIds, threadFilter.cited);
  }, [threadFilter, threadCard, nodes, edges, sceneIds, elements]);
  // Scènes connues quand le filtre a été posé : une scène écrite depuis reste montrée.
  const [threadKnown, setThreadKnown] = useState<{ for: unknown; ids: Set<string> } | null>(null);
  if (threadFilter && threadKnown?.for !== threadFilter) setThreadKnown({ for: threadFilter, ids: new Set(sceneIds) });
  else if (!threadFilter && threadKnown) setThreadKnown(null);
  const threadFold = useMemo<ThreadFold | null>(() => {
    if (!threadKeptIds || !threadKnown) return null;
    const kept = new Set(threadKeptIds);
    const gaps = threadGaps(sceneIds, kept, (id) => eighths.get(id) ?? 0);
    return { kept, known: threadKnown.ids, gap: (id) => { const g = gaps.get(id); return g ? gapText(g.scenes, Math.floor(g.size / 8), getT()) : null; } };
  }, [threadKeptIds, threadKnown, sceneIds, eighths]);
  useEffect(() => {
    if (!editor || editor.isDestroyed) return;
    editor.view.dispatch(setThreadFold(editor.state, threadFold));
  }, [editor, threadFold]);
  /** Une scène de la liste est-elle montrée par le filtre en cours (personnage ou fil) ? */
  const listed = (s: { index: number; cardId?: string }) =>
    keptScenes ? keptScenes.has(s.index) : threadFold ? !!s.cardId && (threadFold.kept.has(s.cardId) || !threadFold.known.has(s.cardId)) : true;

  if (!editor || !screenplay) return null;

  const plural = (n: number, one: string, many: string) =>
    fmt(new Intl.PluralRules(lang).select(n) === "one" ? one : many, { n });

  /**
   * Déplace la scène qui commence à l'élément `from` à la place de celle qui commence à `to` (blocs du
   * séquencier : la scène entière, texte compris). Le curseur suit la scène déplacée.
   */
  const moveScene = (from: number, to: number, keepFocus = false) => {
    emit();
    const current = currentScript(useCosmos.getState());
    if (!current) return;
    const list = blocks(current.elements);
    const a = list.findIndex((b) => b.start === from);
    const b = list.findIndex((x) => x.start === to);
    if (a < 0 || b < 0 || a === b) return;
    const elements = moveBlock(current.elements, a, b);
    if (elements === current.elements) return;
    setAnnounce(fmt(sp.sequencer.moved, { title: list[a].text || sp.untitledScene, n: blocks(elements)[b].number ?? 0 }));
    const next = { ...current, elements };
    // L'éditeur est rechargé ici même (pas d'aller-retour par l'effet), puis le curseur va dans la scène déplacée.
    synced.current = next;
    useCosmos.getState().setScript(next, true);
    editor.commands.setContent(toDoc(next), { emitUpdate: false });
    editor.commands.setTextSelection(posOf(editor.state.doc, blocks(elements)[b].start) + 1);
    const dom = editor.view.nodeDOM(posOf(editor.state.doc, blocks(elements)[b].start));
    if (dom instanceof HTMLElement) dom.scrollIntoView({ block: "nearest" });
    if (keepFocus) requestAnimationFrame(() => rootRef.current?.querySelector<HTMLButtonElement>(".sp-scene-list button.is-current")?.focus());
  };

  const goToFinding = (f: Finding) => goToElement(f.at);
  // Question de l'IA : l'élément de la scène qui contient le passage cité, sinon son en-tête.
  const goToAiScene = (ref: SceneRef, quote?: string) => {
    emit();
    const at = elementFor(currentScript(useCosmos.getState())?.elements ?? [], ref, quote);
    if (at < 0) return false;
    goToElement(at);
    return true;
  };
  const goToElement = (at: number) => {
    emit();
    const pos = posOf(editor.state.doc, at);
    const node = editor.state.doc.nodeAt(pos);
    if (!node) return;
    // Passage caché par le filtre par personnage : on retire le filtre, puis on y va.
    const hidden = editor.view.nodeDOM(pos);
    if (hidden instanceof HTMLElement && hidden.classList.contains("is-filter-hidden")) {
      useCosmos.getState().setCharFilter(null);
      window.requestAnimationFrame(() => goToElement(at));
      return;
    }
    // Tout l'élément est sélectionné : on voit tout de suite de quoi il s'agit.
    editor.chain().focus().setTextSelection({ from: pos + 1, to: pos + Math.max(1, node.nodeSize - 1) }).run();
    const dom = editor.view.nodeDOM(pos);
    if (dom instanceof HTMLElement) dom.scrollIntoView({ block: "center" });
  };

  const goTo = (index: number) => {
    emit();
    const pos = posOf(editor.state.doc, index);
    // Une section suivie d'aucune scène (épisode ou case vides, « Aller à ») : le curseur se pose dessous.
    const gap = index < editor.state.doc.childCount && editor.state.doc.child(index).type.name === PRESERVED ? startGap(editor.state.doc, index) : null;
    if (gap !== null && isGap(editor.state.doc.resolve(gap))) {
      editor.view.dispatch(editor.state.tr.setSelection(new GapCursor(editor.state.doc.resolve(gap))));
      editor.view.focus();
      const dom = editor.view.nodeDOM(pos);
      if (dom instanceof HTMLElement) dom.scrollIntoView({ block: "start" });
      return;
    }
    // Une section déjà suivie d'une scène (saison, épisode de la liste) : le curseur va dans le premier élément
    // qu'on écrit après elle, la section reste en haut de l'écran.
    if (index < editor.state.doc.childCount && editor.state.doc.child(index).type.name === PRESERVED) {
      let next = index + 1;
      while (next < editor.state.doc.childCount && editor.state.doc.child(next).type.name === PRESERVED) next++;
      if (next < editor.state.doc.childCount) {
        editor.chain().setTextSelection(posOf(editor.state.doc, next) + 1).focus(undefined, { scrollIntoView: false }).run();
        track(editor);
        const dom = editor.view.nodeDOM(pos);
        if (dom instanceof HTMLElement) dom.scrollIntoView({ block: "start" });
        return;
      }
    }
    editor.chain().setTextSelection(pos + 1).focus(undefined, { scrollIntoView: false }).run();
    // Le volet de droite suit tout de suite la scène choisie, sans attendre l'éditeur.
    track(editor);
    // WebKit (app Mac, iPad) : le focus différé de l'éditeur peut relire l'ancienne position du
    // curseur dans la page et la remettre. On repose la sélection sur la scène choisie.
    window.requestAnimationFrame(() =>
      window.requestAnimationFrame(() => {
        if (editor.isDestroyed || editor.state.selection.$from.index(0) === index) return;
        if (index >= editor.state.doc.childCount) return;
        editor.commands.setTextSelection(posOf(editor.state.doc, index) + 1);
      }),
    );
    const dom = editor.view.nodeDOM(pos);
    if (dom instanceof HTMLElement) dom.scrollIntoView({ block: "start" });
  };

  /** Choisit une scène pour le volet de droite sans déplacer le curseur (clic sur son synopsis). */
  const showScene = (index: number) => setCurrent((prev) => (prev.index === index ? prev : { index, type: null }));

  // Lecture à voix haute : à partir de l'élément où est le curseur, chaque réplique par la voix de son personnage.
  const readerSpeakers = useMemo(() => speakingNames(screenplay?.elements ?? [], lang), [screenplay, lang]);
  const startListening = () => {
    if (editor.isDestroyed) return;
    const nodes: ReadNode[] = [];
    editor.state.doc.forEach((node) => nodes.push(node.type.name === PRESERVED ? { type: String(node.attrs.kind), text: "" } : { type: node.type.name, text: node.textContent }));
    const { lang: language, reading } = useSettings.getState();
    startReading(editor, screenplayUtterances(nodes, editor.state.selection.$from.index(0), language, reading.parentheticals));
  };
  const readerItems = useReaderItems(startListening);
  const keysLearned = useSettings((s) => s.learned.includes("screenplayKeys"));

  // (À SUIVRE) / (SUITE) changés dans les réglages : la feuille se redessine (rien n'est écrit dans le texte).
  const continuedKey = useCosmos((s) => `${s.scriptPdf.breaks}|${s.scriptPdf.resumes}`);
  useEffect(() => {
    if (!editor.isDestroyed) editor.view.dispatch(editor.state.tr.setMeta("addToHistory", false));
  }, [editor, continuedKey]);

  // Arrivée depuis la recherche ou « À faire » : la scène de cette carte.
  const target = useCosmos((s) => s.manuscriptTarget);
  const goToRef = useRef(goTo);
  goToRef.current = goTo;
  useEffect(() => {
    // Cible déjà prise (l'effet rejoué par le mode strict de React) : ne pas revenir en haut de la scène.
    if (!target || useCosmos.getState().manuscriptTarget !== target) return;
    // Curseur et mot cherché lus avant d'être effacés avec la cible (#85 : le curseur était lu après, donc jamais).
    const { manuscriptCaret: caret, manuscriptNeedle: needle, manuscriptNth: nth } = useCosmos.getState();
    useCosmos.getState().clearManuscriptTarget();
    const state = useCosmos.getState();
    const elements = currentScript(state)?.elements ?? [];
    // Rang du scénario entier (série : toute la saison), ramené à celui de l'épisode ouvert.
    const at = target.startsWith(SCENE_AT) ? Number(target.slice(SCENE_AT.length)) - scriptOffset(state) : -1;
    // Une section d'épisode (« Aller à » un épisode) est juste avant le texte de l'épisode ouvert : son début.
    const at0 = target.startsWith(SCENE_AT) && at < 0 && elements.length > 0 ? 0 : at;
    const index = at0 >= 0 ? (at0 < elements.length ? at0 : -1) : elements.findIndex((el) => el.type === "sceneHeading" && el.cardId === target);
    if (index < 0) return;
    // Arrivée depuis la recherche (#85) : le mot sélectionné dans l'élément de la scène qui le contient.
    const selectNeedle = () => {
      if (!needle || editor.isDestroyed) return false;
      const doc = editor.state.doc;
      // Les éléments écrits de la scène, jusqu'à l'en-tête suivant, comptés comme la liste des résultats.
      const blocks: { node: PMNode; i: number }[] = [];
      for (let i = index; i < doc.childCount; i++) {
        const node = doc.child(i);
        if (i > index && node.type.name === "sceneHeading") break;
        if (node.isTextblock && node.textContent.trim()) blocks.push({ node, i });
      }
      const texts = blocks.map((b) => b.node.textContent);
      // Recherche de la vue (`nth` : la n-ième occurrence), sinon la saisie entière puis le premier mot trouvé.
      let hit: { index: number; at: number; length: number } | null = nth !== null ? nthMatch(texts, needle, nth) : null;
      for (const wholeOnly of nth === null ? [true, false] : []) {
        if (hit) break;
        for (let k = 0; k < texts.length && !hit; k++) {
          const found = findInText(texts[k], needle, wholeOnly);
          if (found) hit = { index: k, ...found };
        }
      }
      if (!hit) return false;
      const { node, i } = blocks[hit.index];
      // Position dans le document d'un caractère de l'élément (un nœud en ligne n'a pas toujours de texte).
      const start = posOf(doc, i) + 1;
      const map = (target: number) => {
        let seen = 0;
        let result = -1;
        node.forEach((child, offset) => {
          if (result >= 0) return;
          const len = child.textContent.length;
          if (child.isText && target <= seen + len) result = start + offset + (target - seen);
          seen += len;
        });
        return result >= 0 ? result : start + target;
      };
      // Au milieu de l'écran (#85), pas au bord où `scrollIntoView` le laissait.
      editor.chain().focus(undefined, { scrollIntoView: false }).setTextSelection({ from: map(hit.at), to: map(hit.at + hit.length) }).run();
      track(editor);
      centerSelection(editor.view);
      return true;
    };
    // « Reprendre là où j'en étais » (#27) : l'élément du curseur dans la scène, puis sa place dans l'élément.
    if (!caret) {
      requestAnimationFrame(() => {
        if (!selectNeedle()) goToRef.current(index);
      });
      return;
    }
    const placeCaret = () => {
      if (editor.isDestroyed) return;
      const doc = editor.state.doc;
      const i = Math.min(index + (caret.el ?? 0), doc.childCount - 1);
      if (i < 0) return;
      const node = doc.child(i);
      if (!node.isTextblock) return;
      editor.commands.setTextSelection(posOf(doc, i) + 1 + Math.min(caret.offset, node.content.size));
    };
    requestAnimationFrame(() => {
      goToRef.current(Math.min(index + (caret.el ?? 0), Math.max(0, editor.state.doc.childCount - 1)));
      placeCaret();
      // Comme goTo : le focus différé de WebKit peut remettre l'ancienne position.
      requestAnimationFrame(() => requestAnimationFrame(placeCaret));
    });
  }, [target]);

  // Où est le curseur (#27), lu au moment où l'on relève la position : la scène (sa carte, sinon le rang de son
  // en-tête dans tout le scénario), l'élément depuis l'en-tête et la place dans l'élément.
  useEffect(() => {
    setCaretSource(() => {
      if (editor.isDestroyed) return null;
      const { $from } = editor.state.selection;
      const doc = editor.state.doc;
      const index = Math.min($from.index(0), doc.childCount - 1);
      if (index < 0) return null;
      let head = index;
      while (head > 0 && doc.child(head).type.name !== "sceneHeading") head--;
      const heading = doc.child(head);
      const isHeading = heading.type.name === "sceneHeading";
      const start = isHeading ? head : index;
      const card = isHeading ? String(heading.attrs.cardId ?? "") : "";
      return {
        scene: card || `${SCENE_AT}${scriptOffset(useCosmos.getState()) + start}`,
        el: index - start,
        offset: $from.depth > 0 ? $from.parentOffset : 0,
        label: isHeading ? heading.textContent.trim() || undefined : undefined,
      };
    });
    return () => setCaretSource(null);
  }, [editor]);

  /** Page de titre : le champ part dans le store, et l'éditeur n'est pas rechargé pour autant. */
  const setTitleField = (field: TitleField, value: string) => {
    emit();
    const next = useCosmos.getState().setTitlePageField(field, value);
    if (next) synced.current = next;
  };

  /**
   * Synopsis d'une scène : une ligne « = … » juste sous son en-tête (un texte vide la retire).
   * Écrit dans l'éditeur, qui est la référence tant que la vue est ouverte.
   */
  const saveSynopsis = (index: number, text: string, ia = false) => {
    emit();
    const { state, view } = editor;
    const heading = state.doc.maybeChild(index);
    if (heading?.type.name !== "sceneHeading") return;
    const tr = state.tr;
    const at = posOf(state.doc, index) + heading.nodeSize;
    // Les lignes de synopsis déjà là sont remplacées par une seule.
    let end = at;
    for (let i = index + 1; i < state.doc.childCount; i++) {
      const node = state.doc.child(i);
      if (node.type.name !== "preserved" || node.attrs.kind !== "synopsis") break;
      end += node.nodeSize;
    }
    if (end > at) tr.delete(at, end);
    if (text) tr.insert(at, state.schema.nodes.preserved.create({ kind: "synopsis", text, depth: null, ia }));
    if (!tr.docChanged) return;
    view.dispatch(tr);
    emit();
    // L'éditeur vient de signaler sa scène (celle du curseur) : le volet reste sur celle du synopsis.
    showScene(index);
  };

  /** Une carte Scène sans texte : on ouvre sa scène à la fin du scénario. */
  const writeScene = (card: SceneCard) => {
    const { state, view } = editor;
    const { schema, doc } = state;
    const title = card.title.trim();
    const heading = schema.nodes.sceneHeading.create({ cardId: card.id, known: true }, title ? schema.text(title) : null);
    // Document encore vierge : la scène prend la place de la ligne vide.
    const blank = doc.childCount === 1 && doc.firstChild!.content.size === 0;
    const at = blank ? 0 : doc.content.size;
    const tr = blank
      ? state.tr.replaceWith(0, doc.content.size, [heading, schema.nodes.action.create()])
      : state.tr.insert(at, [heading, schema.nodes.action.create()]);
    // Titre déjà là : on écrit l'action. Sinon on commence par l'en-tête.
    tr.setSelection(TextSelection.create(tr.doc, title ? at + heading.nodeSize + 1 : at + 1));
    view.dispatch(tr.scrollIntoView());
    view.focus();
  };

  /** Choisir une suggestion : elle remplace le texte de l'élément, ou crée une carte. */
  const pick = (index: number) => {
    const item = menuRef.current?.items[index];
    const element = currentElement(editor.state);
    if (!item || !element) return;
    if (item.create) {
      const { addTitledCard, linkCards } = useCosmos.getState();
      const id = addTitledCard(item.create.type, item.create.title);
      // Un décor créé depuis l'en-tête d'une scène : un fil relie la scène à son décor.
      const sceneCard = element.node.attrs.cardId as string | null;
      if (item.create.type === "lieu" && sceneCard) linkCards(sceneCard, id, sp.linkSetIn);
      refreshMenu(editor);
      return;
    }
    if (item.names) {
      // Le nom choisi remplace le texte de l'élément en cours (relu au moment du choix : il a pu bouger).
      openNames({
        kind: "full",
        onPick: (name) => {
          const now = currentElement(editor.state);
          if (!now) return;
          const from = now.pos + 1;
          editor.view.dispatch(editor.state.tr.insertText(name, from, from + now.node.content.size).scrollIntoView());
          window.setTimeout(() => editor.view.focus(), 0);
        },
      });
      return;
    }
    if (item.text === undefined) return;
    const start = element.pos + 1;
    editor.view.dispatch(editor.state.tr.insertText(item.text, start, start + element.node.content.size).scrollIntoView());
    editor.view.focus();
  };
  pickRef.current = pick;

  /** Une scène écrite sans carte : on crée sa carte sur la toile, sous les autres. */
  const createCard = (target: Scene) => {
    emit();
    const id = useCosmos.getState().addTitledCard("scene", target.text);
    const pos = posOf(editor.state.doc, target.index);
    const node = editor.state.doc.nodeAt(pos);
    if (node?.type.name === "sceneHeading") {
      editor.view.dispatch(editor.state.tr.setNodeMarkup(pos, null, { ...node.attrs, cardId: id, known: true }));
      emit();
    }
  };

  const card = scene?.cardId ? nodes.find((n) => n.id === scene.cardId && n.data.type === "scene")?.data : undefined;
  const location = scene ? headingParts(scene.text).location : "";
  const speakers = scene ? sceneCharacters(elements, scene) : [];

  // Libellés des éléments conservés, lus par le CSS (voir .sp-preserved::before).
  const labels = Object.fromEntries(
    Object.entries(sp.preserved).map(([kind, label]) => [`--sp-label-${kind}`, JSON.stringify(label)]),
  ) as CSSProperties;

  // Couleur de chaque passe marquée dans le texte (#18) : une règle par numéro, lue par le fond et la pastille.
  const revisionRules = [...new Set([...revisions.sets.map((r) => r.n), ...(screenplay?.elements ?? []).flatMap((e) => (e.rev === undefined ? [] : [e.rev]))])]
    .map((n) => `.screenplay [data-rev="${n}"]{--rev:${revisionVar(setOf(revisions, n)?.color ?? colorFor(n))}}`)
    .join("");
  const openPass = currentSet(revisions);
  // Pages verrouillées ou déverrouillées : la feuille se recoupe tout de suite (pas de frappe pour le déclencher).
  useEffect(() => {
    if (editor && !editor.isDestroyed) editor.view.dispatch(editor.state.tr.setMeta("addToHistory", false));
  }, [editor, revisions.locked]);

  return (
    <div
      data-char-filter={charFilter ? "" : undefined}
      className={`screenplay${panels.scenes ? "" : " hide-scenes"}${panels.side ? "" : " hide-side"}${focusMode ? " is-focus" : ""}${writing.showSynopsis && !focusMode ? " show-synopsis" : ""}${focusMode && writing.typewriter ? " is-typewriter" : ""}${chrome.quiet ? " is-quiet" : ""}${chrome.typing ? " is-typing" : ""}${chrome.pointerOff ? " is-pointer-off" : ""}`}
      ref={rootRef}
      // Largeur de la colonne du mode focus, comme dans le Manuscrit : la taille du texte ne change pas, la colonne
      // s'élargit (réglage de l'appareil, en caractères).
      style={focusMode ? { ["--focus-sp" as string]: FOCUS_SCRIPT_CH[writing.column] } : undefined}
    >
      <LanguageToolStatus status={lt.status} />
      {focusMode && <FocusBar />}
      {focusMode && (
        <FocusCounter
          text={pagination && pagination.pages > 0 ? `${fmt(sp.pageOf, { page: pagination.startPage[Math.min(current.index, pagination.startPage.length - 1)] ?? 1, pages: pagination.pages })} · ${fmt(sp.minutes, { n: minutesFor(pagination.pages) })}` : fmt(t.manuscript.wordsMany, { n: num(stats.words) })}
          words={stats.words}
          num={num}
        />
      )}
      <nav className="sp-scenes ms-scenes" aria-label={sp.scenesAria}>
        <EpisodePicker beforeSwitch={emit} onNotice={(text) => setNotice({ text })} />
        {/* Même en-tête que le volet du Manuscrit (#58). */}
        <h2 className="sp-box-title">{sp.scenesTitle}</h2>
        {scenes.length === 0 && <p className="sp-empty">{sp.scenesEmpty}</p>}
        {(speakingList.length > 0 || charFilter || threadFilter || filterGroups.length > 0) && (
          <div className="sp-filter">
            <label htmlFor="sp-filter-name">{sp.filterLabel}</label>
            {/* Lot 17 : personnages (leurs répliques), puis décors, intrigues, thèmes, objets… (scènes reliées ou qui
                les nomment, comme « Lire le fil »). */}
            <select
              id="sp-filter-name"
              value={charFilter ? `c:${charFilter.name}` : threadFilter ? `t:${threadFilter.id}` : ""}
              onChange={(e) => {
                const v = e.target.value;
                const st = useCosmos.getState();
                if (v.startsWith("c:")) setCharFilter({ name: v.slice(2), mode: charFilter?.mode ?? "scenes" });
                else if (v.startsWith("t:")) st.setThreadFilter({ id: v.slice(2), cited: true });
                else {
                  setCharFilter(null);
                  st.setThreadFilter(null);
                }
              }}
            >
              <option value="">{sp.filterAll}</option>
              {speakingList.length > 0 && (
                <optgroup label={types.personnage.section}>
                  {/* Nom venu de la Bible sans réplique encore : il reste proposé. */}
                  {(charFilter && !speakingList.includes(charFilter.name) ? [...speakingList, charFilter.name] : speakingList).map((name) => (
                    <option key={name} value={`c:${name}`}>
                      {name}
                    </option>
                  ))}
                </optgroup>
              )}
              {filterGroups.map((g) => (
                <optgroup key={g.type} label={types[g.type].section}>
                  {g.cards.map((c) => (
                    <option key={c.id} value={`t:${c.id}`}>
                      {c.title}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
            {charFilter && (
              <>
                <div className="side-tabs" role="group" aria-label={sp.filterModes}>
                  <button type="button" aria-pressed={charFilter.mode === "scenes"} onClick={() => setCharFilter({ ...charFilter, mode: "scenes" })}>
                    {sp.filterScenes}
                  </button>
                  <button type="button" aria-pressed={charFilter.mode === "lines"} onClick={() => setCharFilter({ ...charFilter, mode: "lines" })}>
                    {sp.filterLines}
                  </button>
                </div>
                <p className="sp-detail">{fmt(sp.filterCount, { shown: keptScenes?.size ?? 0, total: scenes.length })}</p>
              </>
            )}
          </div>
        )}
        <ol className="sp-scene-list">
          {sceneRows.map((row) => row.kind === "omitted" ? (keptScenes || threadFold ? null : (
            <li key={`omitted:${row.id}`} className="sp-scene-omitted">
              <button type="button" aria-label={fmt(sp.omittedAria, { n: elements[row.at]?.sceneNumber ?? String(row.number) })} onClick={() => goTo(row.at)}>
                <span className="is-slugline ms-name">
                  {row.number}. {row.title}
                </span>
              </button>
            </li>
          )) : row.kind === "act" || row.kind === "seq" ? (
            <li key={`${row.kind}:${row.id}`} className={`sp-scene-group is-${row.kind}`}>
              <button
                type="button"
                className="icon-button sp-part-fold"
                aria-expanded={!foldedParts.has(row.id)}
                aria-label={fmt(foldedParts.has(row.id) ? t.season.unfold : t.season.fold, { title: row.title })}
                onClick={() => toggleFoldedPart(row.id)}
              >
                <span className={`disclosure${foldedParts.has(row.id) ? "" : " is-open"}`} aria-hidden="true" />
              </button>
              {renamingPart === row.id ? (
                <input
                  // Le champ s'ouvre pour qu'on tape tout de suite le nouveau titre.
                  // eslint-disable-next-line jsx-a11y/no-autofocus
                  autoFocus
                  className="sp-part-input"
                  defaultValue={row.title}
                  aria-label={fmt(sp.renamePart, { title: row.title })}
                  onBlur={(e) => {
                    renamePart(row.at, e.target.value);
                    setRenamingPart(null);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") e.currentTarget.blur();
                    if (e.key === "Escape") {
                      e.preventDefault();
                      setRenamingPart(null);
                    }
                  }}
                />
              ) : (
                <button type="button" className="sp-part-title" onClick={() => goTo(row.at)} onDoubleClick={() => setRenamingPart(row.id)}>
                  {row.title} <span className="sp-part-count">· {row.count}</span>
                </button>
              )}
              {renamingPart !== row.id && (
                <button type="button" className="icon-button sp-part-rename" aria-label={fmt(sp.renamePart, { title: row.title })} title={fmt(sp.renamePart, { title: row.title })} onClick={() => setRenamingPart(row.id)}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M4 20h4L19 9l-4-4L4 16z" />
                  </svg>
                </button>
              )}
            </li>
          ) : row.kind !== "scene" ? (
            <li key={`${row.kind}:${row.id}`} className={`sp-scene-group is-${row.kind}`}>
              <button type="button" onClick={() => goTo(row.at)}>
                {row.title}
              </button>
            </li>
          ) : ((s: (typeof scenes)[number], k: number) => !listed(s) ? null : (
            <li
              key={s.index}
              className={`${dragScene === s.index ? "is-dragged" : ""}${overScene === s.index && dragScene !== s.index ? " is-over" : ""}${plotColor(s.cardId).className}`}
              style={plotColor(s.cardId).style}
              // Glisser une scène dans la liste la déplace dans le scénario (texte compris).
              draggable
              onDragStart={(e) => {
                if ((e.target as HTMLElement).closest("textarea")) return e.preventDefault();
                dragRef.current = s.index;
                setDragScene(s.index);
                e.dataTransfer.effectAllowed = "move";
                e.dataTransfer.setData("text/plain", s.text);
              }}
              onDragEnd={() => {
                dragRef.current = null;
                setDragScene(null);
                setOverScene(null);
              }}
              onDragOver={(e) => {
                if (dragRef.current === null) return;
                e.preventDefault();
                setOverScene(s.index);
              }}
              onDrop={(e) => {
                e.preventDefault();
                const from = dragRef.current;
                dragRef.current = null;
                setDragScene(null);
                setOverScene(null);
                if (from !== null) moveScene(from, s.index);
              }}
            >
              <button
                type="button"
                className={s.index === scene?.index ? "is-current" : ""}
                aria-current={s.index === scene?.index ? "true" : undefined}
                aria-keyshortcuts="Alt+ArrowUp Alt+ArrowDown"
                title={t.manuscript.sceneDrag}
                onClick={() => goTo(s.index)}
                onKeyDown={(e) => {
                  // Au clavier : Alt + flèche déplace la scène d'un cran.
                  if (!e.altKey || (e.key !== "ArrowUp" && e.key !== "ArrowDown")) return;
                  const other = scenes[k + (e.key === "ArrowUp" ? -1 : 1)];
                  if (!other) return;
                  e.preventDefault();
                  moveScene(s.index, other.index, true);
                }}
              >
                <span className="ms-grip" aria-hidden="true" />
                <span className={`is-slugline ms-name${s.text ? "" : " is-untitled"}`}>
                  {s.number}. {s.text || sp.untitledScene}
                </span>
                {statusCards.get(s.cardId ?? "") && <StatusDot card={statusCards.get(s.cardId!)!} />}
                {pagination && pagination.startPage[s.index] !== undefined && (
                  <span className="sp-towrite">
                    {fmt(sp.pageShort, { n: pagination.startPage[s.index] })}
                    {/* Longueur en huitièmes de page (#44). */}
                    {eighthsBetween(pagination, s.index, s.end) > 0 && " · "}
                    <SceneLength eighths={eighthsBetween(pagination, s.index, s.end)} template="{n}" />
                  </span>
                )}
              </button>
              {/* Scène en cours : ses flèches (doigt, souris), en plus du glisser et d'Alt + flèche. */}
              {s.index === scene?.index && scenes.length > 1 && (
                <span className="sp-scene-moves">
                  {(["up", "down"] as const).map((way) => {
                    const other = scenes[k + (way === "up" ? -1 : 1)];
                    const label = fmt(way === "up" ? sp.sequencer.moveUp : sp.sequencer.moveDown, { title: s.text || sp.untitledScene });
                    return (
                      <button key={way} type="button" className="icon-button" disabled={!other} aria-label={label} title={label} onClick={() => other && moveScene(s.index, other.index)}>
                        <span aria-hidden="true">{way === "up" ? "↑" : "↓"}</span>
                      </button>
                    );
                  })}
                </span>
              )}
            </li>
          ))(scenes[row.k], row.k))}
        </ol>

        <div className="sr-only" aria-live="polite">
          {announce}
        </div>
        {toWrite.length > 0 && (
          <>
            <div className="eyebrow sp-towrite-title">{sp.toWriteTitle}</div>
            <ul className="sp-scene-list">
              {toWrite.map((c) => (
                <li key={c.id}>
                  <button
                    type="button"
                    aria-label={fmt(sp.writeScene, { title: c.title || sp.untitledScene })}
                    onClick={() => writeScene(c)}
                  >
                    <span className="is-slugline">{c.title || sp.untitledScene}</span>
                    <span className="sp-towrite">{sp.toWrite}</span>
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}
      </nav>

      <div className="sp-center">
        <div className={`sp-bar${toolsOpen ? " is-open" : ""}`} role="toolbar" aria-label={sp.barAria} ref={barRef}>
          {/* Téléphone seulement (CSS) : le type de l'élément en cours ouvre ou ferme le volet, sans quitter le texte. */}
          <button
            type="button"
            className="sp-bar-toggle"
            aria-expanded={toolsOpen}
            aria-label={`${sp.barAria} : ${current.type ? sp.elements[current.type] : "…"}`}
            onPointerDown={(e) => e.preventDefault()}
            onClick={() => setToolsOpen(!toolsOpen)}
          >
            <span>{current.type ? sp.elements[current.type] : sp.barAria}</span>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d={toolsOpen ? "M6 15l6-6 6 6" : "M6 9l6 6 6-6"} />
            </svg>
          </button>
          {EDITABLE_TYPES.map((type) => (
            <button
              key={type}
              type="button"
              aria-pressed={current.type === type}
              // Le focus reste dans le texte, à la souris comme au doigt.
              onPointerDown={(e) => e.preventDefault()}
              onClick={() => {
                editor.view.focus();
                setElementType(type)(editor.state, editor.view.dispatch);
                setToolsOpen(false);
              }}
            >
              {sp.elements[type]}
            </button>
          ))}
          {/* Actes et séquences (#140) : une ligne posée au-dessus de la scène du curseur. */}
          <button type="button" className="sp-part" title={sp.addPartHint} onPointerDown={(e) => e.preventDefault()} onClick={() => { insertPart("act"); setToolsOpen(false); }}>
            {sp.addAct}
          </button>
          <button type="button" className="sp-part" title={sp.addPartHint} onPointerDown={(e) => e.preventDefault()} onClick={() => { insertPart("seq"); setToolsOpen(false); }}>
            {sp.addSeq}
          </button>
          {/* Rappel des touches, jusqu'à ce qu'elles soient apprises (#59) : la barre tient alors sur une ligne. */}
          {!keysLearned && (
            <span className="sp-bar-hint">
              <kbd>{sp.keyTab}</kbd> {sp.hintTab} · <kbd>{sp.keyEnter}</kbd> {sp.hintEnter} · <kbd>{sp.keyEscape}</kbd>{" "}
              {sp.hintEscape}
            </span>
          )}
          {/* #54 : le mode focus en icône, Écouter et les voix dans le menu ⋯ (la barre ne montre la lecture qu'en cours).
              Sur téléphone, la barre reste en mode focus : on en sort par ce bouton, écrit en toutes lettres.
              Ces boutons restent ensemble à droite : le ⋯ ne part jamais seul sur une seconde ligne (lot 17). */}
          <span className="sp-bar-end">
          {focusMode ? (
            <button type="button" className="sp-focus" aria-pressed onPointerDown={(e) => e.preventDefault()} onClick={() => setFocusMode(false)}>
              {sp.focusExit}
            </button>
          ) : (
            <FocusButton className="sp-focus" title={sp.focusHint} onClick={() => setFocusMode(true)} />
          )}
          <ReaderBar menu buttonClass="sp-option" screenplay speakers={readerSpeakers} onStart={startListening} />
          {/* Le reste (1.11.1) : une seule rangée sous les éléments. Numéros de scène et soulignement : dans les Réglages. */}
          {openPass && (
            <button
              type="button"
              className="sp-rev-chip"
              style={{ "--rev": revisionVar(openPass.color) } as CSSProperties}
              aria-label={fmt(t.revisions.chipAria, { name: revisionName(t, revisions, openPass.n) })}
              title={revisionName(t, revisions, openPass.n)}
              onClick={() => useCosmos.getState().setDialog("revisions")}
            >
              {fmt(t.revisions.chip, { color: t.revisions.colors[openPass.color] })}
            </button>
          )}
          <MoreMenu
            className="sp-option"
            items={[
              !focusMode && { label: sp.focus, title: sp.focusHint, hint: key("Mod", "Shift", "F"), onSelect: () => setFocusMode(true) },
              ...readerItems,
              { label: t.book.chutier.title, title: t.format.chutier, hint: key("Mod", "Shift", "K"), onSelect: sendToChutier },
              { label: t.comments.element, hint: key("Mod", "Alt", "M"), onSelect: commentElement },
              lt.available && { label: t.languageTool.menu, onSelect: () => void lt.run() },
              lt.bulk && { label: t.languageTool.menuScript, onSelect: () => void lt.run("all") },
              lt.available && lt.hasIssues && { label: t.languageTool.clear, onSelect: lt.clear },
              // Fusionner (#23) : la scène suivante (sans section entre elles) rejoint celle-ci.
              !!scene?.cardId && !!useCosmos.getState().nextMergeable(scene.cardId) && { label: t.merge.menu, onSelect: mergeNext },
              { label: t.revisions.menu, onSelect: () => useCosmos.getState().setDialog("revisions") },
              !!openPass && { label: t.revisions.close, onSelect: () => useCosmos.getState().closeRevision() },
              { label: t.versions.keepMenu, hint: key("Mod", "Alt", "S"), disabled: !scene?.cardId, onSelect: () => openVersions(true) },
              { label: t.versions.listMenu, disabled: !scene?.cardId, onSelect: () => openVersions(false) },
              { label: t.replace.button, title: t.replace.buttonHint, hint: key("Mod", "Shift", "H"), onSelect: openReplace },
              { label: t.goto.button, title: t.goto.buttonHint, hint: key("Mod", "G"), onSelect: () => useCosmos.getState().setDialog("goto") },
              // Synopsis (#147) : sous chaque en-tête (hors pages), ou lu seul dans sa fenêtre.
              { label: writing.showSynopsis ? t.synopsisView.hide : t.synopsisView.show, onSelect: () => { const st = useSettings.getState(); st.setWriting({ ...st.writing, showSynopsis: !st.writing.showSynopsis }); } },
              { label: t.synopsisView.menu, onSelect: () => useCosmos.getState().setDialog("synopsis") },
              { label: useSettings.getState().plotColors ? t.plan.plotColorsOff : t.plan.plotColorsOn, onSelect: () => useSettings.getState().setPlotColors(!useSettings.getState().plotColors) },
              { label: openFindings > 0 ? fmt(t.review.buttonCount, { n: openFindings }) : t.review.button, title: t.review.buttonHint, onSelect: openReview },
              !phone && { label: t.projectStats.button, title: t.projectStats.buttonHint, onSelect: () => useCosmos.getState().setDialog("stats") },
              // Pages verrouillées (#46) : la scène laisse « OMIS » à sa place ; en rouge, en dernier (elle part à la corbeille).
              locked && !!scene && { label: sp.omitScene, title: sp.omitSceneHint, danger: true, onSelect: omitCurrent },
            ]}
          />
          {/* Mode Atelier : variantes de l'élément en cours, « Je l'ai repris », trois directions pour la scène. */}
          <ScreenplayAtelier editor={editor} />
          <ScreenplayDirections editor={editor} />
          </span>
          {threadFilter && <ThreadBanner card={threadCard} shown={threadKeptIds?.length ?? 0} total={sceneIds.length} />}
          {charFilter && (
            <p className="sp-filter-banner" role="status">
              <span>{charFilter.with ? fmt(charFilter.mode === "lines" ? sp.filterBannerPairLines : sp.filterBannerPair, { name: charFilter.name, other: charFilter.with }) : fmt(charFilter.mode === "lines" ? sp.filterBannerLines : sp.filterBannerScenes, { name: charFilter.name })}</span>
              <button type="button" aria-label={sp.filterClearAria} title={sp.filterClear} onClick={() => setCharFilter(null)}>
                ×
              </button>
            </p>
          )}
        </div>
        <div className="sr-only" aria-live="polite">
          {current.type ? sp.elements[current.type] : ""}
        </div>
        {/* La suggestion active est annoncée : le focus reste dans le texte. */}
        <div className="sr-only" aria-live="polite">
          {menu && menu.active >= 0 ? `${menu.items[menu.active].label}, ${menu.items[menu.active].hint}` : ""}
        </div>

        {/* Ruban du récit : chaque case du gabarit à la place que ses scènes prennent (caché en mode focus). */}
        {!focusMode && (
          <StoryRibbon
            currentId={ribbonCurrent}
            onGo={(id) => {
              const s = scenes.find((x) => (x.cardId ?? `@${x.index}`) === id);
              if (s) goTo(s.index);
            }}
          />
        )}
        <div className="sp-scroll">
          {!focusMode && !charFilter && <TitlePage paper={paper} onChange={setTitleField} />}
          <div
            className={`sp-page${focusMode && (writing.highlight === "sentence" || writing.highlight === "paragraph") ? " is-dimmed" : ""}`}
            data-paper={paper}
            data-numbers={sceneNumbers ? "" : undefined}
            data-underline={underlineHeadings ? "" : undefined}
            style={labels}
            lang={lang}
            ref={pageRef}
          >
            {revisionRules && <style>{revisionRules}</style>}
            <EditorContent editor={editor} />
            {editor && <LanguageToolBubble editor={editor} />}
            {editor && <LanguageToolLive editor={editor} accept={ltAccept} />}
            {veil && (
              <>
                <div className="ms-veil" aria-hidden="true" style={{ top: 0, height: Math.max(0, veil.top) }} />
                <div className="ms-veil" aria-hidden="true" style={{ top: veil.bottom, bottom: 0 }} />
              </>
            )}
            {menu && (
              <SuggestionMenu
                title={sp.suggest.title}
                className="sp-suggest"
                style={menu.style}
                items={menu.items}
                active={menu.active}
                onPick={pick}
              />
            )}
          </div>
        </div>
        {notice && (
          <div className="ms-notice sp-notice" role="status">
            <span>{notice.text}</span>
            {notice.undo ? (
              <button
                type="button"
                className="ghost-button"
                onClick={() => {
                  notice.undo?.();
                  setNotice(null);
                }}
              >
                {t.book.undoBreak}
              </button>
            ) : null}
          </div>
        )}
        {/* Pied de page : position dans le scénario et durée estimée. */}
        {pagination && pagination.pages > 0 && (
          <p className="sp-footer" role="status">
            {fmt(sp.pageOf, { page: pagination.startPage[Math.min(current.index, pagination.startPage.length - 1)] ?? 1, pages: pagination.pages })}
            {" · "}
            {fmt(sp.minutes, { n: minutesFor(pagination.pages) })}
          </p>
        )}
      </div>

      {/* Poignées sur les bords : scènes à gauche, infos à droite. */}
      <EdgeHandle side="left" open={panels.scenes} label={t.manuscript.panelScenes} onClick={() => togglePanel("scenes")} />
      <EdgeHandle side="right" open={panels.side} label={t.manuscript.panelSide} onClick={() => togglePanel("side")} />

      {commentHighlight && <style>{commentHighlight}</style>}
      {sheetRename &&
        createPortal(
          <input
            // Le champ s'ouvre sur la ligne de la section, prêt pour le nouveau titre.
            // eslint-disable-next-line jsx-a11y/no-autofocus
            autoFocus
            className="sp-sheet-rename"
            style={{ top: sheetRename.top, left: sheetRename.left, width: Math.max(220, sheetRename.width) }}
            defaultValue={sheetRename.title}
            aria-label={fmt(sp.renamePart, { title: sheetRename.title })}
            onFocus={(e) => e.currentTarget.select()}
            onBlur={(e) => {
              renamePart(sheetRename.at, e.target.value);
              setSheetRename(null);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                e.currentTarget.blur();
                editorRef.current?.view.focus();
              }
              if (e.key === "Escape") {
                e.preventDefault();
                setSheetRename(null);
                editorRef.current?.view.focus();
              }
            }}
          />,
          portalRoot(editorRef.current?.view.dom ?? null),
        )}
      <aside className="sp-side" aria-label={sideTab === "review" ? t.review.tabReview : sideTab === "comments" ? t.comments.title : sp.inSceneTitle}>
        <SideTabs tab={sideTab} onTab={setSideTab} count={openFindings} comments={scene?.cardId ? openCount(comments[scene.cardId]) : 0} />
        {sideTab === "comments" ? (
          scene?.cardId ? (
            <CommentsPanel sceneId={scene.cardId} anchors={commentAnchors} empty={t.comments.emptyScript} onGo={(id) => void goToComment(id)} onNotice={setNotice} />
          ) : (
            <p className="sp-empty">{sp.noScene}</p>
          )
        ) : sideTab === "review" ? (
          <ReviewPanel
            findings={findings}
            kind="script"
            where={(f) => (f.scene ? fmt(t.review.scene, { n: f.scene }) : t.review.beforeFirst)}
            onGo={goToFinding}
            onAiScene={goToAiScene}
          />
        ) : (
        (() => {
          const P = t.sidePanel.parts;
          const parts: SidePart[] = [];
          if (!scene) parts.push({ key: "scene", title: P.scene, node: <p className="sp-empty">{sp.noScene}</p> });
          else {
            parts.push({ key: "scene", title: P.scene, node: (
            <section className="sp-box">
              <div className="eyebrow" style={{ color: "var(--type-scene)" }}>
                {types.scene.label}
              </div>
              <div className="is-slugline sp-box-title">{scene.text || sp.untitledScene}</div>
              {card ? (
                <>
                  {card.html && (
                    // HTML produit par TipTap ou nettoyé au chargement (voir sanitizeHtml).
                    <div className="sp-card-body" dangerouslySetInnerHTML={{ __html: card.html }} />
                  )}
                  <button type="button" className="link-button" onClick={() => revealCard(card.id)}>
                    {t.bible.seeOnCanvas}
                  </button>
                </>
              ) : (
                <>
                  <p className="sp-empty">{sp.noCard}</p>
                  <button type="button" className="ghost-button" onClick={() => createCard(scene)}>
                    {sp.createCard}
                  </button>
                </>
              )}
            </section>
            ) });
            parts.push({ key: "synopsis", title: P.synopsis, node: (
            <section className="sp-box">
              <h2 className="sp-box-title">{t.manuscript.synopsis}</h2>
              <SynopsisField
                key={scene.index}
                value={sceneSynopsis(elements, scene.index)}
                scene={scene.text || sp.untitledScene}
                onSave={(text) => saveSynopsis(scene.index, text)}
                ia={synopsisIsIa(elements, scene.index)}
                atelier={elements[scene.index]?.cardId ? { sceneId: elements[scene.index].cardId!, text: screenplaySceneText(scriptOffset(useCosmos.getState()) + scene.index), accept: (text) => saveSynopsis(scene.index, text, true) } : undefined}
              />
            </section>
            ) });
            parts.push({ key: "setups", title: P.setups, node: <SceneSetupsBox id={card?.id} /> });
            if (card) parts.push({ key: "links", title: P.links, node: <SceneLinks id={card.id} speakers={speakers.map((c) => ({ name: c.name, lines: c.lines }))} /> });
            if (card) parts.push({ key: "place", title: P.place, node: <ScenePlace id={card.id} /> });
            if (location) parts.push({ key: "location", title: P.location, node: (
              <section className="sp-box">
                <div className="eyebrow" style={{ color: "var(--type-lieu)" }}>
                  {types.lieu.label}
                </div>
                <div className="is-slugline sp-box-title">
                  <SheetLink name={location} type="lieu" nodes={nodes} />
                </div>
                <p className="sp-detail">
                  {plural(scenesInLocation(scenes, location, lang), sp.locationScenesOne, sp.locationScenesMany)}
                </p>
              </section>
            ) });
            if (!card) parts.push({ key: "speakers", title: P.speakers, node: (
              <section className="sp-box">
              <div className="eyebrow" style={{ color: "var(--type-personnage)" }}>
                {sp.characters}
              </div>
              {speakers.length === 0 ? (
                <p className="sp-empty">{sp.noCharacters}</p>
              ) : (
                <ul className="sp-speakers">
                  {speakers.map((c) => (
                    <li key={c.name}>
                      <span>
                        <SheetLink name={c.name} type="personnage" nodes={nodes} />
                      </span>
                      <span className="sp-detail">{plural(c.lines, sp.linesOne, sp.linesMany)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
            ) });
          }
          parts.push({ key: "chutier", title: P.chutier, ownFold: true, node: <Chutier passages={chutier} cards={nodes.map((n) => n.data)} onPutBack={putBack} /> });
          parts.push({ key: "stats", title: P.stats, ownFold: true, node: (
            <StatsBox
              stats={stats}
              done={scenes.filter((s) => (statusCards.get(s.cardId ?? "") ? sceneStatus(statusCards.get(s.cardId!)!) === "fini" : false)).length}
              chapters={0}
              sceneWords={sceneWordCount}
              place={null}
              note={t.stats.estimateScreenplay}
            />
          ) });
          return <SideParts parts={parts} />;
        })()
        )}
      </aside>
    </div>
  );
}

/**
 * Nom d'un personnage ou d'un décor du volet « Scène » : s'il a sa fiche dans la Bible, un clic l'ouvre
 * (le bouton « Retour au scénario » ramène au curseur) ; sinon le nom reste du texte.
 */
function SheetLink({ name, type, nodes }: { name: string; type: "personnage" | "lieu"; nodes: { id: string; data: { type: string; title: string } }[] }) {
  const t = useT();
  const folded = foldName(name);
  const card = folded ? nodes.find((n) => n.data.type === type && foldName(n.data.title) === folded)?.data : undefined;
  const id = folded ? nodes.find((n) => n.data.type === type && foldName(n.data.title) === folded)?.id : undefined;
  if (!card || !id) return <>{name}</>;
  return (
    <button type="button" className="link-button sp-sheet-link" title={fmt(t.bible.openSheet, { title: card.title })} onClick={() => useCosmos.getState().openInBible(id)}>
      {name}
    </button>
  );
}

/** Le filtre par personnage, avec les scènes reliées par un fil à sa carte ; même objet tant que rien ne change. */
let linkedCache: { filter: CharacterFilter | null; nodes: unknown; edges: unknown; out: CharacterFilter | null } | null = null;
function withLinkedScenes(s: CosmosState, filter: CharacterFilter | null): CharacterFilter | null {
  if (!filter) return null;
  if (linkedCache && linkedCache.filter === filter && linkedCache.nodes === s.nodes && linkedCache.edges === s.edges) return linkedCache.out;
  const key = foldName(filter.name);
  const card = s.nodes.find((n) => n.data.type === "personnage" && foldName(n.data.title) === key);
  const scenes = new Set(s.nodes.filter((n) => n.data.type === "scene").map((n) => n.id));
  const linked = card ? s.edges.flatMap((e) => (e.source === card.id && scenes.has(e.target) ? [e.target] : e.target === card.id && scenes.has(e.source) ? [e.source] : [])).sort() : [];
  const previous = linkedCache?.filter === filter ? linkedCache.out : null;
  // Mêmes scènes qu'avant : le même objet, pour ne pas reposer le filtre dans l'éditeur à chaque changement.
  const out = previous && (previous.linked ?? []).join() === linked.join() ? previous : linked.length ? { ...filter, linked } : filter;
  linkedCache = { filter, nodes: s.nodes, edges: s.edges, out };
  return out;
}

/** Personnages reliés par un fil à au moins une carte Scène, en une chaîne stable (un nom par ligne). */
let wiredCache: { nodes: unknown; edges: unknown; key: string } | null = null;
function wiredCharacters(s: CosmosState): string {
  if (wiredCache && wiredCache.nodes === s.nodes && wiredCache.edges === s.edges) return wiredCache.key;
  const type = new Map(s.nodes.map((n) => [n.id, n.data]));
  const names = new Set<string>();
  for (const e of s.edges) {
    const a = type.get(e.source);
    const b = type.get(e.target);
    if (a?.type === "personnage" && b?.type === "scene" && a.title.trim()) names.add(a.title.trim());
    if (b?.type === "personnage" && a?.type === "scene" && b.title.trim()) names.add(b.title.trim());
  }
  const key = [...names].sort().join("\n");
  wiredCache = { nodes: s.nodes, edges: s.edges, key };
  return key;
}
