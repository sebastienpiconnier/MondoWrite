// Fils d'une fiche de la Bible : les cartes reliées, chacune avec son étiquette. Toucher une pastille ouvre la
// fiche du lien (lot 7 de la Bible v2) : leur histoire, ce qui se joue entre eux, comment ça évolue. Retirer
// le fil se fait au pied de cette fiche (1.11.2) : plus de croix sur la pastille, où un toucher le retirait sans un mot.

import { useId, useState } from "react";
import type { Edge } from "@xyflow/react";
import { fmt, useT } from "../i18n";
import { useCosmos } from "../store";
import { WIRE_FIELDS, wireFicheOf } from "../wires";
import { setupOf } from "../setups";
import type { CardData } from "../types";

export function BibleLinks({ cardId, links, titleOf }: { cardId: string; links: Edge[]; titleOf: (id: string) => string }) {
  const all = useT();
  const t = all.bible;
  // Préparer et payer (#119) : le choix n'existe qu'entre deux cartes Scène.
  const nodes = useCosmos((s) => s.nodes);
  const isScene = (id: string) => (nodes.find((n) => n.id === id)?.data as CardData | undefined)?.type === "scene";
  const [open, setOpen] = useState<string | null>(null);
  const id = useId();
  if (links.length === 0) return null;
  const edge = links.find((e) => e.id === open);
  return (
    <>
      <div className="bible-links">
        <span className="eyebrow">{t.linkedTo}</span>
        {links.map((e) => {
          const other = e.source === cardId ? e.target : e.source;
          const filled = Object.keys(wireFicheOf(e) ?? {}).length > 0;
          const setup = setupOf(e);
          const role = setup ? (setup === cardId ? t.setsUp : t.setUpBy) : "";
          return (
            <span key={e.id} className={`chip link-chip${open === e.id ? " is-open" : ""}`}>
              <button
                type="button"
                className="link-chip-open"
                aria-expanded={open === e.id}
                aria-controls={`${id}-wire`}
                title={fmt(t.wireOpen, { title: titleOf(other) })}
                onClick={() => setOpen(open === e.id ? null : e.id)}
              >
                {titleOf(other)}
                {e.label ? ` · ${String(e.label)}` : role ? ` · ${role}` : ""}
                {filled && <span className="link-chip-mark" aria-hidden="true" />}
              </button>
            </span>
          );
        })}
      </div>
      {edge && (
        <section id={`${id}-wire`} className="sheet wire-sheet" aria-label={fmt(t.wireTitle, { a: titleOf(edge.source), b: titleOf(edge.target) })}>
          <div className="eyebrow">{fmt(t.wireTitle, { a: titleOf(edge.source), b: titleOf(edge.target) })}</div>
          <div className="sheet-fields">
            {WIRE_FIELDS.map((key) => (
              <div key={key} className="sheet-field is-wide">
                <label htmlFor={`${id}-${key}`}>{t.wireFields[key]}</label>
                <textarea
                  id={`${id}-${key}`}
                  rows={1}
                  value={wireFicheOf(edge)?.[key] ?? ""}
                  placeholder={t.wirePlaceholders[key]}
                  onChange={(ev) => useCosmos.getState().setWireFiche(edge.id, key, ev.target.value)}
                />
              </div>
            ))}
          </div>
          {isScene(edge.source) && isScene(edge.target) && (
            <div className="sheet-field is-wide">
              <label htmlFor={`${id}-setup`}>{all.toile.setupAria}</label>
              <select id={`${id}-setup`} value={setupOf(edge) ?? ""} onChange={(ev) => useCosmos.getState().setLinkSetup(edge.id, ev.target.value || null)}>
                <option value="">{all.toile.setupNone}</option>
                <option value={edge.source}>{fmt(all.toile.setupOption, { a: titleOf(edge.source), b: titleOf(edge.target) })}</option>
                <option value={edge.target}>{fmt(all.toile.setupOption, { a: titleOf(edge.target), b: titleOf(edge.source) })}</option>
              </select>
            </div>
          )}
          <div className="wire-sheet-actions">
            <button
              type="button"
              className="ghost-button is-danger"
              onClick={() => {
                useCosmos.getState().removeLink(edge.id);
                setOpen(null);
              }}
            >
              {fmt(t.unlink, { title: titleOf(edge.source === cardId ? edge.target : edge.source) })}
            </button>
          </div>
        </section>
      )}
    </>
  );
}
