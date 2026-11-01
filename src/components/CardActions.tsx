// Menu d'une carte (bouton ⋯, ou clic droit hors de son texte) : son image (photo libre ou de l'appareil),
// la mettre en avant (le reste du canevas s'estompe), ne montrer qu'elle et ses voisines. Au clavier :
// flèches, Échap.

import { useEffect, useRef, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { useT } from "../i18n";
import { useCosmos } from "../store";

export function CardActions({ id, hasImage, title = "" }: { id: string; hasImage: boolean; title?: string }) {
  const all = useT();
  const t = all.card;
  const open = useCosmos((s) => s.cardMenu === id);
  const setCardMenu = useCosmos((s) => s.setCardMenu);
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    rootRef.current?.querySelector<HTMLButtonElement>("[role=menuitem]")?.focus();
    const onDown = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setCardMenu(null);
    };
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [open, setCardMenu]);

  const run = (action: () => void) => {
    setCardMenu(null);
    action();
  };
  const items: [string, () => void, boolean?][] = [
    // Photos libres ou fichier de l'appareil : la fenêtre propose les deux.
    [hasImage ? t.changeImage : t.addImage, () => useCosmos.getState().openPhotos({ kind: "card", id })],
    [t.filterHere, () => useCosmos.getState().setFilterCard(id)],
    // Copier : Cmd/Ctrl + V (ou Coller du menu Édition) la recrée ; le presse-papiers reçoit aussi son texte.
    [
      t.copyCard,
      () => {
        const text = useCosmos.getState().copyCards([id]);
        if (text) void navigator.clipboard?.writeText(text).catch(() => undefined);
      },
    ],
    [t.duplicateCard, () => useCosmos.getState().duplicateCards([id])],
    // Un nom propre change : la carte et toutes ses occurrences dans le texte.
    ...(title.trim() ? [[all.replace.renameMenu, () => useCosmos.getState().openReplace({ find: title.trim(), renameId: id })] as [string, () => void]] : []),
    // En dernier, en rouge, après un filet (1.11.1) : la carte part à la corbeille (Annuler, ou la remettre).
    [all.trash.remove, () => useCosmos.getState().deleteCard(id), true],
  ];

  const onKey = (e: ReactKeyboardEvent) => {
    const all = [...(rootRef.current?.querySelectorAll<HTMLButtonElement>("[role=menuitem]") ?? [])];
    const at = all.indexOf(document.activeElement as HTMLButtonElement);
    if (e.key === "ArrowDown") all[(at + 1) % all.length]?.focus();
    else if (e.key === "ArrowUp") all[(at - 1 + all.length) % all.length]?.focus();
    else if (e.key === "Escape") {
      setCardMenu(null);
      buttonRef.current?.focus();
    } else return;
    e.preventDefault();
    e.stopPropagation();
  };

  return (
    <div className="card-actions" ref={rootRef}>
      <button
        ref={buttonRef}
        type="button"
        className="card-delete nodrag"
        aria-label={t.actions}
        title={t.actions}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setCardMenu(open ? null : id)}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <circle cx="5.5" cy="12" r="1.7" />
          <circle cx="12" cy="12" r="1.7" />
          <circle cx="18.5" cy="12" r="1.7" />
        </svg>
      </button>
      {open && (
        <div className="card-actions-menu nodrag nowheel" role="menu" aria-label={t.actions} onKeyDown={onKey}>
          {items.map(([label, action, danger]) => (
            <button key={label} type="button" role="menuitem" tabIndex={-1} className={danger ? "is-danger" : undefined} onClick={() => run(action)}>
              {label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
