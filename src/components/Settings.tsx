// Bouton « Réglages » : langue de l'interface et apparence (système, claire, sombre).
// Listes déroulantes natives : accessibles au clavier, au lecteur d'écran et au doigt.

import { openGuide } from "../help";
import { isTypographySetting } from "../typography";
import { UpdateSettings } from "./Updates";
import { storage } from "../storage";
import { Fragment, useEffect, useId, useRef, useState } from "react";
import { DICTIONARIES, LANGS, isLang, useT } from "../i18n";
import { useSettings, type ThemePref } from "../settings";
import { useCosmos } from "../store";
import { PROJECT_KINDS, isProjectKind } from "../types";
import { PAPERS, isPaper } from "../screenplay/layout";
import { AI_PROVIDERS, AiError, PROVIDERS, isAiProvider, listModels } from "../ai/providers";
import { aiConfig } from "../settings";
import { fmt } from "../i18n";
import { SOURCE_INFO } from "../imageSources";

/** `project` : afficher aussi les réglages du projet ouvert (faux à l'accueil). */
/** Valeur du choix « Autre modèle… » de la liste. */
const OTHER_MODEL = "\u0000other";

export function Settings({ project = true }: { project?: boolean }) {
  const trashCount = useCosmos((s) => s.trash.length);
  const t = useT();
  const { lang, themePref, setLang, setThemePref, author, ai, setAi, photos, writing, setWriting } = useSettings();
  const [models, setModels] = useState<string[]>([]);
  // Modèle saisi à la main (absent de la liste du service).
  const [typing, setTyping] = useState(false);
  const [aiStatus, setAiStatus] = useState("");
  const [testing, setTesting] = useState(false);
  const provider = ai.provider;
  const config = aiConfig(ai);
  const patchAi = (field: "keys" | "models" | "urls", value: string) => provider && setAi({ ...ai, [field]: { ...ai[field], [provider]: value } });
  const test = async () => {
    if (!config || testing) return;
    setTesting(true);
    setAiStatus(t.ai.testing);
    try {
      const list = await listModels(config);
      setModels(list);
      setTyping(false);
      setAiStatus(fmt(t.ai.testOk, { n: list.length }));
      // Pas encore de modèle choisi : on propose le premier de la liste.
      if (!config.model.trim() && list[0]) patchAi("models", list[0]);
    } catch (err) {
      console.error(err);
      setAiStatus(t.ai.errors[err instanceof AiError ? err.code : "other"]);
    } finally {
      setTesting(false);
    }
  };
  const kind = useCosmos((s) => s.kind);
  const setKind = useCosmos((s) => s.setKind);
  const paper = useCosmos((s) => s.paper);
  const setPaper = useCosmos((s) => s.setPaper);
  const sceneNumbers = useCosmos((s) => s.sceneNumbers);
  const underlineHeadings = useCosmos((s) => s.underlineHeadings);
  const markdownCopies = useCosmos((s) => s.markdownCopies);
  const setSceneNumbers = useCosmos((s) => s.setSceneNumbers);
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const ids = { panel: useId(), lang: useId(), theme: useId(), kind: useId(), kindHint: useId(), paper: useId(), paperHint: useId(), numbers: useId(), numbersHint: useId(), author: useId(), pixabay: useId(), unsplash: useId(), photosHint: useId(), ai: useId(), aiKey: useId(), aiUrl: useId(), aiModel: useId(), aiHint: useId(), updates: useId(), copies: useId(), copiesHint: useId(), typography: useId(), typographyHint: useId() };

  // Fermeture : Échap (retour du focus sur le bouton) ou clic/appui à l'extérieur.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        buttonRef.current?.focus();
      }
    };
    const onDown = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onDown);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onDown);
    };
  }, [open]);

  // Service local : à l'ouverture des réglages, la liste des modèles installés se charge d'elle-même.
  const localUrl = provider && PROVIDERS[provider].local ? `${provider}|${config?.url ?? ""}` : "";
  const listed = useRef("");
  useEffect(() => {
    if (!open || !localUrl || !config || listed.current === localUrl) return;
    listed.current = localUrl;
    listModels(config)
      .then((list) => {
        setModels(list);
        if (!config.model.trim() && list[0]) patchAi("models", list[0]);
      })
      .catch(() => setModels([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, localUrl]);

  const themes: { value: ThemePref; label: string }[] = [
    { value: "system", label: t.settings.themeSystem },
    { value: "light", label: t.settings.themeLight },
    { value: "dark", label: t.settings.themeDark },
  ];

  return (
    <div className="settings" ref={rootRef}>
      <button
        ref={buttonRef}
        type="button"
        className="icon-button"
        aria-label={t.settings.title}
        aria-expanded={open}
        aria-controls={ids.panel}
        onClick={() => setOpen(!open)}
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M4 7h10M18 7h2M4 17h4M12 17h8" />
          <circle cx="16" cy="7" r="2" />
          <circle cx="10" cy="17" r="2" />
        </svg>
      </button>

      {open && (
        // Trois colonnes (projet, appareil et photos, IA) : tout se voit sans défiler sur un écran ordinaire.
        <div className={`settings-panel${project ? " has-project" : ""}`} id={ids.panel} role="group" aria-label={t.settings.title}>
          {project && (
            <section className="settings-col">
          {/* Réglage du projet (enregistré dans cosmos.json) */}
          <div className="eyebrow">{t.kinds.section}</div>
          <label htmlFor={ids.kind}>{t.kinds.label}</label>
          <select
            id={ids.kind}
            value={kind}
            aria-describedby={ids.kindHint}
            onChange={(e) => isProjectKind(e.target.value) && setKind(e.target.value)}
          >
            {PROJECT_KINDS.map((k) => (
              <option key={k} value={k}>
                {t.kinds[k]}
              </option>
            ))}
          </select>
          <p className="settings-hint" id={ids.kindHint}>
            {t.kinds.hint}
          </p>
          {kind === "scenario" && (
            <>
              <label htmlFor={ids.paper}>{t.kinds.paper}</label>
              <select
                id={ids.paper}
                value={paper}
                aria-describedby={ids.paperHint}
                onChange={(e) => isPaper(e.target.value) && setPaper(e.target.value)}
              >
                {PAPERS.map((p) => (
                  <option key={p} value={p}>
                    {p === "letter" ? t.kinds.paperLetter : t.kinds.paperA4}
                  </option>
                ))}
              </select>
              <p className="settings-hint" id={ids.paperHint}>
                {t.kinds.paperHint}
              </p>
              <label className="settings-check" htmlFor={ids.numbers}>
                <input
                  id={ids.numbers}
                  type="checkbox"
                  checked={sceneNumbers}
                  aria-describedby={ids.numbersHint}
                  onChange={(e) => setSceneNumbers(e.target.checked)}
                />
                {t.kinds.sceneNumbers}
              </label>
              <p className="settings-hint" id={ids.numbersHint}>
                {t.kinds.sceneNumbersHint}
              </p>
              <label className="settings-check">
                <input type="checkbox" checked={underlineHeadings} onChange={(e) => useCosmos.getState().setUnderlineHeadings(e.target.checked)} />
                {t.kinds.underlineHeadings}
              </label>
            </>
          )}
          {/* Copies Markdown du projet (markdown/) : seulement là où il y a un vrai dossier (pas le navigateur). */}
          {storage.copies && (
            <>
              <label className="settings-check" htmlFor={ids.copies}>
                <input id={ids.copies} type="checkbox" checked={markdownCopies} aria-describedby={ids.copiesHint} onChange={(e) => useCosmos.getState().setMarkdownCopies(e.target.checked)} />
                {t.copies.setting}
              </label>
              <p className="settings-hint" id={ids.copiesHint}>
                {t.copies.hint}
              </p>
            </>
          )}
          <button type="button" className="ghost-button settings-trash" onClick={() => { setOpen(false); useCosmos.getState().setDialog("trash"); }}>
            {fmt(t.trash.open, { n: trashCount })}
          </button>
            </section>
          )}

          <section className="settings-col">
          {/* Réglages de l'appareil (langue, apparence) */}
          <div className="eyebrow">{t.settings.title}</div>
          <label htmlFor={ids.lang}>{t.settings.language}</label>
          <select id={ids.lang} value={lang} onChange={(e) => isLang(e.target.value) && setLang(e.target.value)}>
            {LANGS.map((code) => (
              // Chaque langue est écrite dans sa propre langue (« English », « Français »).
              <option key={code} value={code} lang={code}>
                {DICTIONARIES[code].meta.name}
              </option>
            ))}
          </select>
          <label htmlFor={ids.theme}>{t.settings.theme}</label>
          <select id={ids.theme} value={themePref} onChange={(e) => setThemePref(e.target.value as ThemePref)}>
            {themes.map((th) => (
              <option key={th.value} value={th.value}>
                {th.label}
              </option>
            ))}
          </select>
          {/* Typographie à la frappe (manuscrit, cartes, Bible) : selon la langue, ou choisie, ou aucune. */}
          <label htmlFor={ids.typography}>{t.settings.typography}</label>
          <select
            id={ids.typography}
            aria-describedby={ids.typographyHint}
            value={writing.typography}
            onChange={(e) => isTypographySetting(e.target.value) && setWriting({ ...writing, typography: e.target.value })}
          >
            {(["auto", "fr", "en", "off"] as const).map((v) => (
              <option key={v} value={v}>
                {t.settings.typographyModes[v]}
              </option>
            ))}
          </select>
          <p className="settings-hint" id={ids.typographyHint}>{t.settings.typographyHint}</p>
          {/* Le nom d'auteur vient du profil, qui se remplit sur la page des projets. */}
          <div className="settings-label" id={ids.author}>{t.settings.author}</div>
          <p className="settings-value" aria-labelledby={ids.author}>{author || t.settings.authorNone}</p>
          <p className="settings-hint">{t.settings.authorHint}</p>
          {/* Photos libres : Openverse sans clé ; Pixabay et Unsplash avec la clé de l'auteur, sur cet appareil seulement. */}
          <div className="eyebrow settings-sep">{t.photos.settingsSection}</div>
          {(["pixabay", "unsplash"] as const).map((source) => (
            <Fragment key={source}>
              <label htmlFor={ids[source]}>{fmt(t.photos.settingsKey, { source: SOURCE_INFO[source].name })}</label>
              <input
                id={ids[source]}
                type="password"
                value={photos.keys[source]}
                autoComplete="off"
                spellCheck={false}
                aria-describedby={ids.photosHint}
                onChange={(e) => useSettings.getState().setPhotoKey(source, e.target.value)}
              />
            </Fragment>
          ))}
          <p className="settings-hint" id={ids.photosHint}>
            {t.photos.settingsHint}
          </p>
          {/* Mises à jour : app de bureau seulement (rien dans le navigateur ni sur mobile). */}
          <UpdateSettings checkboxId={ids.updates} />
          </section>

          <section className="settings-col">
          {/* IA facultative : un service au choix, en ligne ou sur la machine */}
          <div className="eyebrow">{t.ai.section}</div>
          <label htmlFor={ids.ai}>{t.ai.provider}</label>
          <select
            id={ids.ai}
            value={provider ?? ""}
            aria-describedby={ids.aiHint}
            onChange={(e) => {
              setAi({ ...ai, provider: isAiProvider(e.target.value) ? e.target.value : null });
              setModels([]);
              setAiStatus("");
            }}
          >
            <option value="">{t.ai.none}</option>
            {AI_PROVIDERS.map((p) => (
              <option key={p} value={p}>
                {t.ai.providers[p]}
              </option>
            ))}
          </select>
          <p className="settings-hint" id={ids.aiHint}>
            {!provider ? t.ai.hintNone : PROVIDERS[provider].local ? t.ai.hintLocal : t.ai.hintCloud}
          </p>
          {provider && config && (
            <>
              {PROVIDERS[provider].local ? (
                <>
                  <label htmlFor={ids.aiUrl}>{t.ai.url}</label>
                  <input id={ids.aiUrl} type="url" value={config.url} placeholder={PROVIDERS[provider].url} autoComplete="off" spellCheck={false} onChange={(e) => patchAi("urls", e.target.value)} />
                </>
              ) : (
                <>
                  <label htmlFor={ids.aiKey}>{t.ai.key}</label>
                  <input id={ids.aiKey} type="password" value={config.key} autoComplete="off" spellCheck={false} onChange={(e) => patchAi("keys", e.target.value)} />
                  <p className="settings-hint">{t.ai.keyHint}</p>
                </>
              )}
              <label htmlFor={ids.aiModel}>{t.ai.model}</label>
              {/* Une liste déroulante dès que les modèles sont connus : un champ avec suggestions n'aurait
                  montré que ceux qui commencent comme le modèle déjà choisi (souvent un seul). */}
              {models.length > 0 && !typing ? (
                <select
                  id={ids.aiModel}
                  value={config.model}
                  onChange={(e) => (e.target.value === OTHER_MODEL ? setTyping(true) : patchAi("models", e.target.value))}
                >
                  {!config.model.trim() && <option value="">{t.ai.chooseModel}</option>}
                  {[...new Set([...(config.model.trim() ? [config.model] : []), ...models])].map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                  <option value={OTHER_MODEL}>{t.ai.otherModel}</option>
                </select>
              ) : (
                <input id={ids.aiModel} type="text" value={config.model} autoComplete="off" spellCheck={false} onChange={(e) => patchAi("models", e.target.value)} />
              )}
              <button type="button" className="ghost-button" disabled={testing} onClick={() => void test()}>
                {t.ai.test}
              </button>
              <p className="settings-hint" role="status">
                {aiStatus}
              </p>
            </>
          )}
          </section>
          <div className="settings-links">
            {/* Visite guidée : dans un projet, elle s'ouvre sur place ; à l'accueil, avec le projet d'exemple. */}
            <button
              type="button"
              className="link-button"
              onClick={() => {
                setOpen(false);
                const { screen, setTour, tryExample } = useCosmos.getState();
                if (screen === "project") setTour(0);
                else void tryExample();
              }}
            >
              {t.tour.open}
            </button>
            <button type="button" className="link-button" title={t.help.guideHint} onClick={() => { setOpen(false); void openGuide(); }}>
              {t.help.guide} <span aria-hidden="true">↗</span>
            </button>
            <button type="button" className="link-button" onClick={() => { setOpen(false); useCosmos.getState().setDialog("shortcuts"); }}>
              {t.shortcuts.open}
            </button>
            <button type="button" className="link-button" onClick={() => { setOpen(false); useCosmos.getState().setDialog("about"); }}>
              {t.about.open}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
