// Fenêtre « Rechercher et remplacer » (Cmd/Ctrl + Maj + H, ou bouton des vues Manuscrit et Scénario), et
// « Renommer partout » (menu d'une carte) : le texte du manuscrit ou du scénario, et au besoin le corps des
// cartes. Le nombre d'occurrences se met à jour pendant la frappe ; « Annuler » remet tout comme avant.

import { useMemo, useState } from "react";
import { useCosmos } from "../store";
import { fmt, useT } from "../i18n";
import { useSettings } from "../settings";

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
  const [replacement, setReplacement] = useState(renamed ? renamed.title : "");
  // Renommer : mot entier et cartes comprises par défaut (un nom propre, partout où il est écrit).
  const [matchCase, setMatchCase] = useState(false);
  const [wholeWord, setWholeWord] = useState(!!renamed);
  const [cards, setCards] = useState(!!renamed);
  const [scope, setScope] = useState<"scene" | "project">("project");
  const [done, setDone] = useState<string | null>(null);

  const req = useMemo(
    () => ({ find, replacement, matchCase, wholeWord, cards: scope === "project" && cards, sceneId: scope === "scene" ? init?.sceneId : null, renameId: renamed?.id ?? null }),
    [find, replacement, matchCase, wholeWord, cards, scope, init?.sceneId, renamed?.id],
  );
  // Recompté quand les textes changent (autre fenêtre, annulation) : manuscript, screenplay et nodes.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const count = useMemo(() => useCosmos.getState().countReplace(req), [req, manuscript, screenplay, nodes]);
  const num = (n: number) => new Intl.NumberFormat(lang).format(n);

  const apply = () => {
    const n = useCosmos.getState().replaceText(req);
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
        <label>
          <input type="checkbox" checked={matchCase} onChange={(e) => setMatchCase(e.target.checked)} /> {r.matchCase}
        </label>
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
        {done ?? (find ? fmt(count === 1 ? r.foundOne : r.foundMany, { n: num(count) }) : r.hint)}
      </p>
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
