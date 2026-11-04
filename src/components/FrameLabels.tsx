// Titres des cadres, toujours au premier plan : une couche posée au-dessus des cartes, des fils et de leurs
// étiquettes (ViewportPortal de React Flow). De loin, quand les cartes deviennent illisibles, les titres s'y
// lisent comme des intertitres, agrandis selon le niveau du cadre (frameLevels.ts), et le titre d'un sous-cadre
// (chapitre dans une case) descend sous celui du cadre qui le contient au lieu de le recouvrir (1.10.3).
// De près, la couche recopie le titre exactement par-dessus celui de l'en-tête (FrameNode), mesuré dans la page,
// pour que les fils ne le traversent plus ; pendant qu'on le modifie, la copie s'efface. Rien ne s'y clique :
// le cadre et ses cartes répondent dessous comme d'habitude.

import { memo, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { useStore, ViewportPortal } from "@xyflow/react";
import { useCosmos } from "../store";
import { fmt, useT } from "../i18n";
import { frameBox } from "../projectState";
import { fitBoost, frameDepth, frameLevel, titleBoost, titleSize } from "../frameLevels";
import { templateBeats } from "../plan";
import { screenplayPlan } from "../screenplay/template";
import type { ScreenplayElement } from "../screenplay/model";

type CosmosState = ReturnType<typeof useCosmos.getState>;

// Cases du gabarit en place, relues une fois par version du scénario (pas une fois par cadre et par rendu).
// Sélecteur du store : il doit rendre le MÊME tableau tant que rien ne change, sinon React redessine en
// boucle et la fenêtre reste vide (1.7.0 à 1.7.2 : roman en gabarit libre ou « Mes gabarits »).
const NO_BEATS: readonly string[] = Object.freeze([]);
const screenplayKeys = new WeakMap<ScreenplayElement[], readonly string[]>();
const customKeys = new WeakMap<object, readonly string[]>();
export function beatKeys(s: CosmosState): readonly string[] {
  if (s.kind !== "scenario") {
    const { template, custom } = s.plan;
    if (template === "libre") return NO_BEATS;
    if (template !== "perso") return templateBeats(template);
    if (!custom) return NO_BEATS;
    let keys = customKeys.get(custom);
    if (!keys) customKeys.set(custom, (keys = templateBeats(template, custom)));
    return keys;
  }
  const elements = s.screenplay?.elements ?? [];
  let keys = screenplayKeys.get(elements);
  if (!keys) {
    const plan = screenplayPlan(elements);
    keys = plan.template === "libre" ? NO_BEATS : templateBeats(plan.template, plan.custom);
    screenplayKeys.set(elements, keys);
  }
  return keys;
}

/** Zoom par crans d'un vingtième : la couche ne se redessine pas à chaque image d'un zoom. Le même pour
 *  l'en-tête des cadres (FrameNode), sinon le titre s'afficherait deux fois près du seuil. */
export const zoomStep = (s: { transform: [number, number, number] }) => Math.round(s.transform[2] * 20) / 20;

/** Place du titre et du rang dans l'en-tête d'un cadre, en unités du canevas, depuis le coin du cadre. */
interface HeadRect {
  dx: number;
  dy: number;
  w: number;
  h: number;
  /** Rang de la case (« Case 3 sur 15 ») : il peut passer à la ligne sous le titre dans un cadre étroit. */
  kicker?: { dx: number; dy: number; w: number; h: number };
}

const near = (x: number, y: number) => Math.abs(x - y) < 0.5;
const sameBox = (a?: { dx: number; dy: number; w: number; h: number }, b?: { dx: number; dy: number; w: number; h: number }) =>
  a === b || (!!a && !!b && near(a.dx, b.dx) && near(a.dy, b.dy) && near(a.w, b.w) && near(a.h, b.h));
const sameRects = (a: Record<string, HeadRect>, b: Record<string, HeadRect>) => {
  const ka = Object.keys(a);
  if (ka.length !== Object.keys(b).length) return false;
  return ka.every((k) => !!b[k] && sameBox(a[k], b[k]) && sameBox(a[k].kicker, b[k].kicker));
};

/**
 * Place d'un élément dans son nœud, en unités du canevas : offsetLeft et offsetTop, cumulés jusqu'au nœud. Ce
 * sont des mesures de mise en page, que le zoom de la vue ne touche pas. Le premier essai divisait la place à
 * l'écran par le zoom lu dans React Flow : pendant le « tout voir » animé, les deux n'étaient pas du même instant,
 * et la copie était coupée (« Saiso… ») et décalée sous le titre de l'en-tête.
 */
export function boxIn(el: HTMLElement, node: HTMLElement): { dx: number; dy: number; w: number; h: number } {
  let dx = 0;
  let dy = 0;
  let cur: HTMLElement | null = el;
  while (cur && cur !== node) {
    dx += cur.offsetLeft;
    dy += cur.offsetTop;
    const parent = cur.offsetParent as HTMLElement | null;
    // Un parent positionné entre l'élément et le nœud compte aussi sa bordure.
    if (parent && parent !== node) {
      dx += parent.clientLeft;
      dy += parent.clientTop;
    }
    cur = parent;
  }
  return { dx, dy, w: el.offsetWidth, h: el.offsetHeight };
}

/** Cadre dont on modifie le titre en ce moment (la copie s'efface pour laisser voir le curseur). */
function useEditingFrame(): string | null {
  const [id, setId] = useState<string | null>(null);
  useEffect(() => {
    const read = () => {
      const el = document.activeElement;
      const node = el instanceof HTMLElement && el.classList.contains("frame-title") ? el.closest<HTMLElement>(".react-flow__node") : null;
      setId(node?.dataset.id ?? null);
    };
    document.addEventListener("focusin", read);
    document.addEventListener("focusout", read);
    return () => {
      document.removeEventListener("focusin", read);
      document.removeEventListener("focusout", read);
    };
  }, []);
  return id;
}

/**
 * Descente des titres de loin : un titre qui commencerait sous le bas du titre d'un cadre qui le contient
 * (et le chevauche en largeur) est posé juste dessous. Les cadres sont pris du plus haut niveau au plus bas.
 * Fonction pure, testée (frame-labels.test.ts).
 */
export function stackLabels(labels: { id: string; x: number; y: number; width: number; level: number }[], heights: Record<string, number>): Record<string, number> {
  const out: Record<string, number> = {};
  const placed: { x: number; y: number; width: number; bottom: number; level: number }[] = [];
  for (const l of [...labels].sort((a, b) => a.level - b.level || a.y - b.y)) {
    let y = l.y;
    for (const p of placed) {
      if (p.level >= l.level) continue;
      const overlap = l.x < p.x + p.width && p.x < l.x + l.width;
      if (overlap && p.y <= l.y && p.bottom > y) y = p.bottom;
    }
    out[l.id] = y - l.y;
    placed.push({ x: l.x, y, width: l.width, bottom: y + (heights[l.id] ?? 0), level: l.level });
  }
  return out;
}

/** `hidden` : cadres masqués par le filtre du canevas (Toile), dont le titre ne se dessine pas non plus. */
function FrameLabelsImpl({ hidden }: { hidden?: ReadonlySet<string> }) {
  const t = useT().toile;
  const zoom = useStore(zoomStep);
  const frames = useCosmos((s) => s.frames);
  const keys = useCosmos(beatKeys);
  const editing = useEditingFrame();
  const labels = useMemo(() => {
    const boxes = frames.map((f) => ({ id: f.id, ...frameBox(f) }));
    return boxes.flatMap((box, i) => {
      const data = frames[i].data;
      const level = frameLevel(frameDepth(box.id, boxes));
      const title = data.title.trim();
      if (hidden?.has(box.id) || !title) return [];
      const far = titleBoost(zoom, level);
      const boost = far > 1 ? fitBoost(title, box.width, titleSize(level, !!data.beat || !!data.season), far) : 1;
      const rank = data.beat ? keys.indexOf(data.beat) + 1 : 0;
      return [{ ...box, level, far: far > 1, boost, title, beat: !!data.beat || !!data.season, kicker: rank > 0 ? fmt(t.beatRank, { n: rank, total: keys.length }) : "" }];
    });
  }, [frames, zoom, keys, t, hidden]);

  // De près : place du titre dans l'en-tête de chaque cadre, mesurée après le dessin (la largeur suit le texte).
  const [heads, setHeads] = useState<Record<string, HeadRect>>({});
  const nearIds = useMemo(() => labels.filter((l) => !l.far).map((l) => l.id).join(" "), [labels]);
  useEffect(() => {
    if (!nearIds) return;
    const ids = nearIds.split(" ");
    const measure = () => {
      const next: Record<string, HeadRect> = {};
      for (const id of ids) {
        const node = document.querySelector<HTMLElement>(`.react-flow__node[data-id="${CSS.escape(id)}"]`);
        const input = node?.querySelector<HTMLElement>(".frame-title");
        if (!node || !input || input.offsetWidth === 0) continue;
        const kicker = node.querySelector<HTMLElement>(".frame-handle > .frame-kicker");
        next[id] = { ...boxIn(input, node), kicker: kicker ? boxIn(kicker, node) : undefined };
      }
      setHeads((prev) => (sameRects(prev, next) ? prev : next));
    };
    const frame = requestAnimationFrame(measure);
    // Le titre change de largeur (frappe ailleurs, polices chargées après coup, cadre redimensionné) : on remesure.
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(() => requestAnimationFrame(measure));
    for (const id of ids) {
      const node = document.querySelector<HTMLElement>(`.react-flow__node[data-id="${CSS.escape(id)}"]`);
      node?.querySelectorAll<HTMLElement>(".frame-title, .frame-handle").forEach((el) => observer?.observe(el));
    }
    void document.fonts?.ready.then(measure);
    return () => {
      cancelAnimationFrame(frame);
      observer?.disconnect();
    };
  }, [nearIds, frames, t]);

  // De loin : hauteur de chaque titre dessiné, pour poser les titres des sous-cadres dessous.
  const refs = useRef(new Map<string, HTMLDivElement>());
  const [shifts, setShifts] = useState<Record<string, number>>({});
  const farLabels = useMemo(() => labels.filter((l) => l.far), [labels]);
  useLayoutEffect(() => {
    const heights: Record<string, number> = {};
    for (const l of farLabels) heights[l.id] = refs.current.get(l.id)?.offsetHeight ?? 0;
    const next = stackLabels(farLabels, heights);
    setShifts((prev) => (JSON.stringify(prev) === JSON.stringify(next) ? prev : next));
  }, [farLabels]);

  if (labels.length === 0) return null;
  // Les grands cadres en dernier : à égalité, leur titre passe devant celui d'un sous-cadre.
  const ordered = [...labels].sort((a, b) => b.level - a.level);
  return (
    <ViewportPortal>
      <div className="frame-labels" aria-hidden="true">
        {ordered.map((l) => {
          if (l.far) {
            return (
              <div
                key={l.id}
                ref={(el) => {
                  if (el) refs.current.set(l.id, el);
                  else refs.current.delete(l.id);
                }}
                className={`frame-label is-level-${l.level}${l.beat ? " is-beat" : ""}`}
                style={{ transform: `translate(${l.x}px, ${l.y + (shifts[l.id] ?? 0)}px)`, width: l.width, "--frame-boost": l.boost } as CSSProperties}
              >
                <span className="frame-label-text">
                  {l.kicker && <span className="frame-kicker">{l.kicker}</span>}
                  <span className="frame-label-title">{l.title}</span>
                </span>
              </div>
            );
          }
          const head = heads[l.id];
          if (!head || editing === l.id) return null;
          const cls = `frame-label is-near is-level-${l.level}${l.beat ? " is-beat" : ""}`;
          return [
            // Largeur du texte lui-même, bornée au cadre : offsetWidth est arrondi au pixel, et une copie à la largeur
            // mesurée coupait son dernier caractère (« Act… » sur « Acte 1 »).
            <div key={l.id} className={cls} style={{ transform: `translate(${l.x + head.dx}px, ${l.y + head.dy}px)`, minWidth: head.w, maxWidth: Math.max(head.w, l.width - head.dx - 8), height: head.h }}>
              <span className="frame-near-title">{l.title}</span>
            </div>,
            l.kicker && head.kicker && (
              <div
                key={`${l.id}:rank`}
                className={`${cls} is-rank`}
                style={{ transform: `translate(${l.x + head.kicker.dx}px, ${l.y + head.kicker.dy}px)`, minWidth: head.kicker.w, height: head.kicker.h }}
              >
                <span className="frame-kicker">{l.kicker}</span>
              </div>
            ),
          ];
        })}
      </div>
    </ViewportPortal>
  );
}

export const FrameLabels = memo(FrameLabelsImpl);
