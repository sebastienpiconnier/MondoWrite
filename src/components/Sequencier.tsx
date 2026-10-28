// Séquencier (vue Plan d'un projet scénario) : les scènes dans l'ordre du fichier, avec leur
// synopsis, leurs personnages et leur longueur. Deux présentations au choix : en liste ou en fiches.
// Changer l'ordre ici déplace la scène entière dans scenario.fountain.
// Trois chemins : glisser à la souris, boutons de déplacement au doigt et au clavier.

import { SceneStatusPicker } from "./SceneStatusPicker";
import type { PlanBeat } from "../plan";
import { TrashIcon } from "./TrashIcon";
import { useEffect, useMemo, useRef, useState } from "react";
import { SCENE_AT, useCosmos } from "../store";
import { useSettings, type SequencerMode } from "../settings";
import { fmt } from "../i18n";
import { useVocab } from "../vocab";
import { blocks, moveBlock } from "../screenplay/sequence";
import { pagesBetween } from "../screenplay/paginate";
import { sceneCharacters, sceneSynopsis, setSceneSynopsis } from "../screenplay/scenes";
import { matchesCharacter } from "../screenplay/editor/autocomplete";
import { plainText } from "../search";
import { minutesFor, usePagination } from "./usePagination";
import { SynopsisField } from "./SynopsisField";
import { Timeline } from "./Timeline";
import { SCREENPLAY_TEMPLATES, applyTemplate, beatOf, currentTemplate, customOf, isScreenplayTemplate, moveToSection, screenplayPlan, sectionLabel } from "../screenplay/template";
import { TemplatePicker } from "./TemplatePicker";
import { useBeatText } from "./useBeatText";
import { StoryCircle } from "./StoryCircle";

const MODES: SequencerMode[] = ["outline", "cards"];

/** Téléphone : le plan se lit en liste seulement (les fiches n\u2019y tiennent pas). */
const phoneSq = () => typeof window !== "undefined" && window.matchMedia("(max-width: 720px)").matches;

