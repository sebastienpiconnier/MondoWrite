import { useEffect, useId, useState } from "react";
import { useT } from "../i18n";
import { cleanFontName, useSettings } from "../settings";
import { systemFonts } from "../systemFonts";

/**
 * « Une police de l'ordinateur » (discussion #61) : le nom de la police, tapé ou choisi dans la liste des polices
 * installées quand l'appareil sait la donner. Le champ s'affiche dans la police choisie, en aperçu.
 */
export function SystemFontField() {
  const t = useT();
  const writing = useSettings((s) => s.writing);
  const setWriting = useSettings((s) => s.setWriting);
  const ids = { input: useId(), list: useId(), hint: useId() };
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

  return (
    <>
      <label htmlFor={ids.input}>{t.settings.customFont}</label>
      <input
        id={ids.input}
        type="text"
        value={draft}
        list={fonts && fonts.length > 0 ? ids.list : undefined}
        autoComplete="off"
        spellCheck={false}
        aria-describedby={ids.hint}
        style={draft ? { fontFamily: `"${cleanFontName(draft)}", var(--font-text)` } : undefined}
        onChange={(e) => {
          setDraft(e.target.value);
          // Un nom choisi dans la liste s'applique tout de suite ; un nom tapé, en quittant le champ ou à Entrée.
          if (fonts?.includes(e.target.value)) commit(e.target.value);
        }}
        onBlur={(e) => commit(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") commit(e.currentTarget.value);
        }}
      />
      {fonts && fonts.length > 0 && (
        <datalist id={ids.list}>
          {fonts.map((f) => (
            <option key={f} value={f} />
          ))}
        </datalist>
      )}
      <p className="settings-hint" id={ids.hint}>
        {fonts === null ? t.settings.customFontLoading : t.settings.customFontHint}
      </p>
    </>
  );
}
