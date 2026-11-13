import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { portalRoot } from "./portalRoot";
import { useT } from "../i18n";
import { cleanFontName, useSettings } from "../settings";
import { systemFonts } from "../systemFonts";

/**
 * « Une police de l'ordinateur » (discussion #61) : choisie dans la liste des polices installées quand l'appareil sait
 * la donner, sinon tapée. Liste maison (le menu natif d'un <select> ignore la police des options sous WebKit : sur Mac, tous les noms
 * s'affichaient dans la police de l'interface) : chaque nom s'écrit dans sa propre police. Champ tapé : aperçu dans le champ.
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
        <FontList
          id={ids.input}
          describedBy={ids.hint}
          label={t.settings.customFont}
          placeholder={t.settings.customFontPick}
          current={current}
          options={options}
          preview={preview}
          onChoose={commit}
        />
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

type FontListProps = {
  id: string;
  describedBy: string;
  label: string;
  placeholder: string;
  current: string;
  options: string[];
  preview: (name: string) => { fontFamily: string } | undefined;
  onChoose: (name: string) => void;
};

/** Liste déroulante maison : souris, doigt et clavier (flèches, Début, Fin, Entrée, Échap), posée dans la fenêtre ouverte. */
function FontList({ id, describedBy, label, placeholder, current, options, preview, onChoose }: FontListProps) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [place, setPlace] = useState<{ left: number; top: number; width: number; height: number; up: boolean } | null>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    if (!open || !buttonRef.current) return;
    const r = buttonRef.current.getBoundingClientRect();
    const below = window.innerHeight - r.bottom - 12;
    const above = r.top - 12;
    const up = below < 220 && above > below;
    const height = Math.max(120, Math.min(320, up ? above : below));
    setPlace({ left: r.left, top: up ? r.top - 6 : r.bottom + 6, width: r.width, height, up });
  }, [open]);

  useEffect(() => {
    if (!open) return;
    menuRef.current?.querySelectorAll<HTMLElement>("[role=option]")[active]?.focus();
  }, [open, active, place]);

  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => {
      const target = e.target as Node;
      if (menuRef.current?.contains(target) || buttonRef.current?.contains(target)) return;
      setOpen(false);
    };
    const close = () => setOpen(false);
    // La molette dans la liste la fait défiler : seule une molette ailleurs la ferme.
    const wheel = (e: WheelEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", away, true);
    window.addEventListener("resize", close);
    window.addEventListener("wheel", wheel, { passive: true, capture: true });
    return () => {
      document.removeEventListener("pointerdown", away, true);
      window.removeEventListener("resize", close);
      window.removeEventListener("wheel", wheel, { capture: true });
    };
  }, [open]);

  const show = () => {
    setActive(Math.max(0, options.indexOf(current)));
    setOpen(true);
  };
  const choose = (name: string) => {
    onChoose(name);
    setOpen(false);
    buttonRef.current?.focus();
  };

  const onMenuKey = (e: React.KeyboardEvent) => {
    const last = options.length - 1;
    const go = (i: number) => {
      e.preventDefault();
      setActive(i);
    };
    if (e.key === "ArrowDown") go(active >= last ? 0 : active + 1);
    else if (e.key === "ArrowUp") go(active <= 0 ? last : active - 1);
    else if (e.key === "Home") go(0);
    else if (e.key === "End") go(last);
    else if (e.key === "Escape" || e.key === "Tab") {
      if (e.key === "Escape") e.preventDefault();
      e.stopPropagation();
      setOpen(false);
      buttonRef.current?.focus();
    } else if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      choose(options[active]);
    }
  };

  return (
    <>
      <button
        ref={buttonRef}
        id={id}
        type="button"
        className="font-list-button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-describedby={describedBy}
        style={preview(current)}
        onClick={() => (open ? setOpen(false) : show())}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown" || e.key === "ArrowUp") {
            e.preventDefault();
            show();
          }
        }}
      >
        <span className="font-list-name">{current || placeholder}</span>
        <svg className="font-list-chevron" width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
          <path d="M2 3.5 5 6.5 8 3.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      {open &&
        place &&
        createPortal(
          <div
            ref={menuRef}
            className={`font-list-menu${place.up ? " is-up" : ""}`}
            role="listbox"
            aria-label={label}
            style={{ left: place.left, top: place.top, width: place.width, maxHeight: place.height }}
            onKeyDown={onMenuKey}
          >
            {options.map((f, i) => (
              <button
                key={f}
                type="button"
                role="option"
                aria-selected={f === current}
                tabIndex={i === active ? 0 : -1}
                className="font-list-option"
                style={preview(f)}
                onPointerDown={(e) => e.preventDefault()}
                onMouseEnter={() => setActive(i)}
                onClick={() => choose(f)}
              >
                <span className="font-list-name">{f}</span>
                {f === current && (
                  <svg className="font-list-check" width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
                    <path d="M2.5 6.2 5 8.5 9.5 3.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                )}
              </button>
            ))}
          </div>,
          portalRoot(buttonRef.current),
        )}
    </>
  );
}
