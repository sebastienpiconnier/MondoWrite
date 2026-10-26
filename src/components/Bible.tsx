// La bible se construit toute seule à partir des cartes typées du canevas.
// Aucune donnée propre : c'est une autre lecture du même projet. On peut aussi y créer une fiche
// et la nommer : c'est une carte comme les autres, qui apparaît aussitôt sur le canevas.
// Tout s'y modifie sur place : titre, texte (le corps de la carte) et, pour un personnage, sa fiche
// d'identité. Le portrait d'un personnage tient dans un cercle, à côté de son nom.

import { SceneStatusPicker } from "./SceneStatusPicker";
import { SceneChanges } from "./SceneChanges";
import { CharacterTimeline, StoryLogSection } from "./StoryChanges";
import { useStoryLog } from "./useStoryLog";
import { headingOf } from "../screenplay/sceneText";
import { DraftPreview } from "./SceneDraft";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { loadFolded, saveFolded, setFolded } from "../bibleFold";
import { useCosmos } from "../store";
import { typeColor, type CardData, type CardType } from "../types";
import { fmt, useT } from "../i18n";
import { POSTER_FIELDS, PRINCIPAL, isPrincipal } from "../character";
import { mentionsIn } from "../manuscript";
import { bookOrder } from "../book";
import { toggleSection } from "../bibleSections";
import { PART_OF, bibleOrder, partNumber } from "../bibleParts";
import { BibleToc } from "./BibleToc";
import { useVocab } from "../vocab";
import { useSettings } from "../settings";
import { useMediaUrl } from "./useMediaUrl";
import { CharacterAssistant } from "./CharacterAssistant";
import { CardSheet } from "./CardSheet";
import { Gallery } from "./Gallery";
import { SourceTools } from "./SourceTools";
import { BibleBody } from "./BibleBody";
import { CharacterMotor } from "./CharacterMotor";
import { CharacterAnswers } from "./CharacterAnswers";
import { ProjectCover } from "./ProjectCover";
import { RelationsMap } from "./RelationsMap";
import type { PlaceRow } from "../review/places";
import type { CharacterRow } from "../review/report";
import { useProjectStats } from "./useProjectStats";
import { EdgeHandle } from "./EdgeHandle";

/** Image d'une fiche, en tête (la même que sur sa carte). Proportions gardées, bandes comblées par un fond flou. */
function EntryImage({ name, alt }: { name: string | undefined; alt: string }) {
  const url = useMediaUrl(name);
  if (!url) return null;
  return (
    <div className="bible-image">
      <img className="bible-image-backdrop" src={url} alt="" aria-hidden="true" />
      <img className="bible-image-main" src={url} alt={alt} />
    </div>
  );
}

/**
 * Sous le nom : genre, âge, métier, rôle (personnage), puis la présence dans le manuscrit
 * (« cité 12 fois, dès la scène 3 »). Idées reprises de la Bible du fork de NEO.
 */
function Poster({ card }: { card: CardData }) {
  const t = useT();
  const lang = useSettings((s) => s.lang);
  const nodes = useCosmos((s) => s.nodes);
  const plan = useCosmos((s) => s.plan);
  const manuscript = useCosmos((s) => s.manuscript);
  const order = useMemo(() => bookOrder(nodes, plan), [nodes, plan]);
  const seen = useMemo(() => mentionsIn(card, manuscript, order), [card, manuscript, order]);
  const traits = card.type === "personnage" ? POSTER_FIELDS.map((key) => card.fiche?.[key]?.trim()).filter(Boolean) : [];
  const firstTitle = seen.first ? nodes.find((n) => n.id === seen.first)?.data.title.trim() || t.manuscript.untitled : "";
  const num = new Intl.NumberFormat(lang).format(seen.count);
  if (traits.length === 0 && seen.count === 0 && !Object.keys(manuscript).length) return null;
  return (
    <p className="bible-poster">
      {traits.length > 0 && <span className="bible-traits">{traits.join(" · ")}</span>}
      {Object.keys(manuscript).length > 0 && (
        <span className="bible-mentions">
          {seen.count === 0
            ? t.character.notInText
            : fmt(seen.count === 1 ? t.character.mentionsOne : t.character.mentionsMany, { n: num, scene: order.indexOf(seen.first!) + 1, title: firstTitle })}
        </span>
      )}
    </p>
  );
}

