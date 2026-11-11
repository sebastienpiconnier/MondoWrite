// Réglages de l'appareil (pas du projet) : langue de l'interface, apparence, nom d'auteur, service d'IA.
// Mémorisés dans le stockage local du navigateur ou de la fenêtre Tauri.

import { readReading, type ReadingSettings } from "./reading";
import { applyWritingAids, isSpellcheckMode, type SpellcheckMode } from "./writingAids";
import { isTypographySetting, type TypographySetting } from "./typography";
import { isFocusColumn, isFocusHighlight, type FocusColumn, type FocusHighlight } from "./focusText";
import { readSections, type BibleSections } from "./bibleSections";
import { create } from "zustand";
import { detectLang, isLang, type Lang } from "./i18n/langs";
import { isTauri } from "./platform";
import { PHOTO_SOURCES, type PhotoSourceId } from "./imageSources";
import { authorName, cleanProfile, readProfile, type AuthorProfile } from "./profile";
import { AI_PROVIDERS, PROVIDERS, isAiProvider, type AiConfig, type AiProvider } from "./ai/providers";
import { readMcp, type McpAccess, type McpSettings } from "./mcp";

export type ThemePref = "system" | "light" | "dark";
export type Theme = "light" | "dark";
/** Palettes de couleurs de l'interface (définies dans styles/palettes.css). Encre est la palette par défaut. */
export const PALETTES = ["encre", "indigo", "papier", "foret", "aube", "sepia", "orange", "contraste"] as const;
export type Palette = (typeof PALETTES)[number];
export const DEFAULT_PALETTE: Palette = "encre";
export const isPalette = (v: unknown): v is Palette => (PALETTES as readonly unknown[]).includes(v);
/**
 * Molette et trackpad sur le canevas (réglage de l'appareil) : « pan » (par défaut) = deux doigts ou molette
 * déplacent, pincer ou Ctrl + molette zoome ; « zoom » = la molette zoome, comme avant la 1.0.17 (souris).
 */
export type WheelMode = "pan" | "zoom";
/** Présentation du séquencier : en liste ou en fiches. */
export type SequencerMode = "outline" | "cards";
/** Aides qui s'effacent une fois apprises (#59) : consigne du canevas, touches du scénario (voir learn.ts). */
export const LEARNED_HINTS = ["canvasHint", "screenplayKeys"] as const;
export type LearnedHint = (typeof LEARNED_HINTS)[number];
/** Relit la liste des aides apprises : seules les clés connues, sans doublon. */
export function readLearned(raw: unknown): LearnedHint[] {
  if (!Array.isArray(raw)) return [];
  return LEARNED_HINTS.filter((k) => raw.includes(k));
}

/**
 * IA facultative : service choisi, et pour chaque service sa clé, son modèle et son adresse.
 * Réglage de l'appareil : une clé d'API ne va jamais dans un projet.
 */
export interface AiSettings {
  provider: AiProvider | null;
  keys: Partial<Record<AiProvider, string>>;
  models: Partial<Record<AiProvider, string>>;
  urls: Partial<Record<AiProvider, string>>;
  /** Modèle d'embedding de la recherche par le sens (services locaux seulement, ai/semantic.ts). */
  embedModels?: Partial<Record<AiProvider, string>>;
  /** Modèle d'image des images de référence (mode Atelier, OpenAI et OpenRouter, ai/imageGen.ts) ; vide : celui par défaut. */
  imageModels?: Partial<Record<AiProvider, string>>;
}

const NO_AI: AiSettings = { provider: null, keys: {}, models: {}, urls: {}, embedModels: {}, imageModels: {} };

function readAi(raw: unknown): AiSettings {
  if (!raw || typeof raw !== "object") return NO_AI;
  const { provider, keys, models, urls, embedModels, imageModels } = raw as Record<string, unknown>;
  const strings = (value: unknown) => {
    const out: Partial<Record<AiProvider, string>> = {};
    if (value && typeof value === "object") for (const p of AI_PROVIDERS) if (typeof (value as Record<string, unknown>)[p] === "string") out[p] = (value as Record<string, string>)[p];
    return out;
  };
  return { provider: isAiProvider(provider) ? provider : null, keys: strings(keys), models: strings(models), urls: strings(urls), embedModels: strings(embedModels), imageModels: strings(imageModels) };
}

