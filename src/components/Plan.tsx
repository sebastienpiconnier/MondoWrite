// Plan (vue Plan d'un projet roman) : les cartes Scène rangées dans les cases d'un gabarit
// (trois actes, Save the Cat, voyage du héros) ou dans une liste libre. Rien n'est recopié :
// le plan ne retient que l'ordre, le titre et le texte restent ceux de la carte.
// Trois chemins pour ranger une scène : la glisser, les flèches, ou le menu « Ranger dans ».
// Chapitres : dans chaque case, les scènes se regroupent par chapitre. Le menu « Chapitre » d'une scène
// la range dans un chapitre, ou en commence un nouveau à cette scène (le précédent s'arrête juste avant).

import { SceneStatusPicker } from "./SceneStatusPicker";
import { TrashIcon } from "./TrashIcon";
import { SynopsisField } from "./SynopsisField";
import { useEffect, useMemo, useRef, useState } from "react";
import { useCosmos, planScenes } from "../store";
import { useSettings, type SequencerMode } from "../settings";
import { fmt, useT } from "../i18n";
import { NOVEL_TEMPLATES, arrange, chapterNumbers, chapterOf, groupByChapter, isPlanTemplate, type Chapter, type PlanTemplate } from "../plan";
import { plainText } from "../search";
import { Timeline } from "./Timeline";
import { StoryCircle } from "./StoryCircle";
import { TemplatePicker } from "./TemplatePicker";
import { useBeatText } from "./useBeatText";

/** Valeur du menu « Ranger dans » pour une scène sortie du plan. */
const UNPLACED = "";
/** Valeurs du menu « Chapitre » : aucun, ou un nouveau qui commence à cette scène. */
const NO_CHAPTER = "";
const NEW_CHAPTER = "+";
const MODES: SequencerMode[] = ["outline", "cards"];

/** Téléphone : le plan se lit en liste seulement (les fiches n\u2019y tiennent pas). */
const phoneSq = () => typeof window !== "undefined" && window.matchMedia("(max-width: 720px)").matches;