/** Portrait d'un personnage, dans un cercle. */
function Portrait({ name, alt }: { name: string | undefined; alt: string }) {
  const url = useMediaUrl(name);
  return url ? <img className="bible-portrait" src={url} alt={alt} /> : null;
}

const TOC_KEY = "mondowrite.bible.toc";

export function Bible() {
  const { t, types, kind } = useVocab();
  const screenplay = useCosmos((s) => s.screenplay);
  const lang = useSettings((s) => s.lang);
  const nodes = useCosmos((s) => s.nodes);
  const edges = useCosmos((s) => s.edges);
  const revealCard = useCosmos((s) => s.revealCard);
  const updateCard = useCosmos((s) => s.updateCard);
  const addTitledCard = useCosmos((s) => s.addTitledCard);
  const target = useCosmos((s) => s.bibleTarget);
  const clearTarget = useCosmos((s) => s.clearBibleTarget);
  // Chiffres relus dans le texte : une ligne sous chaque personnage et chaque lieu (le détail est dans la
  // fenêtre Statistiques, ouverte depuis le Manuscrit ou le Scénario).
  const { characters: charRows, places: placeRows } = useProjectStats();
  const rowOf = useMemo(() => new Map(charRows.filter((r) => r.id).map((r) => [r.id!, r])), [charRows]);
  const placeOf = useMemo(() => new Map(placeRows.filter((r) => r.id).map((r) => [r.id!, r])), [placeRows]);
  const seeLines = (name: string) => {
    useCosmos.getState().setCharFilter({ name: name.toLocaleUpperCase(lang), mode: "lines" });
    useCosmos.getState().setView("manuscrit");
  };
  // Sommaire repliable par sa poignée ; fermé d'office sur téléphone, où il prenait la moitié de l'écran.
  const [tocOpen, setTocOpen] = useState(() => {
    try {
      const saved = localStorage.getItem(TOC_KEY);
      if (saved !== null) return saved !== "0";
    } catch {
      /* ignoré */
    }
    return typeof window === "undefined" || !window.matchMedia("(max-width: 900px)").matches;
  });
  const toggleToc = () =>
    setTocOpen((open) => {
      try {
        localStorage.setItem(TOC_KEY, open ? "0" : "1");
      } catch {
        /* le choix vaut pour la session */
      }
      return !open;
    });
  // Fiche ouverte depuis le canevas (« 3 questions à compléter ») : assistant ouvert sur elle.
  const [assisted, setAssisted] = useState<string | null>(null);
  // Fiches repliées (seulement l'en-tête) : réglage d'affichage de l'appareil, gardé d'une ouverture à l'autre.
  const [folded, setFoldedList] = useState(loadFolded);
  const foldedIds = useMemo(() => new Set(folded), [folded]);
  const fold = useCallback((ids: readonly string[], value: boolean) => {
    setFoldedList((prev) => {
      const next = setFolded(prev, ids, value);
      if (next !== prev) saveFolded(next);
      return next;
    });
  }, []);

  // Fiche qui vient d'être créée ici : elle reste en tête et son titre prend le focus,
  // sans sauter dans l'ordre alphabétique à chaque lettre tapée.
  const [fresh, setFresh] = useState<string | null>(null);
  const mainRef = useRef<HTMLElement>(null);
  useEffect(() => {
    if (fresh) mainRef.current?.querySelector<HTMLInputElement>(`input[data-card="${fresh}"]`)?.focus();
  }, [fresh]);

  // Rubriques : toutes affichées (même vides, pour y créer une fiche), rangées dans les cinq parties de la
  // Bible (bibleParts.ts), dans l'ordre choisi à l'intérieur de chacune, sauf celles que l'auteur a décochées.
  // Réglage de l'appareil (bibleSections.ts).
  const prefs = useSettings((s) => s.bibleSections);
  const setPrefs = useSettings((s) => s.setBibleSections);
  const [arranging, setArranging] = useState(false);
  const sections = useMemo(
    () =>
      bibleOrder(prefs).map((type) => ({
        type,
        cards: nodes
          .filter((n) => n.data.type === type)
          .map((n) => n.data)
          // Les personnages principaux d'abord (Bible v2), puis l'ordre alphabétique.
          .sort((a, b) => (a.id === fresh ? -1 : b.id === fresh ? 1 : Number(isPrincipal(b)) - Number(isPrincipal(a)) || a.title.localeCompare(b.title, lang))),
      })),
    [nodes, lang, fresh, prefs],
  );
  const counts = useMemo(() => {
    const out = new Map<CardType, number>();
    for (const n of nodes) out.set(n.data.type, (out.get(n.data.type) ?? 0) + 1);
    return out;
  }, [nodes]);
  // « projet » : la couverture du projet, première page de la Bible (et page d'arrivée), sans données propres.
  const [current, setCurrent] = useState<CardType | "projet">("projet");
  const onCover = current === "projet";
  const onPage = onCover;
  // Personnages : fiches ou carte des relations (état d'affichage, non enregistré).
  const [charView, setCharView] = useState<"cards" | "map">("cards");
  const relations = charView !== "cards";
  const shown = sections.find((s) => s.type === current) ?? sections.find((s) => s.cards.length > 0) ?? sections[0];

  // Arrivée depuis le canevas : la bonne partie, la fiche à l'écran, l'assistant ouvert si demandé.
  useEffect(() => {
    if (!target) return;
    const card = nodes.find((n) => n.id === target.id)?.data;
    clearTarget();
    if (!card) return;
    // Fiche d'une rubrique masquée : la rubrique revient, sinon on n'arriverait nulle part.
    const { bibleSections, setBibleSections } = useSettings.getState();
    if (bibleSections.hidden.includes(card.type)) setBibleSections(toggleSection(bibleSections, card.type));
    setCurrent(card.type);
    fold([card.id], false);
    if (target.assistant) setAssisted(card.id);
    requestAnimationFrame(() => mainRef.current?.querySelector(`[data-entry="${card.id}"]`)?.scrollIntoView({ block: "start" }));
  }, [target, nodes, clearTarget, fold]);

  // Une rubrique du sommaire : on défile jusqu'à elle (toutes sont sur la même page).
  const rootRef = useRef<HTMLDivElement>(null);
  // Téléphone : le sommaire est un tiroir, il se referme dès qu'on a choisi une rubrique.
  const closeTocOnPhone = () => {
    if (typeof window !== "undefined" && window.matchMedia("(max-width: 900px)").matches) setTocOpen(false);
  };
  const storyLog = useStoryLog();
  const goTo = (type: CardType) => {
    closeTocOnPhone();
    setCurrent(type);
    requestAnimationFrame(() => mainRef.current?.querySelector(`[data-group="${type}"]`)?.scrollIntoView({ block: "start" }));
  };
  // En défilant, le sommaire suit la rubrique à l'écran.
  const onScroll = () => {
    if (onPage || !rootRef.current || !mainRef.current) return;
    const top = rootRef.current.getBoundingClientRect().top + 80;
    let here: CardType | null = null;
    for (const el of Array.from(mainRef.current.querySelectorAll<HTMLElement>("[data-group]"))) {
      if (el.getBoundingClientRect().top <= top) here = el.dataset.group as CardType;
    }
    const next = here ?? sections[0]?.type;
    if (next && next !== current) setCurrent(next);
  };

  const create = (type: CardType) => {
    setCurrent(type);
    setFresh(addTitledCard(type, ""));
  };

  const titleOf = (id: string) => {
    const d = nodes.find((n) => n.id === id)?.data;
    if (!d) return "?";
    if (d.title) return d.title;
    // Carte sans titre : on montre le début de son texte.
    const text = new DOMParser().parseFromString(d.html, "text/html").body.textContent?.trim() ?? "";
    return text ? (text.length > 32 ? `${text.slice(0, 32)}…` : text) : t.bible.untitled;
  };

  /** Une fiche de chaque type peut naître ici. */
  const adders = (
    <div className="bible-add">
      <div className="eyebrow">{t.bible.add}</div>
      {bibleOrder(prefs).map((type) => (
        <button
          key={type}
          type="button"
          className="ghost-button"
          aria-label={fmt(t.bible.addType, { type: types[type].label })}
          onClick={() => create(type)}
        >
          <span className="card-dot" style={{ background: typeColor(type) }} />
          {types[type].label}
        </button>
      ))}
    </div>
  );

  const openCard = (id: string) => {
    const card = nodes.find((n) => n.id === id)?.data;
    if (!card) return;
    setCurrent(card.type);
    setCharView("cards");
    fold([id], false);
    requestAnimationFrame(() => mainRef.current?.querySelector(`[data-entry="${id}"]`)?.scrollIntoView({ block: "start" }));
  };

  /** Une fiche de la Bible : la carte elle-même, modifiable sur place. */
  const entry = (card: CardData, type: CardType) => {
          const links = edges.filter((e) => e.source === card.id || e.target === card.id);
          // Une fiche qu'on vient de créer n'est jamais repliée (son titre attend la frappe).
          const isFolded = foldedIds.has(card.id) && card.id !== fresh;
          const name = card.title.trim() || t.bible.untitled;
          const bodyId = `bible-entry-body-${card.id}`;
          return (
            <article key={card.id} data-entry={card.id} className={`bible-entry${type === "personnage" ? " is-character" : ""}${isFolded ? " is-folded" : ""}`} style={{ ["--type" as string]: typeColor(type) }}>
              {type !== "personnage" && (
                <EntryImage name={card.image} alt={card.title ? fmt(t.card.imageAlt, { title: card.title }) : t.card.imageAltUntitled} />
              )}
              <header>
                {type === "personnage" &&
                  (card.image ? (
                    <button type="button" className="bible-portrait-button" aria-label={t.card.changeImage} title={t.card.changeImage} onClick={() => useCosmos.getState().openPhotos({ kind: "card", id: card.id })}>
                      <Portrait name={card.image} alt={card.title ? fmt(t.card.imageAlt, { title: card.title }) : t.card.imageAltUntitled} />
                    </button>
                  ) : (
                    <button type="button" className="bible-portrait-button is-empty" aria-label={t.character.addPortrait} title={t.character.addPortrait} onClick={() => useCosmos.getState().openPhotos({ kind: "card", id: card.id })}>
                      <span aria-hidden="true">{(card.title.trim()[0] ?? "?").toUpperCase()}</span>
                    </button>
                  ))}
                <div className="bible-heading">
                <h3>
                  {/* Le titre se change ici comme sur le canevas : c'est la même carte. */}
                  <input
                    type="text"
                    data-card={card.id}
                    className={`bible-title${kind === "scenario" && type === "scene" ? " is-slugline" : ""}`}
                    value={card.title}
                    placeholder={types[type].titlePlaceholder}
                    aria-label={t.bible.titleAria}
                    autoComplete="off"
                    onChange={(e) => updateCard(card.id, { title: e.target.value })}
                    onBlur={() => card.id === fresh && setFresh(null)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === "Escape") e.currentTarget.blur();
                    }}
                  />
                </h3>
                {/* L'accroche : le personnage en une phrase, sous son nom, comme dans un dossier. */}
                {type === "personnage" && (
                  <input
                    type="text"
                    className="bible-hook"
                    value={card.fiche?.accroche ?? ""}
                    placeholder={t.character.placeholders.accroche}
                    aria-label={t.character.hookAria}
                    autoComplete="off"
                    onChange={(e) => useCosmos.getState().setFiche(card.id, "accroche", e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === "Escape") e.currentTarget.blur();
                    }}
                  />
                )}
                {type === "personnage" && rowOf.get(card.id) && <StatsLine row={rowOf.get(card.id)!} script={kind === "scenario"} />}
                {type === "lieu" && placeOf.get(card.id) && <PlaceLine row={placeOf.get(card.id)!} script={kind === "scenario"} />}
                {(type === "personnage" || type === "lieu") && <Poster card={card} />}
                </div>
                {type === "personnage" && (
                  <button
                    type="button"
                    className={`icon-button bible-principal${isPrincipal(card) ? " is-on" : ""}`}
                    aria-pressed={isPrincipal(card)}
                    aria-label={fmt(t.character.principalAria, { title: name })}
                    title={`${isPrincipal(card) ? t.character.principalOn : t.character.principalOff}. ${t.character.principalHint}`}
                    onClick={() => useCosmos.getState().setFiche(card.id, "principal", isPrincipal(card) ? "" : PRINCIPAL)}
                  >
                    <svg width="18" height="18" viewBox="0 0 24 24" fill={isPrincipal(card) ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2" strokeLinejoin="round" aria-hidden="true">
                      <path d="M12 3l2.7 5.6 6.1.8-4.5 4.2 1.1 6.1L12 16.8 6.6 19.7l1.1-6.1-4.5-4.2 6.1-.8z" />
                    </svg>
                  </button>
                )}
                <button
                  type="button"
                  className="icon-button bible-fold"
                  aria-expanded={!isFolded}
                  aria-controls={bodyId}
                  aria-label={fmt(isFolded ? t.bible.unfold : t.bible.fold, { title: name })}
                  title={fmt(isFolded ? t.bible.unfold : t.bible.fold, { title: name })}
                  onClick={() => fold([card.id], !isFolded)}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M6 9l6 6 6-6" />
                  </svg>
                </button>
              </header>
              {/* Repliée : seulement l'en-tête ; le contenu n'est pas monté (Bible légère avec beaucoup de fiches). */}
              <div id={bodyId} className="bible-entry-body" hidden={isFolded}>
              {!isFolded && (
              <>
              {/* Personnage : l'essentiel d'abord (moteur, texte), le reste se déplie à la demande. */}
              {type !== "personnage" && <Gallery card={card} />}
              {type === "personnage" && <CharacterMotor card={card} />}
              {type === "personnage" && <CharacterTimeline card={card} />}
              {/* Le synopsis d'une scène de scénario vit dans le fichier Fountain (séquencier) : pas de fiche ici. */}
              {type !== "personnage" && !(type === "scene" && kind === "scenario") && <CardSheet card={card} />}
              {(type === "lien" || type === "image") && <SourceTools card={card} />}
              {type === "document" && (
                <div className="source-tools">
                  {card.fichier ? (
                    <button type="button" className="ghost-button" onClick={() => useCosmos.getState().openDocument(card.id)}>
                      {t.documents.read}
                    </button>
                  ) : (
                    <button type="button" className="ghost-button" onClick={() => void useCosmos.getState().pickDocument(card.id)}>
                      {t.documents.choose}
                    </button>
                  )}
                </div>
              )}
              {/* Le texte se modifie ici comme sur le canevas : c'est le corps de la même carte. Pour une scène
                  de roman, c'est son manuscrit : un aperçu, qu'on écrit dans la carte agrandie. */}
              {type === "scene" && (kind !== "scenario" || headingOf(screenplay?.elements ?? [], card.id) >= 0) ? <DraftPreview card={card} className="is-bible" /> : <BibleBody card={card} />}
              {type === "scene" && !card.page && <SceneStatusPicker card={card} />}
              {type === "scene" && !card.page && <SceneChanges card={card} />}
              {type === "personnage" && (
                <>
                  <CardSheet card={card} startOpen={false} />
                  <CharacterAnswers card={card} />
                  <Gallery card={card} />
                </>
              )}
              {type === "personnage" && <CharacterAssistant card={card} startOpen={assisted === card.id} />}
              {links.length > 0 && (
                <div className="bible-links">
                  <span className="eyebrow">{t.bible.linkedTo}</span>
                  {links.map((e) => {
                    const other = e.source === card.id ? e.target : e.source;
                    return (
                      <span key={e.id} className="chip link-chip">
                        {titleOf(other)}
                        {e.label ? ` · ${String(e.label)}` : ""}
                        <button
                          type="button"
                          className="chip-remove"
                          aria-label={fmt(t.bible.unlink, { title: titleOf(other) })}
                          title={fmt(t.bible.unlink, { title: titleOf(other) })}
                          onClick={() => useCosmos.getState().removeLink(e.id)}
                        >
                          <span aria-hidden="true">×</span>
                        </button>
                      </span>
                    );
                  })}
                </div>
              )}
              {/* En bas de la fiche : dans l'en-tête, il prenait la place du titre sur téléphone. */}
              <button type="button" className="link-button bible-see-canvas" onClick={() => revealCard(card.id)}>
                {t.bible.seeOnCanvas}
              </button>
              {/* Scénario : ses répliques, le reste estompé (filtre par personnage de la vue Scénario). */}
              {card.type === "personnage" && kind === "scenario" && card.title.trim() && (
                <button
                  type="button"
                  className="link-button bible-see-canvas"
                  onClick={() => seeLines(card.title.trim())}
                >
                  {t.bible.seeLines}
                </button>
              )}
              </>
              )}
              </div>
            </article>
          );
  };

  if (!shown && !onPage) {
    return (
      <div className="empty-view">
        <h1>{t.bible.emptyTitle}</h1>
        <p>{t.bible.emptyBody}</p>
        {adders}
      </div>
    );
  }

  return (
    <div className={`bible-frame${tocOpen ? "" : " hide-toc"}`}>
    <EdgeHandle side="left" open={tocOpen} label={t.bible.tocTitle} onClick={toggleToc} />
    <div className="bible" ref={rootRef} onScroll={onScroll}>
      <BibleToc
        sections={sections.map((g) => ({ type: g.type, count: g.cards.length }))}
        counts={counts}
        prefs={prefs}
        setPrefs={setPrefs}
        arranging={arranging}
        setArranging={setArranging}
        onCover={onPage}
        current={shown?.type ?? null}
        openCover={() => {
          closeTocOnPhone();
          setCurrent("projet");
        }}
        goTo={goTo}
        story={
          storyLog.log.length > 0
            ? {
                label: t.changes.story,
                onClick: () => {
                  closeTocOnPhone();
                  if (onPage) setCurrent(sections[0]?.type ?? "personnage");
                  requestAnimationFrame(() => mainRef.current?.querySelector("[data-story]")?.scrollIntoView({ block: "start" }));
                },
              }
            : undefined
        }
      />

      {onCover || !shown ? (
        <section className="bible-main is-cover" aria-label={t.pitch.toc} ref={mainRef}>
          <h1 className="sr-only">{t.pitch.toc}</h1>
          <ProjectCover onOpenTheme={openCard} onAddTheme={() => create("theme")} />
        </section>
      ) : (
        // Toutes les rubriques affichées, l'une sous l'autre : la Bible se lit comme le document exporté
        // (mêmes rubriques, même ordre, mêmes images). Le sommaire mène à chacune.
        <section className="bible-main" aria-label={t.bible.tocTitle} ref={mainRef}>
          <h1 className="sr-only">{t.bible.tocTitle}</h1>
          {sections.map((group, i) => (
            <div key={group.type} className="bible-group" data-group={group.type}>
              {/* Première rubrique d'une partie : son nom, comme dans un dossier (« 3 · Univers »). */}
              {PART_OF[group.type] !== PART_OF[sections[i - 1]?.type ?? group.type] || i === 0 ? (
                <p className={`bible-part-title${PART_OF[group.type] === "pourVous" ? " is-private" : ""}`}>
                  {fmt(t.bible.partTitle, { n: partNumber(PART_OF[group.type]), part: t.bible.parts[PART_OF[group.type]] })}
                </p>
              ) : null}
              <div className="bible-main-head">
                <h2 className="bible-group-title">
                  <span className="card-dot" style={{ background: typeColor(group.type) }} />
                  {types[group.type].section}
                  <span className="toc-count">{group.cards.length}</span>
                </h2>
                <div className="bible-section-tools">
                  {group.cards.length > 0 && !(group.type === "personnage" && relations) && (
                    <>
                      <button
                        type="button"
                        className="link-button"
                        disabled={group.cards.every((c) => foldedIds.has(c.id))}
                        aria-label={fmt(t.bible.foldAllAria, { section: types[group.type].section })}
                        onClick={() => fold(group.cards.map((c) => c.id), true)}
                      >
                        {t.bible.foldAll}
                      </button>
                      <button
                        type="button"
                        className="link-button"
                        disabled={!group.cards.some((c) => foldedIds.has(c.id))}
                        aria-label={fmt(t.bible.unfoldAllAria, { section: types[group.type].section })}
                        onClick={() => fold(group.cards.map((c) => c.id), false)}
                      >
                        {t.bible.unfoldAll}
                      </button>
                    </>
                  )}
                  <button
                    type="button"
                    className="icon-button bible-section-add"
                    aria-label={fmt(t.bible.addType, { type: types[group.type].label })}
                    title={fmt(t.bible.addType, { type: types[group.type].label })}
                    onClick={() => create(group.type)}
                  >
                    <span aria-hidden="true">+</span>
                  </button>
                </div>
                {group.type === "personnage" && group.cards.length > 0 && (
                  <div className="sq-modes" role="group" aria-label={t.relations.tabsAria}>
                    <button type="button" aria-pressed={charView === "cards"} onClick={() => setCharView("cards")}>
                      {t.relations.tabCards}
                    </button>
                    <button type="button" aria-pressed={charView === "map"} onClick={() => setCharView("map")}>
                      {t.relations.tabMap}
                    </button>
                  </div>
                )}
              </div>
              {group.type === "personnage" && relations && group.cards.length > 0 ? (
                <div className="bible-entry">
                  <RelationsMap onOpen={openCard} />
                </div>
              ) : group.cards.length === 0 ? (
                <div className="bible-empty-section">
                  <p className="muted">{t.bible.sectionEmpty}</p>
                  <button type="button" className="ghost-button" onClick={() => create(group.type)}>
                    <span className="card-dot" style={{ background: typeColor(group.type) }} />
                    {fmt(t.bible.addType, { type: types[group.type].label })}
                  </button>
                </div>
              ) : (
                group.cards.map((card) => entry(card, group.type))
              )}
            </div>
          ))}
          <StoryLogSection />
        </section>
      )}
    </div>
    </div>
  );
}

