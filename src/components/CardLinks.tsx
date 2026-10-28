// Au pied d'une carte du canevas : « Relié à : Inès, Le phare ». Un nom centre le canevas sur cette carte.
// Fils masqués (réglage du projet), « Relié à » devient un bouton qui affiche ou masque les fils de la carte.
// Fils visibles, une ligne discrète, repliée (coupée au bout) : la toucher la déplie.

import { Fragment, useState } from "react";
import { useCosmos } from "../store";
import { fmt } from "../i18n";
import { useVocab } from "../vocab";
import { fromLinkedKey, linkedCards, linkedKey } from "../cardLinks";
import { typeColor, type CardType } from "../types";

/** Noms montrés avant « N de plus ». */
const FIRST = 4;

export function CardLinks({ id }: { id: string }) {
  const { t, types } = useVocab();
  // Une chaîne : la carte ne se redessine que si ses voisines (ou leurs titres) changent.
  const key = useCosmos((s) => linkedKey(linkedCards(s.nodes, (n) => n.data, s.edges).get(id)));
  const hideWires = useCosmos((s) => s.hideWires);
  const shown = useCosmos((s) => s.wiresShown.includes(id));
  const [all, setAll] = useState(false);
  // Fils visibles : une ligne repliée ; la toucher déplie la liste, où chaque nom se touche.
  const [open, setOpen] = useState(false);
  if (!key) return null;
  const links = fromLinkedKey(key);
  const nameOf = (l: (typeof links)[number]) => l.title || types[l.type as CardType]?.label || l.type;
  if (!hideWires && !open)
    return (
      <button type="button" className="card-links card-links-line nodrag" aria-expanded={false} title={links.map(nameOf).join(", ")} onClick={() => setOpen(true)}>
        <span className="card-links-label">{t.toile.linkedTo}</span> {links.map(nameOf).join(", ")}
      </button>
    );
  // Liste dépliée : les premiers noms, puis « N de plus ».
  const visible = all ? links : links.slice(0, FIRST);
  const rest = links.length - visible.length;

  return (
    <div className="card-links is-open nodrag">
      {hideWires ? (
        <button
          type="button"
          className={`card-links-toggle${shown ? " is-on" : ""}`}
          aria-pressed={shown}
          title={shown ? t.toile.hideCardWires : t.toile.showCardWires}
          onClick={() => useCosmos.getState().toggleCardWires(id)}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
            <circle cx="5.5" cy="7" r="2.5" />
            <circle cx="18.5" cy="17" r="2.5" />
            <path d="M8 7.5c5 0 3 9 8 9" strokeDasharray={shown ? undefined : "2 3"} />
          </svg>
          {t.toile.linkedTo}
        </button>
      ) : (
        <button type="button" className="card-links-label card-link" aria-expanded={true} onClick={() => setOpen(false)}>
          {t.toile.linkedTo}
        </button>
      )}{" "}
      {visible.map((l, i) => {
        const title = nameOf(l);
        return (
          <Fragment key={l.id}>
            {i > 0 && <span aria-hidden="true">, </span>}
            <button
              type="button"
              className="card-link"
              style={{ ["--type" as string]: typeColor(l.type as CardType) }}
              title={fmt(t.toile.goToLinked, { title })}
              onClick={() => useCosmos.getState().revealCard(l.id)}
            >
              {title}
            </button>
          </Fragment>
        );
      })}
      {rest > 0 && (
        <button type="button" className="card-link is-more" aria-expanded={false} onClick={() => setAll(true)}>
          {fmt(t.toile.moreLinks, { n: rest })}
        </button>
      )}
    </div>
  );
}
