// Chronologie par intrigue (Plan d'un roman, séquencier d'un scénario) : un tableau où chaque colonne est une scène,
// dans l'ordre du plan, et chaque ligne une intrigue (carte Thème), un personnage ou un lieu.
// Toucher une case tire un fil entre la carte et la scène, ou le retire : c'est le même fil que sur le canevas.

import { useMemo } from "react";
import { useCosmos } from "../store";
import { useSettings } from "../settings";
import { fmt, useT } from "../i18n";
import { useVocab } from "../vocab";
import { typeColor } from "../types";
import { screenplaySceneTexts, timeline } from "../timeline";

export function Timeline({ order }: { order: string[] }) {
  const t = useT();
  const p = t.plan;
  const { types } = useVocab();
  const lang = useSettings((s) => s.lang);
  const nodes = useCosmos((s) => s.nodes);
  const edges = useCosmos((s) => s.edges);
  const manuscript = useCosmos((s) => s.manuscript);
  const kind = useCosmos((s) => s.kind);
  const screenplay = useCosmos((s) => s.screenplay);
  // Scénario : pas de manuscrit, les scènes citent leur décor, leurs personnages et leur action.
  const texts = useMemo(() => (kind === "scenario" && screenplay ? screenplaySceneTexts(screenplay.elements) : manuscript), [kind, screenplay, manuscript]);
  const toggleLink = useCosmos((s) => s.toggleLink);
  const revealCard = useCosmos((s) => s.revealCard);
  const readThread = useCosmos((s) => s.readThread);

  const cards = useMemo(() => nodes.map((n) => n.data), [nodes]);
  const groups = useMemo(() => timeline(cards, edges, texts, order, lang), [cards, edges, texts, order, lang]);
  const hasPov = useMemo(() => groups.some((g) => g.rows.some((r) => r.cells.includes("pov"))), [groups]);
  const titleOf = (id: string) => cards.find((c) => c.id === id)?.title.trim() || p.untitled;

  if (order.length === 0) return <p className="sp-empty">{p.empty}</p>;
  if (groups.length === 0) return <p className="sp-empty">{p.timelineNoRows}</p>;

  return (
    <>
      <p className="sp-empty">{p.timelineHint}</p>
      <p className="tl-legend">
        <span className="tl-mark is-linked" aria-hidden="true" /> {p.timelineLinked}
        <span className="tl-mark is-cited" aria-hidden="true" /> {p.timelineCited}
        {hasPov && (
          <>
            <span className="tl-mark is-pov" aria-hidden="true" /> {p.timelinePov}
          </>
        )}
      </p>
      <div className="tl-scroll" role="region" aria-label={p.timeline} tabIndex={0}>
        <table className="tl-table">
          <thead>
            <tr>
              <td />
              {order.map((id, i) => (
                <th key={id} scope="col">
                  <button type="button" title={fmt(p.show, { title: titleOf(id) })} onClick={() => revealCard(id)}>
                    <span className="tl-number">{i + 1}</span>
                    <span className="tl-scene">{titleOf(id)}</span>
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          {groups.map((group) => (
            <tbody key={group.type}>
              <tr className="tl-group">
                <th scope="colgroup" colSpan={order.length + 1}>
                  <span className="tl-group-label">{group.type === "theme" ? p.timelineThemes : types[group.type].section}</span>
                </th>
              </tr>
              {group.rows.map((row) => (
                <tr key={row.card.id}>
                  <th scope="row">
                    <div className="tl-rowhead">
                      <button type="button" className="tl-card" title={fmt(p.show, { title: row.card.title })} onClick={() => revealCard(row.card.id)}>
                        <span className="card-dot" style={{ background: typeColor(group.type) }} />
                        {row.card.title}
                      </button>
                      <span className="tl-count">{row.count}</span>
                      {/* Lire le récit fil par fil (#117) : seulement ses scènes, dans le Manuscrit ou le Scénario. */}
                      {row.count > 0 && (
                        <button type="button" className="icon-button tl-read" aria-label={fmt(t.thread.readOf, { title: row.card.title })} title={fmt(t.thread.readOf, { title: row.card.title })} onClick={() => readThread(row.card.id)}>
                          <ReadIcon />
                        </button>
                      )}
                    </div>
                  </th>
                  {row.cells.map((cell, i) => {
                    const names = { card: row.card.title, scene: titleOf(order[i]) };
                    // Narrateur de la scène : il y est forcément ; la case le dit, sans fil à tirer ou retirer.
                    if (cell === "pov")
                      return (
                        <td key={order[i]}>
                          <span className="tl-cell is-pov" role="img" aria-label={fmt(p.timelinePovCell, names)} title={fmt(p.timelinePovCell, names)}>
                            <span className="tl-mark is-pov" aria-hidden="true" />
                          </span>
                        </td>
                      );
                    return (
                      <td key={order[i]}>
                        <button
                          type="button"
                          className={`tl-cell is-${cell}`}
                          aria-pressed={cell === "linked"}
                          aria-label={fmt(cell === "linked" ? p.timelineOn : cell === "cited" ? p.timelineCitedCell : p.timelineOff, names)}
                          onClick={() => toggleLink(order[i], row.card.id)}
                        >
                          <span className={`tl-mark is-${cell}`} aria-hidden="true" />
                        </button>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          ))}
        </table>
      </div>
    </>
  );
}

/** Icône « lire » : un livre ouvert, au trait de l'encre du thème. */
function ReadIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 6.5C10 5 7 4.5 3.5 5v13c3.5-.5 6.5 0 8.5 1.5 2-1.5 5-2 8.5-1.5V5C17 4.5 14 5 12 6.5Z" />
      <path d="M12 6.5V19.5" />
    </svg>
  );
}
