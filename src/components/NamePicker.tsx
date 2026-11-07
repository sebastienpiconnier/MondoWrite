// Fenêtre « Proposer un nom » (#17) : pays, genre et ce qu'on cherche, une liste tirée hors ligne, « D'autres »
// pour en tirer de nouveaux. Un clic sur un nom le donne à la carte (ou à l'élément du scénario) ; rien ne change
// avant. Les noms déjà portés par une carte du projet ne sont pas proposés.

import { useCallback, useEffect, useMemo, useState } from "react";
import { fmt, useT } from "../i18n";
import { useSettings } from "../settings";
import { useCosmos } from "../store";
import { useNames } from "../namesState";
import { NAME_COUNTRIES, countryForLang, dataFileFor, loadNames, pickNames, seeded, type Gender, type NameKind, type NameList } from "../names";

const COUNT = 8;
const COUNTRIES = NAME_COUNTRIES.filter((c) => dataFileFor(c));

function countryName(code: string, lang: string): string {
  try {
    return new Intl.DisplayNames([lang, "en"], { type: "region" }).of(code) ?? code;
  } catch {
    return code;
  }
}

export function NamePicker() {
  const t = useT().names;
  const lang = useSettings((s) => s.lang);
  const target = useNames((s) => s.target);
  const setDialog = useCosmos((s) => s.setDialog);
  const titles = useCosmos((s) => s.nodes);
  const [country, setCountry] = useState<string>(() => countryForLang(lang));
  const [gender, setGender] = useState<Gender>("any");
  const [kind, setKind] = useState<NameKind>(target?.kind ?? "full");
  const [round, setRound] = useState(() => Math.floor(Math.random() * 1e9));
  const [list, setList] = useState<NameList | null>(null);

  useEffect(() => {
    let live = true;
    setList(null);
    loadNames(country)
      .then((l) => live && setList(l))
      .catch(() => live && setList({ f: [], m: [], x: [], l: [] }));
    return () => {
      live = false;
    };
  }, [country]);

  const taken = useMemo(() => titles.filter((n) => n.data.type === "personnage").map((n) => n.data.title), [titles]);
  const names = useMemo(() => (list ? pickNames({ list, gender, kind, count: COUNT, taken, rand: seeded(round) }) : []), [list, gender, kind, taken, round]);
  const more = useCallback(() => setRound((r) => r + 1), []);

  if (!target) return null;
  const choose = (name: string) => {
    target.onPick(name);
    setDialog(null);
  };

  const segment = <T extends string>(label: string, value: T, options: [T, string][], set: (v: T) => void) => (
    <div className="names-field" role="group" aria-label={label}>
      <span className="eyebrow">{label}</span>
      <div className="names-segment">
        {options.map(([v, text]) => (
          <button key={v} type="button" className={`chip${value === v ? " is-on" : ""}`} aria-pressed={value === v} onClick={() => (set(v), more())}>
            {text}
          </button>
        ))}
      </div>
    </div>
  );

  return (
    <div className="names-panel">
      <h2>{t.title}</h2>
      <p className="muted">{t.intro}</p>
      <label className="names-field">
        <span className="eyebrow">{t.country}</span>
        <select value={country} onChange={(e) => (setCountry(e.target.value), more())}>
          {[...COUNTRIES]
            .map((c) => [c, countryName(c, lang)] as const)
            .sort((a, b) => a[1].localeCompare(b[1], lang))
            .map(([c, label]) => (
              <option key={c} value={c}>
                {label}
              </option>
            ))}
        </select>
      </label>
      {segment<NameKind>(t.kind, kind, [["full", t.kindFull], ["first", t.kindFirst], ["last", t.kindLast]], setKind)}
      {kind !== "last" && segment<Gender>(t.gender, gender, [["any", t.genderAny], ["f", t.genderF], ["m", t.genderM]], setGender)}
      <div className="names-results" role="group" aria-label={t.results}>
        {!list ? null : names.length === 0 ? (
          <p className="muted">{t.none}</p>
        ) : (
          names.map((name) => (
            <button key={name} type="button" className="chip names-pick" aria-label={fmt(t.choose, { name })} onClick={() => choose(name)}>
              {name}
            </button>
          ))
        )}
      </div>
      <div className="names-actions">
        <button type="button" className="ghost-button" onClick={more}>
          {t.more}
        </button>
      </div>
      <p className="muted names-note">{t.noEra} {t.skipped}</p>
    </div>
  );
}
