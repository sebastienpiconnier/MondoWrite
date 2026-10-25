// Moteur d'un personnage, en tête de sa fiche dans la Bible : trois cases lues d'un coup d'œil
// (Veut, A besoin de, Blessure et conflit intérieur ; pour un antagoniste : Motivation, Force, Faille), puis
// l'arc : son type, dessiné, et ses deux temps (Au début, À la fin). Ce sont des champs de la fiche
// (frontmatter `fiche`), rien n'est recopié ailleurs. L'ancien texte « Évolution » reste affiché s'il est rempli.

import { useId } from "react";
import { useCosmos } from "../store";
import { fmt, useT } from "../i18n";
import { ARC_TYPES, isAntagonist, motorFields, type ArcType } from "../character";
import type { CardData } from "../types";

/** Petite courbe d'un type d'arc : monte, descend ou reste à plat. */
function ArcCurve({ type }: { type: ArcType }) {
  const d = type === "positif" ? "M3 19 C 10 19, 14 6, 25 5" : type === "negatif" ? "M3 5 C 10 5, 14 18, 25 19" : "M3 12 C 10 10, 18 14, 25 12";
  return (
    <svg width="28" height="24" viewBox="0 0 28 24" aria-hidden="true" className="arc-curve">
      <path d={d} fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
      <circle cx="25" cy={type === "positif" ? 5 : type === "negatif" ? 19 : 12} r="2.6" fill="currentColor" />
    </svg>
  );
}

export function CharacterMotor({ card }: { card: CardData }) {
  const all = useT();
  const t = all.character;
  const setFiche = useCosmos((s) => s.setFiche);
  const id = useId();
  const fields = motorFields(card);
  const arc = card.fiche?.arcType;

  return (
    <div className="motor">
      <div className={`motor-band${isAntagonist(card) ? " is-antagonist" : ""}`} role="group" aria-label={isAntagonist(card) ? `${t.motor.aria} · ${t.motor.antagonist}` : t.motor.aria}>
        {fields.map((key) => (
          <div key={key} className={`motor-cell${card.fiche?.[key]?.trim() ? " is-filled" : ""}`}>
            <label htmlFor={`${id}-${key}`}>{t.motor.labels[key as keyof typeof t.motor.labels]}</label>
            <textarea
              id={`${id}-${key}`}
              rows={1}
              value={card.fiche?.[key] ?? ""}
              placeholder={t.motor.placeholders[key as keyof typeof t.motor.placeholders]}
              onChange={(e) => setFiche(card.id, key, e.target.value)}
            />
          </div>
        ))}
      </div>
      <div className="arc-picker" role="group" aria-label={t.arcAria}>
        <span className="arc-label" aria-hidden="true">
          {t.fields.arcType}
        </span>
        {ARC_TYPES.map((type) => (
          <button
            key={type}
            type="button"
            className="arc-option"
            aria-pressed={arc === type}
            title={t.arcHints[type]}
            aria-label={fmt("{a} · {b}", { a: t.arcTypes[type], b: t.arcHints[type] })}
            onClick={() => setFiche(card.id, "arcType", arc === type ? "" : type)}
          >
            <ArcCurve type={type} />
            <span>{t.arcTypes[type]}</span>
          </button>
        ))}
      </div>
      {/* L'arc en deux temps, juste sous sa forme dessinée : une seule notion, l'arc. */}
      <div className="motor-arc-ends" role="group" aria-label={t.arcAria}>
        {(["debut", "fin"] as const).map((key, i) => (
          <div key={key} className={`motor-cell is-arc-end${card.fiche?.[key]?.trim() ? " is-filled" : ""}`}>
            <label htmlFor={`${id}-${key}`}>{t.fields[key]}</label>
            <textarea id={`${id}-${key}`} rows={1} value={card.fiche?.[key] ?? ""} placeholder={t.placeholders[key]} onChange={(e) => setFiche(card.id, key, e.target.value)} />
            {i === 0 && <span className="motor-arc-arrow" aria-hidden="true">→</span>}
          </div>
        ))}
      </div>
      {/* Ancien champ « Évolution » (avant la Bible v2) : gardé sous les yeux tant qu'il a du texte. */}
      {(card.fiche?.arc ?? "") !== "" && (
        <div className="motor-arc-text">
          <label htmlFor={`${id}-arc`}>{t.fields.arc}</label>
          <textarea id={`${id}-arc`} rows={1} value={card.fiche?.arc ?? ""} placeholder={t.placeholders.arc} onChange={(e) => setFiche(card.id, "arc", e.target.value)} />
        </div>
      )}
    </div>
  );
}
