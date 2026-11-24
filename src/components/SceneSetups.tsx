// Préparer et payer (#119) : ce qu'une scène prépare et ce qui la prépare, là où on la voit.
// - SetupBadge : pastille d'une carte Scène du canevas (« Prépare 2 · Paie 1 ») ; un clic met ses préparations
//   en avant et estompe le reste (état d'affichage `setupFocus`, jamais enregistré).
// - SceneSetupsBox : onglet « Scène » du Manuscrit et du Scénario, « Prépare » et « Payée par », chaque scène
//   y mène.
// Rien dans un roman interactif (les préparations n'y sont pas proposées).

import { useState } from "react";
import { fmt, useT } from "../i18n";
import { junctionOrder } from "../projectJunctions";
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

export function SceneSetupsBox({ id }: { id: string | null | undefined }) {
  const t = useT();
  const interactive = useInteractive();
  const key = useCosmos((s) => (id ? lettersKey(s, id) : ""));
  const state = useCosmos((s) => (key ? s : null));
  const [adding, setAdding] = useState<"prepares" | "paidBy" | null>(null);
  // Scènes du récit, pour « Prépare… » et « Payée par… » (lot 17) : relues seulement quand on en choisit une.
  const scenes = useCosmos((s) => (adding ? junctionOrder(s.kind, s.nodes, s.plan, s.screenplay).join(",") : ""));
  if (interactive || !id) return null;
  const titleOf = (sid: string) => useCosmos.getState().nodes.find((n) => n.id === sid)?.data.title.trim() || t.manuscript.untitled;
  const picker = adding && (
    <label className="scene-setups-pick">
      <span>{adding === "prepares" ? t.toile.setupsPickPrepares : t.toile.setupsPickPaidBy}</span>
      <select
        // Ouvert pour qu'on choisisse tout de suite.
        // eslint-disable-next-line jsx-a11y/no-autofocus
        autoFocus
        value=""
        onChange={(e) => {
          const other = e.target.value;
          if (other) useCosmos.getState().setSceneSetup(adding === "prepares" ? id : other, adding === "prepares" ? other : id);
          setAdding(null);
        }}
        onBlur={() => setAdding(null)}
      >
        <option value="">{t.toile.setupsChoose}</option>
        {scenes.split(",").filter((sid) => sid && sid !== id).map((sid) => (
          <option key={sid} value={sid}>
            {titleOf(sid)}
          </option>
        ))}
      </select>
    </label>
  );
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
  const title = (sid: string) => state.nodes.find((n) => n.id === sid)?.data.title.trim() || t.manuscript.untitled;
  const prepares: { letter: string; other: string }[] = [];
  const paidBy: { letter: string; other: string }[] = [];
  for (const e of state.edges) {
    const letter = letters.get(e.id);
    const setup = setupOf(e);
    const payoff = payoffOf(e);
    if (!letter || !setup || !payoff) continue;
    if (setup === id) prepares.push({ letter, other: payoff });
    if (payoff === id) paidBy.push({ letter, other: setup });
  }
  const sortByLetter = (a: { letter: string }, b: { letter: string }) => a.letter.length - b.letter.length || a.letter.localeCompare(b.letter);
  const list = (label: string, items: { letter: string; other: string }[]) =>
    items.length > 0 && (
      <div className="scene-setups-row">
        <span className="scene-setups-label">{label}</span>
        <ul className="ms-chips">
          {[...items].sort(sortByLetter).map(({ letter, other }) => (
            <li key={letter}>
              <button type="button" className="chip is-setup" title={fmt(t.toile.setupGo, { title: title(other) })} onClick={() => useCosmos.getState().openInManuscript(other)}>
                <span className="setup-letter" aria-hidden="true">{letter}</span>
                {title(other)}
              </button>
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
