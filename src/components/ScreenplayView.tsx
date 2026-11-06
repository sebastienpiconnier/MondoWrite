// Vue Scénario d'un projet scénario : liste des scènes, feuille au format cinéma, panneau
// « Dans cette scène ». Le texte vit dans scenario.fountain (store.screenplay) : l'éditeur en est
// une lecture, reconvertie en modèle un court instant après chaque modification.

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
import { placePassage, takePassage, type Passage } from "../chutier";
import { screenplayGroups } from "../screenplay/groups";
import { screenplayWords, sceneWords as wordsOfScene } from "../screenplay/words";
import { sceneStatus } from "../character";
import type { ManuscriptStats } from "../stats";
import { blocks, moveBlock } from "../screenplay/sequence";
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { SuggestionMenu } from "./SuggestionMenu";
import { SynopsisField } from "./SynopsisField";
import { TitlePage } from "./TitlePage";
import { LAYOUTS } from "../screenplay/layout";
import { checkScreenplay, type Finding } from "../review/checks";
import { keptScenes as keptBy, speakingNames } from "../review/filter";
import { setCharacterFilter } from "../screenplay/editor/characterFilter";
import { ReviewPanel, SideTabs, useOpenFindings, type SideTab } from "./ReviewPanel";
import { CommentsPanel } from "./CommentsPanel";
import { commentStyle } from "./commentMark";
import { COMMENT_TYPES, commentIdsInElements, openCount } from "../comments";
import { useAiReviewReveal, useOpenAiQuestions } from "./AiReview";
import { elementFor, type SceneRef } from "../ai/review";
import { useCommand } from "../commands";
import { ReaderBar } from "./ReaderBar";
import { StoryRibbon } from "./StoryRibbon";
import { startReading } from "./useReader";
import { screenplayUtterances, type ReadNode } from "../reading";
import { PRESERVED } from "../screenplay/editor/nodes";
import { startGap } from "../screenplay/editor/keymap";
import { GapCursor } from "@tiptap/pm/gapcursor";
import type { ResolvedPos } from "@tiptap/pm/model";
import type { TitleField } from "../screenplay/titlePage";
import { minutesFor, usePagination } from "./usePagination";
import { suggest, type Suggestion } from "../screenplay/editor/autocomplete";
import { ADOPT_META, adoptNew } from "../screenplay/editor/adopt";
import { EditorContent, type Editor } from "@tiptap/react";
import { TextSelection } from "@tiptap/pm/state";
import type { Node as PMNode } from "@tiptap/pm/model";
import { SCENE_AT, currentScript, scriptOffset, useCosmos } from "../store";
import { resolveEpisode, seriesOf } from "../screenplay/series";
import { useEpisodeLabel } from "./EpisodePicker";
import { EpisodePicker } from "./EpisodePicker";
import { useSettings } from "../settings";
import { fmt, getT } from "../i18n";
import { FocusBar, FocusCounter, useFocusChrome } from "./FocusBar";
import { MoreMenu, useKeyHint } from "./MoreMenu";
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
import {
  currentElement,
  fromDoc,
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

  const track = (ed: Editor) => {
    const index = ed.state.selection.$from.index(0);
    const type = currentElement(ed.state)?.type ?? null;
    setCurrent((prev) => (prev.index === index && prev.type === type ? prev : { index, type }));
  };

  const extensions = useMemo(
    () =>
      screenplayExtensions({
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
          enabled: (dom) => !useCosmos.getState().focusMode && !useCosmos.getState().charFilter && (dom.closest(".sp-scroll")?.clientWidth ?? 0) - 32 > PAGE_MIN_WIDTH,
          // Réplique coupée par la page : (À SUIVRE) et (SUITE), comme dans le PDF (réglage du projet).
          continued: () => (useCosmos.getState().scriptPdf.breaks ? { more: getT().screenplay.more, contd: getT().screenplay.contd } : null),
        },
        continued: { resumes: () => useCosmos.getState().scriptPdf.resumes, contd: () => getT().screenplay.contd },
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
  const sceneRows = useMemo(() => {
    type Row = { kind: "season"; id: string; at: number; title: string } | { kind: "episode"; id: string; at: number; title: string } | { kind: "scene"; at: number; k: number };
    const rows: Row[] = scenes.map((sc, k) => ({ kind: "scene", at: sc.index, k }));
    const seasons = seriesOf(elements);
    const named = seasons.filter((x) => x.id !== null).length;
    seasons.forEach((season, i) => {
      if (season.id !== null && named > 0) rows.push({ kind: "season", id: season.id, at: season.at, title: season.title || fmt(t.season.seasonDefault, { n: i + 1 - (seasons[0].id === null ? 1 : 0) }) });
      for (const ep of season.episodes) rows.push({ kind: "episode", id: ep.id, at: ep.at, title: episodeLabel(ep) });
    });
    return rows.sort((a, b) => a.at - b.at);
  }, [scenes, elements, episodeLabel, t]);
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
  const scene = sceneAt(scenes, current.index);
  // Statistiques du volet de droite : mots, pages (mise en page cinéma), scènes écrites.
  const stats = useMemo<ManuscriptStats>(() => {
    const words = screenplayWords(screenplay);
    const pages = pagination?.pages ?? 0;
    const body = scenes.map((s, k) => (screenplay ? wordsOfScene(screenplay, s.index + 1, scenes[k + 1]?.index) : 0));
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
  const nextScene = scene ? scenes[scenes.indexOf(scene) + 1] : undefined;
  const sceneWordCount = screenplay && scene ? wordsOfScene(screenplay, scene.index, nextScene?.index) : 0;
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
  const openVersionsRef = useRef(openVersions);
  openVersionsRef.current = openVersions;
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
  const findings = useMemo(() => [...checkScreenplay(elements, LAYOUTS[paper], nodes.map((n) => n.data), lang), ...storyFindings], [elements, paper, nodes, lang, storyFindings]);
  const openFindings = useOpenFindings(findings) + useOpenAiQuestions();
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
  const sceneEnd = scene ? (scenes[scenes.indexOf(scene) + 1]?.index ?? elements.length) : 0;
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
  const charFilter = useCosmos((s) => s.charFilter);
  const setCharFilter = useCosmos((s) => s.setCharFilter);
  const speakingList = useMemo(() => speakingNames(elements, lang), [elements, lang]);
  const keptScenes = useMemo(() => (charFilter ? new Set(keptBy(elements, charFilter)) : null), [elements, charFilter]);
  useEffect(() => {
    if (!editor || editor.isDestroyed) return;
    editor.view.dispatch(setCharacterFilter(editor.state, charFilter));
  }, [editor, charFilter]);

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
    if (!target) return;
    useCosmos.getState().clearManuscriptTarget();
    const state = useCosmos.getState();
    const elements = currentScript(state)?.elements ?? [];
    // Rang du scénario entier (série : toute la saison), ramené à celui de l'épisode ouvert.
    const at = target.startsWith(SCENE_AT) ? Number(target.slice(SCENE_AT.length)) - scriptOffset(state) : -1;
    // Une section d'épisode (« Aller à » un épisode) est juste avant le texte de l'épisode ouvert : son début.
    const at0 = target.startsWith(SCENE_AT) && at < 0 && elements.length > 0 ? 0 : at;
    const index = at0 >= 0 ? (at0 < elements.length ? at0 : -1) : elements.findIndex((el) => el.type === "sceneHeading" && el.cardId === target);
    if (index >= 0) requestAnimationFrame(() => goToRef.current(index));
  }, [target]);

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

  return (
    <div
      data-char-filter={charFilter ? "" : undefined}
      className={`screenplay${panels.scenes ? "" : " hide-scenes"}${panels.side ? "" : " hide-side"}${focusMode ? " is-focus" : ""}${focusMode && writing.typewriter ? " is-typewriter" : ""}${chrome.quiet ? " is-quiet" : ""}${chrome.typing ? " is-typing" : ""}`}
      ref={rootRef}
    >
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
        <div className="eyebrow">{sp.scenesTitle}</div>
        {scenes.length === 0 && <p className="sp-empty">{sp.scenesEmpty}</p>}
        {(speakingList.length > 0 || charFilter) && (
          <div className="sp-filter">
            <label htmlFor="sp-filter-name">{sp.filterLabel}</label>
            <select
              id="sp-filter-name"
              value={charFilter?.name ?? ""}
              onChange={(e) => setCharFilter(e.target.value ? { name: e.target.value, mode: charFilter?.mode ?? "scenes" } : null)}
            >
              <option value="">{sp.filterAll}</option>
              {/* Nom venu de la Bible sans réplique encore : il reste proposé. */}
              {(charFilter && !speakingList.includes(charFilter.name) ? [...speakingList, charFilter.name] : speakingList).map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
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
          {sceneRows.map((row) => row.kind !== "scene" ? (
            <li key={`${row.kind}:${row.id}`} className={`sp-scene-group is-${row.kind}`}>
              <button type="button" onClick={() => goTo(row.at)}>
                {row.title}
              </button>
            </li>
          ) : ((s: (typeof scenes)[number], k: number) => keptScenes && !keptScenes.has(s.index) ? null : (
            <li
              key={s.index}
              className={`${dragScene === s.index ? "is-dragged" : ""}${overScene === s.index && dragScene !== s.index ? " is-over" : ""}`}
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
                  <span className="sp-towrite">{fmt(sp.pageShort, { n: pagination.startPage[s.index] })}</span>
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
              {/* Le synopsis s'écrit ici ; il apparaît dans le séquencier. Le toucher choisit aussi la scène. */}
              <div className="sp-scene-synopsis" onFocusCapture={() => showScene(s.index)} onPointerDownCapture={() => showScene(s.index)}>
              <SynopsisField
                value={sceneSynopsis(elements, s.index)}
                scene={s.text || sp.untitledScene}
                onSave={(text) => saveSynopsis(s.index, text)}
                ia={synopsisIsIa(elements, s.index)}
                atelier={elements[s.index]?.cardId ? { sceneId: elements[s.index].cardId!, text: screenplaySceneText(scriptOffset(useCosmos.getState()) + s.index), accept: (text) => saveSynopsis(s.index, text, true) } : undefined}
              />
              </div>
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
          <span className="sp-bar-hint">
            <kbd>{sp.keyTab}</kbd> {sp.hintTab} · <kbd>{sp.keyEnter}</kbd> {sp.hintEnter} · <kbd>{sp.keyEscape}</kbd>{" "}
            {sp.hintEscape}
          </span>
          <button
            type="button"
            className="sp-focus"
            aria-pressed={focusMode}
            title={sp.focusHint}
            onPointerDown={(e) => e.preventDefault()}
            onClick={() => setFocusMode(!focusMode)}
          >
            {focusMode ? sp.focusExit : sp.focus}
          </button>
          <ReaderBar buttonClass="sp-option" screenplay speakers={readerSpeakers} onStart={startListening} />
          {/* Le reste (1.11.1) : une seule rangée sous les éléments. Numéros de scène et soulignement : dans les Réglages. */}
          <MoreMenu
            className="sp-option"
            items={[
              { label: t.book.chutier.title, title: t.format.chutier, hint: key("Mod", "Shift", "K"), onSelect: sendToChutier },
              { label: t.comments.element, hint: key("Mod", "Alt", "M"), onSelect: commentElement },
              // Fusionner (#23) : la scène suivante (sans section entre elles) rejoint celle-ci.
              !!scene?.cardId && !!useCosmos.getState().nextMergeable(scene.cardId) && { label: t.merge.menu, onSelect: mergeNext },
              { label: t.versions.keepMenu, hint: key("Mod", "Alt", "S"), disabled: !scene?.cardId, onSelect: () => openVersions(true) },
              { label: t.versions.listMenu, disabled: !scene?.cardId, onSelect: () => openVersions(false) },
              { label: t.replace.button, title: t.replace.buttonHint, hint: key("Mod", "Shift", "H"), onSelect: openReplace },
              { label: t.goto.button, title: t.goto.buttonHint, hint: key("Mod", "G"), onSelect: () => useCosmos.getState().setDialog("goto") },
              { label: openFindings > 0 ? fmt(t.review.buttonCount, { n: openFindings }) : t.review.button, title: t.review.buttonHint, onSelect: openReview },
              !phone && { label: t.projectStats.button, title: t.projectStats.buttonHint, onSelect: () => useCosmos.getState().setDialog("stats") },
            ]}
          />
          {/* Mode Atelier : variantes de l'élément en cours, « Je l'ai repris », trois directions pour la scène. */}
          <ScreenplayAtelier editor={editor} />
          <ScreenplayDirections editor={editor} />
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
            <EditorContent editor={editor} />
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
        <>
        {!scene ? (
          <p className="sp-empty">{sp.noScene}</p>
        ) : (
          <>
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

            {location && (
              <section className="sp-box">
                <div className="eyebrow" style={{ color: "var(--type-lieu)" }}>
                  {types.lieu.label}
                </div>
                <div className="is-slugline sp-box-title">{location}</div>
                <p className="sp-detail">
                  {plural(scenesInLocation(scenes, location, lang), sp.locationScenesOne, sp.locationScenesMany)}
                </p>
              </section>
            )}

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
                      <span>{c.name}</span>
                      <span className="sp-detail">{plural(c.lines, sp.linesOne, sp.linesMany)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </>
        )}
        <Chutier passages={chutier} cards={nodes.map((n) => n.data)} onPutBack={putBack} />
        <StatsBox
          stats={stats}
          done={scenes.filter((s) => (statusCards.get(s.cardId ?? "") ? sceneStatus(statusCards.get(s.cardId!)!) === "fini" : false)).length}
          chapters={0}
          sceneWords={sceneWordCount}
          place={null}
          note={t.stats.estimateScreenplay}
        />
        </>
        )}
      </aside>
    </div>
  );
}
