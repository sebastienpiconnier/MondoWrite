// Carte des relations, dans la rubrique Personnages de la Bible : les portraits reliés par les fils du
// canevas, avec leurs étiquettes. Un fil s'épaissit avec le nombre de scènes que les deux partagent
// (useProjectStats, comme « Qui croise qui ») ; en pointillé, ils n'en partagent aucune. Rien n'est enregistré à part : c'est une autre lecture des fils.
// Toucher un portrait ouvre sa fiche. La liste des relations, en texte, suit la carte (lecteurs d'écran,
// et lecture rapide sur téléphone).

import { useMemo } from "react";
import { useCosmos } from "../store";
import { fmt, useT } from "../i18n";
import { useSettings } from "../settings";
import { edgePoint, relationMap } from "../relations";
import type { CardData } from "../types";
import { useMediaUrl } from "./useMediaUrl";
import { useProjectStats } from "./useProjectStats";
import { sharedById } from "../review/crossings";

const R = 34;
const R_HUB = 44;

function Face({ card, size, label, onOpen, left, top }: { card: CardData; size: number; label: string; onOpen: () => void; left: string; top: string }) {
  const url = useMediaUrl(card.image);
  return (
    <button type="button" className={`rel-face${url ? "" : " is-empty"}`} style={{ left, top, width: size, height: size }} aria-label={label} title={label} onClick={onOpen}>
      {url ? <img src={url} alt="" /> : <span aria-hidden="true">{(card.title.trim()[0] ?? "?").toUpperCase()}</span>}
    </button>
  );
}

export function RelationsMap({ onOpen }: { onOpen: (id: string) => void }) {
  const t = useT();
  const r = t.relations;
  const lang = useSettings((s) => s.lang);
  const nodes = useCosmos((s) => s.nodes);
  const edges = useCosmos((s) => s.edges);
  const cards = useMemo(() => new Map(nodes.map((n) => [n.id, n.data])), [nodes]);
  const map = useMemo(
    () => relationMap([...cards.values()], edges.map((e) => ({ id: e.id, source: e.source, target: e.target, label: String(e.label ?? "") })), lang),
    [cards, edges, lang],
  );
  const { cast } = useProjectStats();
  const together = useMemo(() => new Map(map.edges.map((e) => [e.id, sharedById(cast.people, e.source, e.target)])), [map, cast]);
  const most = Math.max(1, ...together.values());
  // Rien d'écrit encore (aucune scène ne cite personne) : pas de pointillés partout.
  const anyScene = cast.people.some((p) => p.scenes.length > 0);
  const at = new Map(map.nodes.map((n) => [n.id, n]));
  const radius = (id: string) => (id === map.hub ? R_HUB : R);
  const name = (id: string) => cards.get(id)?.title.trim() || t.bible.untitled;

  if (map.nodes.length === 0) return <p className="muted">{r.noCharacters}</p>;

  return (
    <div className="rel">
      <div className="rel-map" style={{ aspectRatio: `${map.width} / ${map.height}`, maxWidth: map.width }}>
        <svg viewBox={`0 0 ${map.width} ${map.height}`} aria-hidden="true">
          {map.edges.map((e) => {
            const a = at.get(e.source)!;
            const b = at.get(e.target)!;
            // Le nom est écrit sous le portrait : un fil qui part vers le bas commence après lui.
            const gap = (from: { x: number; y: number }, to: { x: number; y: number }) => (to.y - from.y > Math.abs(to.x - from.x) * 0.5 ? 28 : 4);
            const p = edgePoint(a.x, a.y, b.x, b.y, radius(a.id) + gap(a, b));
            const q = edgePoint(b.x, b.y, a.x, a.y, radius(b.id) + gap(b, a));
            return (
              <g key={e.id}>
                <line
                  x1={p.x}
                  y1={p.y}
                  x2={q.x}
                  y2={q.y}
                  className={`rel-line${anyScene && !together.get(e.id) ? " is-apart" : ""}`}
                  style={{ strokeWidth: anyScene ? 1.5 + (5 * (together.get(e.id) ?? 0)) / most : undefined }}
                />
                {e.label && (
                  <text x={(p.x + q.x) / 2} y={(p.y + q.y) / 2} className="rel-label" textAnchor="middle" dominantBaseline="middle">
                    {e.label.length > 28 ? `${e.label.slice(0, 27)}…` : e.label}
                  </text>
                )}
              </g>
            );
          })}
          {map.nodes.map((n) => (
            <text key={n.id} x={n.x} y={n.y + radius(n.id) + 18} className="rel-name" textAnchor="middle">
              {name(n.id).length > 22 ? `${name(n.id).slice(0, 21)}…` : name(n.id)}
            </text>
          ))}
        </svg>
        {map.nodes.map((n) => {
          const card = cards.get(n.id)!;
          const size = radius(n.id) * 2;
          return (
            <Face
              key={n.id}
              card={card}
              size={size}
              left={`calc(${(n.x / map.width) * 100}% - ${size / 2}px)`}
              top={`calc(${(n.y / map.height) * 100}% - ${size / 2}px)`}
              label={fmt(n.degree === 1 ? r.faceOne : r.faceMany, { name: name(n.id), n: n.degree })}
              onOpen={() => onOpen(n.id)}
            />
          );
        })}
      </div>
      {map.edges.length === 0 ? (
        <p className="muted">{r.noLinks}</p>
      ) : (
        <ul className="rel-list" aria-label={r.listAria}>
          {map.edges.map((e) => (
            <li key={e.id}>
              <strong>{name(e.source)}</strong>
              <span className="rel-list-label">{e.label || r.unlabeled}</span>
              <strong>{name(e.target)}</strong>
              {anyScene && <span className="muted rel-list-shared">{fmt(together.get(e.id) === 1 ? r.sharedOne : r.sharedMany, { n: together.get(e.id) ?? 0 })}</span>}
            </li>
          ))}
        </ul>
      )}
      <p className="pitch-hint">{r.hint}</p>
    </div>
  );
}
