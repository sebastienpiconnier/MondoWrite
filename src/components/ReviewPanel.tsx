// Onglet « Vérifier » de la colonne de droite (Manuscrit et Scénario) : les points à regarder, groupés par règle.
// Un point mène au passage ; « Renommer partout… » et « Créer la carte » ouvrent les outils existants ;
// « Ignorer » le retire de la liste pour la session. Le panneau ne modifie jamais le texte de lui-même.

import { create } from "zustand";
import { fmt, useT } from "../i18n";
import { useSettings } from "../settings";
import { useCosmos } from "../store";
import { groupFindings, type Finding } from "../review/checks";
import { titleCase } from "../screenplay/editor/autocomplete";

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
}

export function ReviewPanel({ findings, kind, where, onGo }: Props) {
  const t = useT().review;
  const lang = useSettings((s) => s.lang);
  const ignored = useIgnored((s) => s.keys);
  const groups = groupFindings(findings, ignored);
  const left = groups.reduce((n, g) => n + g.items.length, 0);
  const hidden = findings.filter((f) => ignored.has(f.key)).length;
  const replies = (n: number) => (n === 1 ? t.repliesOne : fmt(t.repliesMany, { n }));

  const label = (f: Finding): string => {
    const w = where(f);
    switch (f.rule) {
      case "similarNames":
        return kind === "script"
          ? fmt(t.items.similarNamesScript, { where: w, rare: f.names![0], common: f.names![1], a: replies(f.counts![0]), b: replies(f.counts![1]) })
          : fmt(t.items.similarNamesText, { where: w, rare: f.names![0], common: f.names![1] });
      case "unknownCharacter":
        return fmt(t.items.unknownCharacter, { where: w, name: f.names![0] });
      case "longAction":
        return fmt(t.items.longAction, { where: w, n: f.counts![0] });
      case "headingFormat":
        return fmt(t.items.headingFormat, { where: w, text: f.text });
      case "emptyElement":
        return f.text.trim() ? fmt(t.items.emptyCharacter, { where: w, text: f.text }) : fmt(t.items.emptyHeading, { where: w });
      case "extraSpaces":
        return fmt(t.items.extraSpaces, { where: w, text: f.text });
    }
  };

  return (
    <div className="review">
      <p className="review-summary" role="status">
        {left === 0 ? t.none : left === 1 ? t.summaryOne : fmt(t.summaryMany, { n: left })}
      </p>
      {groups.map((g) => (
        <section key={g.rule} className="review-group" aria-labelledby={`review-${g.rule}`}>
          <h3 id={`review-${g.rule}`} className="review-rule">
            {t.rules[g.rule]} · {g.items.length}
          </h3>
          <p className="review-hint">{t.hints[g.rule]}</p>
          <ul className="review-list">
            {g.items.map((f) => (
              <li key={f.key} className="review-item">
                <button type="button" className="review-go" title={t.goTo} onClick={() => onGo(f)}>
                  {label(f)}
                </button>
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
                  {f.rule === "unknownCharacter" && (
                    <>
                      <button type="button" className="review-primary" onClick={() => useCosmos.getState().addTitledCard("personnage", titleCase(f.names![0], lang))}>
                        {t.createCard}
                      </button>
                      {/* Une faute de frappe : renommer vers le bon nom, à taper dans la fenêtre. */}
                      <button
                        type="button"
                        className="review-ignore"
                        onClick={() => useCosmos.getState().openReplace({ find: f.names![0], replacement: "", sceneId: null, renameId: null })}
                      >
                        {t.rename}
                      </button>
                    </>
                  )}
                  <button type="button" className="review-ignore" onClick={() => ignore(f.key)}>
                    {t.ignore}
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

/** Onglets de la colonne de droite : « Dans cette scène » et « Vérifier ». */
export function SideTabs({ tab, onTab, count }: { tab: "scene" | "review"; onTab: (tab: "scene" | "review") => void; count: number }) {
  const t = useT().review;
  return (
    <div className="side-tabs" role="group" aria-label={t.tabsLabel}>
      <button type="button" aria-pressed={tab === "scene"} onClick={() => onTab("scene")}>
        {t.tabScene}
      </button>
      <button type="button" aria-pressed={tab === "review"} onClick={() => onTab("review")}>
        {count > 0 ? fmt(t.buttonCount, { n: count }) : t.tabReview}
      </button>
    </div>
  );
}
