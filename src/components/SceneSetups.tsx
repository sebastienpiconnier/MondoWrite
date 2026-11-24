// Préparer et payer (#119) : ce qu'une scène prépare et ce qui la prépare, là où on la voit.
// - SetupBadge : pastille d'une carte Scène du canevas (« Prépare 2 · Paie 1 ») ; un clic met ses préparations
//   en avant et estompe le reste (état d'affichage `setupFocus`, jamais enregistré).
// - SceneSetupsBox : onglet « Scène » du Manuscrit et du Scénario, « Prépare » et « Payée par », chaque scène
//   y mène.
// Rien dans un roman interactif (les préparations n'y sont pas proposées).

import { useMemo, useState } from "react";
import { fmt, useT } from "../i18n";
import { sceneNumbers } from "../sceneNumbers";
import { matchChoices, sceneChoices } from "../setupChoices";
import { useInteractive } from "../interactive/useInteractive";
import { payoffOf, setupOf } from "../setups";
import { projectSetupLetters } from "../projectJunctions";
import { useCosmos, type CosmosState } from "../store";

/** Lettres des paires que la scène prépare et qu'elle paie, en une chaîne stable (« A,C|B ») : la carte ne se
 *  redessine que si elles changent. Vide : aucune préparation. */
const lettersKey = (s: CosmosState, id: string) => {
  const mine = projectSetupLetters(s).byScene.get(id);
  return mine ? `${mine.prepares.join(",")}|${mine.pays.join(",")}` : "";
};

export function SetupBadge({ id }: { id: string }) {
  const t = useT().toile;
  const interactive = useInteractive();
  const key = useCosmos((s) => lettersKey(s, id));
  const on = useCosmos((s) => s.setupFocus === id);
  if (interactive || !key) return null;
  const [a, b] = key.split("|");
  const list = (x: string) => x.split(",").join(", ");
  const parts = [a ? fmt(t.setupBadgePrepares, { list: list(a) }) : "", b ? fmt(t.setupBadgePays, { list: list(b) }) : ""].filter(Boolean);
  return (
    <button
      type="button"
      className={`card-setups nodrag${on ? " is-on" : ""}`}
      aria-pressed={on}
      title={on ? t.followClear : t.setupBadgeShow}
      onClick={() => useCosmos.getState().focusSetups(on ? null : id)}
    >
      <span className="card-setups-dot" aria-hidden="true" />
      {parts.join(" · ")}
    </button>
  );
}

/** Choix de l'autre scène d'une préparation : recherche, liste avec numéro, titre et début du synopsis, puis nom
 *  du lien (facultatif). Rien n'est écrit avant « Relier ». */
function SetupPicker({ id, mode, onClose }: { id: string; mode: "prepares" | "paidBy"; onClose: () => void }) {
  const t = useT();
  const [query, setQuery] = useState("");
  const [chosen, setChosen] = useState<string | null>(null);
  const [label, setLabel] = useState("");
  const all = useMemo(() => sceneChoices(useCosmos.getState(), t.manuscript.untitled).filter((c) => c.id !== id), [id, t.manuscript.untitled]);
  const shown = matchChoices(all, query);
  const confirm = () => {
    if (!chosen) return;
    useCosmos.getState().setSceneSetup(mode === "prepares" ? id : chosen, mode === "prepares" ? chosen : id, label);
    onClose();
  };
  return (
    <div className="scene-setups-pick" role="group" aria-label={mode === "prepares" ? t.toile.setupsPickPrepares : t.toile.setupsPickPaidBy}>
      <span className="scene-setups-label">{mode === "prepares" ? t.toile.setupsPickPrepares : t.toile.setupsPickPaidBy}</span>
      <input
        // Ouvert pour qu'on cherche tout de suite.
        // eslint-disable-next-line jsx-a11y/no-autofocus
        autoFocus
        type="search"
        value={query}
        placeholder={t.toile.setupsSearch}
        aria-label={t.toile.setupsSearch}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            e.preventDefault();
            onClose();
          }
          if (e.key === "Enter" && shown.length === 1) setChosen(shown[0].id);
        }}
      />
      <ul className="scene-setups-choices">
        {shown.length === 0 && <li className="scene-setups-none">{t.toile.setupsNone}</li>}
        {shown.map((c) => (
          <li key={c.id}>
            <button type="button" aria-pressed={chosen === c.id} onClick={() => setChosen(c.id)}>
              <span className="scene-setups-title">
                {c.number && <span className="scene-setups-num">{c.number}</span>}
                {c.title}
              </span>
              {c.hint && <span className="scene-setups-hint">{c.hint}</span>}
            </button>
          </li>
        ))}
      </ul>
      <label className="scene-setups-name">
        <span>{t.toile.setupsName}</span>
        <input
          value={label}
          maxLength={60}
          placeholder={t.toile.setupsNameHint}
          onChange={(e) => setLabel(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") confirm();
            if (e.key === "Escape") onClose();
          }}
        />
      </label>
      <div className="scene-setups-add">
        <button type="button" className="ghost-button" onClick={onClose}>
          {t.toile.setupsCancel}
        </button>
        <button type="button" className="ghost-button is-primary" disabled={!chosen} onClick={confirm}>
          {t.toile.setupsLink}
        </button>
      </div>
    </div>
  );
}

