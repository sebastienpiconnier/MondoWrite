// Onglet « Vérifier » de la colonne de droite (Manuscrit et Scénario) : les points à regarder, groupés par règle.
// Un point mène au passage ; « Renommer partout… » et « Créer la carte » ouvrent les outils existants ;
// « Ignorer » le retire de la liste pour la session. Le panneau ne modifie jamais le texte de lui-même.

import { create } from "zustand";
import { fmt, useT } from "../i18n";
import { useSettings } from "../settings";
import { useCosmos } from "../store";
import { STORY_RULES, groupFindings, type Finding } from "../review/checks";
import type { PlanBeat } from "../plan";
import { titleCase } from "../screenplay/editor/autocomplete";
import type { SceneRef } from "../ai/review";
import { AiQuestions, useAiReviewActive } from "./AiReview";

/** Points ignorés pendant la session (jamais enregistrés). */
const useIgnored = create<{ keys: Set<string> }>(() => ({ keys: new Set() }));
const ignore = (key: string) => useIgnored.setState((s) => ({ keys: new Set(s.keys).add(key) }));

/** Nombre de points encore à regarder (pour le bouton « Vérifier · N »). */
export function useOpenFindings(findings: Finding[]): number {
  const keys = useIgnored((s) => s.keys);
  return findings.filter((f) => !keys.has(f.key)).length;
}

interface Props {
  findings: Finding[];
  /** Scénario : nombres de répliques et éléments du format ; roman : texte en prose. */
  kind: "script" | "text";
  /** Où se trouve le point, pour l'auteur : « Scène 3 », ou le titre de la scène. */
  where: (f: Finding) => string;
  onGo: (f: Finding) => void;
  /** Questions de l'IA (relecture) : mène à la scène citée ; faux si elle n'existe plus. */
  onAiScene?: (ref: SceneRef, quote?: string) => boolean;
}

