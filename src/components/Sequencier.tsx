// Séquencier (vue Plan d'un projet scénario) : les scènes dans l'ordre du fichier, avec leur
// synopsis, leurs personnages et leur longueur. Deux présentations au choix : en liste ou en fiches.
// Changer l'ordre ici déplace la scène entière dans scenario.fountain.
// Trois chemins : glisser à la souris, boutons de déplacement au doigt et au clavier.

import { SceneStatusPicker } from "./SceneStatusPicker";
import { PovPicker } from "./PovPicker";
import { templateBeats, type PlanBeat } from "../plan";

/** Gabarits proposés à un épisode : « Épisode de série » d'abord. */
const EPISODE_TEMPLATES = ["episode", ...SCREENPLAY_TEMPLATES.filter((k) => k !== "episode")] as const;
import { MoreMenu } from "./MoreMenu";
import { useEffect, useMemo, useRef, useState } from "react";
import { SCENE_AT, useCosmos } from "../store";
import { useEpisodeLabel } from "./EpisodePicker";
import { episodeAt, episodeScript, isSeries, seriesMark, withEpisodeTemplate, seriesOf, type Episode, type Season } from "../screenplay/series";
import { isSeries as isSeriesPitch } from "../review/checks";
import { formOf } from "../pitch";
import { useSettings, type SequencerMode } from "../settings";
import { fmt } from "../i18n";
import { useVocab } from "../vocab";
import { blocks, moveBlock } from "../screenplay/sequence";
import { pagesBetween } from "../screenplay/paginate";
import { sceneCharacters, sceneSynopsis, setSceneSynopsis, synopsisIsIa } from "../screenplay/scenes";
import { screenplaySceneText } from "./Atelier";
import { matchesCharacter } from "../screenplay/editor/autocomplete";
import { plainText } from "../search";
import { minutesFor, usePagination } from "./usePagination";
import { SynopsisField } from "./SynopsisField";
import { Timeline } from "./Timeline";
import { SCREENPLAY_TEMPLATES, applyTemplate, beatOf, currentTemplate, customOf, isScreenplayTemplate, moveToSection, screenplayPlan, sectionLabel } from "../screenplay/template";
import { TemplatePicker } from "./TemplatePicker";
import { useBeatText } from "./useBeatText";
import { BeatQuestion } from "./StructureTools";
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
  // Toute la série : saisons, épisodes et scènes (screenplay/series.ts).
  const screenplay = useCosmos((s) => s.screenplay);
  const pitch = useCosmos((s) => s.pitch);
  const nodes = useCosmos((s) => s.nodes);
  const anyPov = useMemo(() => nodes.some((n) => n.data.type === "scene" && n.data.fiche?.pov), [nodes]);
  const setScreenplay = useCosmos((s) => s.setScreenplay);
  const revealCard = useCosmos((s) => s.revealCard);
  const pagination = usePagination(true);
  const episodeLabel = useEpisodeLabel();
  // Saisons et épisodes repliés : un affichage, jamais enregistré.
  const [folded, setFolded] = useState<Set<string>>(() => new Set());

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
  // Cases du gabarit en place, dans l'ordre : le rang d'une case (« Case 3 sur 15 ») au-dessus de son titre.
  const beatKeys = useMemo(() => {
    const plan = screenplayPlan(screenplay.elements);
    return plan.template === "libre" ? [] : templateBeats(plan.template, plan.custom);
  }, [screenplay.elements]);
  // Scènes rangées dans chaque case : une case vide reçoit « Une question » (IA branchée).
  const beatScenes = useMemo(() => screenplayPlan(screenplay.elements).beats, [screenplay.elements]);
  // Série : saisons et épisodes, par identifiant.
  const series = seriesOf(screenplay.elements);
  const seasonById = new Map(series.flatMap((x) => (x.id ? [[x.id, x] as [string, Season]] : [])));
  const episodeById = new Map(series.flatMap((x) => x.episodes.map((e) => [e.id, e] as [string, Episode])));
  const inSeries = isSeries(screenplay);
  // Une série se commence ici dès que le scénario n'est pas un film (format pas encore choisi compris).
  const offerSeries = inSeries || isSeriesPitch(pitch) || formOf("scenario", pitch) !== "film";
  const labelOf = (text: string) => {
    const mark = seriesMark({ type: "section", text });
    if (mark?.kind === "episode" && episodeById.has(mark.id)) return episodeLabel(episodeById.get(mark.id)!);
    if (mark?.kind === "season") return seasonById.get(mark.id)?.title || t.season.seasonUntitled;
    const key = beatOf(text);
    return key && key in t.plan.beats ? t.plan.beats[key as PlanBeat].label : sectionLabel(text);
  };
  // Série : une case porte le nom de son épisode dans « Ranger dans » (chaque épisode a les mêmes cases).
  const sectionLabelAt = (b: (typeof list)[number]) => {
    const label = labelOf(b.text);
    if (!inSeries || !beatOf(b.text)) return label;
    const ep = episodeAt(screenplay, b.start);
    return ep && episodeById.has(ep) ? `${episodeLabel(episodeById.get(ep)!)} · ${label}` : label;
  };
  const sections = list.flatMap((b, i) => (b.kind === "section" ? [{ index: i, label: sectionLabelAt(b) }] : []));
  // Section de chaque bloc (la dernière placée avant lui), et longueur de chaque section.
  const owner: number[] = [];
  const sectionPages = new Map<number, number>();
  list.forEach((b, i) => {
    owner[i] = b.kind === "section" ? i : (owner[i - 1] ?? -1);
    if (b.kind === "scene" && owner[i] >= 0) sectionPages.set(owner[i], (sectionPages.get(owner[i]) ?? 0) + pagesBetween(pagination, b.start, b.end));
  });
  // Série : gabarit de chaque épisode, lu dans son texte ; « Épisode de série » en tête de la liste.
  const episodeTemplate = (id: string) => currentTemplate(episodeScript(screenplay, id).elements);
  const setEpisodeTemplate = (id: string, value: string) => {
    if (value === "perso") return;
    const next = withEpisodeTemplate(screenplay, id, (script) =>
      applyTemplate(script, isScreenplayTemplate(value) ? value : null, (key) => t.plan.beats[key as PlanBeat].label),
    );
    if (next !== screenplay) setScreenplay(next, true);
  };
  // Rang d'une case dans le gabarit de son épisode (« Case 3 sur 6 »), ou dans le gabarit du scénario.
  const rankOf = (start: number): { n: number; total: number } | null => {
    const key = beatOf(screenplay.elements[start]?.text ?? "");
    if (!key) return null;
    if (!inSeries) return beatKeys.includes(key) ? { n: beatKeys.indexOf(key) + 1, total: beatKeys.length } : null;
    const ep = episodeAt(screenplay, start);
    if (!ep) return null;
    const plan = screenplayPlan(episodeScript(screenplay, ep).elements);
    const keys = plan.template === "libre" ? [] : templateBeats(plan.template, plan.custom);
    return keys.includes(key) ? { n: keys.indexOf(key) + 1, total: keys.length } : null;
  };
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
  const ts = t.season;
  const toggleFold = (id: string) =>
    setFolded((before) => {
      const next = new Set(before);
      if (!next.delete(id)) next.add(id);
      return next;
    });
  // Blocs cachés par une saison ou un épisode replié (jusqu'à la saison, ou l'épisode, suivant).
  const hidden = new Set<number>();
  {
    let season: string | null = null;
    let episode: string | null = null;
    list.forEach((b, i) => {
      const mark = b.kind === "section" ? seriesMark(screenplay.elements[b.start]) : null;
      if (mark?.kind === "season") {
        season = folded.has(mark.id) ? mark.id : null;
        episode = null;
        return;
      }
      if (season) return void hidden.add(i);
      if (mark?.kind === "episode") {
        episode = folded.has(mark.id) ? mark.id : null;
        return;
      }
      if (episode) hidden.add(i);
    });
  }
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
          {offerSeries && (
            <div className="sq-series-add">
              <button type="button" className="ghost-button" onClick={() => useCosmos.getState().addSeriesEpisode()}>
                + {ts.newEpisode}
              </button>
              {inSeries && (
                <button type="button" className="ghost-button" onClick={() => useCosmos.getState().addSeriesSeason()}>
                  + {ts.newSeason}
                </button>
              )}
            </div>
          )}
          {!inSeries && <TemplatePicker value={template} options={SCREENPLAY_TEMPLATES} allowNone custom={template === "perso" ? customOf(screenplay.elements) : undefined} onBuiltin={(key) => setTemplate(key ?? "")} />}
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
        {scenes === 0 ? <p className="sp-empty">{sq.empty}</p> : inSeries ? <p className="sp-empty">{ts.hint}</p> : scenes > 1 && <p className="sp-empty">{sq.hint}</p>}
        {template && !inSeries && <p className="plan-about">{t.plan.templateAbout[template]}</p>}
        {template && !inSeries && <p className="sp-empty">{sq.templateHint}</p>}
        {template === "cercleHarmon" && (
          <StoryCircle
            counts={Object.fromEntries(Object.entries(screenplayPlan(screenplay.elements).beats).map(([k, ids]) => [k, ids.length]))}
            onPick={(key) => listRef.current?.querySelector(`[data-beat="${key}"]`)?.scrollIntoView({ behavior: "smooth", block: "start" })}
          />
        )}

        <ol className={`sq-list${cards ? " is-cards" : ""}`} ref={listRef} aria-label={sq.listAria}>
          {/* Série : des scènes écrites avant le premier épisode. */}
          {inSeries && list[0]?.kind === "scene" && (
            <li className="sq-section sq-outside">
              <span className="sq-section-name">
                <span className="beat-title">{ts.outside}</span>
              </span>
            </li>
          )}
          {list.map((block, i) => {
            if (hidden.has(i)) return null;
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

            const mark = block.kind === "section" ? seriesMark(screenplay.elements[block.start]) : null;
            if (mark) {
              const season = mark.kind === "season" ? seasonById.get(mark.id) : undefined;
              const episode = mark.kind === "episode" ? episodeById.get(mark.id) : undefined;
              if (!season && !episode) return null;
              const title = season ? season.title || ts.seasonUntitled : episodeLabel(episode!);
              const open = !folded.has(mark.id);
              const pages = season ? pagesBetween(pagination, season.at + 1, season.end) : pagesBetween(pagination, episode!.start, episode!.end);
              const s = useCosmos.getState;
              return (
                <li key={`${mark.kind}-${mark.id}`} className={`sq-section sq-${mark.kind}${dropClass}`} data-series={mark.id} {...drop}>
                  <button type="button" className="icon-button sq-fold" aria-expanded={open} aria-label={fmt(open ? ts.fold : ts.unfold, { title })} onClick={() => toggleFold(mark.id)}>
                    <span className={`disclosure${open ? " is-open" : ""}`} aria-hidden="true" />
                  </button>
                  <span className="sq-section-name">
                    {episode && <span className="beat-rank">{fmt(ts.episodeNumber, { n: episode.number })}</span>}
                    <input
                      key={`${mark.id}:${season?.title ?? episode?.title}`}
                      className="sq-series-title beat-title"
                      defaultValue={season?.title ?? episode?.title}
                      placeholder={season ? ts.seasonUntitled : ts.untitled}
                      aria-label={season ? ts.seasonTitleAria : fmt(ts.episodeTitleAria, { n: episode!.number })}
                      onBlur={(e) => s().renameSeriesPart(mark.id, e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                      }}
                    />
                    {episode && (
                      <SynopsisField value={episode.synopsis} scene={title} onSave={(text) => s().setEpisodeSynopsis(mark.id, text)} />
                    )}
                    {/* Gabarit de cet épisode seul : ses cases se posent dans son texte (lot 3). */}
                    {episode && (
                      <label className="sq-episode-template">
                        <span>{ts.templateOf}</span>
                        <select value={episodeTemplate(episode.id) ?? ""} onChange={(e) => setEpisodeTemplate(episode.id, e.target.value)}>
                          <option value="">{t.plan.noTemplate}</option>
                          {EPISODE_TEMPLATES.map((k) => (
                            <option key={k} value={k}>
                              {t.plan.templates[k]}
                            </option>
                          ))}
                          {episodeTemplate(episode.id) === "perso" && <option value="perso">{t.plan.templates.perso}</option>}
                        </select>
                      </label>
                    )}
                  </span>
                  {pages > 0 && (
                    <span className="sq-section-length">
                      {fmt(sp.lengthShort, { n: number.format(pages) })}
                      {pages >= 0.5 && <> · {fmt(sp.minutes, { n: minutesFor(pages) })}</>}
                    </span>
                  )}
                  <MoreMenu
                    label={fmt(ts.menuFor, { title })}
                    items={[
                      episode && {
                        label: ts.write,
                        onSelect: () => {
                          s().openEpisode(mark.id);
                          s().setView("manuscrit");
                        },
                      },
                      season && { label: ts.newEpisodeIn, onSelect: () => s().addSeriesEpisode(mark.id) },
                      { label: ts.moveUp, onSelect: () => s().moveSeriesPart(mark.id, -1) },
                      { label: ts.moveDown, onSelect: () => s().moveSeriesPart(mark.id, 1) },
                      {
                        label: season ? ts.removeSeason : ts.removeEpisode,
                        danger: true,
                        onSelect: () => {
                          s().removeSeriesPart(mark.id);
                          setAnnounce(fmt(ts.removed, { title }));
                        },
                      },
                    ]}
                  />
                </li>
              );
            }

            if (block.kind === "section") {
              return (
                <li key={`section-${block.start}`} className={`sq-section${beatOf(block.text) ? " is-beat" : ""}${inSeries && beatOf(block.text) ? " in-episode" : ""}${dropClass}`} data-beat={beatOf(block.text) ?? undefined} {...drop}>
                  <span className="sq-section-name">
                    {rankOf(block.start) && <span className="beat-rank">{fmt(t.plan.beatRank, rankOf(block.start)!)}</span>}
                    <span className="beat-title">{labelOf(block.text)}</span>
                    {/* Case d'un gabarit : ce qu'on y met, en une ligne. */}
                    {beatOf(block.text) && beatInfo(beatOf(block.text)!).hint && <span className="sq-section-hint">{beatInfo(beatOf(block.text)!).hint}</span>}
                  </span>
                  {!inSeries && beatKeys.includes(beatOf(block.text) ?? "") && !beatScenes[beatOf(block.text)!]?.length && <BeatQuestion beatKey={beatOf(block.text)!} />}
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
                    ia={synopsisIsIa(screenplay.elements, block.start)}
                    atelier={card ? { sceneId: card.id, text: screenplaySceneText(block.start) } : undefined}
                  />
                  {cardText && <p className="sq-desc">{cardText.length > 140 ? `${cardText.slice(0, 140)}…` : cardText}</p>}
                  {card && (
                    <div className="scene-pills">
                      <SceneStatusPicker card={card} />
                      {/* Scénario : le point de vue n'apparaît ici que dès qu'une scène du projet en a un. */}
                      {anyPov && <PovPicker card={card} />}
                    </div>
                  )}
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
                {/* Écrire la scène ; voir sa carte et la corbeille dans un menu (1.11.1). */}
                <div className="sq-go">
                  <button
                    type="button"
                    className="icon-button"
                    aria-label={fmt(sq.openText, { title })}
                    title={fmt(sq.openText, { title })}
                    onClick={() => useCosmos.getState().openInManuscript(block.cardId ?? `${SCENE_AT}${block.start}`)}
                  >
                    <span aria-hidden="true">✎</span>
                  </button>
                  <MoreMenu
                    label={fmt(t.app.moreActionsFor, { title })}
                    items={[
                      !!block.cardId && { label: t.bible.seeOnCanvas, title: fmt(sq.show, { title }), onSelect: () => revealCard(block.cardId!) },
                      { label: t.trash.remove, title: fmt(t.trash.removeAria, { title }), danger: true, onSelect: () => useCosmos.getState().trashScreenplayScene(block.start) },
                    ]}
                  />
                </div>
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