/** Ligne discrète sous le nom d'un personnage : scènes, répliques, temps de parole (roman : scènes où il est cité). */
function StatsLine({ row, script }: { row: CharacterRow; script: boolean }) {
  const t = useT().charStats;
  const lang = useSettings((s) => s.lang);
  if (row.scenes === 0 && row.lines === 0) return null;
  const n = (v: number) => new Intl.NumberFormat(lang).format(v);
  const scenes = row.scenes === 1 ? t.scenesOne : fmt(t.scenesMany, { n: n(row.scenes) });
  const text = script
    ? fmt(t.ficheScript, {
        scenes,
        lines: row.lines === 1 ? t.linesOne : fmt(t.linesMany, { n: n(row.lines) }),
        share: new Intl.NumberFormat(lang, { style: "percent", maximumFractionDigits: 0 }).format(row.share),
      })
    : fmt(t.ficheText, { scenes });
  return <p className="bible-stats-line">{text}</p>;
}

/** Ligne discrète sous le nom d'un lieu : scènes, et pour un décor pages, intérieur ou extérieur, jour ou nuit. */
function PlaceLine({ row, script }: { row: PlaceRow; script: boolean }) {
  const t = useT();
  const lang = useSettings((s) => s.lang);
  if (row.scenes === 0) return null;
  const n = (v: number) => new Intl.NumberFormat(lang, { maximumFractionDigits: 1 }).format(v);
  const parts = [fmt(t.placeStats.ficheIn, { scenes: row.scenes === 1 ? t.charStats.scenesOne : fmt(t.charStats.scenesMany, { n: n(row.scenes) }) })];
  if (script) {
    if (row.pages) parts.push(fmt(t.placeStats.fichePages, { n: n(row.pages) }));
    parts.push(fmt(t.placeStats.settingCell, { int: n(row.int), ext: n(row.ext) }), fmt(t.placeStats.momentCell, { day: n(row.day), night: n(row.night) }));
  }
  return <p className="bible-stats-line">{parts.join(" · ")}</p>;
}