/** Réglages du service choisi, prêts pour une requête ; null si l'IA est désactivée. */
export function aiConfig(ai: AiSettings): AiConfig | null {
  const p = ai.provider;
  if (!p) return null;
  return { provider: p, key: ai.keys[p] ?? "", model: ai.models[p] ?? PROVIDERS[p].model, url: ai.urls[p] ?? "" };
}

const KEY = "cosmos:reglages";

export interface WritingSettings {
  /** La ligne en cours reste à mi-hauteur de l'écran, comme sur une machine à écrire. */
  typewriter: boolean;
  /** Ce qui reste en pleine encre ; le reste s'estompe. */
  highlight: FocusHighlight;
  /** Typographie automatique à la frappe : selon la langue de l'interface, celle d'une langue de typoRules.ts, ou aucune. */
  typography: TypographySetting;
  /** Zoom de la page du manuscrit et de la feuille du scénario (1 = taille normale, qui suit la fenêtre). */
  zoom: number;
  /** Correcteur orthographique : partout, à la demande dans le manuscrit et le scénario, ou nulle part. */
  spellcheck: SpellcheckMode;
  /** Suggestions et correction automatique du clavier du système. */
  suggestions: boolean;
  /** Mode focus du manuscrit : largeur de la colonne de texte. */
  column: FocusColumn;
  /** Mode focus : passer la fenêtre en plein écran (ordinateur). */
  fullscreen: boolean;
  /** Police de la page du Manuscrit à l'écran (#24) ; les exports gardent la leur. */
  pageFont: PageFont;
  /** Interligne de la page du Manuscrit à l'écran (#24) ; les coupures de page suivent, les exports non. */
  lineSpacing: LineSpacing;
  /** Police de l'ordinateur choisie par son nom (`pageFont` « system », discussion #61) ; vide = police par défaut. */
  customFont: string;
  /** « Juste écrire » (discussion #61) : les projets s'ouvrent sur le Manuscrit et les autres vues se cachent. */
  writerMode: boolean;
}

/** Polices de la page (#24), toutes embarquées sous licence OFL (l'app marche hors ligne). Clés jamais traduites. */
export const PAGE_FONTS = ["plex", "literata", "garamond", "atkinson", "courier", "system"] as const;
export type PageFont = (typeof PAGE_FONTS)[number];
/** Pile CSS de chaque police, avec un repli du système. */
export const PAGE_FONT_STACKS: Record<PageFont, string> = {
  plex: 'var(--font-text)',
  literata: '"Literata", Georgia, serif',
  garamond: '"EB Garamond", Garamond, Georgia, serif',
  atkinson: '"Atkinson Hyperlegible", system-ui, sans-serif',
  courier: 'var(--font-script)',
  // Une police de l'ordinateur : son nom est posé devant par `pageFontStack` ; sinon la police par défaut.
  system: 'var(--font-text)',
};

