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

import { usePageSpell } from "./usePageSpell";
import { sceneStatus } from "../character";
import { SceneStatusPicker, StatusDot } from "./SceneStatusPicker";
import { BookEditor, PAGE, type BookApi } from "./BookEditor";
import type { BookHandlers } from "./bookExtensions";
import { SynopsisField } from "./SynopsisField";
import { SceneChanges } from "./SceneChanges";
import { TrashIcon } from "./TrashIcon";
import { useEffect, useMemo, useRef, useState } from "react";
import { useCosmos } from "../store";
import { useSettings } from "../settings";
import { EdgeHandle } from "./EdgeHandle";
import { fmt, useT } from "../i18n";
import { checkManuscript, type Finding, checkChanges } from "../review/checks";
import { useStoryLog } from "./useStoryLog";
import { ReviewPanel, SideTabs, useOpenFindings } from "./ReviewPanel";
import { useCommand } from "../commands";
import { typeColor } from "../types";
import { chapterNumbers, chapterOf, chapterStep, groupByChapter, type Chapter } from "../plan";
import { PAGE_KINDS, bookOrder, isPageKind, type PageKind } from "../book";
import { countWords, detectCards, orphanTexts } from "../manuscript";
import { Chutier } from "./Chutier";
import type { Passage } from "../chutier";
import { plainText } from "../search";
import { manuscriptStats } from "../stats";
import { StatsBox } from "./StatsBox";

const COUNTER_KEY = "mondowrite.manuscript.counter";
type CounterScope = "scene" | "chapter" | "book";
function readCounter(): CounterScope {
  try {
    const raw = localStorage.getItem(COUNTER_KEY);
    if (raw === "scene" || raw === "chapter" || raw === "book") return raw;
  } catch {
    /* ignoré */
  }
  return "scene";
}

const PANELS_KEY = "mondowrite.manuscript.panels";
type Panels = { scenes: boolean; side: boolean; meta: boolean };
function readPanels(): Panels {
  try {
    const raw = JSON.parse(localStorage.getItem(PANELS_KEY) ?? "null");
    if (raw && typeof raw === "object") return { scenes: raw.scenes !== false, side: raw.side !== false, meta: raw.meta !== false };
  } catch {
    /* ignoré */
  }
  // Téléphone : la page d'abord ; le plan et les infos s'ouvrent avec leurs boutons.
  const phone = typeof window !== "undefined" && window.matchMedia("(max-width: 900px)").matches;
  return { scenes: !phone, side: !phone, meta: true };
}

