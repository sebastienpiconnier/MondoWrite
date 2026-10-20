// Chronologie par intrigue (dans la vue Plan d'un roman) : un tableau où chaque colonne est une scène,
// dans l'ordre du plan, et chaque ligne une intrigue (carte Thème), un personnage ou un lieu.
// Toucher une case tire un fil entre la carte et la scène, ou le retire : c'est le même fil que sur le canevas.

import { useMemo } from "react";
import { useCosmos } from "../store";
import { useSettings } from "../settings";
import { fmt, useT } from "../i18n";
import { useVocab } from "../vocab";
import { typeColor } from "../types";
import { timeline } from "../timeline";

export function Timeline({ order }: { order: string[] }) {
  const p = useT().plan;
  const { types } = useVocab();
  const lang = useSettings((s) => s.lang);
  const nodes = useCosmos((s) => s.nodes);
  const edges = useCosmos((s) => s.edges);
  const manuscript = useCosmos((s) => s.manuscript);
  const toggleLink = useCosmos((s) => s.toggleLink);
  const revealCard = useCosmos((s) => s.revealCard);

  const cards = useMemo(() => nodes.map((n) => n.data), [nodes]);
  const groups = useMemo(() => timeline(cards, edges, manuscript, order, lang), [cards, edges, manuscript, order, lang]);
  const titleOf = (id: string) => cards.find((c) => c.id === id)?.title.trim() || p.untitled;

  if (order.length === 0) return <p className="sp-empty">{p.empty}</p>;
  if (groups.length === 0) return <p className="sp-empty">{p.timelineNoRows}</p>;

  return (
    <>
      <p className="sp-empty">{p.timelineHint}</p>
      <p className="tl-legend">
        <span className="tl-mark is-linked" aria-hidden="true" /> {p.timelineLinked}
        <span className="tl-mark is-cited" aria-hidden="true" /> {p.timelineCited}
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
                    </div>
                  </th>
                  {row.cells.map((cell, i) => {
                    const names = { card: row.card.title, scene: titleOf(order[i]) };
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
