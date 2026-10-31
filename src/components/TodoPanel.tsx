// Bouton « À faire » de la barre du haut : tout ce qui reste ouvert dans le projet (todos.ts), sans liste à
// part. Une case se coche d'ici ; une ligne mène à sa carte, à sa fiche ou à sa scène. Cmd/Ctrl+Maj+L.

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { SCENE_AT, useCosmos } from "../store";
import { fmt, useT } from "../i18n";
import { collectTodos, type Todo, type TodoKind } from "../todos";
import { typeColor } from "../types";

// Trois groupes : les questions gardées dans un personnage et les cartes Question forment ensemble « À creuser ».
// Mode Atelier : un quatrième, « Passages de l'IA », avec « Je l'ai repris » sur chaque ligne.
const GROUPS: { key: "task" | "revisit" | "dig" | "ia"; kinds: TodoKind[] }[] = [
  { key: "task", kinds: ["task"] },
  { key: "revisit", kinds: ["revisit"] },
  { key: "dig", kinds: ["question", "open"] },
  { key: "ia", kinds: ["ia"] },
];

/** « Je l'ai repris » depuis « À faire » : la marque part, le texte reste. */
function rework(todo: Todo) {
  const s = useCosmos.getState();
  if (todo.where === "screenplay") s.unmarkIaElement(todo.index);
  else if (todo.field) s.reworkIaField(todo.cardId, todo.field);
  else if (todo.where === "card" || todo.where === "manuscript") s.unmarkIaPassage(todo.cardId, todo.where, todo.markId);
}

export function TodoPanel() {
  const t = useT();
  const d = t.todos;
  const nodes = useCosmos((s) => s.nodes);
  const manuscript = useCosmos((s) => s.manuscript);
  const screenplay = useCosmos((s) => s.screenplay);
  const kind = useCosmos((s) => s.kind);
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelId = useId();

  const cards = useMemo(() => new Map(nodes.map((n) => [n.id, n.data])), [nodes]);
  const todos = useMemo(() => collectTodos([...cards.values()], manuscript, kind === "scenario" ? screenplay : null), [cards, manuscript, screenplay, kind]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && !e.altKey && e.key.toLowerCase() === "l") {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        buttonRef.current?.focus();
      }
    };
    const onDown = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onDown);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onDown);
    };
  }, [open]);

  const go = (todo: Todo) => {
    setOpen(false);
    const s = useCosmos.getState();
    if (todo.where === "manuscript") s.openInManuscript(todo.cardId);
    else if (todo.where === "screenplay") s.openInManuscript(`${SCENE_AT}${todo.index}`);
    else if (todo.kind === "question") s.openInBible(todo.cardId, true);
    else s.revealCard(todo.cardId);
  };
  const titleOf = (id: string) => cards.get(id)?.title.trim() || t.bible.untitled;

  return (
    <div className="settings" ref={rootRef}>
      <button
        ref={buttonRef}
        type="button"
        className="icon-button todo-button"
        aria-label={fmt(d.button, { n: todos.length })}
        title={fmt(d.button, { n: todos.length })}
        aria-expanded={open}
        aria-controls={panelId}
        aria-keyshortcuts="Control+Shift+L Meta+Shift+L"
        onClick={() => setOpen(!open)}
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <rect x="4" y="4" width="16" height="16" rx="3" />
          <path d="M8.5 12.5l2.5 2.5 4.5-5.5" />
        </svg>
        {todos.length > 0 && <span className="todo-count" aria-hidden="true">{todos.length > 99 ? "99+" : todos.length}</span>}
      </button>
      {open && (
        <div className="settings-panel todo-panel" id={panelId} role="group" aria-label={d.title}>
          <div className="eyebrow">{d.title}</div>
          {todos.length === 0 && <p className="settings-hint">{d.empty}</p>}
          {GROUPS.map(({ key, kinds }) => {
            const items = todos.filter((x) => kinds.includes(x.kind));
            if (items.length === 0) return null;
            return (
              <section key={key} className="todo-group" aria-label={key === "ia" ? t.atelier.todo : d.kinds[key]}>
                <h3>
                  {key === "ia" ? t.atelier.todo : d.kinds[key]} <span className="toc-count">{items.length}</span>
                </h3>
                <ul>
                  {items.map((todo) => {
                    const card = cards.get(todo.cardId);
                    const where = todo.where === "screenplay" && !card ? t.atelier.todoScreenplay : fmt(todo.where === "card" ? d.inCard : d.inScene, { title: titleOf(todo.cardId) });
                    return (
                      <li key={`${todo.kind}-${todo.where}-${todo.cardId}-${todo.field ?? ""}-${todo.index}`}>
                        {todo.kind === "task" && (
                          <input
                            type="checkbox"
                            aria-label={fmt(d.check, { text: todo.text })}
                            onChange={() => useCosmos.getState().toggleTodo(todo.cardId, todo.where === "manuscript" ? "manuscript" : "card", todo.index)}
                          />
                        )}
                        <button type="button" className="todo-item" onClick={() => go(todo)}>
                          <span className="todo-text">{todo.text}</span>
                          <span className="todo-where">
                            {card && <span className="card-dot" style={{ background: typeColor(card.type) }} />}
                            {where}
                          </span>
                        </button>
                        {todo.kind === "ia" && (
                          <button type="button" className="ghost-button todo-rework" title={t.atelier.reworkedHint} onClick={() => rework(todo)}>
                            {t.atelier.reworked}
                          </button>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </section>
            );
          })}
          <p className="settings-hint">{d.hint}</p>
        </div>
      )}
    </div>
  );
}
