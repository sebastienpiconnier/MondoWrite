// Faits d'un roman interactif (lot 4, docs/plan-roman-interactif.md), côté carte des choix : les réglages d'un choix
// (« Seulement si », « Donne ») dans le bandeau d'une flèche, et le volet « Ce que sait le lecteur ». Le bloc de choix
// du texte a les mêmes réglages, en DOM (choicesNode.ts).

import { useEffect, useRef, useState } from "react";
import { fmt, useT } from "../i18n";
import { useCosmos } from "../store";
import { condFromValue, condValue, givenFact, otherEffects, withGiven, type Fact } from "../interactive/facts";
import { projectFacts } from "../interactive/projectFacts";
import type { Choice } from "../interactive/choices";

type ChoiceValue = Omit<Choice, "kind">;
const NEW = "+new";

/** Faits du projet ouvert (même tableau tant qu'ils ne changent pas). */
export const useFacts = () => useCosmos((s) => projectFacts(s));

/** Une liste, ou le champ qui la remplace le temps de nommer un nouveau fait. */
function FactSelect({ label, aria, value, options, onPick }: { label: string; aria: string; value: string; options: { value: string; text: string }[]; onPick: (value: string) => void }) {
  const c = useT().interactive.choices;
  const [asking, setAsking] = useState(false);
  const [draft, setDraft] = useState("");
  const done = useRef(false);
  const finish = (keep: boolean) => {
    if (done.current) return;
    done.current = true;
    const name = keep && draft.trim() ? useCosmos.getState().createFact(draft) : null;
    setAsking(false);
    setDraft("");
    if (name) onPick(name);
  };
  return (
    <label className="choice-rule">
      <span>{label}</span>
      {asking ? (
        <input
          type="text"
          className="choice-new-fact"
          autoFocus
          maxLength={120}
          value={draft}
          placeholder={c.newFactPlaceholder}
          aria-label={c.newFactAria}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={() => finish(true)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              finish(true);
            } else if (e.key === "Escape") {
              e.preventDefault();
              e.stopPropagation();
              finish(false);
            }
          }}
        />
      ) : (
        <select
          aria-label={aria}
          value={value}
          onChange={(e) => {
            if (e.target.value === NEW) {
              done.current = false;
              setAsking(true);
            } else onPick(e.target.value);
          }}
        >
          {options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.text}
            </option>
          ))}
          <option value={NEW}>{c.newFact}</option>
        </select>
      )}
    </label>
  );
}

/** « Seulement si » et « Donne » d'un choix. */
export function ChoiceRules({ line, n, onChange }: { line: ChoiceValue; n: number; onChange: (next: ChoiceValue) => void }) {
  const c = useT().interactive.choices;
  const bools = useFacts().filter((f) => f.kind === "bool");
  const cv = condValue(line.cond);
  const condOptions = [{ value: "", text: c.always }];
  if (cv === "custom") condOptions.push({ value: "custom", text: fmt(c.custom, { cond: line.cond ?? "" }) });
  for (const f of bools) condOptions.push({ value: `has:${f.name}`, text: f.label }, { value: `not:${f.name}`, text: fmt(c.notFact, { fact: f.label }) });
  if (!condOptions.some((o) => o.value === cv)) condOptions.push({ value: cv, text: line.cond ?? "" });
  const given = givenFact(line.effects) ?? "";
  const giveOptions = [{ value: "", text: c.nothing }, ...bools.map((f) => ({ value: f.name, text: f.label }))];
  if (!giveOptions.some((o) => o.value === given)) giveOptions.push({ value: given, text: given });
  const others = otherEffects(line.effects);
  return (
    <div className="choice-rules">
      <FactSelect
        label={c.only}
        aria={fmt(c.onlyAria, { n })}
        value={cv}
        options={condOptions}
        onPick={(v) => onChange({ ...line, cond: condFromValue(v.includes(":") || v === "" || v === "custom" ? v : `has:${v}`, line.cond) })}
      />
      <FactSelect label={c.gives} aria={fmt(c.givesAria, { n })} value={given} options={giveOptions} onPick={(v) => onChange({ ...line, effects: withGiven(line.effects, v || null) })} />
      {others.length > 0 && <code className="choice-effects">{fmt(c.effects, { effects: others.join(", ") })}</code>}
    </div>
  );
}

