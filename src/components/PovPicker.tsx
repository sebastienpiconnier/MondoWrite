// Point de vue d'une scène (1.13.0) : le personnage qui la raconte. Une pastille à côté du statut (même style,
// même menu posé dans <body>), et un champ qui cherche parmi les personnages ou en crée un. Souris, doigt et
// clavier : flèches, Début, Fin, Entrée, Échap. Il vit dans la fiche de la scène (`fiche.pov`, identifiant d'une
// carte Personnage), le même partout : carte, carte agrandie, Bible, Manuscrit.

import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { portalRoot } from "./portalRoot";
import { fmt, useT } from "../i18n";
import { useCosmos } from "../store";
import { useSettings } from "../settings";
import { povOf } from "../character";
import { matchChoices, narratedScenes, povChoices } from "../pov";
import { bookOrder } from "../book";
import { countWords } from "../manuscript";
import { listScenes } from "../screenplay/scenes";
import { foldName } from "../review/names";
import { isTouch } from "../platform";
import { useMediaUrl } from "./useMediaUrl";
import type { CardData } from "../types";

/** Rond du narrateur : son portrait s'il en a un, sinon son initiale. */
export function PovAvatar({ card }: { card: Pick<CardData, "title" | "image"> }) {
  const url = useMediaUrl(card.image);
  const initial = [...card.title.trim()][0]?.toLocaleUpperCase() ?? "?";
  return url ? <img className="pov-avatar" src={url} alt="" aria-hidden="true" /> : <span className="pov-avatar is-initial" aria-hidden="true">{initial}</span>;
}

const NO_NODES: readonly { data: CardData }[] = [];

type Option = { kind: "none" } | { kind: "card"; card: CardData } | { kind: "create"; name: string };

