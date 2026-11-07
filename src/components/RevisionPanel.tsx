// Fenêtre « Révisions » (#18, docs/plan-revisions-scenario.md) : la passe ouverte, les passes passées avec leur
// nombre de lignes marquées, l'ouverture d'une nouvelle passe (couleur, date, nom) et « Nouvelle version propre ».
// Les marques elles-mêmes sont posées par l'éditeur (editor/revisions.ts) ; ici on ne change que les passes.

import { useMemo, useState } from "react";
import { useCosmos } from "../store";
import { useSettings } from "../settings";
import { fmt, useT } from "../i18n";
import { REV_COLORS, colorFor, currentSet, isRevColor, nextNumber, type RevColor } from "../screenplay/revisions";
import { LAYOUTS } from "../screenplay/layout";
import { typeset } from "../screenplay/export/typeset";
import { buildLock } from "../screenplay/lockedPages";
import { bookRevCounts } from "../novelRevisions";
import { revisionDateText, revisionName, revisionVar } from "../revisionsText";

const today = () => {
  const d = new Date();
  const two = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${two(d.getMonth() + 1)}-${two(d.getDate())}`;
};

export function RevisionPanel() {
  const t = useT();
  const k = t.revisions;
  const lang = useSettings((s) => s.lang);
  const revisions = useCosmos((s) => s.revisions);
  const screenplay = useCosmos((s) => s.screenplay);
  const [color, setColor] = useState<RevColor>(() => colorFor(nextNumber(useCosmos.getState().revisions)));
  const [date, setDate] = useState(today);
  const [label, setLabel] = useState("");
  const [notice, setNotice] = useState("");
  const [unlocking, setUnlocking] = useState(false);
  const paper = useCosmos((s) => s.paper);
  const novel = useCosmos((s) => s.kind) !== "scenario";
  const manuscript = useCosmos((s) => s.manuscript);

  const counts = useMemo(() => {
    // Roman : passages marqués dans le texte des scènes ; scénario : lignes marquées.
    if (novel) return bookRevCounts(manuscript);
    const out = new Map<number, number>();
    for (const el of screenplay?.elements ?? []) if (el.rev !== undefined) out.set(el.rev, (out.get(el.rev) ?? 0) + 1);
    return out;
  }, [novel, manuscript, screenplay]);
  const total = [...counts.values()].reduce((a, b) => a + b, 0);
  const open = currentSet(revisions);
  const countText = (n: number) => (novel ? (n === 1 ? k.markedPassage : fmt(k.markedPassages, { n })) : n === 1 ? k.markedOne : fmt(k.marked, { n }));

  // Verrouiller : la pagination d'aujourd'hui, comme le PDF la compose (réglages d'impression du projet).
  const lockNow = () => {
    const elements = screenplay?.elements ?? [];
    const { scriptPdf } = useCosmos.getState();
    const pages = typeset(elements, LAYOUTS[paper], lang, { more: t.screenplay.more, contd: t.screenplay.contd }, { breaks: scriptPdf.breaks, resumes: scriptPdf.resumes });
    useCosmos.getState().lockPages(buildLock(pages, elements));
  };

  const openPass = () => {
    useCosmos.getState().openRevision({ date, label, color });
    // La couleur proposée pour la passe suivante : la suivante dans l'ordre.
    setColor(colorFor(nextNumber(useCosmos.getState().revisions)));
    setLabel("");
    setNotice("");
  };

  return (
    <div className="rev-panel">
      <h2 id="app-dialog-title">{novel ? k.titleNovel : k.title}</h2>
      <p className="rev-intro">{novel ? k.introNovel : k.intro}</p>

      <p className="rev-status" role="status">
        {open ? fmt(k.current, { name: revisionName(t, revisions, open.n) }) : k.none}
      </p>
      {open && (
        <p>
          <button type="button" className="ghost-button" onClick={() => useCosmos.getState().closeRevision()}>
            {k.close}
          </button>{" "}
          <span className="rev-hint">{k.closeHint}</span>
        </p>
      )}

      {revisions.sets.length > 0 && (
        <section aria-label={k.passes}>
          <h3>{k.passes}</h3>
          <ul className="rev-list">
            {[...revisions.sets].reverse().map((s) => (
              <li key={s.n}>
                <span className="rev-swatch" aria-hidden="true" style={{ background: revisionVar(s.color) }} />
                <span>
                  {revisionName(t, revisions, s.n)}
                  {s.date ? ` (${revisionDateText(lang, s.date)})` : ""}
                </span>
                <span className="rev-count">{countText(counts.get(s.n) ?? 0)}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <form
        className="rev-form"
        onSubmit={(e) => {
          e.preventDefault();
          openPass();
        }}
      >
        <h3>{k.openTitle}</h3>
        <label>
          {k.color}
          <select value={color} onChange={(e) => isRevColor(e.target.value) && setColor(e.target.value)}>
            {REV_COLORS.map((c) => (
              <option key={c} value={c}>
                {k.colors[c]}
              </option>
            ))}
          </select>
        </label>
        <label>
          {k.date}
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </label>
        <label>
          {k.label}
          <input type="text" value={label} maxLength={80} placeholder={k.labelPlaceholder} onChange={(e) => setLabel(e.target.value)} />
        </label>
        <button type="submit" className="ghost-button is-primary">
          {k.open}
        </button>
      </form>

      {!novel && (
      <section aria-label={k.lockTitle}>
        <h3>{k.lockTitle}</h3>
        <p className="rev-hint">{k.lockIntro}</p>
        <p role="status">{revisions.locked ? fmt(k.lockOn, { n: revisions.locked.length }) : k.lockNone}</p>
        {!revisions.locked && (
          <p>
            <button type="button" className="ghost-button" disabled={(screenplay?.elements.length ?? 0) === 0} onClick={lockNow}>
              {k.lock}
            </button>{" "}
            <span className="rev-hint">{fmt(k.lockHint, { paper: paper === "a4" ? "A4" : "Letter" })}</span>
          </p>
        )}
        {revisions.locked && !unlocking && (
          <p>
            <button type="button" className="ghost-button" onClick={() => setUnlocking(true)}>
              {k.unlock}
            </button>
          </p>
        )}
        {revisions.locked && unlocking && (
          <p role="alertdialog" aria-label={k.unlockAsk}>
            {k.unlockAsk}{" "}
            <button type="button" className="ghost-button" autoFocus onClick={() => setUnlocking(false)}>
              {k.unlockNo}
            </button>{" "}
            <button
              type="button"
              className="ghost-button"
              onClick={() => {
                useCosmos.getState().unlockPages();
                setUnlocking(false);
              }}
            >
              {k.unlockYes}
            </button>
          </p>
        )}
      </section>
      )}

      <section>
        <button
          type="button"
          className="ghost-button"
          disabled={total === 0}
          onClick={() => {
            useCosmos.getState().clearRevisionMarks();
            setNotice(k.cleared);
          }}
        >
          {k.clear}
        </button>{" "}
        <span className="rev-hint">{novel ? k.clearHintNovel : k.clearHint}</span>
        {notice && (
          <p role="status" className="rev-hint">
            {notice}
          </p>
        )}
      </section>
    </div>
  );
}
