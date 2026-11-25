// Plan (vue Plan d'un projet roman) : les cartes Scène rangées dans les cases d'un gabarit
// (trois actes, Save the Cat, voyage du héros) ou dans une liste libre. Rien n'est recopié :
// le plan ne retient que l'ordre, le titre et le texte restent ceux de la carte.
// Trois chemins pour ranger une scène : la glisser, les flèches, ou le menu « Ranger dans ».
// Chapitres : dans chaque case, les scènes se regroupent par chapitre. Le menu « Chapitre » d'une scène
// la range dans un chapitre, ou en commence un nouveau à cette scène (le précédent s'arrête juste avant).

import { ReorderHandle } from "./ReorderHandle";
import { usePlotColor } from "./usePlotColor";
import { useInteractive } from "../interactive/useInteractive";
import { interactiveScenes } from "../interactive/scenes";
import { choiceGraph } from "../interactive/choices";
import { endingCounts, verifyStory } from "../interactive/verify";
import { readFactLabels } from "../interactive/facts";
import { sceneMarks, scenesKey } from "../interactive/storyMap";
import { openPlay } from "../interactive/playState";
import { projectSections } from "../interactive/projectSections";
import { FactsPanel } from "./ChoiceRules";
import { projectFacts } from "../interactive/projectFacts";
import type { Fact } from "../interactive/facts";
import { MarksTags, RenumberButton, SectionNumber } from "./StoryChoices";
import { SceneStatusPicker } from "./SceneStatusPicker";
import { PovPicker } from "./PovPicker";
import { MoreMenu } from "./MoreMenu";
import { SynopsisField } from "./SynopsisField";
import { novelSceneText } from "./Atelier";
import { useEffect, useMemo, useRef, useState } from "react";
import { useCosmos, planScenes } from "../store";
import { useSettings } from "../settings";
import { fmt, useT } from "../i18n";
import { NOVEL_TEMPLATES, arrange, beatLevel, chapterNumbers, chapterOf, groupByChapter, hasSubBeats, isPlanTemplate, leafBeats, type Chapter, type PlanTemplate } from "../plan";
import { plainText } from "../search";
import { Timeline } from "./Timeline";
import { StoryCircle } from "./StoryCircle";
import { TemplatePicker } from "./TemplatePicker";
import { ArrangeToggle, PlanHeader } from "./PlanHeader";
import { useBeatText } from "./useBeatText";
import { BeatQuestion } from "./StructureTools";

/** Valeur du menu « Ranger dans » pour une scène sortie du plan. */
const UNPLACED = "";
/** Valeurs du menu « Chapitre » : aucun, ou un nouveau qui commence à cette scène. */
const NO_CHAPTER = "";
const NEW_CHAPTER = "+";
const NO_FACTS: Fact[] = [];

/** Téléphone : le plan se lit en liste seulement (les fiches n\u2019y tiennent pas). */
const phoneSq = () => typeof window !== "undefined" && window.matchMedia("(max-width: 720px)").matches;

