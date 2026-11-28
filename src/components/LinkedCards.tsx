// Relier sans tirer de fil (#137, #138). Une rangée de pastilles : les cartes d'un type reliées à une carte par un
// fil, dans un sens ou l'autre, et un « + » qui ouvre une recherche. Choisir une carte tire le fil (le même que sur
// le canevas) ; un nom qui n'existe pas encore crée la carte et la relie, en une étape ; le × d'une pastille délie.
// Rien n'est gardé à part : ce sont les fils du projet.
// - SceneLinks : onglet Scène du Manuscrit et du Scénario, carte Scène agrandie, Bible (Personnages, Intrigues,
//   Lieu ou Décor de la scène).
// - CardScenes : fiche d'une Intrigue, d'un Personnage, d'un Lieu… (carte agrandie, Bible) : ses scènes, dans
//   l'ordre du récit, avec « Lire ces scènes ».

import { useId, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { fmt, useT } from "../i18n";
import { useVocab } from "../vocab";
import { useCosmos, type CosmosState } from "../store";
import { typeColor, type CardType } from "../types";
import { foldName } from "../review/names";
import { junctionOrder } from "../projectJunctions";
import { canFollow } from "../threadFilter";
import { useInteractive } from "../interactive/useInteractive";
import { plotColors } from "../plotColors";
import { listScenes, sceneCharacters } from "../screenplay/scenes";
import { titleCase } from "../screenplay/editor/autocomplete";
import { useSettings } from "../settings";

const MAX_SHOWN = 40;

// Un bouton de la souris (ou un doigt) est-il enfoncé ? Lu quand la recherche perd le focus.
let pointerDown = false;
if (typeof window !== "undefined") {
  window.addEventListener("pointerdown", () => (pointerDown = true), true);
  window.addEventListener("pointerup", () => window.setTimeout(() => (pointerDown = false)), true);
  window.addEventListener("pointercancel", () => (pointerDown = false), true);
}

/** Fils entre `id` et une carte de ce type, en une chaîne stable (« fil>carte,… ») : la rangée ne se redessine que
 *  si ses liens changent. */
// Type de chaque carte, gardé tant que la liste des cartes ne change pas : une Bible montre beaucoup de rangées,
// toutes relues à chaque changement du store.
const typesCache = new WeakMap<CosmosState["nodes"], Map<string, CardType>>();
function typesOf(nodes: CosmosState["nodes"]): Map<string, CardType> {
  let map = typesCache.get(nodes);
  if (!map) typesCache.set(nodes, (map = new Map(nodes.map((n) => [n.id, n.data.type]))));
  return map;
}

function linksKey(s: CosmosState, id: string, types: readonly CardType[]): string {
  const typeOf = typesOf(s.nodes);
  const out: string[] = [];
  for (const e of s.edges) {
    const other = e.source === id ? e.target : e.target === id ? e.source : null;
    const type = other ? typeOf.get(other) : undefined;
    if (other && type && types.includes(type)) out.push(`${e.id}>${other}`);
  }
  return out.join(",");
}

function useLinks(id: string, types: readonly CardType[]) {
  const key = useCosmos((s) => linksKey(s, id, types));
  return useMemo(() => (key ? key.split(",").map((pair) => { const [edge, card] = pair.split(">"); return { edge, card }; }) : []), [key]);
}

/** Titres des cartes de ce type, en une chaîne stable (« id\ttitre\n… »). */
function titlesKey(s: CosmosState, types: readonly CardType[]): string {
  return s.nodes
    .filter((n) => types.includes(n.data.type) && !n.data.page)
    .map((n) => `${n.id}\t${n.data.title.trim()}`)
    .join("\n");
}

function useTitles(types: readonly CardType[]): Map<string, string> {
  const key = useCosmos((s) => titlesKey(s, types));
  return useMemo(() => new Map(key ? key.split("\n").map((l) => l.split("\t") as [string, string]) : []), [key]);
}

/** Une rangée : intitulé, pastilles, et le « + » qui ouvre la recherche. */
/** Personnage qui parle dans la scène (Scénario) : son nom tel qu'écrit et son nombre de répliques. */
export interface Speaker {
  name: string;
  lines: number;
}

// `also` : d'autres types montrés et proposés dans la même rangée (#170 : thèmes et idées) ; `type` est celui des
// cartes créées depuis la rangée. Les tableaux sont constants (hors du rendu) pour que les sélecteurs restent stables.
const NO_TYPES: readonly CardType[] = [];
const rowTypes = new Map<string, readonly CardType[]>();
const typesFor = (type: CardType, also: readonly CardType[]) => {
  const key = [type, ...also].join(",");
  let list = rowTypes.get(key);
  if (!list) rowTypes.set(key, (list = [type, ...also]));
  return list;
};

function LinkRow({ id, type, also = NO_TYPES, label, ordered, onOpen, canCreate = true, speakers }: { id: string; type: CardType; also?: readonly CardType[]; label: string; ordered?: string[]; onOpen: (card: string) => void; canCreate?: boolean; speakers?: Speaker[] }) {
  const t = useT().sceneLinks;
  const types = typesFor(type, also);
  const links = useLinks(id, types);
  const titles = useTitles(types);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const listId = useId();
  const plusRef = useRef<HTMLButtonElement>(null);
  const untitled = useT().sceneLinks.untitledScene;
  const name = (card: string) => titles.get(card) || (type === "scene" ? untitled : "…");

  // Intrigues d'une scène (#143) : l'étoile choisit la principale, qui passe en tête (sa couleur colore la scène).
  const mainPlot = useCosmos((s) => (type === "intrigue" ? s.nodes.find((n) => n.id === id)?.data.fiche?.intrigue : undefined));
  const withStar = type === "intrigue" && links.length > 1;
  const shown = useMemo(() => {
    if (type === "intrigue") {
      // Ordre des fils, l'intrigue principale d'abord (sinon la première reliée l'est).
      return mainPlot && links.some((l) => l.card === mainPlot) ? [...links.filter((l) => l.card === mainPlot), ...links.filter((l) => l.card !== mainPlot)] : links;
    }
    if (!ordered) return [...links].sort((a, b) => name(a.card).localeCompare(name(b.card)));
    const rank = new Map(ordered.map((x, i) => [x, i]));
    return [...links].sort((a, b) => (rank.get(a.card) ?? 1e9) - (rank.get(b.card) ?? 1e9));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [links, ordered, titles, mainPlot, type]);

  const linked = new Set(links.map((l) => l.card));
  // Couleur de chaque intrigue (#143) sur sa pastille.
  const plots = useCosmos((s) => (type === "intrigue" ? plotColors(s.nodes, s.edges).plots : null));
  // Personnages (Scénario) : une seule liste pour ceux qu'on a reliés et ceux qui parlent. Un personnage qui parle
  // sans être relié a sa pastille en pointillé, « + » le relie (et crée sa carte s'il n'en a pas).
  const speakerOf = (card: string) => {
    const full = foldName(name(card));
    const first = foldName(name(card).split(/\s+/)[0] ?? "");
    return speakers?.find((sp) => foldName(sp.name) === full) ?? speakers?.find((sp) => foldName(sp.name) === first);
  };
  const lineText = (n: number) => (n === 1 ? t.linesOne : fmt(t.linesMany, { n }));
  const loose = (speakers ?? []).filter((sp) => !shown.some(({ card }) => speakerOf(card) === sp));
  const linkSpeaker = (sp: Speaker) => {
    const st = useCosmos.getState();
    const card = [...titles.entries()].find(([, title]) => foldName(title) === foldName(sp.name) || foldName(title.split(/\s+/)[0] ?? "") === foldName(sp.name))?.[0];
    if (card) st.linkCards(id, card, "");
    else st.addLinkedCard(id, type, titleCase(sp.name, useSettings.getState().lang));
  };
  const wanted = foldName(query.trim());
  const candidates = [...titles.keys()]
    .filter((c) => c !== id && !linked.has(c) && (!wanted || foldName(name(c)).includes(wanted)))
    .sort((a, b) => (ordered ? (ordered.indexOf(a) + 1 || 1e9) - (ordered.indexOf(b) + 1 || 1e9) : name(a).localeCompare(name(b))))
    .slice(0, MAX_SHOWN);
  const exact = [...titles.values()].some((x) => foldName(x) === wanted);
  const offerCreate = canCreate && !!query.trim() && !exact;
  const options: ({ kind: "card"; card: string } | { kind: "create" })[] = [...candidates.map((card) => ({ kind: "card" as const, card })), ...(offerCreate ? [{ kind: "create" as const }] : [])];

  const close = () => {
    setOpen(false);
    setQuery("");
    setActive(0);
    plusRef.current?.focus();
  };
  const choose = (k: number) => {
    const o = options[k];
    if (!o) return;
    const st = useCosmos.getState();
    if (o.kind === "card") st.linkCards(id, o.card, "");
    else st.addLinkedCard(id, type, query.trim());
    setQuery("");
    setActive(0);
  };
  const onKey = (e: ReactKeyboardEvent) => {
    if (e.key === "ArrowDown") setActive((a) => Math.min(a + 1, options.length - 1));
    else if (e.key === "ArrowUp") setActive((a) => Math.max(a - 1, 0));
    else if (e.key === "Enter") choose(active);
    else if (e.key === "Escape") {
      e.stopPropagation();
      close();
    } else return;
    e.preventDefault();
  };

  return (
    <div className="link-row" style={{ ["--type" as string]: typeColor(type) }}>
      <div className="link-row-head">
        <span className="eyebrow">{label}</span>
        <button
          ref={plusRef}
          type="button"
          className="icon-button link-row-add"
          aria-label={fmt(t.add, { section: label })}
          title={fmt(t.add, { section: label })}
          aria-expanded={open}
          onClick={() => (open ? close() : setOpen(true))}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
            <path d="M12 5v14M5 12h14" />
          </svg>
        </button>
      </div>
      {shown.length === 0 && loose.length === 0 && !open ? (
        <p className="sp-empty">{t.none}</p>
      ) : (
        <ul className="ms-chips">
          {shown.map(({ edge, card }, k) => (
            <li key={edge} className="chip link-pill">
              {withStar && (
                <button
                  type="button"
                  className="link-star"
                  aria-pressed={k === 0}
                  aria-label={fmt(k === 0 ? t.mainPlot : t.makeMainPlot, { title: name(card) })}
                  title={fmt(k === 0 ? t.mainPlot : t.makeMainPlot, { title: name(card) })}
                  onClick={() => k !== 0 && useCosmos.getState().setFiche(id, "intrigue", card)}
                >
                  {k === 0 ? "★" : "☆"}
                </button>
              )}
              <button type="button" className="link-chip-open" onClick={() => onOpen(card)}>
                <span className="card-dot" aria-hidden="true" style={plots?.get(card) ? { background: `var(--plot-${plots.get(card)})` } : undefined} />
                {name(card)}
                {speakers && speakerOf(card) && <span className="link-lines"> · {lineText(speakerOf(card)!.lines)}</span>}
              </button>
              <button type="button" className="chip-remove" aria-label={fmt(t.unlink, { title: name(card) })} title={fmt(t.unlink, { title: name(card) })} onClick={() => useCosmos.getState().removeLink(edge)}>
                ×
              </button>
            </li>
          ))}
          {loose.map((sp) => (
            <li key={`speaker-${sp.name}`} className="chip link-pill is-loose">
              <span className="link-chip-open">
                {sp.name}
                <span className="link-lines"> · {lineText(sp.lines)}</span>
              </span>
              <button type="button" className="chip-remove" aria-label={fmt(t.linkSpeaker, { title: sp.name })} title={fmt(t.linkSpeaker, { title: sp.name })} onClick={() => linkSpeaker(sp)}>
                +
              </button>
            </li>
          ))}
        </ul>
      )}
      {open && (
        <div className="link-picker">
          <input
            // La recherche s'ouvre pour qu'on tape tout de suite (comme le menu des mentions).
            // eslint-disable-next-line jsx-a11y/no-autofocus
            autoFocus
            type="text"
            role="combobox"
            aria-expanded="true"
            aria-controls={listId}
            aria-activedescendant={options.length ? `${listId}-${active}` : undefined}
            aria-label={fmt(t.add, { section: label })}
            placeholder={canCreate ? t.search : t.searchScenes}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setActive(0);
            }}
            onKeyDown={onKey}
            onBlur={(e) => {
              // On sort de la recherche (Tab, clic ailleurs) : elle se referme ; un clic dans sa liste la garde. Au
              // clic, seulement une fois le clic fini : refermée tout de suite, elle faisait remonter ce qui la
              // suit, et le bouton visé (le « + » de la rangée d'après) n'était plus sous le pointeur.
              if (e.currentTarget.parentElement?.contains(e.relatedTarget as Node | null)) return;
              const shut = () => {
                setOpen(false);
                setQuery("");
              };
              if (pointerDown) window.addEventListener("click", () => window.setTimeout(shut), { once: true });
              else shut();
            }}
          />
          <ul id={listId} role="listbox" aria-label={label} className="link-picker-list">
            {options.length === 0 && <li className="sp-empty">{t.nothing}</li>}
            {options.map((o, k) => (
              <li
                key={o.kind === "card" ? o.card : "create"}
                id={`${listId}-${k}`}
                role="option"
                aria-selected={k === active}
                className={k === active ? "is-active" : ""}
                // Garder le focus dans le champ : on peut enchaîner plusieurs choix.
                onPointerDown={(e) => e.preventDefault()}
                onClick={() => choose(k)}
              >
                {o.kind === "card" ? name(o.card) : fmt(t.create, { title: query.trim() })}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

/** Personnages, intrigues et lieu (décor) d'une scène. */
export function SceneLinks({ id, speakers: given, compact }: { id: string; speakers?: Speaker[]; compact?: boolean }) {
  const { types } = useVocab();
  // Scénario : ceux qui parlent dans la scène, lus dans le texte (carte agrandie, Bible) quand la vue ne les donne pas.
  const screenplay = useCosmos((s) => (s.kind === "scenario" && !given ? s.screenplay : null));
  const speakers = useMemo(() => {
    if (given || !screenplay) return given;
    const scene = listScenes(screenplay.elements).find((sc) => sc.cardId === id);
    return scene ? sceneCharacters(screenplay.elements, scene).map((c) => ({ name: c.name, lines: c.lines })) : undefined;
  }, [given, screenplay, id]);
  const t = useT().sceneLinks;
  const st = useCosmos.getState;
  const open = (card: string) => st().openInBible(card);
  return (
    <section className={`sp-box scene-links${compact ? " is-compact" : ""}`} aria-label={t.title}>
      <LinkRow id={id} type="personnage" label={types.personnage.section} onOpen={open} speakers={speakers} />
      <LinkRow id={id} type="intrigue" label={types.intrigue.section} onOpen={open} />
      <LinkRow id={id} type="lieu" label={types.lieu.section} onOpen={open} />
      {/* Étiquettes (#170) : thèmes et idées reliés ; un nom nouveau crée un Thème. */}
      <LinkRow id={id} type="theme" also={TAG_TYPES} label={t.tags} onOpen={open} />
    </section>
  );
}

/** Ordre du récit, en une chaîne stable, recalculé seulement quand cartes, plan ou scénario changent. */
let orderCache: { nodes: unknown; plan: unknown; screenplay: unknown; kind: unknown; key: string } | null = null;
function storyKey(s: CosmosState): string {
  const c = orderCache;
  if (c && c.nodes === s.nodes && c.plan === s.plan && c.screenplay === s.screenplay && c.kind === s.kind) return c.key;
  const key = junctionOrder(s.kind, s.nodes, s.plan, s.screenplay).join(",");
  orderCache = { nodes: s.nodes, plan: s.plan, screenplay: s.screenplay, kind: s.kind, key };
  return key;
}
function useStoryOrder(): string[] {
  const key = useCosmos(storyKey);
  return useMemo(() => (key ? key.split(",") : []), [key]);
}

const SCENE_ONLY: readonly CardType[] = ["scene"];
const TAG_TYPES: readonly CardType[] = ["idee"];

/** Les scènes d'une carte (Intrigue, Personnage, Lieu, Objet, Thème, Idée…), dans l'ordre du récit. */
export function CardScenes({ id, type }: { id: string; type: CardType }) {
  const t = useT();
  const { types } = useVocab();
  const interactive = useInteractive();
  const order = useStoryOrder();
  const count = useLinks(id, SCENE_ONLY).length;
  // Une Idée reliée à des scènes sert d'étiquette (#170) : elle montre ses scènes comme un Thème.
  if (type === "scene" || type === "question" || type === "image" || type === "lien" || type === "document") return null;
  return (
    <section className="sp-box card-scenes">
      <LinkRow id={id} type="scene" label={types.scene.section} ordered={order} canCreate={false} onOpen={(scene) => { useCosmos.getState().setDialog(null); useCosmos.getState().openInManuscript(scene); }} />
      {count > 0 && (
        <p className="sp-detail card-scenes-foot">
          {count === 1 ? t.sceneLinks.appearsOne : fmt(t.sceneLinks.appearsMany, { n: count })}
          {(canFollow(type) || type === "idee") && !interactive && (
            <>
              {" · "}
              <button type="button" className="link-button" onClick={() => { useCosmos.getState().setDialog(null); useCosmos.getState().readThread(id); }}>
                {t.thread.menu}
              </button>
            </>
          )}
        </p>
      )}
    </section>
  );
}