/** Nom d'une police tapé ou choisi : une ligne, sans guillemets ni signes qui casseraient la règle CSS. */
export function cleanFontName(raw: unknown): string {
  if (typeof raw !== "string") return "";
  return raw.replace(/[^\p{L}\p{N} \-_.&+'’]/gu, "").replace(/\s+/g, " ").trim().slice(0, 80);
}

/** Pile CSS de la page : la police choisie, ou la police de l'ordinateur nommée, avec la police par défaut en repli. */
export function pageFontStack(font: PageFont, customFont: string): string {
  const name = cleanFontName(customFont);
  if (font === "system" && name) return `"${name}", ${PAGE_FONT_STACKS.plex}`;
  return PAGE_FONT_STACKS[font];
}
/** Interlignes de la page (#24) : celui d'origine (1,6), simple, 1,5 et double (multiples d'une ligne de 1,2). */
export const LINE_SPACINGS = ["normal", "single", "oneHalf", "double"] as const;
export type LineSpacing = (typeof LINE_SPACINGS)[number];
export const LINE_HEIGHTS: Record<LineSpacing, number> = { normal: 1.6, single: 1.2, oneHalf: 1.8, double: 2.4 };
const isPageFont = (v: unknown): v is PageFont => typeof v === "string" && (PAGE_FONTS as readonly string[]).includes(v);
const isLineSpacing = (v: unknown): v is LineSpacing => typeof v === "string" && (LINE_SPACINGS as readonly string[]).includes(v);

/** Crans du zoom de la page (Cmd/Ctrl + et -, menu Présentation, Réglages). */
export const PAGE_ZOOMS = [0.8, 0.9, 1, 1.15, 1.3, 1.5, 1.75, 2] as const;

/** Cran suivant (+1), précédent (-1) ou taille normale (0) ; une valeur hors des crans va au plus proche. */
export function nextZoom(zoom: number, step: -1 | 0 | 1): number {
  if (step === 0) return 1;
  const i = PAGE_ZOOMS.findIndex((z) => z >= zoom - 1e-6);
  const at = i < 0 ? PAGE_ZOOMS.length - 1 : PAGE_ZOOMS[i] > zoom + 1e-6 && step > 0 ? i - 1 : i;
  return PAGE_ZOOMS[Math.max(0, Math.min(PAGE_ZOOMS.length - 1, at + step))];
}

const readZoom = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? Math.max(PAGE_ZOOMS[0], Math.min(PAGE_ZOOMS[PAGE_ZOOMS.length - 1], v)) : 1);

function readWriting(raw: unknown): WritingSettings {
  const w = (raw ?? {}) as Partial<Record<keyof WritingSettings, unknown>>;
  return {
    typewriter: w.typewriter === true,
    highlight: isFocusHighlight(w.highlight) ? w.highlight : "off",
    typography: isTypographySetting(w.typography) ? w.typography : "auto",
    zoom: readZoom(w.zoom),
    spellcheck: isSpellcheckMode(w.spellcheck) ? w.spellcheck : "notes",
    suggestions: w.suggestions !== false,
    column: isFocusColumn(w.column) ? w.column : "medium",
    fullscreen: w.fullscreen === true,
    pageFont: isPageFont(w.pageFont) ? w.pageFont : "plex",
    lineSpacing: isLineSpacing(w.lineSpacing) ? w.lineSpacing : "normal",
    customFont: cleanFontName(w.customFont),
    writerMode: w.writerMode === true,
  };
}
/** Pour les tests : la lecture prudente des réglages d'écriture. */
export const readWritingForTest = (raw: unknown) => readWriting(raw);
const darkQuery = () => (typeof window !== "undefined" ? window.matchMedia?.("(prefers-color-scheme: dark)") : undefined);

interface SettingsState {
  lang: Lang;
  themePref: ThemePref;
  /** Thème réellement affiché (« system » résolu). */
  theme: Theme;
  setLang: (lang: Lang) => void;
  setThemePref: (pref: ThemePref) => void;
  palette: Palette;
  setPalette: (palette: Palette) => void;
  sequencerMode: SequencerMode;
  /** Ruban du récit coloré par narrateur (point de vue des scènes), 1.13.0. */
  ribbonPov: boolean;
  setRibbonPov: (on: boolean) => void;
  /** Synopsis sous chaque scène du volet des scènes (Manuscrit et Scénario, #58) ; non par défaut. */
  /** Aides déjà apprises (#59) : la consigne du canevas, les touches du scénario… ne s'affichent plus. */
  learned: LearnedHint[];
  learn: (hint: LearnedHint) => void;
  /** Toutes les aides reviennent (menu Aide). */
  unlearnAll: () => void;
  wheelMode: WheelMode;
  setWheelMode: (mode: WheelMode) => void;
  setSequencerMode: (mode: SequencerMode) => void;
  /** Profil de l'auteur (nom, nom de plume, coordonnées), repris par les nouveaux projets. */
  profile: AuthorProfile;
  setProfile: (profile: AuthorProfile) => void;
  /** Nom signé sur les œuvres, tiré du profil (nom de plume, sinon prénom et nom). */
  author: string;
  ai: AiSettings;
  setAi: (ai: AiSettings) => void;
  /** Mode focus du manuscrit : machine à écrire, et ce qui reste en pleine encre. */
  writing: WritingSettings;
  setWriting: (writing: WritingSettings) => void;
  /** Rubriques de la Bible : ordre et rubriques masquées. */
  bibleSections: BibleSections;
  setBibleSections: (sections: BibleSections) => void;
  /** Recherche de photos : clés Pixabay et Unsplash (propres à l'appareil comme celles de l'IA) et dernière source choisie. */
  photos: PhotoSettings;
  setPhotoKey: (source: "pixabay" | "unsplash", key: string) => void;
  setPhotoSource: (source: PhotoSourceId) => void;
  /** Lecture à voix haute : voix du narrateur et des personnages (voix de cet appareil), vitesse. */
  reading: ReadingSettings;
  setReading: (patch: Partial<ReadingSettings>) => void;
  /** « Mes gabarits » : les gabarits de l'auteur gardés sur l'appareil, proposés dans tous ses projets. */
  templates: SavedTemplate[];
  saveTemplate: (template: SavedTemplate) => void;
  forgetTemplate: (id: string) => void;
  /** Remet un gabarit retiré (« Annuler »), à sa place dans la liste. */
  restoreTemplate: (template: SavedTemplate, at: number) => void;
  /** Mises à jour de l'app : vérification au lancement (une fois par jour au plus), dernière vérification. */
  updates: UpdateSettings;
  setUpdates: (updates: Partial<UpdateSettings>) => void;
  /** Assistant externe par MCP (#62) : autorisé ou non, et projets ouverts à l'assistant (identifiant → niveau). */
  mcp: McpSettings;
  setMcpEnabled: (on: boolean) => void;
  setMcpProject: (id: string, access: McpAccess | null) => void;
}

/** Un gabarit de l'auteur gardé sur l'appareil : son nom et ses cases (les clés naissent dans chaque projet). */
export interface SavedTemplate {
  id: string;
  name: string;
  beats: { label: string; hint?: string }[];
}

const MAX_TEMPLATES = 30;

export function readTemplates(raw: unknown): SavedTemplate[] {
  if (!Array.isArray(raw)) return [];
  const out: SavedTemplate[] = [];
  for (const item of raw.slice(0, MAX_TEMPLATES)) {
    if (!item || typeof item !== "object") continue;
    const { id, name, beats } = item as { id?: unknown; name?: unknown; beats?: unknown };
    if (typeof id !== "string" || !id || out.some((t) => t.id === id) || !Array.isArray(beats)) continue;
    const list = beats.flatMap((b) => {
      const { label, hint } = (b ?? {}) as { label?: unknown; hint?: unknown };
      return typeof label === "string" && label.trim() ? [{ label: label.trim().slice(0, 120), ...(typeof hint === "string" && hint.trim() ? { hint: hint.trim().slice(0, 300) } : {}) }] : [];
    });
    if (list.length > 0) out.push({ id, name: typeof name === "string" ? name.trim().slice(0, 120) : "", beats: list.slice(0, 40) });
  }
  return out;
}

export interface UpdateSettings {
  /** Chercher une nouvelle version au lancement de l'app. */
  auto: boolean;
  /** Dernière vérification (millisecondes), pour ne pas interroger GitHub à chaque lancement. */
  lastCheck: number;
}

function readUpdates(raw: unknown): UpdateSettings {
  const u = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  return { auto: u.auto !== false, lastCheck: typeof u.lastCheck === "number" && Number.isFinite(u.lastCheck) ? u.lastCheck : 0 };
}

export interface PhotoSettings {
  source: PhotoSourceId;
  keys: { pixabay: string; unsplash: string };
}

const cleanKey = (value: unknown) => (typeof value === "string" ? value.trim().slice(0, 200) : "");

function readPhotos(raw: unknown): PhotoSettings {
  const data = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const keys = (data.keys && typeof data.keys === "object" ? data.keys : {}) as Record<string, unknown>;
  const source = PHOTO_SOURCES.includes(data.source as PhotoSourceId) ? (data.source as PhotoSourceId) : "openverse";
  return { source, keys: { pixabay: cleanKey(keys.pixabay), unsplash: cleanKey(keys.unsplash) } };
}

function readSaved(): { lang?: unknown; themePref?: unknown; palette?: unknown; sequencerMode?: unknown; ribbonPov?: unknown; learned?: unknown; wheelMode?: unknown; author?: unknown; ai?: unknown; bibleSections?: unknown; writing?: unknown; photos?: unknown; profile?: unknown; updates?: unknown; reading?: unknown; templates?: unknown; mcp?: unknown } {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? "{}");
  } catch {
    return {};
  }
}

