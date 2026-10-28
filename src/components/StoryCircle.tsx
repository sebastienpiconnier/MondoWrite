// Cercle de Dan Harmon, dessiné en cercle dans le Plan et le séquencier : les huit étapes autour, le nombre de
// scènes dans chacune, le monde connu en haut et l'inconnu en bas. Une étape vide se voit (pointillé) ; la
// toucher mène à sa case dans la liste. Un affichage, rien n'est enregistré.

import { fmt, useT } from "../i18n";
import { PLAN_TEMPLATES, type PlanBeat } from "../plan";

interface Props {
  /** Scènes de chaque étape, par clé de case. */
  counts: Record<string, number>;
  onPick: (key: string) => void;
}

const SIZE = 320;
const C = SIZE / 2;
const OUTER = 120;
const INNER = 58;

/** Point du cercle à l'angle `a` (en tours, 0 en haut, sens des aiguilles d'une montre). */
const at = (a: number, r: number) => [C + r * Math.sin(a * 2 * Math.PI), C - r * Math.cos(a * 2 * Math.PI)] as const;

function sector(i: number, n: number): string {
  const gap = 0.006;
  const a0 = i / n - 0.5 / n + gap;
  const a1 = i / n + 0.5 / n - gap;
  const [x0, y0] = at(a0, OUTER);
  const [x1, y1] = at(a1, OUTER);
  const [x2, y2] = at(a1, INNER);
  const [x3, y3] = at(a0, INNER);
  return `M${x0},${y0} A${OUTER},${OUTER} 0 0 1 ${x1},${y1} L${x2},${y2} A${INNER},${INNER} 0 0 0 ${x3},${y3} Z`;
}

export function StoryCircle({ counts, onPick }: Props) {
  const t = useT();
  const c = t.circle;
  const keys = PLAN_TEMPLATES.cercleHarmon;
  const n = keys.length;
  return (
    <figure className="story-circle">
      <svg viewBox={`0 0 ${SIZE} ${SIZE}`} role="group" aria-label={c.aria}>
        <line x1={C - OUTER - 14} y1={C} x2={C + OUTER + 14} y2={C} className="story-circle-axis" />
        <text x={C} y={C - 10} className="story-circle-world">
          {c.known}
        </text>
        <text x={C} y={C + 20} className="story-circle-world">
          {c.unknown}
        </text>
        {keys.map((key, i) => {
          const count = counts[key] ?? 0;
          const label = t.plan.beats[key as PlanBeat].label;
          const [tx, ty] = at(i / n, (OUTER + INNER) / 2);
          return (
            <g
              key={key}
              role="button"
              tabIndex={0}
              className={`story-circle-step${count === 0 ? " is-empty" : ""}`}
              aria-label={fmt(count === 1 ? c.stepOne : c.stepMany, { step: label, n: count })}
              onClick={() => onPick(key)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  onPick(key);
                }
              }}
            >
              <title>{fmt(count === 1 ? c.stepOne : c.stepMany, { step: label, n: count })}</title>
              <path d={sector(i, n)} />
              <text x={tx} y={ty - 4} className="story-circle-num">
                {i + 1}
              </text>
              <text x={tx} y={ty + 12} className="story-circle-count">
                {count}
              </text>
            </g>
          );
        })}
      </svg>
      <figcaption className="story-circle-legend">
        {keys.map((key, i) => (
          <span key={key}>
            {i + 1}. {t.plan.beats[key as PlanBeat].label.replace(/^\d+\s*·\s*/, "")}
          </span>
        ))}
      </figcaption>
    </figure>
  );
}
