// Menu de suggestions partagé : « Transformer en… » des cartes et complétion du scénario.
// Le clavier (flèches, Entrée, Échap) est géré par l'éditeur qui l'ouvre : le focus ne quitte pas le texte.

import type { CSSProperties } from "react";

export interface SuggestionItem {
  key: string;
  label: string;
  /** Précision affichée à droite (« personnage », « hors champ »…). */
  hint?: string;
  /** Pastille de couleur (variable CSS), pour les types de carte. */
  color?: string;
}

interface Props {
  title: string;
  items: SuggestionItem[];
  /** Index de la suggestion active, -1 si aucune. */
  active: number;
  onPick: (index: number) => void;
  className?: string;
  style?: CSSProperties;
}

export function SuggestionMenu({ title, items, active, onPick, className = "", style }: Props) {
  return (
    <div className={`slash-menu nodrag ${className}`.trim()} role="listbox" aria-label={title} style={style}>
      <div className="slash-title">{title}</div>
      {items.map((item, i) => (
        <button
          key={item.key}
          type="button"
          role="option"
          aria-selected={i === active}
          className={`slash-item${i === active ? " is-active" : ""}`}
          // Garde le focus dans l'éditeur, à la souris comme au doigt.
          onPointerDown={(e) => e.preventDefault()}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => onPick(i)}
        >
          {item.color && <span className="card-dot" style={{ background: item.color }} />}
          <span className="slash-label">{item.label}</span>
          {item.hint && <span className="slash-hint">{item.hint}</span>}
        </button>
      ))}
    </div>
  );
}
