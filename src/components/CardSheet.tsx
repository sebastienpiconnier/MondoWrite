// Fiche d'une carte dans la Bible : des caractéristiques standard, facultatives, selon le type.
// Personnage : rôle, genre, âge, métier, surnoms, apparence, objectif, faille, relations…
// Lieu : époque, ambiance, ce qui s'y passe, pourquoi il compte.
// Intrigue : nature, question dramatique, enjeu, déclencheur, obstacles, point de bascule, résolution.
// Comme dans la Bible du fork de NEO, seuls les champs remplis restent sous les yeux ; les autres attendent
// derrière « Ajouter si utile », une pastille par champ (Bible v2), ou tous d'un coup par « Afficher les champs vides ». Les valeurs vivent dans la carte (frontmatter `fiche`), jamais recopiées ailleurs.

import { plotColors } from "../plotColors";
import { PLOT_COLORS } from "../character";
import { BufferedInput, BufferedTextarea } from "./BufferedField";
import { IaFieldNote } from "./Atelier";
import { useEffect, useId, useState } from "react";
import { useSettings } from "../settings";
import { useCosmos } from "../store";
import { useInteractive } from "../interactive/useInteractive";
import { useIssueLabel } from "./SceneIssue";
import { fmt, useT } from "../i18n";
import { CHOICE_FIELDS, SHORT_FIELDS, WIDE_FIELDS, bandFields, isCardRefField, isChoiceField, sheetFields, type SheetField } from "../character";
import type { CardData } from "../types";
import { openNamesForCard } from "../namesState";

export function CardSheet({ card, startOpen, omit }: { card: CardData; startOpen?: boolean; /** Champs montrés ailleurs dans la même fenêtre. */ omit?: readonly string[] }) {
  const all = useT();
  const t = all.character;
  const typeLabels = all.fiche.typeLabels as Partial<Record<string, Record<string, string>>>;
  const labels: Record<string, string> = { ...all.character.fields, ...all.fiche.fields, ...typeLabels[card.type] };
  const values = all.fiche.values as Record<string, Record<string, string>>;
  const typePlaceholders = all.fiche.typePlaceholders as Partial<Record<string, Record<string, string>>>;
  const placeholders: Record<string, string> = { ...all.character.placeholders, ...all.fiche.placeholders, ...typePlaceholders[card.type] };
  const title = all.fiche.titles[card.type as keyof typeof all.fiche.titles] ?? t.sheet;
  // Les champs montrés ailleurs (moteur et arc d'un personnage) ne sont pas répétés ici.
  const band = bandFields(card);
  // Roman interactif : pas de courbe du récit (« Pour le héros, la scène finit… » se lit sur un seul chemin), sauf
  // si l'auteur l'a déjà remplie.
  const interactive = useInteractive();
  // « Pour Sarah, la scène finit » quand la scène a un point de vue (#171).
  const issueLabel = useIssueLabel(card);
  const fields = sheetFields(card.type).filter((key) => !band.has(key) && !omit?.includes(key) && !(interactive && key === "issue" && !card.fiche?.issue));
  const setFiche = useCosmos((s) => s.setFiche);
  // Épisode : le personnage pivot se choisit parmi les cartes Personnage (la fiche garde son identifiant).
  const nodes = useCosmos((s) => (card.type === "episode" ? s.nodes : null));
  const people = (nodes ?? []).filter((n) => n.data.type === "personnage" && n.data.title.trim()).map((n) => n.data);
  const filled = fields.filter((key) => card.fiche?.[key]?.trim()).length;
  // Ouverte d'office quand quelque chose est rempli ; sinon un bouton invite à la compléter.
  const [open, setOpen] = useState(startOpen ?? filled > 0);
  // Champs vides affichés. Une fiche vide les montre tous, et les garde à l'écran pendant qu'on la remplit
  // (sinon, le premier champ rempli faisait disparaître les autres).
  const [more, setMore] = useState(filled === 0);
  // Un champ qu'on vient de vider reste à l'écran le temps de la saisie.
  const [touched, setTouched] = useState<Set<SheetField>>(new Set());
  const id = useId();
  // Champ ajouté par sa pastille : il prend le focus dès qu'il est affiché.
  const [focusKey, setFocusKey] = useState<SheetField | null>(null);
  useEffect(() => {
    if (!focusKey) return;
    document.getElementById(`${id}-${focusKey}`)?.focus();
    setFocusKey(null);
  }, [focusKey, id]);
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
    // Champs de texte : la frappe reste dans le champ et part au store après une pause (BufferedField).
    const markTouched = () => {
      if (!touched.has(key)) setTouched(new Set(touched).add(key));
    };
    const commit = (value: string) => setFiche(card.id, key, value);
    return (
      <div key={key} className={`sheet-field${SHORT_FIELDS.has(key) || isChoiceField(key) ? " is-short" : ""}${WIDE_FIELDS.has(key) || shown.length === 1 ? " is-wide" : ""}${card.ia?.includes(key) ? " is-ia" : ""}`}>
        <label htmlFor={props.id}>{key === "issue" ? issueLabel : labels[key]}</label>
        {isCardRefField(key) ? (
          <select id={props.id} value={props.value} onChange={props.onChange}>
            <option value="">{all.fiche.pivotNone}</option>
            {people.map((c) => (
              <option key={c.id} value={c.id}>
                {c.title.trim()}
              </option>
            ))}
          </select>
        ) : isChoiceField(key) ? (
          // Champ à choix (certitude, état d'une question, repère d'un épisode) : la valeur écrite est la clé.
          <select id={props.id} value={props.value} onChange={props.onChange}>
            <option value="">{all.fiche.valueNone}</option>
            {CHOICE_FIELDS[key].map((v) => (
              <option key={v} value={v}>
                {values[key][v]}
              </option>
            ))}
          </select>
        ) : SHORT_FIELDS.has(key) ? (
          <BufferedInput type="text" autoComplete="off" id={props.id} placeholder={props.placeholder} value={props.value} onCommit={commit} onChange={markTouched} />
        ) : (
          <BufferedTextarea rows={1} id={props.id} placeholder={props.placeholder} value={props.value} onCommit={commit} onChange={markTouched} />
        )}
        {/* Mode Atelier : valeur proposée par l'IA et acceptée, jusqu'à ce que l'auteur y touche. */}
        {card.ia?.includes(key) && <IaFieldNote onRework={() => useCosmos.getState().reworkIaField(card.id, key)} />}
      </div>
    );
  };

  return (
    <>
    {card.type === "intrigue" && <PlotColorPicker card={card} />}
    <section className="sheet" aria-label={title}>
      <button type="button" className="sheet-toggle" aria-expanded={open} aria-controls={`${id}-fields`} onClick={() => setOpen(!open)}>
        <span>{title}</span>
        <span className="sheet-count">{fmt(t.filled, { n: filled, total: fields.length })}</span>
        <span aria-hidden="true" className={`sheet-chevron disclosure${open ? " is-open" : ""}`} />
      </button>
      {open && (
        <div id={`${id}-fields`}>
          <div className="sheet-fields">{shown.map(field)}</div>
          {card.type === "personnage" && (
            <button type="button" className="link-button sheet-more" onClick={() => openNamesForCard(card.id)}>
              {all.names.menu}
            </button>
          )}
          {filled > 0 && empty > 0 && !more && (
            <div className="sheet-add" role="group" aria-label={t.addIfUseful}>
              <span className="eyebrow">{t.addIfUseful}</span>
              {fields
                .filter((key) => !shown.includes(key))
                .map((key) => (
                  <button
                    key={key}
                    type="button"
                    className="chip sheet-add-chip"
                    aria-label={fmt(t.addField, { field: labels[key] })}
                    onClick={() => {
                      setTouched(new Set(touched).add(key));
                      setFocusKey(key);
                    }}
                  >
                    <span aria-hidden="true">+</span> {labels[key]}
                  </button>
                ))}
            </div>
          )}
          {filled > 0 && empty > 0 && (
            <button type="button" className="link-button sheet-more" aria-expanded={more} onClick={() => setMore(!more)}>
              {more ? t.fewerDetails : fmt(t.moreDetails, { n: empty })}
            </button>
          )}
        </div>
      )}
    </section>
    </>
  );
}

