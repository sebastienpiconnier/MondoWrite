// Ce que « Ce qui change » remplit dans la Bible (lot 5), sans rien saisir ici :
// - sous la fiche d'un personnage, « Au fil des scènes » : un curseur sur le récit et son état à ce moment
//   (où il est, ce qu'il porte, ce qu'il sait, ce qu'il ignore encore), puis le journal de ses changements ;
// - dans « Pour vous », « Au fil du récit » : le journal entier, qui sait quoi, les objets, les promesses.
// Un clic sur une scène ouvre sa carte en grand, là où l'on écrit ses changements.

import { useId, useMemo, useState } from "react";
import { fmt, useT } from "../i18n";
import { useCosmos } from "../store";
import { objectTracks, promises, stateAt, whoKnows, type LoggedChange, type StoryStep } from "../changes";
import { useStoryLog } from "./useStoryLog";
import type { CardData } from "../types";

function useStepLabel() {
  const t = useT().changes;
  return (s: StoryStep) =>
    s.kind === "chapter" ? (s.title ? fmt(t.chapterTitled, { n: s.number, title: s.title }) : fmt(t.chapter, { n: s.number })) : fmt(t.scene, { n: s.number, title: s.title || t.untitledScene });
}

function SceneLink({ change, titleOf }: { change: LoggedChange; titleOf: (id: string) => string }) {
  const t = useT().changes;
  const title = titleOf(change.sceneId) || t.untitledScene;
  return (
    <button type="button" className="story-scene" aria-label={fmt(t.openScene, { title })} onClick={() => useCosmos.getState().expandCard(change.sceneId)}>
      {change.index + 1}. {title}
    </button>
  );
}

/** Sous la fiche d'un personnage : son état au fil du récit. Rien tant qu'aucune scène ne le fait changer. */
export function CharacterTimeline({ card }: { card: CardData }) {
  const t = useT().changes;
  const { log, steps, titleOf } = useStoryLog();
  const label = useStepLabel();
  const mine = useMemo(() => log.filter((c) => c.who.includes(card.id)), [log, card.id]);
  const [step, setStep] = useState<number | null>(null);
  const sliderId = useId();
  if (mine.length === 0 || steps.length === 0) return null;
  const at = Math.min(step ?? steps.length - 1, steps.length - 1);
  const state = stateAt(card.id, log, steps[at].index);
  const list = (items: string[]) => (items.length > 0 ? items.join(" · ") : t.nothing);

  return (
    <details className="story-character">
      <summary>{t.character}</summary>
      <div className="story-slider">
        <label htmlFor={sliderId} className="sr-only">
          {t.stepAria}
        </label>
        <input id={sliderId} type="range" min={0} max={steps.length - 1} value={at} aria-valuetext={label(steps[at])} onChange={(e) => setStep(Number(e.target.value))} />
        <p className="story-step">{fmt(t.after, { step: label(steps[at]) })}</p>
      </div>
      <dl className="story-state">
        <div>
          <dt>{t.place}</dt>
          <dd>{state.place ? state.place.text : t.nothing}</dd>
        </div>
        <div>
          <dt>{t.carries}</dt>
          <dd>{list(state.carries.map((c) => c.text))}</dd>
        </div>
        <div>
          <dt>{t.knows}</dt>
          <dd>{list(state.knows.map((c) => c.text))}</dd>
        </div>
        <div>
          <dt>{t.ignores}</dt>
          <dd>{list(state.ignores.map((c) => c.text))}</dd>
        </div>
      </dl>
      <h4 className="story-subtitle">{t.journal}</h4>
      <ol className="story-journal">
        {mine.map((c, i) => (
          <li key={i} className={c.index > steps[at].index ? "is-later" : ""}>
            <SceneLink change={c} titleOf={titleOf} />
            <span>{c.text}</span>
          </li>
        ))}
      </ol>
    </details>
  );
}

/** « Au fil du récit », en fin de Bible (partie « Pour vous ») : rien tant qu'aucune scène n'a de changement. */
export function StoryLogSection() {
  const t = useT().changes;
  const { log, titleOf } = useStoryLog();
  const nodes = useCosmos((s) => s.nodes);
  const knows = useMemo(() => whoKnows(log), [log]);
  const objects = useMemo(() => objectTracks(log), [log]);
  const promised = useMemo(() => promises(log), [log]);
  if (log.length === 0) return null;
  const nameOf = (id: string) => nodes.find((n) => n.id === id)?.data.title.trim() || "?";
  const people = [...new Set(knows.flatMap((r) => [...r.learned.keys()]))];

  return (
    <div className="bible-group story-log" data-story="">
      <div className="bible-main-head">
        <h2 className="bible-group-title">{t.story}</h2>
      </div>
      <p className="muted story-hint">{t.storyHint}</p>

      <h3 className="story-subtitle">{t.storyJournal}</h3>
      <ol className="story-journal">
        {log.map((c, i) => (
          <li key={i}>
            <SceneLink change={c} titleOf={titleOf} />
            <span>{c.text}</span>
          </li>
        ))}
      </ol>

      {knows.length > 0 && (
        <>
          <h3 className="story-subtitle">{t.whoKnows}</h3>
          <p className="muted story-hint">{t.whoKnowsHint}</p>
          <div className="story-table-wrap">
            <table className="story-table">
              <thead>
                <tr>
                  <th scope="col">
                    <span className="sr-only">{t.whoKnows}</span>
                  </th>
                  {people.map((id) => (
                    <th key={id} scope="col">
                      {nameOf(id)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {knows.map((row) => (
                  <tr key={row.key}>
                    <th scope="row">{row.text}</th>
                    {people.map((id) => {
                      const at = row.learned.get(id);
                      return <td key={id}>{at ? at.index + 1 : ""}</td>;
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {objects.length > 0 && (
        <>
          <h3 className="story-subtitle">{t.objects}</h3>
          <ul className="story-list">
            {objects.map((o) => (
              <li key={o.key}>
                <strong>{o.text}</strong>
                <span className="muted">
                  {o.moves.map((m) => `${m.who.map(nameOf).join(", ")} ${m.verb === "recoit" ? t.verbs.recoit : t.verbs.perd} (${m.index + 1})`).join(" · ")}
                </span>
              </li>
            ))}
          </ul>
        </>
      )}

      {promised.length > 0 && (
        <>
          <h3 className="story-subtitle">{t.promises}</h3>
          <ul className="story-list">
            {promised.map((p, i) => (
              <li key={i}>
                <strong>
                  {p.made.who.map(nameOf).join(", ")} {t.verbs.promet} {p.text}
                </strong>
                <span className={p.kept ? "muted" : "story-open"}>
                  {p.kept ? fmt(t.promiseKept, { scene: `${p.kept.index + 1}. ${titleOf(p.kept.sceneId) || t.untitledScene}` }) : t.promiseOpen}
                </span>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