export function Plan() {
  const t = useT();
  const p = t.plan;
  const lang = useSettings((s) => s.lang);
  // Même réglage d'appareil que le séquencier : liste ou fiches.
  const mode = useSettings((s) => s.sequencerMode);
  const setMode = useSettings((s) => s.setSequencerMode);
  const asCards = !phoneSq() && mode === "cards";
  const sq = t.screenplay.sequencer;
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

  const sceneIds = useMemo(() => planScenes(nodes), [nodes]);
  const arranged = useMemo(() => arrange(plan, sceneIds), [plan, sceneIds]);
  const cards = useMemo(() => new Map(nodes.map((n) => [n.id, n.data])), [nodes]);
  const free = plan.template === "libre";
  const placed = sceneIds.length - arranged.unplaced.length;

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
  const [drafts, setDrafts] = useState<Record<string, string>>({});

  // Après un déplacement au clavier, le focus suit la scène.
  const rootRef = useRef<HTMLDivElement>(null);
  const refocus = useRef<{ id: string; way: "up" | "down" } | null>(null);
  useEffect(() => {
    const target = refocus.current;
    if (!target) return;
    refocus.current = null;
    const row = rootRef.current?.querySelector(`[data-scene="${target.id}"]`);
    const button =
      row?.querySelector<HTMLButtonElement>(`button[data-move="${target.way}"]:not(:disabled)`) ??
      row?.querySelector<HTMLButtonElement>("button[data-move]:not(:disabled)");
    button?.focus();
  }, [plan]);

  const beatInfo = useBeatText();
  const beatLabel = (key: string) => beatInfo(key).label;
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
    refocus.current = { id, way };
    tell(id);
  };
  const add = (beat: string) => {
    const title = (drafts[beat] ?? "").trim();
    if (!title) return;
    addPlanScene(title, beat);
    setDrafts({ ...drafts, [beat]: "" });
  };

  const order = arranged.beats.flatMap((b) => b.ids);
  const numbers = useMemo(() => chapterNumbers(plan, [...order, ...arranged.unplaced]), [plan, order, arranged.unplaced]);
  const chapterName = (chapter: Chapter) => {
    const n = numbers.get(chapter.id) ?? 0;
    return chapter.title.trim() ? fmt(c.numberedTitle, { n, title: chapter.title.trim() }) : fmt(c.numbered, { n });
  };
  const chapters = [...(plan.chapters ?? [])].sort((a, b) => (numbers.get(a.id) ?? 0) - (numbers.get(b.id) ?? 0));
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
    return (
      <li
        key={id}
        data-scene={id}
        className={`sq-scene plan-scene${dragged === id ? " is-dragged" : ""}${over === id && dragged !== id ? " is-over" : ""}`}
        draggable
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
        {beat !== null && (
          <div className="sq-moves">
            <button type="button" className="icon-button" data-move="up" disabled={at <= 0} aria-label={fmt(p.moveUp, { title })} onClick={() => step(id, "up")}>
              <span aria-hidden="true">{asCards ? "←" : "↑"}</span>
            </button>
            <button
              type="button"
              className="icon-button"
              data-move="down"
              disabled={at === order.length - 1}
              aria-label={fmt(p.moveDown, { title })}
              onClick={() => step(id, "down")}
            >
              <span aria-hidden="true">{asCards ? "→" : "↓"}</span>
            </button>
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
            <SynopsisField value={card.fiche?.synopsis ?? ""} scene={title} onSave={(value) => useCosmos.getState().setFiche(id, "synopsis", value)} />
            {!card.fiche?.synopsis && text && <p className="sq-desc">{text.length > 160 ? `${text.slice(0, 160)}…` : text}</p>}
            <SceneStatusPicker card={card} />
          </div>
        </div>
        <div className="plan-actions">
        {beat !== null && (
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
        <button type="button" className="icon-button" aria-label={fmt(p.show, { title })} title={fmt(p.show, { title })} onClick={() => revealCard(id)}>
          <span aria-hidden="true">↗</span>
        </button>
        <button type="button" className="icon-button" aria-label={fmt(p.openText, { title })} title={fmt(p.openText, { title })} onClick={() => useCosmos.getState().openInManuscript(id)}>
          <span aria-hidden="true">✎</span>
        </button>
        <button type="button" className="icon-button sq-trash" aria-label={fmt(t.trash.removeAria, { title })} title={fmt(t.trash.removeAria, { title })} onClick={() => useCosmos.getState().deleteCard(id)}>
          <TrashIcon />
        </button>
        </div>
      </li>
    );
  };

  return (
    <div className="sequencer" ref={rootRef}>
      <div className={`sq-inner${asCards || timeline ? " is-cards" : ""}`}>
        <header className="sq-head">
          <h1>{p.title}</h1>
          <TemplatePicker
            value={plan.template}
            options={NOVEL_TEMPLATES.includes(plan.template as (typeof NOVEL_TEMPLATES)[number]) || plan.template === "perso" ? NOVEL_TEMPLATES : ([...NOVEL_TEMPLATES, plan.template] as PlanTemplate[])}
            custom={plan.custom}
            onBuiltin={(key) => key && isPlanTemplate(key) && setPlanTemplate(key)}
          />
          <p className="plan-about">{p.templateAbout[plan.template]}</p>
          <div className="sq-modes" role="group" aria-label={p.modeAria}>
            {MODES.map((m) => (
              <button
                key={m}
                type="button"
                aria-pressed={!timeline && mode === m}
                onClick={() => {
                  setMode(m);
                  setTimeline(false);
                }}
              >
                {sq[m]}
              </button>
            ))}
            <button type="button" className="plan-timeline-tab" aria-pressed={timeline} onClick={() => setTimeline(true)}>
              {p.timeline}
            </button>
          </div>
          <button type="button" className="ghost-button plan-organize" title={t.organize.hint} onClick={organizeCanvas}>
            {t.organize.button}
          </button>
          {sceneIds.length > 0 && (
            <p className="sq-total">
              <strong>{plural(sceneIds.length)}</strong>
              {!free && <> · {fmt(p.placedOf, { placed, n: sceneIds.length })}</>}
            </p>
          )}
        </header>
        {timeline ? (
          <Timeline order={[...order, ...arranged.unplaced]} />
        ) : (
          <>
        <p className="sp-empty">{sceneIds.length === 0 ? p.empty : p.hint}</p>
        {/* Le cercle de Dan Harmon se lit en cercle : ses huit étapes, et les trous. */}
        {plan.template === "cercleHarmon" && (
          <StoryCircle
            counts={Object.fromEntries(arranged.beats.map((b) => [b.key, b.ids.length]))}
            onPick={(key) => document.getElementById(`plan-${key}`)?.scrollIntoView({ behavior: "smooth", block: "start" })}
          />
        )}

        {arranged.beats.map((beat, rank) => (
          <section key={beat.key} className={`plan-beat${free ? "" : " is-beat"}${over === beat.key ? " is-over" : ""}`} aria-labelledby={`plan-${beat.key}`} {...dropOn(beat.key, beat.key)}>
            {/* Case du gabarit : son rang dans la structure au-dessus d'un grand titre (comme son cadre sur le canevas). */}
            <h2 id={`plan-${beat.key}`}>
              {!free && <span className="beat-rank">{fmt(p.beatRank, { n: rank + 1, total: arranged.beats.length })}</span>}
              <span className="beat-title">{beatLabel(beat.key)}</span>
              {beat.ids.length > 0 && <span className="plan-count">{beat.ids.length}</span>}
            </h2>
            {beatInfo(beat.key).hint && <p className="plan-beat-hint">{beatInfo(beat.key).hint}</p>}
            {groupByChapter(plan, beat.ids).map((group) => {
              const list = <ol className={`sq-list${asCards ? " is-cards" : ""}`}>{group.ids.map((id) => scene(id, beat.key, beat.ids.indexOf(id)))}</ol>;
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
            <form
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
            </form>
          </section>
        ))}

        {!free && (
          <section className={`plan-beat is-unplaced${over === "unplaced" ? " is-over" : ""}`} aria-labelledby="plan-unplaced" {...dropOn("unplaced", null)}>
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
