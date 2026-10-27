// « À ranger · N » du canevas (iPad, ordinateur) : les cartes capturées dans le Carnet du téléphone. Le bouton
// n'apparaît que s'il y en a. « Montrer » met la carte en avant sur le canevas ; la déplacer ou la relier la sort
// de la liste (store), « C'est rangé » aussi. Rien d'autre n'est enregistré que la marque `inbox` des cartes.

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { fmt } from "../i18n";
import { useVocab } from "../vocab";
import { useCosmos } from "../store";
import { typeColor } from "../types";
import { inboxCards } from "../inbox";

export function InboxMenu() {
  const { t, types } = useVocab();
  const b = t.inbox;
  const nodes = useCosmos((s) => s.nodes);
  const waiting = useMemo(() => inboxCards(nodes.map((n) => n.data)), [nodes]);
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelId = useId();

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.stopPropagation();
      setOpen(false);
      buttonRef.current?.focus();
    };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey, true);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey, true);
    };
  }, [open]);

  if (waiting.length === 0) return null;
  const n = waiting.length;
  return (
    <div className="canvas-filter canvas-inbox" ref={rootRef}>
      <button
        ref={buttonRef}
        type="button"
        className="icon-button has-label inbox-button"
        aria-label={fmt(b.buttonAria, { n })}
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        title={fmt(b.buttonAria, { n })}
        onClick={() => setOpen(!open)}
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M4 13l2.5-8h11L20 13v6H4z" />
          <path d="M4 13h4.5l1.5 2.5h4l1.5-2.5H20" />
        </svg>
        <span className="tool-label" aria-hidden="true">{fmt(b.button, { n })}</span>
      </button>
      {open && (
        <div id={panelId} className="canvas-filter-panel inbox-panel" role="dialog" aria-label={b.title}>
          <p className="canvas-filter-title">{b.title}</p>
          <p className="inbox-hint">{b.hint}</p>
          <ul className="inbox-list">
            {waiting.map((card) => {
              const name = card.title.trim() || card.fiche?.url || t.carnet.untitled;
              return (
                <li key={card.id} className="inbox-item">
                  <button type="button" className="inbox-show" aria-label={fmt(b.show, { title: name })} onClick={() => useCosmos.getState().revealCard(card.id)}>
                    <span className="card-dot" style={{ background: typeColor(card.type) }} aria-hidden="true" />
                    <span className="inbox-name">{name}</span>
                    <span className="inbox-kind">{types[card.type].label}</span>
                  </button>
                  <button type="button" className="ghost-button" aria-label={fmt(b.filedAria, { title: name })} onClick={() => useCosmos.getState().fileInbox([card.id])}>
                    {b.filed}
                  </button>
                </li>
              );
            })}
          </ul>
          <button
            type="button"
            className="ghost-button"
            onClick={() => {
              useCosmos.getState().fileInbox(waiting.map((c) => c.id));
              setOpen(false);
            }}
          >
            {b.allFiled}
          </button>
        </div>
      )}
    </div>
  );
}
