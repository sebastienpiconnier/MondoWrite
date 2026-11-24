import { useState, type ReactNode } from "react";
import { create } from "zustand";
import { fmt, useT } from "../i18n";
import {
  loadSidePrefs,
  moveSidePart,
  orderParts,
  resetSideParts,
  saveSidePrefs,
  setSideFolded,
  setSideHidden,
  type SidePrefs,
} from "../sidePanel";

/** Réglage de l'appareil, partagé par les deux vues d'écriture. */
const useSidePrefs = create<{ prefs: SidePrefs; set: (p: SidePrefs) => void }>((set) => ({
  prefs: loadSidePrefs(),
  set: (prefs) => {
    saveSidePrefs(prefs);
    set({ prefs });
  },
}));

export interface SidePart {
  /** Clé écrite dans le réglage, la même dans le Manuscrit et le Scénario. */
  key: string;
  title: string;
  node: ReactNode;
  /** La rubrique se replie déjà elle-même (chutier, statistiques) : pas d'en-tête en plus. */
  ownFold?: boolean;
}

/**
 * Rubriques du volet de droite : dans l'ordre de l'auteur, chacune repliable par son en-tête,
 * masquables et rangées par « Personnaliser le volet ». Rien n'est écrit dans le projet.
 */
export function SideParts({ parts }: { parts: SidePart[] }) {
  const t = useT().sidePanel;
  const prefs = useSidePrefs((s) => s.prefs);
  const setPrefs = useSidePrefs((s) => s.set);
  const [editing, setEditing] = useState(false);
  const defaults = parts.map((p) => p.key);
  const byKey = new Map(parts.map((p) => [p.key, p]));
  const order = orderParts(defaults, prefs);
  const shown = order.filter((k) => !prefs.hidden.includes(k));

  return (
    <>
      {shown.map((key) => {
        const part = byKey.get(key)!;
        if (part.ownFold) return <div key={key} className="side-part is-own" data-part={key}>{part.node}</div>;
        const folded = prefs.folded.includes(key);
        return (
          <section key={key} className={`side-part${folded ? " is-folded" : ""}`} data-part={key}>
            <h2 className="side-part-title">
              <button type="button" className="side-part-head" aria-expanded={!folded} onClick={() => setPrefs(setSideFolded(prefs, key, !folded))}>
                <span aria-hidden="true" className={`disclosure${folded ? "" : " is-open"}`} />
                {part.title}
              </button>
            </h2>
            {!folded && <div className="side-part-body">{part.node}</div>}
          </section>
        );
      })}
      {editing ? (
        <section className="side-part side-parts-edit" aria-label={t.customize}>
          <h2 className="side-part-title">{t.customize}</h2>
          <ul className="side-parts-list">
            {order.map((key, i) => {
              const part = byKey.get(key)!;
              const hidden = prefs.hidden.includes(key);
              return (
                <li key={key}>
                  <label>
                    <input type="checkbox" checked={!hidden} onChange={(e) => setPrefs(setSideHidden(prefs, key, !e.target.checked))} />
                    <span>{part.title}</span>
                  </label>
                  <button type="button" className="icon-button" disabled={i === 0} aria-label={`${t.up} : ${part.title}`} title={t.up} onClick={() => setPrefs(moveSidePart(prefs, defaults, key, -1))}>
                    ↑
                  </button>
                  <button type="button" className="icon-button" disabled={i === order.length - 1} aria-label={`${t.down} : ${part.title}`} title={t.down} onClick={() => setPrefs(moveSidePart(prefs, defaults, key, 1))}>
                    ↓
                  </button>
                </li>
              );
            })}
          </ul>
          <div className="side-parts-actions">
            <button type="button" className="link-button" onClick={() => setPrefs(resetSideParts(prefs, defaults))}>
              {t.reset}
            </button>
            <button type="button" className="ghost-button" onClick={() => setEditing(false)}>
              {t.done}
            </button>
          </div>
        </section>
      ) : (
        <button type="button" className="link-button side-parts-customize" onClick={() => setEditing(true)}>
          {prefs.hidden.some((k) => defaults.includes(k)) ? fmt(t.customizeHidden, { n: prefs.hidden.filter((k) => defaults.includes(k)).length }) : t.customize}
        </button>
      )}
    </>
  );
}