export function PovPicker({ card, className = "" }: { card: CardData; className?: string }) {
  const tt = useT();
  const t = tt.pov;
  const lang = useSettings((s) => s.lang);
  // Léger tant que le menu est fermé (une pastille par carte Scène sur le canevas) : seule la carte du narrateur
  // est suivie ; la liste des cartes ne l'est que menu ouvert.
  const povId = card.fiche?.pov;
  const narratorCard = useCosmos((s) => (povId ? s.nodes.find((n) => n.id === povId)?.data : undefined));
  const narrator = narratorCard ? povOf(card, [narratorCard]) : null;
  const title = card.title.trim() || tt.manuscript.untitled;
  const [open, setOpen] = useState(false);
  const nodes = useCosmos((s) => (open ? s.nodes : NO_NODES));
  const cards = useMemo(() => nodes.map((n) => n.data), [nodes]);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const [place, setPlace] = useState<{ left: number; top: number; up: boolean } | null>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const id = useId();

  const people = useMemo(() => (open ? povChoices(cards, lang) : []), [open, cards, lang]);
  const options = useMemo<Option[]>(() => {
    const name = query.trim();
    const found = matchChoices(people, name);
    const exact = found.some((c) => foldName(c.title) === foldName(name));
    return [
      ...(name ? [] : [{ kind: "none" } as Option]),
      ...found.map((c): Option => ({ kind: "card", card: c })),
      ...(name && !exact ? [{ kind: "create", name } as Option] : []),
    ];
  }, [people, query]);
  const optionId = (i: number) => `${id}-opt-${i}`;

  // Menu posé dans <body> (au-dessus du canevas, à taille normale même dézoomé), sous le bouton ou au-dessus.
  useLayoutEffect(() => {
    if (!open || !buttonRef.current) return;
    const r = buttonRef.current.getBoundingClientRect();
    const up = r.bottom + 320 > window.innerHeight && r.top > 320;
    setPlace({ left: Math.max(8, Math.min(r.left, window.innerWidth - 298)), top: up ? r.top - 6 : r.bottom + 6, up });
  }, [open]);

  // Clavier : le focus va dans le champ. Au doigt, on ne fait pas sortir le clavier virtuel d'office.
  useEffect(() => {
    if (!open || !place) return;
    if (isTouch()) listRef.current?.focus();
    else inputRef.current?.focus();
  }, [open, place]);

  // L'option active reste visible quand la liste défile (longue liste de personnages).
  useEffect(() => {
    listRef.current?.querySelector(`#${CSS.escape(`${id}-opt-${active}`)}`)?.scrollIntoView({ block: "nearest" });
  }, [active, id]);

  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => {
      const target = e.target as Node;
      if (menuRef.current?.contains(target) || buttonRef.current?.contains(target)) return;
      setOpen(false);
    };
    const close = () => setOpen(false);
    document.addEventListener("pointerdown", away, true);
    window.addEventListener("resize", close);
    // En capture : le canevas arrête la molette avant qu'elle ne remonte jusqu'à la fenêtre (sauf dans la liste).
    const wheel = (e: WheelEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) close();
    };
    window.addEventListener("wheel", wheel, { passive: true, capture: true });
    return () => {
      document.removeEventListener("pointerdown", away, true);
      window.removeEventListener("resize", close);
      window.removeEventListener("wheel", wheel, { capture: true });
    };
  }, [open]);

  const show = () => {
    setQuery("");
    setActive(0);
    setOpen(true);
  };
  const close = () => {
    setOpen(false);
    buttonRef.current?.focus();
  };
  const choose = (o: Option | undefined) => {
    if (!o) return;
    const s = useCosmos.getState();
    if (o.kind === "none") {
      if (card.fiche?.pov) s.setFiche(card.id, "pov", "");
    } else if (o.kind === "card") {
      if (card.fiche?.pov !== o.card.id) s.setFiche(card.id, "pov", o.card.id);
    } else s.createPov(card.id, o.name);
    close();
  };

  const onMenuKey = (e: React.KeyboardEvent) => {
    const last = options.length - 1;
    const go = (i: number) => {
      e.preventDefault();
      setActive(i);
    };
    if (e.key === "ArrowDown") go(active >= last ? 0 : active + 1);
    else if (e.key === "ArrowUp") go(active <= 0 ? last : active - 1);
    else if ((e.key === "Home" || e.key === "End") && e.target !== inputRef.current) go(e.key === "Home" ? 0 : last);
    else if (e.key === "Escape" || e.key === "Tab") {
      if (e.key === "Escape") e.preventDefault();
      e.stopPropagation();
      close();
    } else if (e.key === "Enter" || (e.key === " " && e.target !== inputRef.current)) {
      e.preventDefault();
      choose(options[active]);
    }
  };

  const label = (o: Option) => (o.kind === "none" ? t.none : o.kind === "card" ? o.card.title.trim() : fmt(t.create, { name: o.name }));
  const selected = (o: Option) => (o.kind === "none" ? !narrator : o.kind === "card" && o.card.id === narrator?.id);

  return (
    <span className={`status-picker pov-picker nodrag${narrator ? " is-set" : ""} ${className}`}>
      <button
        ref={buttonRef}
        type="button"
        className="status-picker-button"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={`${fmt(t.chooseFor, { title })} : ${narrator ? narrator.title.trim() : t.none}`}
        onClick={() => (open ? setOpen(false) : show())}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown" || e.key === "ArrowUp") {
            e.preventDefault();
            show();
          }
        }}
      >
        {narrator ? <PovAvatar card={narrator} /> : <PovIcon />}
        <span className="pov-name">{narrator ? narrator.title.trim() : t.empty}</span>
        <svg className="status-chevron" width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
          <path d="M2 3.5 5 6.5 8 3.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      {open &&
        place &&
        createPortal(
          <div
            ref={menuRef}
            className={`status-menu pov-menu${place.up ? " is-up" : ""}`}
            role="dialog"
            aria-label={fmt(t.chooseFor, { title })}
            style={{ left: place.left, top: place.top }}
            onKeyDown={onMenuKey}
          >
            <input
              ref={inputRef}
              type="text"
              className="pov-search"
              role="combobox"
              aria-expanded="true"
              aria-controls={`${id}-list`}
              aria-autocomplete="list"
              aria-activedescendant={options.length > 0 ? optionId(active) : undefined}
              aria-label={t.search}
              placeholder={t.search}
              autoComplete="off"
              spellCheck={false}
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setActive(0);
              }}
            />
            <div
              ref={listRef}
              id={`${id}-list`}
              className="pov-list"
              role="listbox"
              tabIndex={-1}
              aria-label={t.label}
              aria-activedescendant={options.length > 0 ? optionId(active) : undefined}
            >
              {options.map((o, i) => (
                <div
                  key={o.kind === "card" ? o.card.id : o.kind}
                  id={optionId(i)}
                  role="option"
                  aria-selected={selected(o)}
                  className={`status-option pov-option${i === active ? " is-active" : ""}${o.kind === "create" ? " is-create" : ""}`}
                  onPointerDown={(e) => e.preventDefault()}
                  onMouseEnter={() => setActive(i)}
                  onClick={() => choose(o)}
                >
                  {o.kind === "card" ? <PovAvatar card={o.card} /> : o.kind === "create" ? <span className="pov-avatar is-plus" aria-hidden="true">+</span> : <PovIcon />}
                  <span>{label(o)}</span>
                  {selected(o) && (
                    <svg className="status-check" width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
                      <path d="M2.5 6.2 5 8.5 9.5 3.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  )}
                </div>
              ))}
            </div>
            {people.length === 0 && !query.trim() && <p className="pov-hint">{t.noCharacter}</p>}
          </div>,
          portalRoot(buttonRef.current),
        )}
    </span>
  );
}