export function SceneSetupsBox({ id }: { id: string | null | undefined }) {
  const t = useT();
  const interactive = useInteractive();
  const key = useCosmos((s) => (id ? lettersKey(s, id) : ""));
  const state = useCosmos((s) => (key ? s : null));
  const [adding, setAdding] = useState<"prepares" | "paidBy" | null>(null);
  const [renaming, setRenaming] = useState<string | null>(null);
  if (interactive || !id) return null;
  const picker = adding && <SetupPicker id={id} mode={adding} onClose={() => setAdding(null)} />;
  const addButtons = (
    <div className="scene-setups-add">
      <button type="button" className="ghost-button" onClick={() => setAdding("prepares")}>
        {t.toile.setupsAddPrepares}
      </button>
      <button type="button" className="ghost-button" onClick={() => setAdding("paidBy")}>
        {t.toile.setupsAddPaidBy}
      </button>
    </div>
  );
  if (!state) {
    return (
      <section className="sp-box scene-setups">
        <h2 className="sp-box-title">{t.toile.setupsTitle}</h2>
        {picker || addButtons}
      </section>
    );
  }
  const letters = projectSetupLetters(state).byLink;
  const numbers = sceneNumbers(state);
  const title = (sid: string) => state.nodes.find((n) => n.id === sid)?.data.title.trim() || t.manuscript.untitled;
  type Item = { letter: string; other: string; edge: string; label: string };
  const prepares: Item[] = [];
  const paidBy: Item[] = [];
  for (const e of state.edges) {
    const letter = letters.get(e.id);
    const setup = setupOf(e);
    const payoff = payoffOf(e);
    if (!letter || !setup || !payoff) continue;
    const label = typeof e.label === "string" ? e.label : "";
    if (setup === id) prepares.push({ letter, other: payoff, edge: e.id, label });
    if (payoff === id) paidBy.push({ letter, other: setup, edge: e.id, label });
  }
  const sortByLetter = (a: { letter: string }, b: { letter: string }) => a.letter.length - b.letter.length || a.letter.localeCompare(b.letter);
  const list = (label: string, items: Item[]) =>
    items.length > 0 && (
      <div className="scene-setups-row">
        <span className="scene-setups-label">{label}</span>
        <ul className="scene-setups-links">
          {[...items].sort(sortByLetter).map((it) => (
            <li key={it.letter}>
              {renaming === it.edge ? (
                <input
                  // eslint-disable-next-line jsx-a11y/no-autofocus
                  autoFocus
                  className="scene-setups-rename"
                  defaultValue={it.label}
                  maxLength={60}
                  aria-label={fmt(t.toile.setupsRename, { title: title(it.other) })}
                  placeholder={t.toile.setupsNameHint}
                  onBlur={(e) => {
                    useCosmos.getState().renameLink(it.edge, e.target.value.trim());
                    setRenaming(null);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") e.currentTarget.blur();
                    if (e.key === "Escape") setRenaming(null);
                  }}
                />
              ) : (
                <>
                  <button type="button" className="chip is-setup" title={fmt(t.toile.setupGo, { title: title(it.other) })} onClick={() => useCosmos.getState().openInManuscript(it.other)}>
                    <span className="setup-letter" aria-hidden="true">{it.letter}</span>
                    <span className="scene-setups-text">
                      {numbers.get(it.other) && <span className="scene-setups-num">{numbers.get(it.other)}</span>}
                      {title(it.other)}
                    </span>
                    {it.label && <span className="scene-setups-linklabel">{it.label}</span>}
                  </button>
                  <button type="button" className="icon-button scene-setups-pen" aria-label={fmt(t.toile.setupsRename, { title: title(it.other) })} title={fmt(t.toile.setupsRename, { title: title(it.other) })} onClick={() => setRenaming(it.edge)}>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="M4 20h4L19 9l-4-4L4 16z" />
                    </svg>
                  </button>
                </>
              )}
            </li>
          ))}
        </ul>
      </div>
    );
  return (
    <section className="sp-box scene-setups">
      <h2 className="sp-box-title">{t.toile.setupsTitle}</h2>
      {list(t.toile.setupsPrepares, prepares)}
      {list(t.toile.setupsPaidBy, paidBy)}
      {picker || addButtons}
    </section>
  );
}
