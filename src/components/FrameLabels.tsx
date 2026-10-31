// Titres des cadres vus de loin : quand on recule, les cartes deviennent illisibles mais les titres doivent
// se lire, comme des intertitres. Ils passent alors dans une couche posée au-dessus des cartes (ViewportPortal
// de React Flow), agrandis selon le niveau du cadre (frameLevels.ts). Rien ne s'y clique : le cadre et ses
// cartes répondent dessous comme d'habitude. De près, c'est l'en-tête du cadre (FrameNode) qui porte le titre.

import { memo, useMemo, type CSSProperties } from "react";
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

function FrameLabelsImpl() {
  const t = useT().toile;
  const zoom = useStore(zoomStep);
  const frames = useCosmos((s) => s.frames);
  const keys = useCosmos(beatKeys);
  const labels = useMemo(() => {
    const boxes = frames.map((f) => ({ id: f.id, ...frameBox(f) }));
    return boxes.flatMap((box, i) => {
      const data = frames[i].data;
      const level = frameLevel(frameDepth(box.id, boxes));
      const title = data.title.trim();
      const far = titleBoost(zoom, level);
      if (far <= 1 || !title) return [];
      const boost = fitBoost(title, box.width, titleSize(level, !!data.beat), far);
      const rank = data.beat ? keys.indexOf(data.beat) + 1 : 0;
      return [{ ...box, level, boost, title, beat: !!data.beat, kicker: rank > 0 ? fmt(t.beatRank, { n: rank, total: keys.length }) : "" }];
    });
  }, [frames, zoom, keys, t]);

  if (labels.length === 0) return null;
  return (
    <ViewportPortal>
      <div className="frame-labels" aria-hidden="true">
        {labels.map((l) => (
          <div
            key={l.id}
            className={`frame-label is-level-${l.level}${l.beat ? " is-beat" : ""}`}
            style={{ transform: `translate(${l.x}px, ${l.y}px)`, width: l.width, "--frame-boost": l.boost } as CSSProperties}
          >
            <span className="frame-label-text">
              {l.kicker && <span className="frame-kicker">{l.kicker}</span>}
              <span className="frame-label-title">{l.title}</span>
            </span>
          </div>
        ))}
      </div>
    </ViewportPortal>
  );
}

export const FrameLabels = memo(FrameLabelsImpl);
