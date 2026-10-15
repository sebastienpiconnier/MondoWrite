// Statut d'une scène (brouillon, à revoir, terminée) : une pastille de couleur et un petit menu à notre style
// (le menu natif d'un <select> ignore le thème sous Windows). Souris, doigt et clavier : flèches, Début, Fin,
// Entrée, Échap. Il vit dans la fiche de la carte (`fiche.statut`), le même partout : carte, carte agrandie,
// Bible, Plan, séquencier, Manuscrit.

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { fmt, useT } from "../i18n";
import { useCosmos } from "../store";
import { SCENE_STATUSES, sceneStatus } from "../character";
import type { CardData } from "../types";

/** Pastille seule, pour les listes de scènes. */
export function StatusDot({ card }: { card: CardData }) {
  const t = useT().sceneStatus;
  const status = sceneStatus(card);
  if (!status) return null;
  return <span className={`status-dot is-${status}`} title={t.values[status]} aria-label={t.values[status]} role="img" />;
}

const CHOICES = ["", ...SCENE_STATUSES] as const;

export function SceneStatusPicker({ card, className = "" }: { card: CardData; className?: string }) {
  const tt = useT();
  const t = tt.sceneStatus;
  const status = sceneStatus(card);
  const title = card.title.trim() || tt.manuscript.untitled;
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [place, setPlace] = useState<{ left: number; top: number; up: boolean } | null>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const label = (s: string) => (s ? t.values[s as (typeof SCENE_STATUSES)[number]] : t.none);

  // Le menu est posé dans <body> (au-dessus du canevas et de ses cartes, à taille normale même dézoomé),
  // sous le bouton, ou au-dessus s'il manque de place en bas.
  useLayoutEffect(() => {
    if (!open || !buttonRef.current) return;
    const r = buttonRef.current.getBoundingClientRect();
    const up = r.bottom + 180 > window.innerHeight && r.top > 180;
    setPlace({ left: Math.min(r.left, window.innerWidth - 200), top: up ? r.top - 6 : r.bottom + 6, up });
  }, [open]);

  useEffect(() => {
    if (!open) return;
    menuRef.current?.querySelectorAll<HTMLElement>("[role=option]")[active]?.focus();
  }, [open, active, place]);

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
    window.addEventListener("wheel", close, { passive: true });
    return () => {
      document.removeEventListener("pointerdown", away, true);
      window.removeEventListener("resize", close);
      window.removeEventListener("wheel", close);
    };
  }, [open]);

  const show = () => {
    setActive(Math.max(0, CHOICES.indexOf(status ?? "")));
    setOpen(true);
  };
  const choose = (value: string) => {
    if (value !== (status ?? "")) useCosmos.getState().setFiche(card.id, "statut", value);
    setOpen(false);
    buttonRef.current?.focus();
  };

  const onMenuKey = (e: React.KeyboardEvent) => {
    const last = CHOICES.length - 1;
    const go = (i: number) => {
      e.preventDefault();
      setActive(i);
    };
    if (e.key === "ArrowDown") go(active >= last ? 0 : active + 1);
    else if (e.key === "ArrowUp") go(active <= 0 ? last : active - 1);
    else if (e.key === "Home") go(0);
    else if (e.key === "End") go(last);
    else if (e.key === "Escape" || e.key === "Tab") {
      if (e.key === "Escape") e.preventDefault();
      e.stopPropagation();
      setOpen(false);
      buttonRef.current?.focus();
    } else if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      choose(CHOICES[active]);
    }
  };

  return (
    <span className={`status-picker nodrag${status ? ` is-${status}` : ""} ${className}`}>
      <button
        ref={buttonRef}
        type="button"
        className="status-picker-button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={`${fmt(t.chooseFor, { title })} : ${label(status ?? "")}`}
        onClick={() => (open ? setOpen(false) : show())}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown" || e.key === "ArrowUp") {
            e.preventDefault();
            show();
          }
        }}
      >
        <span className="status-dot" aria-hidden="true" />
        <span>{label(status ?? "")}</span>
        <svg className="status-chevron" width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
          <path d="M2 3.5 5 6.5 8 3.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      {open &&
        place &&
        createPortal(
          <div
            ref={menuRef}
            className={`status-menu${place.up ? " is-up" : ""}`}
            role="listbox"
            aria-label={fmt(t.chooseFor, { title })}
            style={{ left: place.left, top: place.top }}
            onKeyDown={onMenuKey}
          >
            {CHOICES.map((s, i) => (
              <button
                key={s || "none"}
                type="button"
                role="option"
                aria-selected={s === (status ?? "")}
                tabIndex={i === active ? 0 : -1}
                className={`status-option${s ? ` is-${s}` : ""}`}
                onPointerDown={(e) => e.preventDefault()}
                onMouseEnter={() => setActive(i)}
                onClick={() => choose(s)}
              >
                <span className={`status-dot${s ? ` is-${s}` : ""}`} aria-hidden="true" />
                <span>{label(s)}</span>
                {s === (status ?? "") && (
                  <svg className="status-check" width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
                    <path d="M2.5 6.2 5 8.5 9.5 3.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                )}
              </button>
            ))}
          </div>,
          document.body,
        )}
    </span>
  );
}
