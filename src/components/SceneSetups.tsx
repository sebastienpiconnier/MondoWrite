// Préparer et payer (#119) : ce qu'une scène prépare et ce qui la prépare, là où on la voit.
// - SetupBadge : pastille d'une carte Scène du canevas (« Prépare 2 · Paie 1 ») ; un clic met ses préparations
//   en avant et estompe le reste (état d'affichage `setupFocus`, jamais enregistré).
// - SceneSetupsBox : onglet « Scène » du Manuscrit et du Scénario, « Prépare » et « Payée par », chaque scène
//   y mène.
// Rien dans un roman interactif (les préparations n'y sont pas proposées).

import { fmt, useT } from "../i18n";
import { useInteractive } from "../interactive/useInteractive";
import { setupsOf } from "../setups";
import { useCosmos } from "../store";

/** Nombre de scènes préparées et de scènes qui préparent, en une chaîne stable (la carte ne se redessine que si
 *  ces nombres changent). */
const countsKey = (edges: Parameters<typeof setupsOf>[0], id: string) => {
  const s = setupsOf(edges, id);
  return `${s.prepares.length}:${s.paidBy.length}`;
};

export function SetupBadge({ id }: { id: string }) {
  const t = useT().toile;
  const interactive = useInteractive();
  const key = useCosmos((s) => countsKey(s.edges, id));
  const on = useCosmos((s) => s.setupFocus === id);
  if (interactive || key === "0:0") return null;
  const [a, b] = key.split(":").map(Number);
  const parts = [a > 0 ? fmt(t.setupBadgePrepares, { n: a }) : "", b > 0 ? fmt(t.setupBadgePays, { n: b }) : ""].filter(Boolean);
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
  const key = useCosmos((s) => (id ? countsKey(s.edges, id) : "0:0"));
  const edges = useCosmos((s) => (key === "0:0" ? null : s.edges));
  const nodes = useCosmos((s) => (key === "0:0" ? null : s.nodes));
  if (interactive || !id || !edges || !nodes) return null;
  const { prepares, paidBy } = setupsOf(edges, id);
  const title = (sid: string) => nodes.find((n) => n.id === sid)?.data.title.trim() || t.manuscript.untitled;
  const list = (label: string, ids: string[]) =>
    ids.length > 0 && (
      <div className="scene-setups-row">
        <span className="scene-setups-label">{label}</span>
        <ul className="ms-chips">
          {ids.map((sid) => (
            <li key={sid}>
              <button type="button" className="chip is-setup" title={fmt(t.toile.setupGo, { title: title(sid) })} onClick={() => useCosmos.getState().openInManuscript(sid)}>
                <span className="card-setups-dot" aria-hidden="true" />
                {title(sid)}
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
    </section>
  );
}
