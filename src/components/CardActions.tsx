// Menu d'une carte (bouton ⋯, ou clic droit hors de son texte) : son image (photo libre ou de l'appareil),
// la mettre en avant (le reste du canevas s'estompe), ne montrer qu'elle et ses voisines. Au clavier :
// flèches, Échap.

import { focusMenuItem } from "./focusMenuItem";
import { useEffect, useRef, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { useT } from "../i18n";
import { useCosmos } from "../store";
import { openNamesForCard } from "../namesState";
import { useStoryMarks } from "../interactive/useStoryMap";
import { readMarksKey } from "../interactive/storyMap";
import { openPlay } from "../interactive/playState";
import { askStoryChoice } from "./StoryChoices";
import { useInteractive } from "../interactive/useInteractive";

export function CardActions({ id, hasImage, title = "", isCharacter = false, follow = false }: { id: string; hasImage: boolean; title?: string; isCharacter?: boolean; follow?: boolean }) {
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
  // Scène d'un roman interactif (lot 11) : les gestes de la carte des choix, au clavier et au doigt.
  const story = useStoryMarks((s) => id in s.byId);
  // Lire le récit fil par fil (#117) : pas dans un roman interactif, où l'ordre du livre n'est pas celui de la lecture.
  const interactive = useInteractive();
  const marksKey = useStoryMarks((s) => s.byId[id] ?? "");
  const m = all.interactive.map;
  // Une scène qui finit l'histoire (lot 14) : son type de fin, les deux autres proposés.
  const marks = story ? readMarksKey(marksKey) : null;
  const endItems: [string, () => void][] =
    marks && (marks.ending || marks.deadEnd)
      ? ([
          ["good", m.markGood],
          ["bad", m.markBad],
          [null, m.markNeutral],
        ] as const)
          .filter(([kind]) => kind !== marks.endKind)
          .map(([kind, label]) => [label, () => useCosmos.getState().setSceneEnding(id, kind)])
      : [];
  const storyItems: [string, () => void][] = story
    ? [
        [m.write, () => useCosmos.getState().openInManuscript(id)],
        [all.interactive.play.openHere, () => openPlay(id)],
        [m.addChoice, () => askStoryChoice({ kind: "pick", id })],
        [m.sceneAfter, () => askStoryChoice({ kind: "after", id })],
        [m.endHere, () => askStoryChoice({ kind: "end", id })],
        ...endItems,
      ]
    : [];
  const items: [string, () => void, boolean?][] = [
    ...storyItems,
    // Photos libres ou fichier de l'appareil : la fenêtre propose les deux.
    [hasImage ? t.changeImage : t.addImage, () => useCosmos.getState().openPhotos({ kind: "card", id })],
    [t.filterHere, () => useCosmos.getState().setFilterCard(id)],
    ...(follow && !interactive ? [[all.thread.menu, () => useCosmos.getState().readThread(id)] as [string, () => void]] : []),
    // Copier : Cmd/Ctrl + V (ou Coller du menu Édition) la recrée ; le presse-papiers reçoit aussi son texte.
    [
      t.copyCard,
      () => {
        const text = useCosmos.getState().copyCards([id]);
        if (text) void navigator.clipboard?.writeText(text).catch(() => undefined);
      },
    ],
    [t.duplicateCard, () => useCosmos.getState().duplicateCards([id])],
    // Un personnage : des noms tirés de listes par pays (#17).
    ...(isCharacter ? [[all.names.menu, () => openNamesForCard(id)] as [string, () => void]] : []),
    // Un nom propre change : la carte et toutes ses occurrences dans le texte.
    ...(title.trim() ? [[all.replace.renameMenu, () => useCosmos.getState().openReplace({ find: title.trim(), renameId: id })] as [string, () => void]] : []),
    // En dernier, en rouge, après un filet (1.11.1) : la carte part à la corbeille (Annuler, ou la remettre).
    [all.trash.remove, () => useCosmos.getState().deleteCard(id), true],
  ];

  const onKey = (e: ReactKeyboardEvent) => {
    if (focusMenuItem(e)) return;
    if (e.key === "Escape") {
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
