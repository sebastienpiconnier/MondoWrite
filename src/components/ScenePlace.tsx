// Ranger une scène depuis sa fiche (#141) : séquence, épisode et case du gabarit en listes déroulantes, dans
// l'onglet Scène du Scénario et la carte Scène agrandie. Changer la valeur déplace la scène et son texte, comme un
// glisser-déposer, en une étape d'annulation ; le séquencier et le canevas suivent. Scénario seulement.

import { useMemo } from "react";
import { useCosmos } from "../store";
import { useT } from "../i18n";
import { partLabel, partOfScene, structureOf } from "../screenplay/structure";
import { allEpisodes, episodeOfCard, episodeScript } from "../screenplay/series";
import { customOf, screenplayPlan } from "../screenplay/template";
import { beatText, templateBeats } from "../plan";
import { useEpisodeLabel } from "./EpisodePicker";

export function ScenePlace({ id }: { id: string }) {
  const t = useT();
  const sp = t.screenplay;
  const kind = useCosmos((s) => s.kind);
  const screenplay = useCosmos((s) => s.screenplay);
  const scriptBeats = useCosmos((s) => s.plan.scriptBeats);
  const episodeLabel = useEpisodeLabel();
  const info = useMemo(() => {
    if (kind !== "scenario" || !screenplay) return null;
    const els = screenplay.elements;
    const heading = els.findIndex((el) => el.type === "sceneHeading" && el.cardId === id);
    if (heading < 0) return null;
    const parts = structureOf(els);
    const seqs = parts.filter((p) => p.kind === "seq");
    const choices = seqs.length > 0 ? seqs : parts;
    const part = partOfScene(choices, heading);
    const episodes = allEpisodes(els);
    const episode = episodeOfCard(screenplay, id);
    // Cases du gabarit : celles de l'épisode de la scène dans une série.
    const own = episodeScript(screenplay, episode);
    const plan = screenplayPlan(own.elements);
    const custom = customOf(own.elements, scriptBeats);
    const beats = plan.template === "libre" ? [] : templateBeats(plan.template, custom);
    const beat = beats.find((k) => (plan.beats[k] ?? []).includes(id)) ?? "";
    return { choices, part, episodes, episode, beats, beat, custom };
  }, [kind, screenplay, id, scriptBeats]);
  if (!info || (info.choices.length === 0 && info.episodes.length === 0 && info.beats.length === 0)) return null;
  const st = useCosmos.getState;
  return (
    <section className="sp-box scene-place" aria-label={sp.placeTitle}>
      {info.episodes.length > 0 && (
        <label className="scene-place-row">
          <span>{sp.preserved.episode}</span>
          <select value={info.episode ?? ""} onChange={(e) => e.target.value && st().placeInEpisode(id, e.target.value)}>
            {!info.episode && <option value="">{t.season.outside}</option>}
            {info.episodes.map((ep) => (
              <option key={ep.id} value={ep.id}>
                {episodeLabel(ep)}
              </option>
            ))}
          </select>
        </label>
      )}
      {info.choices.length > 0 && (
        <label className="scene-place-row">
          <span>{info.choices[0].kind === "act" ? sp.preserved.act : sp.preserved.seq}</span>
          <select value={info.part?.key ?? ""} onChange={(e) => e.target.value && st().placeInPart(id, e.target.value)}>
            {!info.part && <option value="">{sp.placeNone}</option>}
            {info.choices.map((p) => (
              <option key={p.key} value={p.key}>
                {partLabel(p, sp.preserved)}
              </option>
            ))}
          </select>
        </label>
      )}
      {info.beats.length > 0 && (
        <label className="scene-place-row">
          <span>{sp.preserved.beat}</span>
          <select value={info.beat} onChange={(e) => e.target.value && st().placeInBeat(id, e.target.value)}>
            {!info.beat && <option value="">{sp.placeNone}</option>}
            {info.beats.map((k) => (
              <option key={k} value={k}>
                {beatText(k, t.plan.beats as Record<string, { label: string; hint: string }>, info.custom).label}
              </option>
            ))}
          </select>
        </label>
      )}
      <p className="sp-detail scene-place-hint">{sp.placeHint}</p>
    </section>
  );
}
