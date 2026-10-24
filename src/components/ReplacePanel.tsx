// Fenêtre « Rechercher et remplacer » (Cmd/Ctrl + Maj + H, ou bouton des vues Manuscrit et Scénario), et
// « Renommer partout » (menu d'une carte) : le texte du manuscrit ou du scénario, et au besoin le corps des
// cartes. Les occurrences sont listées avec leur contexte et se cochent une à une : un nom qui est aussi un
// mot du texte (Will, Rose, Hope) n'est jamais remplacé en aveugle en tête de phrase. « Annuler » remet tout.

import { useMemo, useState } from "react";
import { useCosmos } from "../store";
import { findOccurrences, isAlsoAWord } from "../replace";
import { fmt, useT } from "../i18n";
import { useSettings } from "../settings";

/** Lignes affichées au plus ; les suivantes gardent leur case (cochées sauf en tête de phrase). */
const MAX_ROWS = 300;

export function ReplacePanel() {
  const t = useT();
  const r = t.replace;
  const lang = useSettings((s) => s.lang);
  const init = useCosmos((s) => s.replaceInit);
  const renamed = useCosmos((s) => (s.replaceInit?.renameId ? s.nodes.find((n) => n.id === s.replaceInit!.renameId)?.data : undefined));
  const undo = useCosmos((s) => s.replaceUndo);
  // On relit l'état pour compter : textes, scénario et cartes.
  const manuscript = useCosmos((s) => s.manuscript);
  const screenplay = useCosmos((s) => s.screenplay);
  const nodes = useCosmos((s) => s.nodes);
  const [find, setFind] = useState(init?.find ?? "");
  const [replacement, setReplacement] = useState(renamed ? renamed.title : (init?.replacement ?? ""));
  // Renommer : un nom propre, mot entier, cartes comprises, partout où il est écrit tel quel ou en capitales.
  const [matchCase, setMatchCase] = useState(false);
  const [nameCase, setNameCase] = useState(!!renamed);
  const [wholeWord, setWholeWord] = useState(!!renamed || !!init?.replacement);
  const [cards, setCards] = useState(!!renamed);
  const [scope, setScope] = useState<"scene" | "project">("project");
  const [done, setDone] = useState<string | null>(null);

  const base = useMemo(
    () => ({
      find,
      replacement,
      matchCase: !renamed && matchCase,
      nameCase: !!renamed && nameCase,
      wholeWord,
      cards: scope === "project" && cards,
      sceneId: scope === "scene" ? init?.sceneId : null,
      renameId: renamed?.id ?? null,
    }),
    [find, replacement, matchCase, nameCase, wholeWord, cards, scope, init?.sceneId, renamed],
  );
  // Relu quand les textes changent (autre fenêtre, annulation) : manuscript, screenplay et nodes.
  const occurrences = useMemo(
    () => findOccurrences(useCosmos.getState(), base),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [base, manuscript, screenplay, nodes],
  );
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const alsoAWord = useMemo(() => isAlsoAWord(useCosmos.getState(), find.trim()), [find, manuscript, screenplay, nodes]);
  // Décochées d'office : un mot ordinaire en tête de phrase (« Will you… »). Le choix de l'auteur vaut tant
  // que la liste ne change pas.
  const sig = `${alsoAWord}|${occurrences.map((o) => o.key).join(",")}`;
  const [choice, setChoice] = useState<{ sig: string; skip: Set<string> } | null>(null);
  const skip = useMemo(
    () => (choice?.sig === sig ? choice.skip : new Set(occurrences.filter((o) => alsoAWord && o.sentenceStart).map((o) => o.key))),
    [choice, sig, occurrences, alsoAWord],
  );
  const toggle = (key: string) => {
    const next = new Set(skip);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    setChoice({ sig, skip: next });
    setDone(null);
  };
  const setAll = (on: boolean) => setChoice({ sig, skip: on ? new Set() : new Set(occurrences.map((o) => o.key)) });
  const count = occurrences.length - occurrences.filter((o) => skip.has(o.key)).length;
  const num = (n: number) => new Intl.NumberFormat(lang).format(n);

  const apply = () => {
    const n = useCosmos.getState().replaceText({ ...base, skip: [...skip] });
    setDone(renamed ? fmt(r.renamedDone, { title: replacement, n: num(n) }) : fmt(n === 1 ? r.doneOne : r.doneMany, { n: num(n) }));
  };

  return (
    <form
      className="replace-panel"
      onSubmit={(e) => {
        e.preventDefault();
        apply();
      }}
    >
      <h2 id="app-dialog-title">{renamed ? fmt(r.renameTitle, { title: renamed.title }) : r.title}</h2>
      <label className="replace-field">
        <span>{r.find}</span>
        <input type="search" value={find} autoFocus={!renamed} autoComplete="off" onChange={(e) => (setFind(e.target.value), setDone(null))} />
      </label>
      <label className="replace-field">
        <span>{renamed ? r.newName : r.replaceWith}</span>
        <input type="text" value={replacement} autoFocus={!!renamed} autoComplete="off" onChange={(e) => (setReplacement(e.target.value), setDone(null))} />
      </label>
      <div className="replace-options">
        {renamed ? (
          <label>
            <input type="checkbox" checked={nameCase} onChange={(e) => setNameCase(e.target.checked)} /> {r.nameCase}
          </label>
        ) : (
          <label>
            <input type="checkbox" checked={matchCase} onChange={(e) => setMatchCase(e.target.checked)} /> {r.matchCase}
          </label>
        )}
        <label>
          <input type="checkbox" checked={wholeWord} onChange={(e) => setWholeWord(e.target.checked)} /> {r.wholeWord}
        </label>
        {init?.sceneId && (
          <label>
            <span>{r.scope}</span>{" "}
            <select value={scope} onChange={(e) => setScope(e.target.value as "scene" | "project")}>
              <option value="scene">{r.scopeScene}</option>
              <option value="project">{r.scopeProject}</option>
            </select>
          </label>
        )}
        {scope === "project" && (
          <label>
            <input type="checkbox" checked={cards} onChange={(e) => setCards(e.target.checked)} /> {r.cards}
          </label>
        )}
      </div>
      <p className="replace-count" role="status">
        {done ??
          (!find
            ? r.hint
            : count === occurrences.length
              ? fmt(count === 1 ? r.foundOne : r.foundMany, { n: num(count) })
              : fmt(r.checked, { n: num(count), total: num(occurrences.length) }))}
      </p>
      {find && alsoAWord && occurrences.some((o) => o.sentenceStart) && !done && (
        <p className="replace-warning">{fmt(r.alsoAWord, { word: find.trim().toLowerCase() })}</p>
      )}
      {occurrences.length > 0 && !done && (
        <div className="replace-review">
          <div className="replace-review-head">
            <span>{r.review}</span>
            <button type="button" className="link-button" onClick={() => setAll(skip.size > 0)}>
              {skip.size > 0 ? r.checkAll : r.uncheckAll}
            </button>
          </div>
          <ul className="replace-list">
            {occurrences.slice(0, MAX_ROWS).map((o) => (
              <li key={o.key}>
                <label className={o.sentenceStart && alsoAWord ? "is-doubtful" : undefined}>
                  <input type="checkbox" checked={!skip.has(o.key)} onChange={() => toggle(o.key)} />
                  <span className="replace-where">{o.label || r.untitled}</span>
                  <span className="replace-context">
                    {o.before}
                    <mark>{o.match}</mark>
                    {o.after}
                  </span>
                </label>
              </li>
            ))}
          </ul>
          {occurrences.length > MAX_ROWS && <p className="replace-more">{fmt(r.more, { n: num(occurrences.length - MAX_ROWS) })}</p>}
        </div>
      )}
      <div className="assistant-actions replace-actions">
        {undo && (
          <button type="button" onClick={() => (useCosmos.getState().undoReplace(), setDone(r.undone))}>
            {r.undo}
          </button>
        )}
        <button type="submit" className="is-primary" disabled={!find || (count === 0 && !renamed) || (!!renamed && !replacement.trim())}>
          {renamed ? r.renameAll : r.replaceAll}
        </button>
      </div>
    </form>
  );
}
