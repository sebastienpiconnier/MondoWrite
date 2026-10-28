// Fenêtre « Aller à » (Cmd/Ctrl + G, bouton des barres du Manuscrit et du Scénario, menu Édition du Mac) :
// on tape un numéro de page ou de scène, un titre, un mot ; Entrée emmène au premier endroit trouvé.
// Les endroits viennent de goto.ts ; on y va par `openInManuscript`, comme la recherche.

import { useMemo, useRef, useState } from "react";
import { useCosmos } from "../store";
import { fmt } from "../i18n";
import { useVocab } from "../vocab";
import { useSettings } from "../settings";
import { LAYOUTS } from "../screenplay/layout";
import { paginate } from "../screenplay/paginate";
import { bookOrder } from "../book";
import { findPlaces, novelPlaces, screenplayPlaces, type GoLabels, type GoTarget } from "../goto";

export function GoToPanel() {
  const { t } = useVocab();
  const g = t.goto;
  const lang = useSettings((s) => s.lang);
  const kind = useCosmos((s) => s.kind);
  const screenplay = useCosmos((s) => s.screenplay);
  const paper = useCosmos((s) => s.paper);
  const nodes = useCosmos((s) => s.nodes);
  const plan = useCosmos((s) => s.plan);
  const manuscript = useCosmos((s) => s.manuscript);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const listRef = useRef<HTMLUListElement>(null);

  const labels: GoLabels = useMemo(
    () => ({
      page: g.page,
      untitledScene: t.screenplay.untitledScene,
      chapter: (n, title) => (title ? fmt(t.chapters.numberedTitle, { n, title }) : fmt(t.chapters.numbered, { n })),
    }),
    [g, t],
  );

  const places = useMemo(() => {
    if (kind === "scenario") {
      const elements = screenplay?.elements ?? [];
      const pagination = paginate(elements, LAYOUTS[paper]);
      return screenplayPlaces(elements, pagination.startPage, pagination.pages, labels);
    }
    const order = bookOrder(nodes, plan);
    const titles = new Map(nodes.map((n) => [n.id, n.data.title]));
    return novelPlaces(order, titles, plan, manuscript, labels);
  }, [kind, screenplay, paper, nodes, plan, manuscript, labels]);

  const found = useMemo(() => findPlaces(query, places, labels), [query, places, labels]);
  const current = Math.min(active, Math.max(0, found.length - 1));
  const number = new Intl.NumberFormat(lang);

  const go = (place: GoTarget | undefined) => {
    if (!place) return;
    const s = useCosmos.getState();
    s.setDialog(null);
    s.openInManuscript(place.target);
  };

  const move = (step: number) => {
    if (found.length === 0) return;
    const next = (current + step + found.length) % found.length;
    setActive(next);
    listRef.current?.children[next]?.scrollIntoView({ block: "nearest" });
  };

  return (
    <div className="goto">
      <h2 id="app-dialog-title">{g.title}</h2>
      <input
        className="goto-input"
        type="search"
        autoFocus
        value={query}
        aria-label={g.inputAria}
        aria-describedby="goto-hint"
        aria-controls="goto-list"
        aria-activedescendant={found[current] ? `goto-${found[current].key}` : undefined}
        placeholder={g.placeholder}
        onChange={(e) => {
          setQuery(e.target.value);
          setActive(0);
        }}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") (e.preventDefault(), move(1));
          else if (e.key === "ArrowUp") (e.preventDefault(), move(-1));
          else if (e.key === "Enter") (e.preventDefault(), go(found[current]));
        }}
      />
      <p className="goto-hint" id="goto-hint">
        {g.hint}
      </p>
      {found.length === 0 ? (
        <p className="goto-empty" role="status">
          {g.empty}
        </p>
      ) : (
        <ul className="goto-list" id="goto-list" ref={listRef} role="listbox" aria-label={g.results}>
          {found.map((place, i) => (
            <li key={place.key} id={`goto-${place.key}`} role="option" aria-selected={i === current}>
              <button type="button" className={`goto-item${i === current ? " is-active" : ""}`} tabIndex={-1} onClick={() => go(place)} onPointerEnter={() => setActive(i)}>
                <span className="goto-kind">{g.kinds[place.kind]}</span>
                <span className="goto-label">{place.label}</span>
                {place.detail && <span className="goto-detail">{place.detail}</span>}
                <span className="goto-page">{fmt(g.pageShort, { n: number.format(place.page) })}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