const resolve = (pref: ThemePref): Theme => (pref === "system" ? (darkQuery()?.matches ? "dark" : "light") : pref);

const saved = readSaved();
const initialProfile = readProfile(saved.profile, saved.author);
const initialLang: Lang = isLang(saved.lang) ? saved.lang : detectLang();
const initialPref: ThemePref =
  saved.themePref === "light" || saved.themePref === "dark" ? saved.themePref : "system";

export const useSettings = create<SettingsState>((set) => ({
  lang: initialLang,
  themePref: initialPref,
  theme: resolve(initialPref),
  setLang: (lang) => set({ lang }),
  setThemePref: (themePref) => set({ themePref, theme: resolve(themePref) }),
  palette: isPalette(saved.palette) ? saved.palette : DEFAULT_PALETTE,
  setPalette: (palette) => set({ palette }),
  sequencerMode: saved.sequencerMode === "cards" ? "cards" : "outline",
  setSequencerMode: (sequencerMode) => set({ sequencerMode }),
  ribbonPov: saved.ribbonPov === true,
  setRibbonPov: (ribbonPov) => set({ ribbonPov }),
  learned: readLearned(saved.learned),
  learn: (hint) => set((s) => (s.learned.includes(hint) ? s : { learned: [...s.learned, hint] })),
  unlearnAll: () => set({ learned: [] }),
  wheelMode: saved.wheelMode === "zoom" ? "zoom" : "pan",
  setWheelMode: (wheelMode) => set({ wheelMode }),
  profile: initialProfile,
  setProfile: (profile) => {
    const clean = cleanProfile(profile);
    set({ profile: clean, author: authorName(clean) });
  },
  author: authorName(initialProfile),
  ai: readAi(saved.ai),
  setAi: (ai) => set({ ai }),
  writing: readWriting(saved.writing),
  setWriting: (writing) => set({ writing }),
  bibleSections: readSections(saved.bibleSections),
  setBibleSections: (bibleSections) => set({ bibleSections }),
  photos: readPhotos(saved.photos),
  setPhotoKey: (source, key) => set((s) => ({ photos: { ...s.photos, keys: { ...s.photos.keys, [source]: cleanKey(key) } } })),
  setPhotoSource: (source) => set((s) => ({ photos: { ...s.photos, source } })),
  reading: readReading(saved.reading),
  setReading: (patch) => set((s) => ({ reading: readReading({ ...s.reading, ...patch }) })),
  templates: readTemplates(saved.templates),
  saveTemplate: (template) => set((s) => ({ templates: readTemplates([template, ...s.templates.filter((t) => t.id !== template.id)]) })),
  forgetTemplate: (id) => set((s) => ({ templates: s.templates.filter((t) => t.id !== id) })),
  restoreTemplate: (template, at) =>
    set((s) => {
      const rest = s.templates.filter((t) => t.id !== template.id);
      return { templates: readTemplates([...rest.slice(0, at), template, ...rest.slice(at)]) };
    }),
  updates: readUpdates(saved.updates),
  setUpdates: (updates) => set((s) => ({ updates: { ...s.updates, ...updates } })),
  mcp: readMcp(saved.mcp),
  setMcpEnabled: (enabled) => set((s) => ({ mcp: { ...s.mcp, enabled } })),
  setMcpProject: (id, access) =>
    set((s) => {
      const projects = { ...s.mcp.projects };
      if (access) projects[id] = access;
      else delete projects[id];
      return { mcp: readMcp({ ...s.mcp, projects }) };
    }),
}));

