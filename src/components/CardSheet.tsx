// Fiche d'une carte dans la Bible : des caractéristiques standard, facultatives, selon le type.
// Personnage : rôle, genre, âge, métier, surnoms, apparence, objectif, faille, relations…
// Lieu : époque, ambiance, ce qui s'y passe, pourquoi il compte.
// Intrigue : nature, question dramatique, enjeu, déclencheur, obstacles, point de bascule, résolution.
// Comme dans la Bible du fork de NEO, seuls les champs remplis restent sous les yeux ; « Plus de détails »
// montre les autres. Les valeurs vivent dans la carte (frontmatter `fiche`), jamais recopiées ailleurs.

import { useId, useState } from "react";
import { useCosmos } from "../store";
import { fmt, useT } from "../i18n";
import { SHORT_FIELDS, WIDE_FIELDS, bandFields, sheetFields, type SheetField } from "../character";
import type { CardData } from "../types";

export function CardSheet({ card, startOpen }: { card: CardData; startOpen?: boolean }) {
  const all = useT();
  const t = all.character;
  const labels: Record<string, string> = { ...all.character.fields, ...all.fiche.fields };
  const placeholders: Record<string, string> = { ...all.character.placeholders, ...all.fiche.placeholders };
  const title = all.fiche.titles[card.type as keyof typeof all.fiche.titles] ?? t.sheet;
  // Les champs montrés ailleurs (moteur et arc d'un personnage) ne sont pas répétés ici.
  const band = bandFields(card);
  const fields = sheetFields(card.type).filter((key) => !band.has(key));
  const setFiche = useCosmos((s) => s.setFiche);
  const filled = fields.filter((key) => card.fiche?.[key]?.trim()).length;
  // Ouverte d'office quand quelque chose est rempli ; sinon un bouton invite à la compléter.
  const [open, setOpen] = useState(startOpen ?? filled > 0);
  // Champs vides affichés. Une fiche vide les montre tous.
  const [more, setMore] = useState(false);
  // Un champ qu'on vient de vider reste à l'écran le temps de la saisie.
  const [touched, setTouched] = useState<Set<SheetField>>(new Set());
  const id = useId();
  if (fields.length === 0) return null;
  const showAll = more || filled === 0;
  const shown = fields.filter((key) => showAll || (card.fiche?.[key] ?? "").trim() || touched.has(key));
  const empty = fields.length - filled;

  const field = (key: SheetField) => {
    const props = {
      id: `${id}-${key}`,
      value: card.fiche?.[key] ?? "",
      placeholder: placeholders[key],
      onChange: (e: { target: { value: string } }) => {
        if (!touched.has(key)) setTouched(new Set(touched).add(key));
        setFiche(card.id, key, e.target.value);
      },
    };
    return (
      <div key={key} className={`sheet-field${SHORT_FIELDS.has(key) ? " is-short" : ""}${WIDE_FIELDS.has(key) || shown.length === 1 ? " is-wide" : ""}`}>
        <label htmlFor={props.id}>{labels[key]}</label>
        {SHORT_FIELDS.has(key) ? <input type="text" autoComplete="off" {...props} /> : <textarea rows={1} {...props} />}
      </div>
    );
  };

  return (
    <section className="sheet" aria-label={title}>
      <button type="button" className="sheet-toggle" aria-expanded={open} aria-controls={`${id}-fields`} onClick={() => setOpen(!open)}>
        <span>{title}</span>
        <span className="sheet-count">{fmt(t.filled, { n: filled, total: fields.length })}</span>
        <span aria-hidden="true" className="sheet-chevron">{open ? "▴" : "▾"}</span>
      </button>
      {open && (
        <div id={`${id}-fields`}>
          <div className="sheet-fields">{shown.map(field)}</div>
          {filled > 0 && empty > 0 && (
            <button type="button" className="link-button sheet-more" aria-expanded={more} onClick={() => setMore(!more)}>
              {more ? t.fewerDetails : fmt(t.moreDetails, { n: empty })}
            </button>
          )}
        </div>
      )}
    </section>
  );
}
