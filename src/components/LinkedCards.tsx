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

function linksKey(s: CosmosState, id: string, type: CardType): string {
  const typeOf = typesOf(s.nodes);
  const out: string[] = [];
  for (const e of s.edges) {
    const other = e.source === id ? e.target : e.target === id ? e.source : null;
    if (other && typeOf.get(other) === type) out.push(`${e.id}>${other}`);
  }
  return out.join(",");
}

function useLinks(id: string, type: CardType) {
  const key = useCosmos((s) => linksKey(s, id, type));
  return useMemo(() => (key ? key.split(",").map((pair) => { const [edge, card] = pair.split(">"); return { edge, card }; }) : []), [key]);
}

/** Titres des cartes de ce type, en une chaîne stable (« id\ttitre\n… »). */
function titlesKey(s: CosmosState, type: CardType): string {
  return s.nodes
    .filter((n) => n.data.type === type && !n.data.page)
    .map((n) => `${n.id}\t${n.data.title.trim()}`)
    .join("\n");
}

function useTitles(type: CardType): Map<string, string> {
  const key = useCosmos((s) => titlesKey(s, type));
  return useMemo(() => new Map(key ? key.split("\n").map((l) => l.split("\t") as [string, string]) : []), [key]);
}

/** Une rangée : intitulé, pastilles, et le « + » qui ouvre la recherche. */
function LinkRow({ id, type, label, ordered, onOpen, canCreate = true }: { id: string; type: CardType; label: string; ordered?: string[]; onOpen: (card: string) => void; canCreate?: boolean }) {
  const t = useT().sceneLinks;
  const links = useLinks(id, type);
  const titles = useTitles(type);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const listId = useId();
  const plusRef = useRef<HTMLButtonElement>(null);
  const untitled = useT().sceneLinks.untitledScene;
  const name = (card: string) => titles.get(card) || (type === "scene" ? untitled : "…");

  const shown = useMemo(() => {
    if (!ordered) return [...links].sort((a, b) => name(a.card).localeCompare(name(b.card)));
    const rank = new Map(ordered.map((x, i) => [x, i]));
    return [...links].sort((a, b) => (rank.get(a.card) ?? 1e9) - (rank.get(b.card) ?? 1e9));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [links, ordered, titles]);

  const linked = new Set(links.map((l) => l.card));
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
      {shown.length === 0 && !open ? (
        <p className="sp-empty">{t.none}</p>
      ) : (
        <ul className="ms-chips">
          {shown.map(({ edge, card }) => (
            <li key={edge} className="chip link-pill">
              <button type="button" className="link-chip-open" onClick={() => onOpen(card)}>
                <span className="card-dot" aria-hidden="true" />
                {name(card)}
              </button>
              <button type="button" className="chip-remove" aria-label={fmt(t.unlink, { title: name(card) })} title={fmt(t.unlink, { title: name(card) })} onClick={() => useCosmos.getState().removeLink(edge)}>
                ×
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
export function SceneLinks({ id }: { id: string }) {
  const { types } = useVocab();
  const st = useCosmos.getState;
  const open = (card: string) => st().openInBible(card);
  return (
    <section className="sp-box scene-links" aria-label={useT().sceneLinks.title}>
      <LinkRow id={id} type="personnage" label={types.personnage.section} onOpen={open} />
      <LinkRow id={id} type="intrigue" label={types.intrigue.section} onOpen={open} />
      <LinkRow id={id} type="lieu" label={types.lieu.section} onOpen={open} />
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

/** Les scènes d'une carte (Intrigue, Personnage, Lieu, Objet, Thème…), dans l'ordre du récit. */
export function CardScenes({ id, type }: { id: string; type: CardType }) {
  const t = useT();
  const { types } = useVocab();
  const interactive = useInteractive();
  const order = useStoryOrder();
  const count = useLinks(id, "scene").length;
  if (type === "scene" || type === "idee" || type === "question" || type === "image" || type === "lien" || type === "document") return null;
  return (
    <section className="sp-box card-scenes">
      <LinkRow id={id} type="scene" label={types.scene.section} ordered={order} canCreate={false} onOpen={(scene) => { useCosmos.getState().setDialog(null); useCosmos.getState().openInManuscript(scene); }} />
      {count > 0 && (
        <p className="sp-detail card-scenes-foot">
          {count === 1 ? t.sceneLinks.appearsOne : fmt(t.sceneLinks.appearsMany, { n: count })}
          {canFollow(type) && !interactive && (
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
