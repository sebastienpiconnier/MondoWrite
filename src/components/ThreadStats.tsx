// Statistiques › Intrigues et thèmes (#118) : la part du récit reliée à chaque intrigue et à chaque thème, en
// mots (roman) ou en pages (scénario). Tout se lit dans les fils (threadWeights) : rien n'est saisi ni enregistré.
// Chaque ligne mène à la fiche, et « Lire ces scènes » au récit fil par fil (#117).

import { useMemo } from "react";
import { fmt } from "../i18n";
import { useCosmos } from "../store";
import { useSettings } from "../settings";
import { useVocab } from "../vocab";
import { bookOrder } from "../book";
import { manuscriptStats } from "../stats";
import { listScenes } from "../screenplay/scenes";
import { threadWeights } from "../threadFilter";
import { useSceneEighths } from "./SceneLength";

export function ThreadStats({ onOpen, onRead }: { onOpen: (id: string) => void; onRead: (id: string) => void }) {
  const { t, types, kind } = useVocab();
  const r = t.threadStats;
  const lang = useSettings((s) => s.lang);
  const nodes = useCosmos((s) => s.nodes);
  const edges = useCosmos((s) => s.edges);
  const plan = useCosmos((s) => s.plan);
  const manuscript = useCosmos((s) => s.manuscript);
  const screenplay = useCosmos((s) => s.screenplay);
  const eighths = useSceneEighths();
  const script = kind === "scenario";

  const rows = useMemo(() => {
    const cards = nodes.map((n) => n.data);
    if (script) {
      const order = screenplay ? listScenes(screenplay.elements).flatMap((x) => (x.cardId ? [x.cardId] : [])) : [];
      return { order, weights: threadWeights(cards, edges, order, (id) => (eighths.get(id) ?? 0) / 8, lang) };
    }
    const order = bookOrder(nodes, plan).filter((id) => !cards.find((c) => c.id === id)?.page);
    const words = manuscriptStats(manuscript, order).perScene;
    return { order, weights: threadWeights(cards, edges, order, (id) => words.get(id) ?? 0, lang), written: [...words.values()].some((n) => n > 0) };
  }, [script, nodes, edges, plan, manuscript, screenplay, eighths, lang]);

  const number = (n: number) => new Intl.NumberFormat(lang).format(n);
  const decimal = (n: number) => new Intl.NumberFormat(lang, { maximumFractionDigits: 1 }).format(n);
  const percent = (n: number) => new Intl.NumberFormat(lang, { style: "percent", maximumFractionDigits: 0 }).format(n);
  const written = script ? rows.weights.some((w) => w.size > 0) : !!rows.written;

  if (rows.weights.length === 0) return <p className="muted">{r.empty}</p>;
  return (
    <div className="char-stats thread-stats">
      <p className="muted thread-stats-note">{written ? r.note : r.noteScenes}</p>
      <div className="char-stats-table">
        <table>
          <thead>
            <tr>
              <th scope="col">{r.name}</th>
              <th scope="col">{r.type}</th>
              <th scope="col" className="is-number">{r.scenes}</th>
              <th scope="col" className="is-number">{script ? r.pages : r.words}</th>
              <th scope="col">{r.share}</th>
              <th scope="col"><span className="sr-only">{t.thread.menu}</span></th>
            </tr>
          </thead>
          <tbody>
            {rows.weights.map((w) => (
              <tr key={w.card.id}>
                <th scope="row">
                  <button type="button" className="link-button char-stats-name" aria-label={fmt(t.charStats.openAria, { name: w.card.title })} onClick={() => onOpen(w.card.id)}>
                    {w.card.title}
                  </button>
                </th>
                <td>{types[w.card.type].label}</td>
                <td className="is-number">{number(w.scenes)}</td>
                <td className="is-number">{w.scenes === 0 ? "" : script ? fmt(t.placeStats.pagesValue, { n: decimal(w.size) }) : number(w.size)}</td>
                <td>
                  {w.scenes === 0 ? (
                    <span className="muted">{r.none}</span>
                  ) : (
                    <span className="char-stats-share">
                      <span className="char-stats-bar" aria-hidden="true">
                        <span style={{ width: `${Math.round(Math.min(1, w.share) * 100)}%` }} />
                      </span>
                      {percent(w.share)}
                    </span>
                  )}
                </td>
                <td>
                  {w.scenes > 0 && (
                    <button type="button" className="link-button" aria-label={fmt(t.thread.readOf, { title: w.card.title })} onClick={() => onRead(w.card.id)}>
                      {t.thread.menu}
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
