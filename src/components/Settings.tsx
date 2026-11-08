// Bouton « Réglages » : langue de l'interface et apparence (système, claire, sombre).
// Listes déroulantes natives : accessibles au clavier, au lecteur d'écran et au doigt.
// #57 : le bouton ouvre d'abord le menu de l'app (Réglages…, Corbeille, Sauvegardes, Commandes, aide, À propos),
// le seul chemin vers ces fenêtres sur PC, iPad et iPhone, qui n'ont pas de barre des menus. Les onglets des
// Réglages ne gardent que des réglages.

import { SPELLCHECK_MODES, isSpellcheckMode } from "../writingAids";
import { openGuide } from "../help";
import { isTypographySetting } from "../typography";
import { typoOptions } from "../typoRules";
import { UpdateSettings } from "./Updates";
import { usePhone } from "./usePhone";
import { storage } from "../storage";
import { Fragment, useEffect, useId, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { useCommand } from "../commands";
import { DICTIONARIES, langCoverage, offeredLangs, isLang, useT } from "../i18n";
import { openExternal } from "../platform";
import { MoreMenu, useKeyHint } from "./MoreMenu";
import { openPalette } from "../commandList";
import { unlearnAll } from "../learn";
import { REPO } from "../updates";

/** Guide des traducteurs sur GitHub. */
const TRANSLATE_URL = `https://github.com/${REPO}/blob/main/TRANSLATING.md`;
import { useSettings, PAGE_ZOOMS, PAGE_FONTS, LINE_SPACINGS, PALETTES, type LineSpacing, type PageFont, type Palette, type ThemePref, type WheelMode } from "../settings";
import { FOCUS_COLUMNS, FOCUS_HIGHLIGHTS } from "../focusText";
import { canFullscreen } from "./FocusBar";
import { useCosmos } from "../store";
import { PROJECT_KINDS, isProjectKind } from "../types";
import { PAPERS, isPaper } from "../screenplay/layout";
import { AI_PROVIDERS, aiErrorText, PROVIDERS, isAiProvider, isLoopback, isReady, listModels } from "../ai/providers";
import { canEmbed, isEmbedModel, proposeEmbedModel } from "../ai/semantic";
import { appleAvailability, isOffered, type FmAvailability } from "../ai/apple";
import { ATELIER_SETTING_ID } from "./Atelier";
import { aiConfig } from "../settings";
import { fmt } from "../i18n";
import { SOURCE_INFO } from "../imageSources";
import { ImageModelField } from "./ImageGen";

/** `project` : afficher aussi les réglages du projet ouvert (faux à l'accueil). */
/** Valeur du choix « Autre modèle… » de la liste. */
const OTHER_MODEL = "\u0000other";

type SettingsTab = "project" | "general" | "writing" | "ai";

export function Settings({ project = true }: { project?: boolean }) {
  const trashCount = useCosmos((s) => s.trash.length);
  const t = useT();
  const phone = usePhone();
  const key = useKeyHint();
  const { lang, themePref, palette, setPalette, setLang, setThemePref, author, ai, setAi, photos, writing, setWriting } = useSettings();
  const [models, setModels] = useState<string[]>([]);
  // Modèle saisi à la main (absent de la liste du service).
  const [typing, setTyping] = useState(false);
  const [aiStatus, setAiStatus] = useState("");
  // iPhone et iPad : synchronisation par iCloud Drive (proposée seulement si iCloud est disponible).
  // null : pas encore su (évite d'afficher un instant le message « iCloud n'est pas activé »).
  const [icloudOk, setIcloudOk] = useState<boolean | null>(null);
  const [icloudOn, setIcloudOn] = useState(() => storage.icloud?.enabled() ?? false);
  useEffect(() => {
    void storage.icloud?.available().then(setIcloudOk);
  }, []);
  const [testing, setTesting] = useState(false);
  // Apple Foundation Models (1.10.0) : null tant qu'on ne sait pas ; « unsupported » hors d'un appareil Apple qui le connaît.
  const [apple, setApple] = useState<FmAvailability | null>(null);
  const [appleChecking, setAppleChecking] = useState(false);
  const checkApple = () => {
    setAppleChecking(true);
    void appleAvailability(true)
      .then(setApple)
      .finally(() => setAppleChecking(false));
  };
  const provider = ai.provider;
  const config = aiConfig(ai);
  const embedModel = (provider && ai.embedModels?.[provider]) || "";
  // Toujours sur les réglages du moment (pas ceux du rendu) : une clé collée pendant le chargement des
  // modèles n'est pas effacée quand le modèle proposé s'écrit ensuite.
  const patchAi = (field: "keys" | "models" | "urls" | "embedModels", value: string, forProvider = provider) => {
    if (!forProvider) return;
    const now = useSettings.getState().ai;
    setAi({ ...now, [field]: { ...now[field], [forProvider]: value } });
  };
  /** Pas encore de modèle choisi pour ce service (réglages du moment) : on propose le premier de la liste. */
  const proposeModel = (forProvider: NonNullable<typeof provider>, list: string[]) => {
    const now = aiConfig({ ...useSettings.getState().ai, provider: forProvider });
    // Un modèle d'embedding ne sait pas converser : on propose d'abord un autre modèle.
    const chat = list.find((m) => !isEmbedModel(m)) ?? list[0];
    if (now && !now.model.trim() && chat) patchAi("models", chat, forProvider);
    // Recherche par le sens (service local) : un modèle dont le nom dit « embed », s'il y en a un.
    const embedNow = useSettings.getState().ai.embedModels?.[forProvider] ?? "";
    const embedding = proposeEmbedModel(list);
    if (canEmbed(forProvider) && !embedNow.trim() && embedding) patchAi("embedModels", embedding, forProvider);
  };
  const test = async () => {
    if (!config || testing) return;
    setTesting(true);
    setAiStatus(t.ai.testing);
    try {
      const list = await listModels(config);
      setModels(list);
      setTyping(false);
      setAiStatus(fmt(t.ai.testOk, { n: list.length }));
      proposeModel(config.provider, list);
    } catch (err) {
      console.error(err);
      setAiStatus(aiErrorText(err, t.ai.errors));
    } finally {
      setTesting(false);
    }
  };
  const kind = useCosmos((s) => s.kind);
  const setKind = useCosmos((s) => s.setKind);
  const paper = useCosmos((s) => s.paper);
  const setPaper = useCosmos((s) => s.setPaper);
  const sceneNumbers = useCosmos((s) => s.sceneNumbers);
  const scriptPdf = useCosmos((s) => s.scriptPdf);
  const underlineHeadings = useCosmos((s) => s.underlineHeadings);
  const markdownCopies = useCosmos((s) => s.markdownCopies);
  const aiMode = useCosmos((s) => s.aiMode);
  const setSceneNumbers = useCosmos((s) => s.setSceneNumbers);
  const [open, setOpen] = useState(false);
  // Barre des menus du Mac (Réglages…) et Cmd/Ctrl + virgule : ouvrir.
  useCommand("settings", () => setOpen(true));
  const wheelMode = useSettings((s) => s.wheelMode);
  const finePointer = typeof window !== "undefined" && !!window.matchMedia?.("(any-pointer: fine)").matches;
  // Augmenter le contraste (réglage du système) : la palette Contraste s'impose, on le dit sous le choix.
  const [moreContrast, setMoreContrast] = useState(() => typeof window !== "undefined" && !!window.matchMedia?.("(prefers-contrast: more)").matches);
  useEffect(() => {
    const q = window.matchMedia?.("(prefers-contrast: more)");
    if (!q) return;
    const on = () => setMoreContrast(q.matches);
    q.addEventListener("change", on);
    return () => q.removeEventListener("change", on);
  }, []);
  const rootRef = useRef<HTMLDivElement>(null);
  const ids = { panel: useId(), lang: useId(), theme: useId(), palette: useId(), kind: useId(), kindHint: useId(), paper: useId(), paperHint: useId(), numbers: useId(), numbersHint: useId(), author: useId(), pixabay: useId(), unsplash: useId(), photosHint: useId(), ai: useId(), aiKey: useId(), aiUrl: useId(), aiModel: useId(), aiHint: useId(), aiEmbed: useId(), aiEmbedHint: useId(), updates: useId(), copies: useId(), copiesHint: useId(), typography: useId(), typographyHint: useId(), spell: useId(), spellHint: useId(), suggestions: useId(), suggestionsHint: useId(), focusHl: useId(), focusTw: useId(), focusCol: useId(), focusFs: useId(), icloud: useId(), icloudHint: useId(), wheel: useId(), pageZoom: useId(), pageFont: useId(), lineSpacing: useId(), pageLookHint: useId(), atelierHint: useId() };

  // Fermeture : Échap (retour du focus sur le bouton) ou clic/appui à l'extérieur.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        rootRef.current?.querySelector<HTMLElement>(".settings-button")?.focus();
      }
    };
    const onDown = (e: PointerEvent) => {
      // Dehors, ou sur le bouton lui-même (il rouvre le menu de l'app) : le panneau se ferme.
      if (!rootRef.current?.contains(e.target as Node) || (e.target instanceof Element && e.target.closest(".settings-button"))) setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onDown);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onDown);
    };
  }, [open]);

  // Service local : à l'ouverture des réglages, la liste des modèles installés se charge d'elle-même.
  const localUrl = provider && PROVIDERS[provider].local && !PROVIDERS[provider].device ? `${provider}|${config?.url ?? ""}` : "";
  const listed = useRef("");
  // Modèle d'Apple : disponibilité redemandée à chaque ouverture (Apple Intelligence activée, modèle téléchargé entre-temps).
  useEffect(() => {
    if (open) checkApple();
  }, [open]);
  useEffect(() => {
    if (!open || !localUrl || !config || listed.current === localUrl) return;
    listed.current = localUrl;
    const asked = localUrl;
    const stale = () => listed.current !== asked || useSettings.getState().ai.provider !== config.provider;
    listModels(config)
      .then((list) => {
        if (stale()) return; // adresse ou service changés entre-temps
        setModels(list);
        setAiStatus("");
        proposeModel(config.provider, list);
      })
      .catch((err) => {
        if (stale()) return;
        setModels([]);
        // Échec : on pourra réessayer (bouton, ou en rouvrant les réglages), et on le dit.
        listed.current = "";
        setAiStatus(fmt(t.ai.listFailed, { error: aiErrorText(err, t.ai.errors) }));
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, localUrl]);

  // Onglet affiché : « Ce projet » quand un projet est ouvert, sinon « Général ». Gardé tant que l'app tourne.
  const tabs: [SettingsTab, string][] = [
    ...(project ? [["project", t.kinds.section] as [SettingsTab, string]] : []),
    ["general", t.settings.tabGeneral],
    ["writing", t.settings.writingSection],
    ["ai", t.settings.tabAi],
  ];
  const [chosenTab, setTab] = useState<SettingsTab>(project ? "project" : "general");
  const tab: SettingsTab = tabs.some(([k]) => k === chosenTab) ? chosenTab : "general";
  const onTabKey = (e: ReactKeyboardEvent) => {
    const at = tabs.findIndex(([k]) => k === tab);
    const go = e.key === "ArrowRight" ? at + 1 : e.key === "ArrowLeft" ? at - 1 : e.key === "Home" ? 0 : e.key === "End" ? tabs.length - 1 : null;
    if (go === null) return;
    e.preventDefault();
    const next = tabs[(go + tabs.length) % tabs.length][0];
    setTab(next);
    document.getElementById(`${ids.panel}-tab-${next}`)?.focus();
  };

  const themes: { value: ThemePref; label: string }[] = [
    { value: "system", label: t.settings.themeSystem },
    { value: "light", label: t.settings.themeLight },
    { value: "dark", label: t.settings.themeDark },
  ];

  return (
    <div className="settings" ref={rootRef}>
      <MoreMenu
        className="settings-button"
        label={t.settings.menu}
        icon={
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M4 7h10M18 7h2M4 17h4M12 17h8" />
            <circle cx="16" cy="7" r="2" />
            <circle cx="10" cy="17" r="2" />
          </svg>
        }
        items={[
          { label: t.settings.open, hint: key("Mod", ","), onSelect: () => setOpen(true) },
          project && { label: fmt(t.trash.open, { n: trashCount }), rule: true, onSelect: () => useCosmos.getState().setDialog("trash") },
          // Sauvegardes hors du projet (#14, #15) : app seulement ; celles du projet ouvert, ou de tous à l'accueil.
          !!storage.backups && { label: t.backups.settingsButton, rule: !project, onSelect: () => useCosmos.getState().openBackups(project ? (storage.backups?.key() ?? null) : null) },
          { label: `${t.palette.title}…`, title: t.palette.open, hint: key("Mod", "K"), onSelect: () => openPalette() },
          // Visite guidée : dans un projet, elle s'ouvre sur place ; à l'accueil, avec le projet d'exemple. Pas sur téléphone.
          !phone && {
            label: t.tour.open,
            rule: true,
            onSelect: () => {
              const { screen, setTour, tryExample } = useCosmos.getState();
              // La visite fait aussi revenir les aides déjà apprises (#59) : consigne du canevas, touches du scénario.
              unlearnAll();
              if (screen === "project") setTour(0);
              else void tryExample();
            },
          },
          { label: `${t.help.guide} ↗`, title: t.help.guideHint, hint: "F1", rule: phone, onSelect: () => void openGuide(null) },
          { label: t.shortcuts.open, onSelect: () => useCosmos.getState().setDialog("shortcuts") },
          { label: t.about.open, onSelect: () => useCosmos.getState().setDialog("about") },
        ]}
      />

      {open && (
        <div className="settings-panel" id={ids.panel} role="group" aria-label={t.settings.title}>
          {/* Onglets (1.11.1) : une chose à la fois, comme la fenêtre Réglages d'une app Mac ; flèches au clavier. */}
          <div className="settings-tabs" role="tablist" aria-label={t.settings.title} onKeyDown={onTabKey}>
            {tabs.map(([key, label]) => (
              <button
                key={key}
                type="button"
                role="tab"
                id={`${ids.panel}-tab-${key}`}
                aria-controls={`${ids.panel}-${key}`}
                aria-selected={tab === key}
                tabIndex={tab === key ? 0 : -1}
                className={tab === key ? "is-current" : undefined}
                onClick={() => setTab(key)}
              >
                {label}
              </button>
            ))}
          </div>
          {project && (
            <section className="settings-col" role="tabpanel" id={`${ids.panel}-project`} aria-labelledby={`${ids.panel}-tab-project`} hidden={tab !== "project"}>
          {/* Réglage du projet (enregistré dans cosmos.json) */}
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
              {/* (À SUIVRE) et (SUITE) : les mêmes réglages que la fenêtre PDF (scriptPdf), écran et PDF. */}
              <label className="settings-check">
                <input type="checkbox" checked={scriptPdf.breaks} onChange={(e) => useCosmos.getState().setScriptPdf({ breaks: e.target.checked })} />
                {t.scriptPdf.breaks}
              </label>
              <label className="settings-check">
                <input type="checkbox" checked={scriptPdf.resumes} onChange={(e) => useCosmos.getState().setScriptPdf({ resumes: e.target.checked })} />
                {t.scriptPdf.resumes}
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
          {/* Mode Atelier (1.8.0) : seulement quand une IA est branchée (ou s'il est déjà actif, pour pouvoir l'arrêter). */}
          {(isReady(config) || aiMode === "atelier") && (
            <>
              <label className="settings-check" htmlFor={ATELIER_SETTING_ID}>
                <input
                  id={ATELIER_SETTING_ID}
                  type="checkbox"
                  checked={aiMode === "atelier"}
                  aria-describedby={ids.atelierHint}
                  onChange={(e) => useCosmos.getState().setAiMode(e.target.checked ? "atelier" : "gardienne")}
                />
                {t.atelier.settingOn}
              </label>
              <div className="settings-hint" id={ids.atelierHint}>
                <p>{aiMode === "atelier" ? t.atelier.settingHint : t.atelier.settingOff}</p>
                {aiMode !== "atelier" && <p>{t.atelier.settingHint}</p>}
                <p>{t.atelier.settingKdp}</p>
              </div>
            </>
          )}
            </section>
          )}

          <section className="settings-col" role="tabpanel" id={`${ids.panel}-general`} aria-labelledby={`${ids.panel}-tab-general`} hidden={tab !== "general"}>
          {/* Réglages de l'appareil (langue, apparence, profil, mises à jour, clés de photos) */}
          <label htmlFor={ids.lang}>{t.settings.language}</label>
          <select id={ids.lang} value={lang} onChange={(e) => isLang(e.target.value) && setLang(e.target.value)}>
            {(offeredLangs().includes(lang) ? offeredLangs() : [...offeredLangs(), lang]).map((code) => (
              // Chaque langue est écrite dans sa propre langue (« English », « Français »).
              <option key={code} value={code} lang={code}>
                {langCoverage(code) < 1
                  ? fmt(t.settings.languagePartial, { name: DICTIONARIES[code].meta.name, percent: new Intl.NumberFormat(lang, { style: "percent" }).format(Math.floor(langCoverage(code) * 100) / 100) })
                  : DICTIONARIES[code].meta.name}
              </option>
            ))}
          </select>
          {/* Guide des traducteurs (TRANSLATING.md) : toute langue est la bienvenue. */}
          <button type="button" className="link-button settings-link" onClick={() => void openExternal(TRANSLATE_URL)}>
            {t.settings.translateHelp} <span aria-hidden="true">↗</span>
          </button>
          <label htmlFor={ids.theme}>{t.settings.theme}</label>
          <select id={ids.theme} value={themePref} onChange={(e) => setThemePref(e.target.value as ThemePref)}>
            {themes.map((th) => (
              <option key={th.value} value={th.value}>
                {th.label}
              </option>
            ))}
          </select>
          <label htmlFor={ids.palette}>{t.settings.palette}</label>
          <select id={ids.palette} value={palette} onChange={(e) => setPalette(e.target.value as Palette)}>
            {PALETTES.map((id) => (
              <option key={id} value={id}>
                {t.settings.palettes[id]}
              </option>
            ))}
          </select>
          {moreContrast && <p className="settings-hint">{t.settings.paletteSystemContrast}</p>}
          {/* Seulement avec une souris ou un trackpad : au doigt, déplacer et pincer ne changent pas. */}
          {finePointer && (
            <>
              <label htmlFor={ids.wheel}>{t.settings.wheel}</label>
              <select id={ids.wheel} value={wheelMode} onChange={(e) => useSettings.getState().setWheelMode(e.target.value as WheelMode)}>
                <option value="pan">{t.settings.wheelPan}</option>
                <option value="zoom">{t.settings.wheelZoom}</option>
              </select>
            </>
          )}
          {/* Le nom d'auteur vient du profil (fenêtre « Toi, l'auteur », ProfileDialog). */}
          <div className="settings-label" id={ids.author}>{t.settings.author}</div>
          <p className="settings-value" aria-labelledby={ids.author}>{author || t.settings.authorNone}</p>
          <p className="settings-hint">{t.settings.authorHint}</p>
          <button
            type="button"
            className="ghost-button"
            onClick={() => {
              setOpen(false);
              useCosmos.getState().setDialog("profile");
            }}
          >
            {t.settings.profileEdit}
          </button>
          {/* Mises à jour : app de bureau seulement (rien dans le navigateur ni sur mobile). */}
          <UpdateSettings checkboxId={ids.updates} />
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
          </section>

          <section className="settings-col" role="tabpanel" id={`${ids.panel}-writing`} aria-labelledby={`${ids.panel}-tab-writing`} hidden={tab !== "writing"}>
          {/* Écriture : mode focus, zoom, typographie, correcteur. */}
          {/* Mode focus : réglé ici aussi, car sur téléphone la barre du mode focus ne garde que la sortie. */}
          <label htmlFor={ids.focusHl}>{t.settings.focusHighlight}</label>
          <select id={ids.focusHl} value={writing.highlight} onChange={(e) => setWriting({ ...writing, highlight: e.target.value as typeof writing.highlight })}>
            {FOCUS_HIGHLIGHTS.map((h) => (
              <option key={h} value={h}>
                {t.focus.highlights[h]}
              </option>
            ))}
          </select>
          <label className="settings-check" htmlFor={ids.focusTw}>
            <input id={ids.focusTw} type="checkbox" checked={writing.typewriter} onChange={(e) => setWriting({ ...writing, typewriter: e.target.checked })} />
            {t.settings.focusTypewriter}
          </label>
          {/* Sur téléphone, le texte prend toute la largeur : la largeur de colonne n'y change rien. */}
          {!phone && (
            <>
              <label htmlFor={ids.focusCol}>{t.settings.focusColumn}</label>
              <select id={ids.focusCol} value={writing.column} onChange={(e) => setWriting({ ...writing, column: e.target.value as typeof writing.column })}>
                {FOCUS_COLUMNS.map((c) => (
                  <option key={c} value={c}>
                    {t.focus.columns[c]}
                  </option>
                ))}
              </select>
            </>
          )}
          {canFullscreen() && (
            <label className="settings-check" htmlFor={ids.focusFs}>
              <input id={ids.focusFs} type="checkbox" checked={writing.fullscreen} onChange={(e) => setWriting({ ...writing, fullscreen: e.target.checked })} />
              {t.settings.focusFullscreen}
            </label>
          )}
          <label htmlFor={ids.pageZoom}>{t.settings.pageZoom}</label>
          <select id={ids.pageZoom} value={String(writing.zoom)} onChange={(e) => setWriting({ ...writing, zoom: Number(e.target.value) })}>
            {/* Une valeur relue hors des crans reste proposée, sinon la liste afficherait autre chose. */}
            {(PAGE_ZOOMS.includes(writing.zoom as (typeof PAGE_ZOOMS)[number]) ? PAGE_ZOOMS : [...PAGE_ZOOMS, writing.zoom].sort((a, b) => a - b)).map((z) => (
              <option key={z} value={String(z)}>
                {new Intl.NumberFormat(lang, { style: "percent" }).format(z)}
              </option>
            ))}
          </select>
          {/* Police et interligne de la page du Manuscrit (#24) : à l'écran seulement. */}
          <label htmlFor={ids.pageFont}>{t.settings.pageFont}</label>
          <select id={ids.pageFont} value={writing.pageFont} aria-describedby={ids.pageLookHint} onChange={(e) => setWriting({ ...writing, pageFont: e.target.value as PageFont })}>
            {PAGE_FONTS.map((f) => (
              <option key={f} value={f}>
                {t.settings.pageFonts[f]}
              </option>
            ))}
          </select>
          <label htmlFor={ids.lineSpacing}>{t.settings.lineSpacing}</label>
          <select id={ids.lineSpacing} value={writing.lineSpacing} aria-describedby={ids.pageLookHint} onChange={(e) => setWriting({ ...writing, lineSpacing: e.target.value as LineSpacing })}>
            {LINE_SPACINGS.map((l) => (
              <option key={l} value={l}>
                {t.settings.lineSpacings[l]}
              </option>
            ))}
          </select>
          <p className="settings-hint" id={ids.pageLookHint}>
            {t.settings.pageLookHint}
          </p>
          {icloudOk === false && storage.icloud && (
            <p className="settings-hint" id={ids.icloudHint}>
              {storage.canPickFolder ? t.settings.icloudOffMac : t.settings.icloudOff}
            </p>
          )}
          {icloudOk && storage.icloud && (
            <>
              <label className="settings-check" htmlFor={ids.icloud}>
                <input
                  id={ids.icloud}
                  type="checkbox"
                  aria-describedby={ids.icloudHint}
                  checked={icloudOn}
                  onChange={(e) => {
                    setIcloudOn(e.target.checked);
                    void useCosmos.getState().setIcloud(e.target.checked);
                  }}
                />
                {t.settings.icloud}
              </label>
              <p className="settings-hint" id={ids.icloudHint}>
                {storage.canPickFolder ? t.settings.icloudHintMac : t.settings.icloudHint}
              </p>
            </>
          )}
          {/* Typographie à la frappe (manuscrit, cartes, Bible) : selon la langue, ou choisie, ou aucune. */}
          <label htmlFor={ids.typography}>{t.settings.typography}</label>
          <select
            id={ids.typography}
            aria-describedby={ids.typographyHint}
            value={writing.typography}
            onChange={(e) => isTypographySetting(e.target.value) && setWriting({ ...writing, typography: e.target.value })}
          >
            <option value="auto">{t.settings.typographyModes.auto}</option>
            {typoOptions(lang).map(({ code, language, quotes }) => (
              <option key={code} value={code}>
                {fmt(t.settings.typographyLang, { language, quotes })}
              </option>
            ))}
            <option value="off">{t.settings.typographyModes.off}</option>
          </select>
          <p className="settings-hint" id={ids.typographyHint}>{t.settings.typographyHint}</p>
          {/* Correcteur et suggestions du système (writingAids.ts) : réglages de l'appareil. */}
          <label htmlFor={ids.spell}>{t.settings.spellcheck}</label>
          <select
            id={ids.spell}
            aria-describedby={ids.spellHint}
            value={writing.spellcheck}
            onChange={(e) => isSpellcheckMode(e.target.value) && setWriting({ ...writing, spellcheck: e.target.value })}
          >
            {SPELLCHECK_MODES.map((v) => (
              <option key={v} value={v}>
                {t.settings.spellcheckModes[v]}
              </option>
            ))}
          </select>
          <p className="settings-hint" id={ids.spellHint}>{t.settings.spellcheckHint}</p>
          <label className="settings-check" htmlFor={ids.suggestions}>
            <input id={ids.suggestions} type="checkbox" aria-describedby={ids.suggestionsHint} checked={writing.suggestions} onChange={(e) => setWriting({ ...writing, suggestions: e.target.checked })} />
            {t.settings.suggestions}
          </label>
          <p className="settings-hint" id={ids.suggestionsHint}>{t.settings.suggestionsHint}</p>
          </section>

          <section className="settings-col" role="tabpanel" id={`${ids.panel}-ai`} aria-labelledby={`${ids.panel}-tab-ai`} hidden={tab !== "ai"}>
          {/* IA facultative : un service au choix, en ligne ou sur la machine */}
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
            {AI_PROVIDERS.filter((p) => p !== "apple" || p === provider || (apple !== null && isOffered(apple))).map((p) =>
              p === "apple" && apple !== "available" ? (
                // Proposé grisé (raison sous la liste) ; gardé s'il est déjà choisi, pour pouvoir en changer.
                <option key={p} value={p} disabled={p !== provider}>
                  {fmt(t.apple.unavailableOption, { name: t.ai.providers[p] })}
                </option>
              ) : (
                <option key={p} value={p}>
                  {t.ai.providers[p]}
                </option>
              ),
            )}
          </select>
          <p className="settings-hint" id={ids.aiHint}>
            {!provider ? t.ai.hintNone : PROVIDERS[provider].device ? t.apple.hint : !PROVIDERS[provider].local ? t.ai.hintCloud : isLoopback(config?.url ?? "") ? t.ai.hintLocal : t.ai.hintRemote}
          </p>
          {/* Apple Intelligence proposé grisé : la raison, et de quoi vérifier de nouveau. */}
          {provider !== "apple" && apple !== null && isOffered(apple) && apple !== "available" && (
            <>
              <p className="settings-hint" role="status">
                {appleChecking ? t.apple.checking : t.apple.availability[apple]}
              </p>
              <button type="button" className="ghost-button" disabled={appleChecking} onClick={checkApple}>
                {t.apple.recheck}
              </button>
            </>
          )}
          {provider && config && PROVIDERS[provider].device && (
            <>
              <p className="settings-hint" role="status">
                {appleChecking || apple === null ? t.apple.checking : t.apple.availability[apple]}
              </p>
              <p className="settings-hint">{t.apple.small}</p>
              <button type="button" className="ghost-button" disabled={appleChecking} onClick={checkApple}>
                {t.apple.recheck}
              </button>
              <p className="settings-hint">{t.apple.noSemantic}</p>
            </>
          )}
          {provider && config && !PROVIDERS[provider].device && (
            <>
              {PROVIDERS[provider].local ? (
                <>
                  <label htmlFor={ids.aiUrl}>{t.ai.url}</label>
                  <input id={ids.aiUrl} type="url" value={config.url} placeholder={PROVIDERS[provider].url} autoComplete="off" spellCheck={false} onChange={(e) => patchAi("urls", e.target.value)} />
                  <label htmlFor={ids.aiKey}>{t.ai.token}</label>
                  <input id={ids.aiKey} type="password" value={config.key} autoComplete="off" spellCheck={false} onChange={(e) => patchAi("keys", e.target.value)} />
                  <p className="settings-hint">{t.ai.tokenHint}</p>
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
              {/* Recherche par le sens : seulement sur la machine (le texte ne part pas en ligne). */}
              {canEmbed(provider) ? (
                <>
                  <label htmlFor={ids.aiEmbed}>{t.semantic.embedModel}</label>
                  {models.length > 0 ? (
                    <select id={ids.aiEmbed} value={embedModel} aria-describedby={ids.aiEmbedHint} onChange={(e) => patchAi("embedModels", e.target.value)}>
                      <option value="">{t.semantic.noEmbedModel}</option>
                      {[...new Set([...(embedModel ? [embedModel] : []), ...models])].map((m) => (
                        <option key={m} value={m}>
                          {m}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <input id={ids.aiEmbed} type="text" value={embedModel} aria-describedby={ids.aiEmbedHint} autoComplete="off" spellCheck={false} onChange={(e) => patchAi("embedModels", e.target.value)} />
                  )}
                  <p className="settings-hint" id={ids.aiEmbedHint}>
                    {t.semantic.embedHint}
                  </p>
                </>
              ) : (
                <p className="settings-hint">{t.semantic.cloudOnly}</p>
              )}
              {/* Images de référence du mode Atelier (1.10.0) : modèle d'image, ou la phrase qui dit que le service n'en fait pas. */}
              <ImageModelField provider={provider} />
              <p className="settings-hint" role="status">
                {aiStatus}
              </p>
            </>
          )}
          </section>
        </div>
      )}
    </div>
  );
}