export function Manuscript() {
  const t = useT();
  const m = t.manuscript;
  // Volets escamotables (plan à gauche, infos à droite) : on garde le choix d'une fois sur l'autre.
  const [panels, setPanels] = useState(readPanels);
  const togglePanel = (key: keyof Panels) =>
    setPanels((p) => {
      const next = { ...p, [key]: !p[key] };
      try {
        localStorage.setItem(PANELS_KEY, JSON.stringify(next));
      } catch {
        /* stockage indisponible : le choix vaut pour la session */
      }
      return next;
    });
  const lang = useSettings((s) => s.lang);
  const nodes = useCosmos((s) => s.nodes);
  const plan = useCosmos((s) => s.plan);
  const manuscript = useCosmos((s) => s.manuscript);
  const updateCard = useCosmos((s) => s.updateCard);
  const addTitledCard = useCosmos((s) => s.addTitledCard);
  const splitScene = useCosmos((s) => s.splitScene);
  const startChapterAt = useCosmos((s) => s.startChapterAt);
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
  const [notice, setNotice] = useState<{ text: string; undo?: () => void } | null>(null);
  // Compteur de mots de la barre : scène, chapitre ou livre, au clic. Correcteur orthographique : à la demande.
  const [counter, setCounter] = useState(readCounter);
  // Correcteur : seulement si les Réglages le veulent aussi dans le manuscrit (suivi en direct).
  const spell = usePageSpell();
  const chutier = useCosmos((s) => s.chutier);
  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(null), 10000);
    return () => window.clearTimeout(timer);
  }, [notice]);
  const handlers = useRef<BookHandlers | null>(null);
  const bookApi = useRef<BookApi | null>(null);

  // Onglet « Vérifier » : points à regarder dans le texte (rien n'est corrigé tout seul).
  const [sideTab, setSideTab] = useState<"scene" | "review">("scene");
  const storyLog = useStoryLog();
  const findings = useMemo(
    () => [...checkManuscript(manuscript, order, cards), ...checkChanges(storyLog.log, storyLog.order, cards)],
    [manuscript, order, cards, storyLog],
  );
  const openFindings = useOpenFindings(findings);
  const openReview = () => {
    setSideTab("review");
    if (!panels.side) togglePanel("side");
  };
  useCommand("review", openReview);
  const goToFinding = (f: Finding) => {
    const id = f.sceneId;
    if (!id) return;
    setChosen(id);
    // Au redessin suivant : la scène est dans l'éditeur, on y sélectionne le passage.
    window.requestAnimationFrame(() => {
      if (!f.needle || !bookApi.current?.selectText(id, f.needle)) bookApi.current?.scrollToScene(id);
    });
  };
  // Pages occupées par la scène en cours, mesurées par l'éditeur (null : feuille continue).
  const [place, setPlace] = useState<{ first: number; last: number } | null>(null);

  // Arrivée depuis « À faire » : la bonne scène.
  useEffect(() => {
    if (!target) return;
    useCosmos.getState().clearManuscriptTarget();
    setChosen(target);
    // Le livre est déjà dessiné : on y défile jusqu'à la scène demandée.
    window.requestAnimationFrame(() => bookApi.current?.scrollToScene(target));
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
  const stats = useMemo(() => manuscriptStats(manuscript, order), [manuscript, order]);
  const numbers = useMemo(() => chapterNumbers(plan, order), [plan, order]);
  const chapterName = (chapter: Chapter) => {
    const n = numbers.get(chapter.id) ?? 0;
    return chapter.title.trim() ? fmt(t.chapters.numberedTitle, { n, title: chapter.title.trim() }) : fmt(t.chapters.numbered, { n });
  };

  const num = (n: number) => new Intl.NumberFormat(lang).format(n);
  const words = (n: number) => fmt(new Intl.PluralRules(lang).select(n) === "one" ? m.wordsOne : m.wordsMany, { n: num(n) });
  // Une scène choisie dans le volet de gauche : on défile jusqu'à elle dans le livre.
  const go = (id: string) => {
    setChosen(id);
    bookApi.current?.scrollToScene(id);
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
  /** Remet un passage du chutier dans le texte, à sa place d'origine si on la retrouve. */
  const putBack = (p: Passage) => {
    const where = bookApi.current?.putBack(p, currentRef.current);
    if (!where) return;
    useCosmos.getState().removePassage(p.id);
    const text = where === "exact" ? b.chutier.back : where === "near" ? b.chutier.backNear : b.chutier.backElsewhere;
    setSaid(text);
    setNotice(where === "exact" ? null : { text });
  };
  handlers.current = {
    onSceneBreak: (id, rest) => {
      const next = splitScene(id, rest);
      if (!next) return false;
      setFresh({ id: next, from: id });
      setChosen(next);
      bookApi.current?.focusScene(next);
      setSaid(b.newScene);
      setNotice({
        text: b.newScene,
        undo: () => {
          useCosmos.getState().joinScenes(next, id);
          setFresh(null);
          setChosen(id);
          bookApi.current?.focusScene(id, -1);
          setSaid(b.breakUndone);
        },
      });
      return true;
    },
    onChapterBreak: (id) => {
      if (fresh?.id !== id) return false;
      const chapter = startChapterAt(id);
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
    onChutier: () => {
      const out = bookApi.current?.sendToChutier();
      if (!out) return;
      if ("error" in out) {
        const text = out.error === "scene" ? b.chutier.oneScene : b.chutier.nothing;
        setSaid(text);
        setNotice({ text });
        return;
      }
      useCosmos.getState().addPassage(out.passage);
      setSaid(b.chutier.sent);
      setNotice({ text: b.chutier.sent, undo: () => putBack(out.passage) });
    },
    onJoin: (from, into, offset) => {
      const a = cards.find((c) => c.id === from);
      const z = cards.find((c) => c.id === into);
      if (!a || !z || isPageKind(a.page) || isPageKind(z.page)) return false;
      // Une scène qui ouvre un chapitre ne se fond pas dans la précédente (sauf vide : c'est l'annulation d'une coupure).
      const opens = chapterOf(plan, from)?.id !== chapterOf(plan, into)?.id;
      if (opens && plainText(useCosmos.getState().manuscript[from] ?? "") !== "") return false;
      const before = { from: useCosmos.getState().manuscript[from] ?? "", into: useCosmos.getState().manuscript[into] ?? "" };
      useCosmos.getState().joinScenes(from, into);
      setFresh(null);
      setChosen(into);
      bookApi.current?.focusScene(into, offset, true);
      setSaid(b.joined);
      // Annuler : la fiche revient de la corbeille et chaque scène retrouve son texte d'avant.
      setNotice({
        text: b.joined,
        undo: () => {
          const store = useCosmos.getState();
          store.undo();
          store.setManuscriptText(into, before.into);
          store.setManuscriptText(from, before.from);
          setChosen(from);
          bookApi.current?.focusScene(from, 0);
          setSaid(b.joinUndone);
        },
      });
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
  const chapter = chapterOf(plan, current);
  // La scène ouvre son chapitre : le titre du chapitre s'affiche au-dessus, comme dans un livre.
  const opensChapter = !pageKind && !!chapter && (at === 0 || chapterOf(plan, order[at - 1])?.id !== chapter.id);
  const sceneWords = countWords(manuscript[current]);
  // Ce que compte le compteur : la scène, son chapitre (si elle en a un) ou tout le livre.
  const scopes: CounterScope[] = chapter ? ["scene", "chapter", "book"] : ["scene", "book"];
  const countScope: CounterScope = scopes.includes(counter) ? counter : "scene";
  const nextScope = scopes[(scopes.indexOf(countScope) + 1) % scopes.length];
  const counted =
    countScope === "book"
      ? stats.words
      : countScope === "chapter" && chapter
        ? order.reduce((sum, id) => sum + (chapterOf(plan, id)?.id === chapter.id ? (stats.perScene.get(id) ?? 0) : 0), 0)
        : sceneWords;

  return (
    <div className={`manuscript${panels.scenes ? "" : " hide-scenes"}${panels.side ? "" : " hide-side"}${panels.meta ? "" : " hide-meta"}${focusMode ? " is-focus" : ""}${focusMode && writing.typewriter ? " is-typewriter" : ""}`}>
      {focusMode && (
        <div className="ms-focus-bar" role="toolbar" aria-label={t.focus.aria}>
          <div className="focus-options">
            <button type="button" aria-pressed={writing.typewriter} onClick={() => setWriting({ ...writing, typewriter: !writing.typewriter })}>
              {t.focus.typewriter}
            </button>
          </div>
          <button type="button" className="focus-exit" aria-label={t.focus.exit} onClick={() => setFocusMode(false)}>
            <span className="focus-exit-text">{t.focus.exit}</span>
            <svg className="focus-exit-x" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </div>
      )}
      <nav className="sp-scenes ms-scenes" aria-label={m.scenesAria}>
        <h2 className="sp-box-title">{m.scenesTitle}</h2>
        <p className="ms-total">{words(stats.words)}</p>
        <p className="ms-drag-hint">{m.sceneHint}</p>
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
                      className={`${id === current ? "is-current" : ""}${movable ? " is-movable" : ""}`}
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
                      {movable && <span className="ms-grip" aria-hidden="true" />}
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

      {/* Poignées sur les bords : plan à gauche, infos à droite, barre de la scène en haut. */}
      <EdgeHandle side="left" open={panels.scenes} label={m.panelScenes} onClick={() => togglePanel("scenes")} />
      <EdgeHandle side="right" open={panels.side} label={m.panelSide} onClick={() => togglePanel("side")} />

      {!panels.meta && <EdgeHandle side="top" open={panels.meta} label={m.panelMeta} onClick={() => togglePanel("meta")} />}
      <div className="ms-main" ref={mainRef}>
        <div className="ms-sheet">
          {/* Une barre discrète : les compteurs sont dans les colonnes, la page ressemble à un livre. */}
          <div className="ms-meta-wrap">
          <div className="ms-meta-anchor">
          {panels.meta && <EdgeHandle side="top" open={panels.meta} label={m.panelMeta} onClick={() => togglePanel("meta")} />}
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
            <button type="button" className="ghost-button ms-start-chapter" title={t.replace.buttonHint} aria-keyshortcuts="Control+Shift+H Meta+Shift+H" onClick={() => useCosmos.getState().openReplace({ sceneId: current })}>
              {t.replace.button}
            </button>
            <button type="button" className="ghost-button ms-start-chapter" aria-pressed={sideTab === "review" && panels.side} title={t.review.buttonHint} onClick={openReview}>
              {openFindings > 0 ? fmt(t.review.buttonCount, { n: openFindings }) : t.review.button}
            </button>
            <button type="button" className="ghost-button ms-start-chapter stats-button" title={t.projectStats.buttonHint} onClick={() => useCosmos.getState().setDialog("stats")}>
              {t.projectStats.button}
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
            {/* Un clic change ce que le compteur compte : la scène, son chapitre, tout le livre. */}
            <button
              type="button"
              className="ghost-button ms-counter"
              aria-live="polite"
              title={fmt(b.counter.title, { scope: b.counter.of[countScope], next: b.counter.to[nextScope] })}
              onClick={() => {
                setCounter(nextScope);
                try {
                  localStorage.setItem(COUNTER_KEY, nextScope);
                } catch {
                  /* le choix vaut pour la session */
                }
              }}
            >
              {words(counted)} · {b.counter[countScope]}
            </button>
          </div>
          </div>
          </div>
          {/* Tout le livre dans un seul éditeur, mis en pages ; le volet de gauche mène à une scène ou à un chapitre. */}
          <div
            className={`ms-page${focusMode && (writing.highlight === "sentence" || writing.highlight === "paragraph") ? " is-dimmed" : ""}`}
            style={{ ["--ms-width" as string]: PAGE.width, ["--ms-height" as string]: PAGE.height }}
          >
            <BookEditor order={order} cards={cards} plan={plan} current={current} onCurrent={setChosen} handlers={handlers} api={bookApi} onPlace={setPlace} spell={spell} />
          </div>
          {notice && (
            <div className="ms-notice" role="status">
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
                  {b.undoBreak}
                </button>
              ) : null}
            </div>
          )}
          {!pageKind && <p className="ms-hint">{b.enterHint}</p>}
          <div className="sr-only" aria-live="polite">
            {said}
          </div>
        </div>
      </div>

      <aside className="sp-side" aria-label={sideTab === "review" ? t.review.tabReview : m.inScene}>
        <SideTabs tab={sideTab} onTab={setSideTab} count={openFindings} />
        {sideTab === "review" ? (
          <ReviewPanel
            findings={findings}
            kind="text"
            where={(f) => cards.find((c) => c.id === f.sceneId)?.title.trim() || m.untitled}
            onGo={goToFinding}
          />
        ) : (
        <>
        <StatsBox stats={stats} done={story.filter((id) => sceneStatus(cards.find((c) => c.id === id) ?? { type: "idee" }) === "fini").length} chapters={numbers.size} sceneWords={sceneWords} place={place} />
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
        {card.type === "scene" && !card.page && (
          <section className="sp-box">
            <SceneChanges key={card.id} card={card} compact />
          </section>
        )}
        <Chutier passages={chutier} cards={cards} onPutBack={putBack} />
        </>
        )}
      </aside>
    </div>
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
