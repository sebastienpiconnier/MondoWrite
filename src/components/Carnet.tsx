// Carnet du téléphone : on y note ce qui vient (idée, question, nom), en une ligne ou plus. Chaque note devient une
// carte ordinaire marquée « à ranger » (inbox.ts) : elle existe aussitôt dans la Bible et sur le canevas, où on lui
// trouvera sa place depuis l'iPad ou l'ordinateur. Ici, la liste « À ranger » permet d'ouvrir une note dans la
// Bible, d'y joindre une photo, de la dire rangée ou de la jeter.

import { useId, useMemo, useState } from "react";
import { useCosmos } from "../store";
import { fmt } from "../i18n";
import { useVocab } from "../vocab";
import { typeColor, type CardType } from "../types";
import { CAPTURE_TYPES, inboxCards } from "../inbox";
import { TrashIcon } from "./TrashIcon";

export function Carnet() {
  const { t, types } = useVocab();
  const c = t.carnet;
  const nodes = useCosmos((s) => s.nodes);
  const [type, setType] = useState<CardType>("idee");
  const [text, setText] = useState("");
  const [said, setSaid] = useState("");
  const id = useId();
  const waiting = useMemo(() => inboxCards(nodes.map((n) => n.data)), [nodes]);

  const keep = () => {
    if (!useCosmos.getState().captureCard(type, text)) return;
    setText("");
    setSaid(c.added);
  };

  return (
    <section className="carnet" aria-label={c.aria}>
      <h1 className="carnet-title">{c.title}</h1>
      <p className="carnet-intro">{c.intro}</p>

      <form
        className="carnet-capture"
        onSubmit={(e) => {
          e.preventDefault();
          keep();
        }}
      >
        <div className="carnet-types" role="radiogroup" aria-label={c.typesAria}>
          {CAPTURE_TYPES.map((k) => (
            <button
              key={k}
              type="button"
              role="radio"
              aria-checked={type === k}
              className={`chip carnet-type${type === k ? " is-on" : ""}`}
              style={{ ["--type" as string]: typeColor(k) }}
              onClick={() => setType(k)}
            >
              <span className="card-dot" style={{ background: typeColor(k) }} aria-hidden="true" />
              {types[k].label}
            </button>
          ))}
        </div>
        <textarea
          id={`${id}-text`}
          className="carnet-field"
          rows={3}
          value={text}
          placeholder={c.placeholder}
          aria-label={c.fieldAria}
          aria-describedby={`${id}-hint`}
          onChange={(e) => {
            setText(e.target.value);
            if (said) setSaid("");
          }}
          onKeyDown={(e) => {
            // Cmd/Ctrl + Entrée garde la note (clavier branché sur un iPad étroit, ou ordinateur).
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              keep();
            }
          }}
        />
        <div className="carnet-actions">
          <p id={`${id}-hint`} className="carnet-hint">
            {said || c.hint}
          </p>
          <button type="submit" className="ghost-button carnet-keep" disabled={!text.trim()}>
            {c.add}
          </button>
        </div>
        <span className="sr-only" role="status">
          {said}
        </span>
      </form>

      <h2 className="carnet-inbox-title">{waiting.length > 0 ? fmt(c.inboxCount, { n: waiting.length }) : c.inbox}</h2>
      {waiting.length === 0 ? (
        <p className="carnet-empty">{c.empty}</p>
      ) : (
        <ul className="carnet-list">
          {waiting.map((card) => {
            const name = card.title.trim() || card.fiche?.url || c.untitled;
            return (
              <li key={card.id} className="carnet-item" style={{ ["--type" as string]: typeColor(card.type) }}>
                <button type="button" className="carnet-open" aria-label={fmt(c.open, { title: name })} onClick={() => useCosmos.getState().openInBible(card.id)}>
                  <span className="carnet-kind">{types[card.type].label}</span>
                  <span className="carnet-name">{name}</span>
                </button>
                <div className="carnet-item-actions">
                  <button type="button" className="icon-button" aria-label={t.card.addImage} title={t.card.addImage} onClick={() => useCosmos.getState().openPhotos({ kind: "card", id: card.id })}>
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" aria-hidden="true">
                      <rect x="3" y="5" width="18" height="14" rx="2" />
                      <circle cx="9" cy="10" r="1.6" />
                      <path d="M21 16l-5-5-8 8" />
                    </svg>
                  </button>
                  <button type="button" className="icon-button" aria-label={fmt(c.filedAria, { title: name })} title={c.filed} onClick={() => useCosmos.getState().fileInbox([card.id])}>
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="M5 12.5l4.5 4.5L19 7" />
                    </svg>
                  </button>
                  <button type="button" className="icon-button" aria-label={fmt(c.trash, { title: name })} title={fmt(c.trash, { title: name })} onClick={() => useCosmos.getState().deleteCard(card.id)}>
                    <TrashIcon />
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
