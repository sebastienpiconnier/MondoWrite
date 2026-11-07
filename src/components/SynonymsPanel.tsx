// Fenêtre « Synonymes » (#16) : les sens du mot sous le curseur, un clic (ou Entrée) remplace le mot en gardant
// sa casse. Hors ligne ; rien n'est remplacé sans le choix de l'auteur.

import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { fmt, useT } from "../i18n";
import { useSettings } from "../settings";
import { useCosmos } from "../store";
import { useSynonyms } from "../synonymsState";
import { hasThesaurus, loadThesaurus, lookup, matchCase, type Lookup } from "../thesaurus";
import { languageName } from "../typoRules";

type State = { status: "loading" } | { status: "ready"; found: Lookup | null } | { status: "none-lang" } | { status: "failed" };

export function SynonymsPanel() {
  const t = useT().thesaurus;
  const lang = useSettings((s) => s.lang);
  const target = useSynonyms((s) => s.target);
  const setDialog = useCosmos((s) => s.setDialog);
  const [state, setState] = useState<State>({ status: "loading" });
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!target?.word) return;
    if (!hasThesaurus(lang)) {
      setState({ status: "none-lang" });
      return;
    }
    let live = true;
    setState({ status: "loading" });
    loadThesaurus(lang)
      .then((data) => live && setState({ status: "ready", found: lookup(data, target.word, lang) }))
      .catch(() => live && setState({ status: "failed" }));
    return () => {
      live = false;
    };
  }, [target, lang]);

  // Le premier synonyme prend le focus dès que la liste est là.
  useEffect(() => {
    if (state.status === "ready") listRef.current?.querySelector<HTMLButtonElement>("button")?.focus();
  }, [state]);

  if (!target) return null;

  const choose = (synonym: string) => {
    target.replace(matchCase(target.word, synonym));
    setDialog(null);
    // Le focus revient à l'éditeur une fois la fenêtre fermée.
    window.setTimeout(target.refocus, 0);
  };
  const onKey = (e: KeyboardEvent) => {
    const buttons = [...(listRef.current?.querySelectorAll<HTMLButtonElement>("button") ?? [])];
    const at = buttons.indexOf(document.activeElement as HTMLButtonElement);
    if (e.key === "ArrowDown" || e.key === "ArrowRight") buttons[Math.min(at + 1, buttons.length - 1)]?.focus();
    else if (e.key === "ArrowUp" || e.key === "ArrowLeft") buttons[Math.max(at - 1, 0)]?.focus();
    else return;
    e.preventDefault();
  };

  let body;
  if (!target.word) body = <p className="muted">{t.noWord}</p>;
  else if (state.status === "loading") body = <p className="muted">{t.loading}</p>;
  else if (state.status === "none-lang") body = <p className="muted">{fmt(t.noDictionary, { lang: languageName(lang, lang) })}</p>;
  else if (state.status === "failed") body = <p className="muted">{t.loadFailed}</p>;
  else if (!state.found) body = <p className="muted">{fmt(t.none, { word: target.word })}</p>;
  else {
    const { senses } = state.found;
    body = (
      <div ref={listRef} className="synonyms-list" role="group" aria-label={t.senseList} onKeyDown={onKey}>
        {senses.map((words, i) => (
          <div key={i} className="synonyms-sense">
            {senses.length > 1 && <span className="eyebrow">{fmt(t.sense, { n: i + 1 })}</span>}
            <div className="synonyms-words">
              {words.map((w) => (
                <button key={w} type="button" className="chip" aria-label={fmt(t.replaceBy, { word: matchCase(target.word, w) })} onClick={() => choose(w)}>
                  {matchCase(target.word, w)}
                </button>
              ))}
            </div>
          </div>
        ))}
        <p className="muted synonyms-hint">{t.hint}</p>
      </div>
    );
  }

  return (
    <div className="synonyms-panel">
      <h2>{target.word ? fmt(t.forWord, { word: target.word }) : t.title}</h2>
      {body}
    </div>
  );
}