export function Sequencier() {
  const { t } = useVocab();
  const sp = t.screenplay;
  const sq = sp.sequencer;
  const lang = useSettings((s) => s.lang);
  const mode = useSettings((s) => s.sequencerMode);
  const setMode = useSettings((s) => s.setSequencerMode);
  const screenplay = useCosmos((s) => s.screenplay);
  const nodes = useCosmos((s) => s.nodes);
  const setScreenplay = useCosmos((s) => s.setScreenplay);
  const revealCard = useCosmos((s) => s.revealCard);
  const pagination = usePagination();

  const list = useMemo(() => (screenplay ? blocks(screenplay.elements) : []), [screenplay]);
  const characterCards = useMemo(() => nodes.filter((n) => n.data.type === "personnage"), [nodes]);
  // Scène en cours de glissement : la ref sert au dépôt (lu tout de suite), l'état à l'affichage.
  const draggedRef = useRef<number | null>(null);
  const [dragged, setDraggedState] = useState<number | null>(null);
  const setDragged = (index: number | null) => {
    draggedRef.current = index;
    setDraggedState(index);
  };
  const [over, setOver] = useState<number | null>(null);
  const [announce, setAnnounce] = useState("");
  // Chronologie : même tableau que dans le Plan d'un roman (une colonne par scène, une ligne par intrigue, personnage ou lieu).
  const [timeline, setTimeline] = useState(false);
  // Après un déplacement au clavier, le focus suit la scène.
  const listRef = useRef<HTMLOListElement>(null);
  const refocus = useRef<{ index: number; way: "up" | "down" } | null>(null);
  useEffect(() => {
    const target = refocus.current;
    if (!target) return;
    refocus.current = null;
    const row = listRef.current?.children[target.index];
    const button =
      row?.querySelector<HTMLButtonElement>(`button[data-move="${target.way}"]:not(:disabled)`) ??
      row?.querySelector<HTMLButtonElement>("button[data-move]:not(:disabled)");
    button?.focus();
  }, [list]);

  if (!screenplay || !pagination) return null;

  const number = new Intl.NumberFormat(lang, { maximumFractionDigits: 1 });
  const plural = (n: number, one: string, many: string) =>
    fmt(new Intl.PluralRules(lang).select(n) === "one" ? one : many, { n });

  const move = (from: number, to: number, way?: "up" | "down") => {
    const elements = moveBlock(screenplay.elements, from, to);
    if (elements === screenplay.elements) return;
    if (way) refocus.current = { index: to, way };
    const moved = blocks(elements)[to];
    setAnnounce(fmt(sq.moved, { title: moved.text || sp.untitledScene, n: moved.number ?? 0 }));
    setScreenplay({ ...screenplay, elements }, true);
  };

  // Gabarit : ses cases sont des sections du scénario. Une section écrite par l'auteur garde son texte.
  const template = currentTemplate(screenplay.elements);
  const beatInfo = useBeatText();
  const labelOf = (text: string) => {
    const key = beatOf(text);
    return key && key in t.plan.beats ? t.plan.beats[key as PlanBeat].label : sectionLabel(text);
  };
  const sections = list.flatMap((b, i) => (b.kind === "section" ? [{ index: i, label: labelOf(b.text) }] : []));
  // Section de chaque bloc (la dernière placée avant lui), et longueur de chaque section.
  const owner: number[] = [];
  const sectionPages = new Map<number, number>();
  list.forEach((b, i) => {
    owner[i] = b.kind === "section" ? i : (owner[i - 1] ?? -1);
    if (b.kind === "scene" && owner[i] >= 0) sectionPages.set(owner[i], (sectionPages.get(owner[i]) ?? 0) + pagesBetween(pagination, b.start, b.end));
  });
  const setTemplate = (value: string) =>
    setScreenplay(applyTemplate(screenplay, isScreenplayTemplate(value) ? value : null, (key) => t.plan.beats[key as PlanBeat].label), true);
  const moveTo = (from: number, section: number) => {
    const elements = moveToSection(screenplay.elements, from, section);
    if (elements === screenplay.elements) return;
    const title = list[from].text || sp.untitledScene;
    // Elle arrive en dernier dans sa nouvelle section.
    const n = owner.filter((o, i) => o === section && list[i].kind === "scene" && i !== from).length + 1;
    setAnnounce(fmt(t.plan.moved, { title, beat: sections.find((s) => s.index === section)?.label ?? "", n }));
    setScreenplay({ ...screenplay, elements }, true);
  };

  const scenes = list.filter((b) => b.kind === "scene").length;
  const cards = !phoneSq() && mode === "cards";
  const sceneCards = useMemo(() => list.filter((b) => b.kind === "scene" && b.cardId).map((b) => b.cardId as string), [list]);

  return (
    <div className="sequencer">
      <div className={`sq-inner${cards || timeline ? " is-cards" : ""}`}>
        <header className="sq-head">
          <h1>{sq.title}</h1>
          <div className="sq-modes" role="group" aria-label={sq.modeAria}>
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
              {t.plan.timeline}
            </button>
          </div>
          <TemplatePicker value={template} options={SCREENPLAY_TEMPLATES} allowNone custom={template === "perso" ? customOf(screenplay.elements) : undefined} onBuiltin={(key) => setTemplate(key ?? "")} />
          {pagination.pages > 0 && (
            <p className="sq-total">
              <strong>{fmt(sp.minutes, { n: minutesFor(pagination.pages) })}</strong> ·{" "}
              {plural(pagination.pages, sp.pagesOne, sp.pagesMany)}
            </p>
          )}
        </header>
        {timeline ? (
          <Timeline order={sceneCards} />
        ) : (
          <>
        {scenes === 0 ? <p className="sp-empty">{sq.empty}</p> : scenes > 1 && <p className="sp-empty">{sq.hint}</p>}
        {template && <p className="plan-about">{t.plan.templateAbout[template]}</p>}
        {template && <p className="sp-empty">{sq.templateHint}</p>}
        {template === "cercleHarmon" && (
          <StoryCircle
            counts={Object.fromEntries(Object.entries(screenplayPlan(screenplay.elements).beats).map(([k, ids]) => [k, ids.length]))}
            onPick={(key) => listRef.current?.querySelector(`[data-beat="${key}"]`)?.scrollIntoView({ behavior: "smooth", block: "start" })}
          />
        )}

        <ol className={`sq-list${cards ? " is-cards" : ""}`} ref={listRef} aria-label={sq.listAria}>
          {list.map((block, i) => {
            const dropClass = over === i && dragged !== null && dragged !== i ? " is-over" : "";
            const drop = {
              onDragOver: (e: React.DragEvent) => {
                if (draggedRef.current === null) return;
                e.preventDefault();
                setOver(i);
              },
              onDrop: (e: React.DragEvent) => {
                e.preventDefault();
                if (draggedRef.current !== null) move(draggedRef.current, i);
                setDragged(null);
                setOver(null);
              },
            };

            if (block.kind === "section") {
              return (
                <li key={`section-${block.start}`} className={`sq-section${dropClass}`} data-beat={beatOf(block.text) ?? undefined} {...drop}>
                  <span className="sq-section-name">
                    <span>{labelOf(block.text)}</span>
                    {/* Case d'un gabarit : ce qu'on y met, en une ligne. */}
                    {beatOf(block.text) && beatInfo(beatOf(block.text)!).hint && <span className="sq-section-hint">{beatInfo(beatOf(block.text)!).hint}</span>}
                  </span>
                  {(sectionPages.get(i) ?? 0) > 0 && (
                    <span className="sq-section-length">
                      {fmt(sp.lengthShort, { n: number.format(sectionPages.get(i)!) })}
                      {sectionPages.get(i)! >= 0.5 && <> · {fmt(sp.minutes, { n: minutesFor(sectionPages.get(i)!) })}</>}
                    </span>
                  )}
                </li>
              );
            }

            const title = block.text || sp.untitledScene;
            const card = block.cardId ? nodes.find((n) => n.id === block.cardId)?.data : undefined;
            const synopsis = sceneSynopsis(screenplay.elements, block.start);
            // Sans synopsis, le texte de la carte en tient lieu (plus discret : il n'est pas dans le scénario).
            const cardText = !synopsis && card?.html ? plainText(card.html) : "";
            const speakers = sceneCharacters(screenplay.elements, { index: block.start, end: block.end });
            const pages = pagesBetween(pagination, block.start, block.end);

            return (
              <li
                key={`scene-${block.start}`}
                className={`sq-scene${dragged === i ? " is-dragged" : ""}${dropClass}`}
                draggable
                onDragStart={(e) => {
                  // Pas en tirant dans le champ du synopsis : on y sélectionne du texte.
                  if ((e.target as HTMLElement).closest("textarea")) return e.preventDefault();
                  e.dataTransfer.effectAllowed = "move";
                  e.dataTransfer.setData("text/plain", title);
                  setDragged(i);
                }}
                onDragEnd={() => {
                  setDragged(null);
                  setOver(null);
                }}
                {...drop}
              >
                <div className="sq-moves">
                  <button
                    type="button"
                    className="icon-button"
                    data-move="up"
                    disabled={i === 0}
                    aria-label={fmt(sq.moveUp, { title })}
                    onClick={() => move(i, i - 1, "up")}
                  >
                    <span aria-hidden="true">{cards ? "←" : "↑"}</span>
                  </button>
                  <button
                    type="button"
                    className="icon-button"
                    data-move="down"
                    disabled={i === list.length - 1}
                    aria-label={fmt(sq.moveDown, { title })}
                    onClick={() => move(i, i + 1, "down")}
                  >
                    <span aria-hidden="true">{cards ? "→" : "↓"}</span>
                  </button>
                </div>
                <div className="sq-body">
                  <div className="is-slugline sq-title">
                    {block.number}. {title}
                  </div>
                  <SynopsisField
                    value={synopsis}
                    scene={title}
                    onSave={(text) => setScreenplay({ ...screenplay, elements: setSceneSynopsis(screenplay.elements, block.start, text) }, true)}
                  />
                  {cardText && <p className="sq-desc">{cardText.length > 140 ? `${cardText.slice(0, 140)}…` : cardText}</p>}
                  {card && <SceneStatusPicker card={card} />}
                  {speakers.length > 0 && (
                    <ul className="sq-speakers" aria-label={sq.charactersAria}>
                      {speakers.map((speaker) => {
                        const known = characterCards.find((n) => matchesCharacter(n.data.title, speaker.name));
                        return (
                          <li key={speaker.name}>
                            {known ? (
                              <button
                                type="button"
                                className="chip"
                                title={fmt(sq.showCharacter, { name: known.data.title })}
                                onClick={() => revealCard(known.id)}
                              >
                                {speaker.name}
                              </button>
                            ) : (
                              <span className="chip is-plain">{speaker.name}</span>
                            )}
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>
                {sections.length > 0 && (
                  <label className="plan-to">
                    <span className="sr-only">{fmt(t.plan.moveTo, { title })}</span>
                    <span aria-hidden="true">{t.plan.moveToShort}</span>
                    <select value={owner[i]} onChange={(e) => moveTo(i, Number(e.target.value))}>
                      {owner[i] < 0 && <option value={-1}>{sq.noSection}</option>}
                      {sections.map((s) => (
                        <option key={s.index} value={s.index}>
                          {s.label}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
                <div className="sq-length">
                  <div>{fmt(sp.lengthShort, { n: number.format(pages) })}</div>
                  {/* Sous la demi-page, une durée arrondie à la minute ne voudrait rien dire. */}
                  {pages >= 0.5 && <div>{fmt(sp.minutes, { n: minutesFor(pages) })}</div>}
                </div>
                {/* Aller ailleurs : la carte de la scène sur le canevas, ou la scène dans le Scénario. */}
                <div className="sq-go">
                  {block.cardId && (
                    <button type="button" className="icon-button" aria-label={fmt(sq.show, { title })} title={fmt(sq.show, { title })} onClick={() => revealCard(block.cardId!)}>
                      <span aria-hidden="true">↗</span>
                    </button>
                  )}
                  <button
                    type="button"
                    className="icon-button"
                    aria-label={fmt(sq.openText, { title })}
                    title={fmt(sq.openText, { title })}
                    onClick={() => useCosmos.getState().openInManuscript(block.cardId ?? `${SCENE_AT}${block.start}`)}
                  >
                    <span aria-hidden="true">✎</span>
                  </button>
                </div>
                <button
                  type="button"
                  className="icon-button sq-trash"
                  aria-label={fmt(t.trash.removeAria, { title })}
                  title={fmt(t.trash.removeAria, { title })}
                  onClick={() => useCosmos.getState().trashScreenplayScene(block.start)}
                >
                  <TrashIcon />
                </button>
              </li>
            );
          })}
        </ol>
          </>
        )}
        <div className="sr-only" aria-live="polite">
          {announce}
        </div>
      </div>
    </div>
  );
}
