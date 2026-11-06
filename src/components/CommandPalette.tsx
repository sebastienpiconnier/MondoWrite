// Palette de commandes (#26, Cmd/Ctrl + K) : on tape le nom d'une action (« organiser », « exporter en PDF »,
// « mode focus »…) et Entrée la lance. « Aller à » mène à des endroits ; la palette mène à des actions.
// Les commandes viennent de commandList.ts, la même liste que la barre des menus du Mac : seules celles qui sont
// possibles maintenant sont proposées.

import { useMemo, useRef, useState } from "react";
import { useT } from "../i18n";
import { useCosmos } from "../store";
import { useKeyHint } from "./MoreMenu";
import { acceleratorKeys, groupName, matchCommands, paletteEntries, runFromPalette, type PaletteEntry } from "../commandList";

export function CommandPalette() {
  const t = useT();
  const p = t.palette;
  const key = useKeyHint();
  // Lu une fois à l'ouverture : la liste ne bouge pas pendant qu'on tape.
  const screen = useCosmos((s) => s.screen);
  const view = useCosmos((s) => s.view);
  const kind = useCosmos((s) => s.kind);
  const entries = useMemo(() => paletteEntries(t, { screen: screen === "project" ? "project" : "home", view, kind }), [t, screen, view, kind]);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const listRef = useRef<HTMLUListElement>(null);
  const found = useMemo(() => matchCommands(query, entries), [query, entries]);
  const current = Math.min(active, Math.max(0, found.length - 1));

  const go = (entry: PaletteEntry | undefined) => {
    if (entry) runFromPalette(entry.id);
  };
  const move = (step: number) => {
    if (found.length === 0) return;
    const next = (current + step + found.length) % found.length;
    setActive(next);
    listRef.current?.children[next]?.scrollIntoView({ block: "nearest" });
  };

  return (
    <div className="goto palette">
      <h2 id="app-dialog-title">{p.title}</h2>
      <input
        className="goto-input"
        type="search"
        autoFocus
        value={query}
        aria-label={p.inputAria}
        aria-describedby="palette-hint"
        aria-controls="palette-list"
        aria-activedescendant={found[current] ? `palette-${found[current].id}` : undefined}
        placeholder={p.placeholder}
        autoComplete="off"
        spellCheck={false}
        onChange={(e) => {
          setQuery(e.target.value);
          setActive(0);
        }}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") (e.preventDefault(), move(1));
          else if (e.key === "ArrowUp") (e.preventDefault(), move(-1));
          else if (e.key === "Home" && found.length) (e.preventDefault(), setActive(0));
          else if (e.key === "End" && found.length) (e.preventDefault(), setActive(found.length - 1));
          else if (e.key === "Enter") (e.preventDefault(), go(found[current]));
        }}
      />
      <p className="goto-hint" id="palette-hint">
        {p.hint}
      </p>
      {found.length === 0 ? (
        <p className="goto-empty" role="status">
          {p.empty}
        </p>
      ) : (
        <ul className="goto-list" id="palette-list" ref={listRef} role="listbox" aria-label={p.results}>
          {found.map((entry, i) => (
            <li key={entry.id} id={`palette-${entry.id}`} role="option" aria-selected={i === current}>
              <button type="button" className={`goto-item${i === current ? " is-active" : ""}`} tabIndex={-1} onClick={() => go(entry)} onPointerEnter={() => setActive(i)}>
                <span className="goto-kind">{groupName(t, entry.group)}</span>
                <span className="goto-label">{entry.label}</span>
                {entry.accelerator && <kbd className="goto-page palette-keys">{key(...acceleratorKeys(entry.accelerator))}</kbd>}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