/**
 * Palette affichée : celle de l'auteur, sauf si le système demande plus de contraste (Augmenter le contraste
 * sur Mac et iPad, Contraste élevé sous Windows) : la palette Contraste, le temps du réglage. Le choix de
 * l'auteur, lui, reste enregistré tel quel.
 */
export const shownPalette = (palette: Palette, moreContrast: boolean): Palette => (moreContrast ? "contraste" : palette);

const contrastQuery = () => (typeof window !== "undefined" ? window.matchMedia?.("(prefers-contrast: more)") : undefined);

/**
 * Clés gardées dans le trousseau du système (#30, secrets.ts) : vrai seulement une fois qu'elles y sont écrites
 * et relues. Alors `cosmos:reglages` ne les porte plus ; faux (trousseau absent, écriture refusée), elles y restent.
 */
let keysElsewhere = false;
let persist: (() => void) | null = null;
export const keysInKeychain = () => keysElsewhere;
export function setKeysInKeychain(on: boolean) {
  if (keysElsewhere === on) return;
  keysElsewhere = on;
  persist?.();
}

/** Applique les réglages au document et les mémorise. À appeler une fois, avant le premier rendu. */
export function initSettings() {
  const apply = ({ lang, theme, themePref, palette, sequencerMode, ribbonPov, learned, wheelMode, profile, ai, bibleSections, writing, photos, updates, reading, templates, mcp }: SettingsState) => {
    const root = document.documentElement;
    root.lang = lang;
    root.dataset.theme = theme;
    root.dataset.palette = shownPalette(palette, !!contrastQuery()?.matches);
    root.style.colorScheme = theme; // barres de défilement, listes déroulantes natives
    // Zoom de la page (manuscrit, scénario) : une variable CSS ; agrandie, la page peut défiler de côté.
    root.style.setProperty("--page-zoom", String(writing.zoom));
    // Police et interligne de la page du Manuscrit (#24) : deux variables CSS, lues seulement par .ms-page.
    root.style.setProperty("--page-font", pageFontStack(writing.pageFont, writing.customFont));
    root.style.setProperty("--page-leading", String(LINE_HEIGHTS[writing.lineSpacing]));
    applyWritingAids(writing.spellcheck, writing.suggestions);
    if (writing.zoom > 1) root.dataset.pageZoomed = "";
    else delete root.dataset.pageZoomed;
    try {
      const stored = keysElsewhere ? { ai: { ...ai, keys: {} }, photos: { ...photos, keys: { pixabay: "", unsplash: "" } } } : { ai, photos };
      localStorage.setItem(KEY, JSON.stringify({ lang, themePref, palette, sequencerMode, ribbonPov, learned, wheelMode, profile, ...stored, bibleSections, writing, updates, reading, templates, mcp }));
    } catch {
      /* réglage non mémorisé, sans gravité */
    }
  };
  apply(useSettings.getState());
  useSettings.subscribe(apply);
  persist = () => apply(useSettings.getState());

  // App Tauri : la barre de titre native suit aussi le choix (null = suivre le système).
  if (isTauri()) {
    const syncWindow = (pref: ThemePref) =>
      import("@tauri-apps/api/window")
        .then(({ getCurrentWindow }) => getCurrentWindow().setTheme(pref === "system" ? null : pref))
        .catch(() => {
          /* pas de barre de titre à thème sur cette plateforme (mobile) */
        });
    syncWindow(useSettings.getState().themePref);
    useSettings.subscribe((s, prev) => s.themePref !== prev.themePref && syncWindow(s.themePref));
  }

  // Augmenter le contraste, activé ou coupé pendant que l'app tourne : la palette affichée suit.
  contrastQuery()?.addEventListener("change", () => apply(useSettings.getState()));

  // Le système passe en sombre (ou en clair) : on suit si l'auteur l'a demandé.
  darkQuery()?.addEventListener("change", () => {
    const { themePref } = useSettings.getState();
    if (themePref === "system") useSettings.setState({ theme: resolve("system") });
  });
}

/** Vue d'un projet qu'on ouvre : le Manuscrit en mode « Juste écrire », sinon le canevas. */
export const firstView = (): "toile" | "manuscrit" => (useSettings.getState().writing.writerMode ? "manuscrit" : "toile");