/**
 * Couleur d'une intrigue (#143) : huit pastilles de la palette des points de vue, et « Auto ». Elle colore les
 * scènes reliées (Plan, séquencier, listes des scènes, canevas) quand « Couleurs des intrigues » est allumé.
 */
export function PlotColorPicker({ card }: { card: CardData }) {
  const t = useT().plan;
  const auto = useCosmos((s) => plotColors(s.nodes, s.edges).plots.get(s.nodes.find((n) => n.data === card)?.id ?? ""));
  const id = useCosmos((s) => s.nodes.find((n) => n.data === card)?.id);
  const chosen = card.fiche?.couleur ?? "";
  const set = (v: string) => id && useCosmos.getState().setFiche(id, "couleur", v);
  // Palette franche (#157) : chaque couleur porte son nom, écrit à côté de sa pastille.
  const bold = useSettings((s) => s.plotPalette === "bold");
  const nameOf = (c: string) => (bold ? t.plotBoldNames[Number(c) - 1] : fmt(t.plotColorN, { n: c }));
  return (
    <div className={`plot-color${bold ? " is-named" : ""}`} role="radiogroup" aria-label={t.plotColor}>
      <span className="plot-color-label">{t.plotColor}</span>
      {PLOT_COLORS.map((c) => (
        <button
          key={c}
          type="button"
          role="radio"
          aria-checked={chosen === c || (!chosen && String(auto) === c)}
          className={`plot-swatch${chosen === c ? " is-chosen" : ""}`}
          style={{ ["--swatch" as string]: `var(--plot-${c})` }}
          aria-label={nameOf(c)}
          title={nameOf(c)}
          onClick={() => set(chosen === c ? "" : c)}
        >
          {bold && <span className="plot-swatch-name">{nameOf(c)}</span>}
        </button>
      ))}
      {chosen && (
        <button type="button" className="link-button" onClick={() => set("")}>
          {t.plotColorAuto}
        </button>
      )}
    </div>
  );
}