export function Plan() {
  const t = useT();
  const p = t.plan;
  const lang = useSettings((s) => s.lang);
  // Même réglage d'appareil que le séquencier : liste ou fiches.
  const mode = useSettings((s) => s.sequencerMode);
  const asCards = !phoneSq() && mode === "cards";
  const nodes = useCosmos((s) => s.nodes);
  const plan = useCosmos((s) => s.plan);
  const setPlanTemplate = useCosmos((s) => s.setPlanTemplate);
  const placeInPlan = useCosmos((s) => s.placeInPlan);
  const stepInPlan = useCosmos((s) => s.stepInPlan);
  const addPlanScene = useCosmos((s) => s.addPlanScene);
  const updateCard = useCosmos((s) => s.updateCard);
  const revealCard = useCosmos((s) => s.revealCard);
  const startChapterAt = useCosmos((s) => s.startChapterAt);
  const setSceneChapter = useCosmos((s) => s.setSceneChapter);
  const renamePlanChapter = useCosmos((s) => s.renamePlanChapter);
  const askDeleteChapter = useCosmos((s) => s.askDeleteChapter);
  const organizeCanvas = useCosmos((s) => s.organizeCanvas);
  const c = t.chapters;

  // Roman interactif (lot 11, #91) : la carte des choix est le canevas ; le Plan montre les sections du livre.
  const interactive = useInteractive();
  const sceneIds = useMemo(() => planScenes(nodes), [nodes]);
  const arranged = useMemo(() => arrange(plan, sceneIds), [plan, sceneIds]);
  const cards = useMemo(() => new Map(nodes.map((n) => [n.id, n.data])), [nodes]);
  const free = plan.template === "libre";
  const placed = sceneIds.length - arranged.unplaced.length;
  // Sections du livre : numéro imprimé (le mélange du livre-jeu, le départ au 1) et repères de chaque scène.
  const manuscript = useCosmos((s) => s.manuscript);
  const metaKeep = useCosmos((s) => s.metaKeep);
  const storyScenes = interactive ? interactiveScenes(nodes, plan) : null;
  const storyKey = storyScenes ? scenesKey(storyScenes) : "";
  // Numéros figés du livre-jeu (lot 12).
  const sections = useCosmos((s) => (interactive ? projectSections(s) : null));
  const book = useMemo(() => {
    if (!storyScenes) return null;
    const graph = choiceGraph(manuscript, storyScenes);
    const marks = sceneMarks(storyScenes, graph, manuscript, verifyStory(storyScenes, manuscript, readFactLabels(metaKeep)));
    return { numbers: new Map(Object.entries(sections?.numbers ?? {})), locked: new Set(sections?.locked ?? []), marks, endings: endingCounts(storyScenes, manuscript) };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storyKey, manuscript, metaKeep, sections]);
  // Plan libre d'un roman interactif : les scènes dans l'ordre d'impression, sans flèches ni glisser (l'ordre de la
  // liste ne compte que pour le départ, qu'on choisit par le menu ⋯).
  const bySection = interactive && free && !!book;
  const facts = useCosmos((s) => (interactive ? projectFacts(s) : NO_FACTS));
  const [showFacts, setShowFacts] = useState(false);

  // Scène en cours de glissement : la ref sert au dépôt (lu tout de suite), l'état à l'affichage.
  const draggedRef = useRef<string | null>(null);
  const [dragged, setDraggedState] = useState<string | null>(null);
  const setDragged = (id: string | null) => {
    draggedRef.current = id;
    setDraggedState(id);
  };
  const [over, setOver] = useState<string | null>(null);
  const [announce, setAnnounce] = useState("");
  // Chronologie par intrigue : une troisième lecture du plan, non mémorisée.
  const [timeline, setTimeline] = useState(false);
  // Pas de chronologie dans un roman interactif : ses colonnes suivent l'ordre du livre.
  const showTimeline = timeline && !interactive;
  // La scène dont « Ranger » est ouvert (chapitre et case) : un affichage, une seule à la fois.
  const [arranging, setArranging] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, string>>({});

  // Après un déplacement au clavier, le focus suit la scène.
  const rootRef = useRef<HTMLDivElement>(null);
  const refocus = useRef<string | null>(null);
  useEffect(() => {
    const target = refocus.current;
    if (!target) return;
    refocus.current = null;
    rootRef.current?.querySelector<HTMLButtonElement>(`[data-scene="${target}"] .reorder-handle`)?.focus();
  }, [plan]);

  const beatInfo = useBeatText();
  const beatLabel = (key: string) => beatInfo(key).label;
  const plotColor = usePlotColor();
  const titleOf = (id: string) => cards.get(id)?.title.trim() || p.untitled;

  /** Annonce la nouvelle place d'une scène (lecteurs d'écran), d'après l'état à jour du store. */
  const tell = (id: string) => {
    const now = arrange(useCosmos.getState().plan, sceneIds);
    const beat = now.beats.find((b) => b.ids.includes(id));
    setAnnounce(
      beat
        ? fmt(p.moved, { title: titleOf(id), beat: beatLabel(beat.key), n: beat.ids.indexOf(id) + 1 })
        : fmt(p.removed, { title: titleOf(id) }),
    );
  };
  const place = (id: string, beat: string | null, index?: number) => {
    placeInPlan(id, beat, index);
    tell(id);
  };
  const step = (id: string, way: "up" | "down") => {
    if (!stepInPlan(id, way)) return;
    refocus.current = id;
    tell(id);
  };
  const add = (beat: string) => {
    const title = (drafts[beat] ?? "").trim();
    if (!title) return;
    addPlanScene(title, beat);
    setDrafts({ ...drafts, [beat]: "" });
  };

  const order = arranged.beats.flatMap((b) => b.ids);
  // Les scènes occupent les premiers indices. Chaque case, même vide, et la zone « À placer »
  // restent des cibles de dépôt pour la poignée, comme pour le glisser de ligne entière.
  const firstBeatTarget = order.length;
  const unplacedTarget = firstBeatTarget + arranged.beats.length;
  const gripDrop = (id: string, from: number, to: number) => {
    if (to >= firstBeatTarget) {
      place(id, arranged.beats[to - firstBeatTarget]?.key ?? null);
      return;
    }
    const target = order[to];
    const beat = arranged.beats.find((b) => b.ids.includes(target));
    if (beat) place(id, beat.key, beat.ids.indexOf(target) + (from < to ? 1 : 0));
  };
  const numbers = useMemo(() => chapterNumbers(plan, [...order, ...arranged.unplaced]), [plan, order, arranged.unplaced]);
  const chapterName = (chapter: Chapter) => {
    const n = numbers.get(chapter.id) ?? 0;
    return chapter.title.trim() ? fmt(c.numberedTitle, { n, title: chapter.title.trim() }) : fmt(c.numbered, { n });
  };
  const chapters = [...(plan.chapters ?? [])].sort((a, b) => (numbers.get(a.id) ?? 0) - (numbers.get(b.id) ?? 0));
  // Type de fin d'une section qui finit l'histoire (lot 14) : les deux autres types proposés dans son menu ⋯.
  const endingItems = (id: string) => {
    const mk = book?.marks.get(id);
    if (!mk || !(mk.ending || mk.deadEnd)) return [];
    const m = t.interactive.map;
    return (
      [
        ["good", m.markGood],
        ["bad", m.markBad],
        [null, m.markNeutral],
      ] as const
    )
      .filter(([kind]) => kind !== mk.endKind)
      .map(([kind, label]) => ({ label, onSelect: () => useCosmos.getState().setSceneEnding(id, kind) }));
  };
  const plural = (n: number) => fmt(new Intl.PluralRules(lang).select(n) === "one" ? p.summaryOne : p.summaryMany, { n });

  const dropOn = (key: string, beat: string | null, index?: number) => ({
    onDragOver: (e: React.DragEvent) => {
      if (draggedRef.current === null) return;
      e.preventDefault();
      e.stopPropagation();
      setOver(key);
    },
    onDrop: (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (draggedRef.current !== null) place(draggedRef.current, beat, index);
      setDragged(null);
      setOver(null);
    },
  });

  const scene = (id: string, beat: string | null, index: number) => {
    const card = cards.get(id);
    if (!card) return null;
    const title = titleOf(id);
    const text = card.html ? plainText(card.html) : "";
    const at = order.indexOf(id);
    // Chapitre (scène rangée) ou case du gabarit : de quoi la ranger, derrière le bouton « Ranger ».
    // Roman interactif : ni chapitre ni case en plan libre (l'ordre de lecture n'y est pas celui du livre).
    const canArrange = interactive ? !free : beat !== null || !free;
    return (
      <li
        key={id}
        data-scene={id}
        data-reorder-index={bySection ? undefined : beat === null ? unplacedTarget : at}
        className={`sq-scene plan-scene${dragged === id ? " is-dragged" : ""}${over === id && dragged !== id ? " is-over" : ""}${plotColor(id).className}`}
        style={plotColor(id).style}
        draggable={!bySection}
        onDragStart={(e) => {
          // Pas en tirant dans un champ : on y sélectionne du texte.
          if ((e.target as HTMLElement).closest("input, select, textarea")) return e.preventDefault();
          e.dataTransfer.effectAllowed = "move";
          e.dataTransfer.setData("text/plain", title);
          setDragged(id);
        }}
        onDragEnd={() => {
          setDragged(null);
          setOver(null);
        }}
        // Déposer sur une scène rangée : juste avant elle. Sur une scène à placer : on sort du plan.
        {...dropOn(id, beat, beat === null ? undefined : index)}
      >
        {bySection && <SectionNumber id={id} n={book.numbers.get(id)} title={title} locked={book.locked.has(id)} start={!!book.marks.get(id)?.start} />}
        {beat !== null && !bySection && (
          <div className="sq-moves">
            <ReorderHandle
              label={fmt(t.controls.reorder, { label: title })}
              moveLabels={{ up: fmt(p.moveUp, { title }), down: fmt(p.moveDown, { title }) }}
              index={at}
              count={order.length}
              dragEnabled={!free || order.length > 1}
              canStep={{
                up: index > 0 || beat !== arranged.beats[0]?.key,
                down: at < order.length - 1 || beat !== arranged.beats[arranged.beats.length - 1]?.key,
              }}
              onStep={(way) => step(id, way)}
              onMove={(from, to) => gripDrop(id, from, to)}
            />
          </div>
        )}
        <div className="sq-body">
          <input
            className="bible-title"
            value={card.title}
            placeholder={p.untitled}
            aria-label={p.sceneTitle}
            onChange={(e) => updateCard(id, { title: e.target.value })}
          />
          {/* Ce qui se passe dans la scène, en une phrase (champ `synopsis` de sa fiche). Faute de synopsis, ses notes.
              En liste, cette ligne prend toute la largeur de la fiche, sous le titre (le statut reste à sa droite). */}
          <div className="plan-detail">
            <SynopsisField
              value={card.fiche?.synopsis ?? ""}
              scene={title}
              onSave={(value) => useCosmos.getState().setFiche(id, "synopsis", value)}
              ia={card.ia?.includes("synopsis")}
              atelier={{ sceneId: id, text: novelSceneText(id) }}
            />
            {!card.fiche?.synopsis && text && <p className="sq-desc">{text.length > 160 ? `${text.slice(0, 160)}…` : text}</p>}
            {/* Statut et point de vue toujours là ; chapitre et case derrière « Ranger » (#55), comme le séquencier. */}
            <div className="scene-pills">
              <SceneStatusPicker card={card} />
              <PovPicker card={card} />
            </div>
            {book && <MarksTags marks={book.marks.get(id)} />}
            {canArrange && arranging === id && (
            <div className="plan-meta" id={`arrange-${id}`}>
              {beat !== null && !interactive && (
                <label className="plan-to">
                  <span className="sr-only">{fmt(c.chooseFor, { title })}</span>
                  <span aria-hidden="true">{c.short}</span>
                  <select
                    title={fmt(c.chooseFor, { title })}
                    value={chapterOf(plan, id)?.id ?? NO_CHAPTER}
                    onChange={(e) => {
                      const value = e.target.value;
                      if (value === NEW_CHAPTER) startChapterAt(id);
                      else setSceneChapter(id, value === NO_CHAPTER ? null : value);
                    }}
                  >
                    <option value={NO_CHAPTER}>{c.none}</option>
                    {chapters.map((ch) => (
                      <option key={ch.id} value={ch.id}>
                        {chapterName(ch)}
                      </option>
                    ))}
                    <option value={NEW_CHAPTER}>{c.startHere}</option>
                  </select>
                </label>
              )}
              {!free && (
                <label className="plan-to">
                  <span className="sr-only">{fmt(p.moveTo, { title })}</span>
                  <span aria-hidden="true">{p.moveToShort}</span>
                  <select title={fmt(p.moveTo, { title })} value={beat ?? UNPLACED} onChange={(e) => place(id, e.target.value === UNPLACED ? null : e.target.value)}>
                    <option value={UNPLACED}>{p.unplaced}</option>
                    {arranged.beats.map((b) => (
                      <option key={b.key} value={b.key}>
                        {beatLabel(b.key)}
                      </option>
                    ))}
                  </select>
                </label>
              )}
            </div>
            )}
          </div>
        </div>
        <div className="plan-actions">
        {canArrange && <ArrangeToggle open={arranging === id} title={title} onToggle={() => setArranging(arranging === id ? null : id)} />}
        <button type="button" className="icon-button" aria-label={fmt(p.openText, { title })} title={fmt(p.openText, { title })} onClick={() => useCosmos.getState().openInManuscript(id)}>
          <span aria-hidden="true">✎</span>
        </button>
        {/* Voir sur le canevas et la corbeille dans un menu (1.11.1) : la corbeille n'est plus à côté du crayon. */}
        <MoreMenu
          label={fmt(t.app.moreActionsFor, { title })}
          items={[
            { label: t.bible.seeOnCanvas, title: fmt(p.show, { title }), onSelect: () => revealCard(id) },
            bySection && beat !== null && !book.marks.get(id)?.start && { label: t.interactive.plan.makeStart, onSelect: () => place(id, beat, 0) },
            book && { label: t.interactive.play.openHere, onSelect: () => openPlay(id) },
            ...endingItems(id),
            bySection &&
              !book.marks.get(id)?.start && {
                label: book.locked.has(id) ? t.interactive.plan.release : t.interactive.plan.keep,
                onSelect: () => useCosmos.getState().toggleSectionLock(id),
              },
            !interactive && !!useCosmos.getState().nextMergeable(id) && { label: t.merge.menuShort, onSelect: () => useCosmos.getState().mergeWithNext(id) },
            { label: t.trash.remove, title: fmt(t.trash.removeAria, { title }), danger: true, onSelect: () => useCosmos.getState().deleteCard(id) },
          ]}
        />
        </div>
      </li>
    );
  };

  return (
    <div className="sequencer" data-native-reorder ref={rootRef} data-reorder-list>
      <div className={`sq-inner${asCards || showTimeline ? " is-cards" : ""}`}>
        <PlanHeader
          title={interactive ? t.interactive.plan.sectionsTitle : p.title}
          timeline={showTimeline}
          onTimeline={setTimeline}
          noTimeline={interactive}
          modeAria={p.modeAria}
          actions={
            <>
              <button type="button" className="ghost-button plan-organize" title={t.organize.hint} onClick={organizeCanvas}>
                {t.organize.button}
              </button>
              {interactive && (
                <>
                  <button type="button" className="ghost-button" onClick={() => openPlay()}>
                    {t.interactive.play.open}
                  </button>
                  {free && <RenumberButton />}
                  <span className="plan-facts">
                    <button type="button" className={`ghost-button${showFacts ? " is-on" : ""}`} aria-expanded={showFacts} onClick={() => setShowFacts((v) => !v)}>
                      {fmt(t.interactive.facts.button, { n: facts.length })}
                    </button>
                    {showFacts && <FactsPanel onClose={() => setShowFacts(false)} />}
                  </span>
                </>
              )}
            </>
          }
          total={
            sceneIds.length > 0 && (
              <p className="sq-total">
                <strong>{plural(sceneIds.length)}</strong>
                {!free && <> · {fmt(p.placedOf, { placed, n: sceneIds.length })}</>}
                {book && (book.endings.good > 0 || book.endings.bad > 0) && <> · {fmt(t.interactive.map.endings, book.endings)}</>}
              </p>
            )
          }
          template={
            interactive && free ? undefined : (
            <TemplatePicker
              value={plan.template}
              options={NOVEL_TEMPLATES.includes(plan.template as (typeof NOVEL_TEMPLATES)[number]) || plan.template === "perso" ? NOVEL_TEMPLATES : ([...NOVEL_TEMPLATES, plan.template] as PlanTemplate[])}
              custom={plan.custom}
              onBuiltin={(key) => key && isPlanTemplate(key) && setPlanTemplate(key)}
            />
            )
          }
          about={interactive && free ? t.interactive.plan.startHint : p.templateAbout[plan.template]}
        />
        {showTimeline ? (
          <Timeline order={[...order, ...arranged.unplaced]} />
        ) : (
          <>
        {/* Sections du livre : ni case où glisser ni flèches, l'aide du Plan ne s'y applique pas. */}
        {(sceneIds.length === 0 || !bySection) && <p className="sp-empty">{sceneIds.length === 0 ? p.empty : p.hint}</p>}
        {/* Le cercle de Dan Harmon se lit en cercle : ses huit étapes, et les trous. */}
        {plan.template === "cercleHarmon" && (
          <StoryCircle
            counts={Object.fromEntries(arranged.beats.map((b) => [b.key, b.ids.length]))}
            onPick={(key) => document.getElementById(`plan-${key}`)?.scrollIntoView({ behavior: "smooth", block: "start" })}
          />
        )}

        {arranged.beats.map((beat, beatIndex) => {
          // Gabarit imbriqué (#111) : un ensemble (« Acte I ») n'a pas de rang, ses sous-cases sont en retrait.
          const level = beatLevel(plan.custom, beat.key);
          const isGroup = hasSubBeats(plan.custom, beat.key);
          const leaves = leafBeats(plan.template, plan.custom);
          const rank = leaves.indexOf(beat.key);
          return (
          <section
            key={beat.key}
            data-reorder-index={bySection ? undefined : firstBeatTarget + beatIndex}
            className={`plan-beat${free ? "" : " is-beat"}${isGroup ? " is-group" : ""}${level > 1 ? ` level-${level}` : ""}${over === beat.key ? " is-over" : ""}`}
            aria-labelledby={`plan-${beat.key}`}
            {...dropOn(beat.key, beat.key)}
          >
            {/* Case du gabarit : son rang dans la structure au-dessus d'un grand titre (comme son cadre sur le canevas). */}
            <h2 id={`plan-${beat.key}`} {...(level > 1 ? { "aria-level": level + 1 } : {})}>
              {!free && rank >= 0 && <span className="beat-rank">{fmt(p.beatRank, { n: rank + 1, total: leaves.length })}</span>}
              <span className="beat-title">{beatLabel(beat.key)}</span>
              {beat.ids.length > 0 && <span className="plan-count">{beat.ids.length}</span>}
            </h2>
            {beatInfo(beat.key).hint && !bySection && <p className="plan-beat-hint">{beatInfo(beat.key).hint}</p>}
            {/* Case vide d'un gabarit (IA branchée) : une question sur mesure, à garder en carte Question. */}
            {!free && !isGroup && beat.ids.length === 0 && <BeatQuestion beatKey={beat.key} />}
            {groupByChapter(plan, beat.ids).map((group) => {
              // Sections du livre : dans l'ordre de leurs numéros.
              const ids = bySection ? [...group.ids].sort((a, b) => (book.numbers.get(a) ?? 0) - (book.numbers.get(b) ?? 0)) : group.ids;
              const list = <ol className={`sq-list${asCards ? " is-cards" : ""}`}>{ids.map((id) => scene(id, beat.key, beat.ids.indexOf(id)))}</ol>;
              if (!group.chapter) return <div key={`loose-${group.ids[0]}`}>{list}</div>;
              const ch = group.chapter;
              const name = chapterName(ch);
              return (
                <div key={`${ch.id}-${group.ids[0]}`} className="plan-chapter" role="group" aria-label={name}>
                  <div className="plan-chapter-head">
                    <span className="plan-chapter-number">{fmt(c.numbered, { n: numbers.get(ch.id) ?? 0 })}</span>
                    <input
                      className="bible-title plan-chapter-title"
                      value={ch.title}
                      placeholder={c.titlePlaceholder}
                      aria-label={fmt(c.titleAria, { name })}
                      onChange={(e) => renamePlanChapter(ch.id, e.target.value)}
                    />
                    <span className="plan-count">{group.ids.length}</span>
                    <button type="button" className="icon-button" aria-label={fmt(c.remove, { name })} title={fmt(c.remove, { name })} onClick={() => askDeleteChapter(ch.id)}>
                      <span aria-hidden="true">×</span>
                    </button>
                  </div>
                  {list}
                </div>
              );
            })}
            {/* Un ensemble reçoit ses scènes dans ses sous-cases : pas de champ « Nouvelle scène » à lui. */}
            {!isGroup && <form
              className="plan-add"
              onSubmit={(e) => {
                e.preventDefault();
                add(beat.key);
              }}
            >
              <input
                value={drafts[beat.key] ?? ""}
                placeholder={p.newScene}
                aria-label={fmt(p.newSceneIn, { beat: beatLabel(beat.key) })}
                onChange={(e) => setDrafts({ ...drafts, [beat.key]: e.target.value })}
              />
              <button type="submit" disabled={!(drafts[beat.key] ?? "").trim()}>
                {p.add}
              </button>
            </form>}
          </section>
          );
        })}

        {!free && (
          <section data-reorder-index={unplacedTarget} className={`plan-beat is-unplaced${over === "unplaced" ? " is-over" : ""}`} aria-labelledby="plan-unplaced" {...dropOn("unplaced", null)}>
            <h2 id="plan-unplaced">
              {p.unplaced}
              {arranged.unplaced.length > 0 && <span className="plan-count">{arranged.unplaced.length}</span>}
            </h2>
            <p className="plan-beat-hint">{arranged.unplaced.length > 0 || sceneIds.length === 0 ? p.unplacedHint : p.unplacedEmpty}</p>
            {arranged.unplaced.length > 0 && <ol className={`sq-list${asCards ? " is-cards" : ""}`}>{arranged.unplaced.map((id, i) => scene(id, null, i))}</ol>}
          </section>
        )}

          </>
        )}
        <div className="sr-only" aria-live="polite">
          {announce}
        </div>
      </div>
    </div>
  );
}