/** Court résumé d'un choix pour son étiquette sur la carte : « si … », « + … ». */
export function ruleSummary(line: ChoiceValue, facts: readonly Fact[], words: { ifFact: string; ifNot: string; gives: string }): { before: string; after: string } {
  const labelOf = (name: string) => facts.find((f) => f.name === name)?.label ?? name;
  const cv = condValue(line.cond);
  const m = /^(has|not):(.+)$/.exec(cv);
  const before = m ? fmt(m[1] === "not" ? words.ifNot : words.ifFact, { fact: labelOf(m[2]) }) : cv === "custom" ? fmt(words.ifFact, { fact: line.cond ?? "" }) : "";
  const given = givenFact(line.effects);
  const after = given ? fmt(words.gives, { fact: labelOf(given) }) : "";
  return { before, after };
}

/** Volet « Ce que sait le lecteur » : les faits du livre, leur libellé, et où ils servent. */
export function FactsPanel({ onClose }: { onClose: () => void }) {
  const f = useT().interactive.facts;
  const facts = useFacts();
  const [draft, setDraft] = useState("");
  const first = useRef<HTMLInputElement>(null);
  useEffect(() => first.current?.focus(), []);
  const add = () => {
    if (draft.trim()) useCosmos.getState().createFact(draft);
    setDraft("");
  };
  return (
    <div
      className="facts-panel"
      role="dialog"
      aria-label={f.title}
      onKeyDown={(e) => {
        if (e.key === "Escape" && !(e.target as HTMLElement).closest("input")) onClose();
      }}
    >
      <div className="facts-head">
        <h3>{f.title}</h3>
        <button type="button" className="icon-button" aria-label={f.close} title={f.close} onClick={onClose}>
          ×
        </button>
      </div>
      <p className="facts-hint">{f.hint}</p>
      {facts.length === 0 && <p className="sp-empty">{f.empty}</p>}
      <ul>
        {facts.map((fact, i) => (
          <FactRow key={fact.name} fact={fact} inputRef={i === 0 ? first : undefined} />
        ))}
      </ul>
      <form
        className="facts-add"
        onSubmit={(e) => {
          e.preventDefault();
          add();
        }}
      >
        <input
          ref={facts.length === 0 ? first : undefined}
          type="text"
          maxLength={120}
          value={draft}
          placeholder={useT().interactive.choices.newFactPlaceholder}
          aria-label={f.add}
          onChange={(e) => setDraft(e.target.value)}
        />
        <button type="submit" className="ghost-button" disabled={!draft.trim()}>
          + {f.add}
        </button>
      </form>
    </div>
  );
}

function FactRow({ fact, inputRef }: { fact: Fact; inputRef?: React.RefObject<HTMLInputElement | null> }) {
  const f = useT().interactive.facts;
  const [label, setLabel] = useState(fact.label);
  useEffect(() => setLabel(fact.label), [fact.label]);
  const commit = () => {
    if (label.trim() && label !== fact.label) useCosmos.getState().setFactLabel(fact.name, label);
    else setLabel(fact.label);
  };
  const unused = fact.given === 0 && fact.needed === 0;
  return (
    <li className={`facts-row${fact.given === 0 && fact.needed > 0 ? " is-warn" : ""}`}>
      <input
        ref={inputRef}
        type="text"
        maxLength={120}
        value={label}
        aria-label={fmt(f.labelAria, { name: fact.name })}
        onChange={(e) => setLabel(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") (e.target as HTMLInputElement).blur();
          else if (e.key === "Escape") {
            e.stopPropagation();
            setLabel(fact.label);
          }
        }}
      />
      <p className="facts-meta">
        <code>{fact.name}</code>
        {fact.kind === "int" && <span className="choice-tag">{f.counter}</span>}
        <span>{fmt(f.uses, { given: fact.given, needed: fact.needed })}</span>
      </p>
      {fact.given === 0 && fact.needed > 0 && <p className="facts-warn">{f.neverGiven}</p>}
      {unused && (
        <button type="button" className="ghost-button is-danger" onClick={() => useCosmos.getState().setFactLabel(fact.name, null)}>
          {f.forget}
        </button>
      )}
    </li>
  );
}