export function ReviewPanel({ findings, kind, where, onGo, onAiScene }: Props) {
  const all = useT();
  const t = all.review;
  const beats = all.plan.beats;
  const lang = useSettings((s) => s.lang);
  const ignored = useIgnored((s) => s.keys);
  const aiActive = useAiReviewActive() && !!onAiScene;
  const groups = groupFindings(findings, ignored);
  const left = groups.reduce((n, g) => n + g.items.length, 0);
  const hidden = findings.filter((f) => ignored.has(f.key)).length;
  const replies = (n: number) => (n === 1 ? t.repliesOne : fmt(t.repliesMany, { n }));

  const label = (f: Finding): string => {
    const w = STORY_RULES.includes(f.rule) ? "" : where(f);
    switch (f.rule) {
      case "similarNames":
        return kind === "script"
          ? fmt(t.items.similarNamesScript, { where: w, rare: f.names![0], common: f.names![1], a: replies(f.counts![0]), b: replies(f.counts![1]) })
          : fmt(t.items.similarNamesText, { where: w, rare: f.names![0], common: f.names![1] });
      case "unknownCharacter":
        return fmt(t.items.unknownCharacter, { where: w, name: f.names![0] });
      case "silentCharacter":
        return fmt(t.items.silentCharacter, { where: w, name: f.names![0] });
      case "longAction":
        return fmt(t.items.longAction, { where: w, n: f.counts![0] });
      case "headingFormat":
        return fmt(t.items.headingFormat, { where: w, text: f.text });
      case "emptyElement":
        return f.text.trim() ? fmt(t.items.emptyCharacter, { where: w, text: f.text }) : fmt(t.items.emptyHeading, { where: w });
      case "extraSpaces":
        return fmt(t.items.extraSpaces, { where: w, text: f.text });
      case "nearRepeat":
        return fmt(f.counts![0] === 0 ? t.items.nearRepeatNext : t.items.nearRepeat, { where: w, word: f.names![0], n: f.counts![0], text: f.text });
      case "frequentWords":
        return fmt(t.items.frequentWords, { total: new Intl.NumberFormat(lang).format(f.counts![f.counts!.length - 1]) });
      case "principalNotMost":
        return fmt(t.items.principalNotMost, { name: f.names![0], other: f.names![1], a: f.counts![0], b: f.counts![1] });
      case "noGoal":
        return fmt(t.items.noGoal, { name: f.names![0] });
      case "noEpisodes":
        return t.items.noEpisodes;
      case "pilotLength":
        return fmt(t.items.pilotLength, { n: f.counts![0], min: f.counts![1], max: f.counts![2], format: f.text });
      case "episodeLength":
        return fmt(t.items.episodeLength, { episode: f.text, n: f.counts![0], min: f.counts![1], max: f.counts![2] });
      case "principalAbsent":
        return fmt(t.items.principalAbsent, { name: f.names![0], from: f.names![1], to: f.names![2], n: f.counts![0] });
      case "secretNoReveal":
        return fmt(t.items.secretNoReveal, { name: f.names![0] });
      case "secretNoClue":
        return fmt(t.items.secretNoClue, { name: f.names![0] });
      case "objectOnce":
        return fmt(t.items.objectOnce, { name: f.names![0] });
      case "beatDrift":
        return fmt(t.items.beatDrift, { beat: beats[f.text as PlanBeat]?.label ?? f.text, at: f.counts![0], target: f.counts![1] });
    }
  };
  // Une question sur l'histoire mène à la fiche (ou à la Bible), pas à un passage du texte.
  // Un mot employé souvent : « Rechercher et remplacer » montre chacun de ses emplois, avec son contexte.
  const findWord = (word: string) => useCosmos.getState().openReplace({ find: word, sceneId: null, renameId: null });
  const go = (f: Finding) => {
    if (f.rule === "frequentWords") return findWord(f.names![0]);
    if (!STORY_RULES.includes(f.rule)) return onGo(f);
    const s = useCosmos.getState();
    // Une case loin de sa place : on va à sa première scène, dans le texte.
    if (f.rule === "beatDrift" && f.sceneId) return s.openInManuscript(f.sceneId);
    // La longueur d'un épisode : on ouvre cet épisode dans le séquencier.
    if (f.rule === "episodeLength" && f.sceneId) {
      s.openEpisode(f.sceneId);
      return s.setView("plan");
    }
    if (f.sceneId) s.openInBible(f.sceneId);
    else s.setView("bible");
  };

  return (
    <div className="review">
      {onAiScene && <AiQuestions onScene={onAiScene} />}
      {!(left === 0 && aiActive) && (
        <p className="review-summary" role="status">
          {left === 0 ? t.none : left === 1 ? t.summaryOne : fmt(t.summaryMany, { n: left })}
        </p>
      )}
      {groups.map((g) => (
        <section key={g.rule} className="review-group" aria-labelledby={`review-${g.rule}`}>
          <h3 id={`review-${g.rule}`} className="review-rule">
            {t.rules[g.rule]} · {g.items.length}
          </h3>
          <p className="review-hint">{t.hints[g.rule]}</p>
          <ul className="review-list">
            {g.items.map((f) => (
              <li key={f.key} className="review-item">
                <button type="button" className="review-go" title={STORY_RULES.includes(f.rule) ? t.openSheet : t.goTo} onClick={() => go(f)}>
                  {label(f)}
                </button>
                {f.rule === "frequentWords" && (
                  <ul className="review-words">
                    {f.names!.map((word, i) => (
                      <li key={word}>
                        <button type="button" className="review-word" title={fmt(t.items.frequentWordFind, { word })} onClick={() => findWord(word)}>
                          {fmt(t.items.frequentWord, { word, n: f.counts![i] })}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
                <div className="review-actions">
                  {f.rule === "similarNames" && (
                    <button
                      type="button"
                      className="review-primary"
                      onClick={() => useCosmos.getState().openReplace({ find: f.names![0], replacement: f.names![1], sceneId: null, renameId: null })}
                    >
                      {t.rename}
                    </button>
                  )}
                  {(f.rule === "unknownCharacter" || f.rule === "silentCharacter") && (
                    <button type="button" className="review-primary" onClick={() => useCosmos.getState().addTitledCard("personnage", titleCase(f.names![0], lang))}>
                      {t.createCard}
                    </button>
                  )}
                  {f.rule === "noEpisodes" && (
                    <button
                      type="button"
                      className="review-primary"
                      onClick={() => {
                        const s = useCosmos.getState();
                        const id = s.addSeriesEpisode();
                        if (id) s.openEpisode(id);
                        s.setView("plan");
                      }}
                    >
                      {t.newEpisode}
                    </button>
                  )}
                  <button type="button" className="review-ignore" onClick={() => ignore(f.key)}>
                    {STORY_RULES.includes(f.rule) ? t.intended : t.ignore}
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      ))}
      {hidden > 0 && (
        <p className="review-ignored">
          {hidden === 1 ? t.ignoredOne : fmt(t.ignoredMany, { n: hidden })}{" "}
          <button type="button" className="link-button" onClick={() => useIgnored.setState({ keys: new Set() })}>
            {t.showIgnored}
          </button>
        </p>
      )}
    </div>
  );
}

/** Onglets de la colonne de droite : « Dans cette scène », « Commentaires » (si `comments` est donné) et « Vérifier ». */
export type SideTab = "scene" | "comments" | "review";
export function SideTabs({ tab, onTab, count, comments }: { tab: SideTab; onTab: (tab: SideTab) => void; count: number; comments?: number }) {
  const t = useT();
  return (
    <div className="side-tabs" role="group" aria-label={t.review.tabsLabel}>
      <button type="button" aria-pressed={tab === "scene"} onClick={() => onTab("scene")}>
        {comments !== undefined ? t.review.tabSceneShort : t.review.tabScene}
      </button>
      {comments !== undefined && (
        <button type="button" aria-pressed={tab === "comments"} onClick={() => onTab("comments")}>
          {comments > 0 ? fmt(t.comments.tabCount, { n: comments }) : t.comments.tab}
        </button>
      )}
      <button type="button" aria-pressed={tab === "review"} onClick={() => onTab("review")}>
        {count > 0 ? fmt(t.review.buttonCount, { n: count }) : t.review.tabReview}
      </button>
    </div>
  );
}
