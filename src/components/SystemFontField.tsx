import { useEffect, useId, useState } from "react";
import { useT } from "../i18n";
import { cleanFontName, useSettings } from "../settings";
import { systemFonts } from "../systemFonts";

/**
 * « Une police de l'ordinateur » (discussion #61) : choisie dans la liste des polices installées quand l'appareil sait
 * la donner, sinon tapée. Le champ s'affiche dans la police choisie, en aperçu.
 */
export function SystemFontField() {
  const t = useT();
  const writing = useSettings((s) => s.writing);
  const setWriting = useSettings((s) => s.setWriting);
  const ids = { input: useId(), hint: useId() };
  const [fonts, setFonts] = useState<string[] | null>(null);
  const [draft, setDraft] = useState(writing.customFont);

  useEffect(() => {
    let alive = true;
    void systemFonts().then((list) => alive && setFonts(list));
    return () => {
      alive = false;
    };
  }, []);

  const commit = (value: string) => {
    const name = cleanFontName(value);
    setDraft(name);
    if (name !== writing.customFont) setWriting({ ...writing, customFont: name });
  };

  const preview = (name: string) => (name ? { fontFamily: `"${cleanFontName(name)}", var(--font-text)` } : undefined);

  // Polices connues : une liste qui les montre toutes. Pas de <datalist> : le navigateur n'y propose que les noms qui
  // commencent comme le texte du champ, donc, une police choisie, plus rien d'autre (novembre 2026).
  if (fonts && fonts.length > 0) {
    const current = writing.customFont;
    const options = current && !fonts.includes(current) ? [current, ...fonts] : fonts;
    return (
      <>
        <label htmlFor={ids.input}>{t.settings.customFont}</label>
        <select
          id={ids.input}
          value={current}
          aria-describedby={ids.hint}
          style={preview(current)}
          onChange={(e) => commit(e.target.value)}
        >
          {!current && <option value="">{t.settings.customFontPick}</option>}
          {options.map((f) => (
            <option key={f} value={f}>
              {f}
            </option>
          ))}
        </select>
        <p className="settings-hint" id={ids.hint}>
          {t.settings.customFontListHint}
        </p>
      </>
    );
  }

  return (
    <>
      <label htmlFor={ids.input}>{t.settings.customFont}</label>
      <input
        id={ids.input}
        type="text"
        value={draft}
        autoComplete="off"
        spellCheck={false}
        aria-describedby={ids.hint}
        style={preview(draft)}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={(e) => commit(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") commit(e.currentTarget.value);
        }}
      />
      <p className="settings-hint" id={ids.hint}>
        {fonts === null ? t.settings.customFontLoading : t.settings.customFontHint}
      </p>
    </>
  );
}