/** Œil : la scène n'a pas encore de point de vue. */
function PovIcon() {
  return (
    <svg className="pov-avatar is-icon" width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
      <path d="M1.5 8s2.4-4.5 6.5-4.5S14.5 8 14.5 8 12.1 12.5 8 12.5 1.5 8 1.5 8Z" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
      <circle cx="8" cy="8" r="2" fill="none" stroke="currentColor" strokeWidth="1.3" />
    </svg>
  );
}

/**
 * Fiche d'un personnage dans la Bible : « Narrateur de 5 scènes · 8 200 mots », qui déplie la liste de ses scènes
 * dans l'ordre du livre (ou du scénario) ; une scène s'ouvre dans le Manuscrit (ou le Scénario). Rien sans scène.
 */
export function PovScenes({ card }: { card: CardData }) {
  const t = useT();
  const lang = useSettings((s) => s.lang);
  const nodes = useCosmos((s) => s.nodes);
  const plan = useCosmos((s) => s.plan);
  const manuscript = useCosmos((s) => s.manuscript);
  const screenplay = useCosmos((s) => (s.kind === "scenario" ? s.screenplay : null));
  const [open, setOpen] = useState(false);
  const listId = useId();
  const order = useMemo(
    () => (screenplay ? listScenes(screenplay.elements).flatMap((s) => (s.cardId ? [s.cardId] : [])) : bookOrder(nodes, plan)),
    [screenplay, nodes, plan],
  );
  const scenes = useMemo(() => narratedScenes(card.id, nodes.map((n) => n.data), order), [card.id, nodes, order]);
  if (scenes.length === 0) return null;
  const num = new Intl.NumberFormat(lang);
  const words = screenplay ? 0 : scenes.reduce((sum, s) => sum + countWords(manuscript[s.id]), 0);
  const head = fmt(scenes.length === 1 ? t.pov.narratorOne : t.pov.narratorMany, { n: num.format(scenes.length) });
  return (
    <div className="pov-scenes">
      <button type="button" className="link-button pov-scenes-toggle" aria-expanded={open} aria-controls={listId} onClick={() => setOpen(!open)}>
        <svg className="pov-avatar is-icon" width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
          <path d="M1.5 8s2.4-4.5 6.5-4.5S14.5 8 14.5 8 12.1 12.5 8 12.5 1.5 8 1.5 8Z" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
          <circle cx="8" cy="8" r="2" fill="none" stroke="currentColor" strokeWidth="1.3" />
        </svg>
        <span>
          {head}
          {words > 0 && ` · ${fmt(t.pov.words, { n: num.format(words) })}`}
        </span>
        <span className="sr-only">{open ? t.pov.hideScenes : t.pov.showScenes}</span>
        <span aria-hidden="true" className={`sheet-chevron disclosure${open ? " is-open" : ""}`} />
      </button>
      {open && (
        <ol id={listId} className="pov-scenes-list">
          {scenes.map((s) => {
            const name = s.title.trim() || t.manuscript.untitled;
            return (
              <li key={s.id}>
                <button type="button" className="link-button" aria-label={fmt(t.pov.openScene, { title: name })} onClick={() => useCosmos.getState().openInManuscript(s.id)}>
                  {name}
                </button>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
