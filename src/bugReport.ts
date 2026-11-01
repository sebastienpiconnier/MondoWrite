// « Signaler un bug » (À propos, 1.10.3) : ouvre une issue GitHub préremplie, que l'auteur relit et envoie
// lui-même. Rien ne part sans lui : MondoWrite n'a ni serveur ni compte. Le texte porte la version, le système,
// la langue, le type de projet et les dernières erreurs vues par l'app (chemins de fichiers raccourcis,
// jamais de texte du projet, jamais de clé). Fonctions pures, testées (bug-report.test.ts), sauf l'écoute
// des erreurs (watchErrors).

import { REPO } from "./updates";

/** Dernières erreurs de l'app, les plus récentes en dernier. Gardées en mémoire, le temps de la session. */
const MAX_ERRORS = 5;
const ERROR_LEN = 300;
const errors: string[] = [];

/** Chemins de fichiers raccourcis : le nom de la session (dossier personnel) n'a rien à faire dans une issue publique. */
export function scrubPaths(text: string): string {
  return text
    .replace(/\/(?:Users|home)\/[^/\s'"]+/g, "~")
    .replace(/[A-Za-z]:\\Users\\[^\\\s'"]+/g, "~")
    .replace(/\/(?:private\/)?var\/mobile\/Containers\/[^\s'"]*/g, "…");
}

/** Une erreur en une ligne lisible, chemins raccourcis, bornée. */
export function errorLine(err: unknown): string {
  const raw = err instanceof Error ? `${err.name}: ${err.message}` : typeof err === "string" ? err : (() => {
    try {
      return JSON.stringify(err);
    } catch {
      return String(err);
    }
  })();
  const line = scrubPaths(String(raw ?? "")).replace(/\s+/g, " ").trim();
  return line.length > ERROR_LEN ? `${line.slice(0, ERROR_LEN - 1)}…` : line;
}

export function recordError(err: unknown) {
  const line = errorLine(err);
  if (!line) return;
  // Même erreur répétée : une seule ligne.
  if (errors[errors.length - 1] === line) return;
  errors.push(line);
  if (errors.length > MAX_ERRORS) errors.shift();
}

export const recentErrors = (): readonly string[] => errors;

/** Écoute les erreurs de la page et celles que l'app écrit dans la console (enregistrement, IA, exports). */
export function watchErrors() {
  if (typeof window === "undefined") return;
  window.addEventListener("error", (e) => recordError(e.error ?? e.message));
  window.addEventListener("unhandledrejection", (e) => recordError(e.reason));
  const original = console.error.bind(console);
  console.error = (...args: unknown[]) => {
    recordError(args.length === 1 ? args[0] : args.map((a) => errorLine(a)).join(" "));
    original(...args);
  };
}

export interface BugContext {
  version: string;
  /** Système et navigateur lus dans l'appareil (user agent raccourci). */
  system: string;
  /** App de bureau, mobile ou navigateur. */
  shell: string;
  lang: string;
  /** Roman ou scénario, vide sans projet ouvert. */
  project: string;
  /** Service d'IA branché, sans clé (vide sans IA). */
  ai: string;
  errors: readonly string[];
}

export interface BugTexts {
  title: string;
  what: string;
  expected: string;
  steps: string;
  stepsHint: string;
  details: string;
  noErrors: string;
  labels: { version: string; system: string; shell: string; lang: string; project: string; ai: string; errors: string };
}

/** « Version : 1.10.3 » en français, « Version: 1.10.3 » en anglais. */
const pair = (label: string, value: string, lang: string) => `- ${label}${lang.startsWith("fr") ? "\u00a0:" : ":"} ${value}`;

/** Corps de l'issue, en Markdown : questions à remplir, puis ce que l'app sait d'elle-même. */
export function bugBody(ctx: BugContext, t: BugTexts): string {
  const l = t.labels;
  const info = [
    pair(l.version, ctx.version, ctx.lang),
    pair(l.shell, ctx.shell, ctx.lang),
    pair(l.system, ctx.system, ctx.lang),
    pair(l.lang, ctx.lang, ctx.lang),
    ctx.project ? pair(l.project, ctx.project, ctx.lang) : "",
    ctx.ai ? pair(l.ai, ctx.ai, ctx.lang) : "",
  ].filter(Boolean);
  const errs = ctx.errors.length > 0 ? ["```", ...ctx.errors, "```"] : [t.noErrors];
  return [`### ${t.what}`, "", "", `### ${t.expected}`, "", "", `### ${t.steps}`, t.stepsHint, "1. ", "", `### ${t.details}`, ...info, "", `**${l.errors}**`, ...errs, ""].join("\n");
}

/** Adresse de la page « nouvelle issue » de GitHub, titre et corps préremplis (bornée : les navigateurs coupent les adresses trop longues). */
export function bugReportUrl(ctx: BugContext, t: BugTexts, repo = REPO): string {
  let body = bugBody(ctx, t);
  if (body.length > 6000) body = bugBody({ ...ctx, errors: ctx.errors.slice(-2) }, t).slice(0, 6000);
  const params = new URLSearchParams({ title: t.title, body, labels: "bug" });
  return `https://github.com/${repo}/issues/new?${params.toString()}`;
}

/** Système en clair depuis le user agent : « macOS 15.1 », « Windows 10/11 », « iPadOS », « Linux »… et le navigateur s'il n'est pas l'app. */
export function systemName(ua: string): string {
  const mac = /Mac OS X (\d+)[._](\d+)/.exec(ua);
  if (/iPhone/.test(ua)) return `iOS ${/OS (\d+)_(\d+)/.exec(ua)?.slice(1).join(".") ?? ""}`.trim();
  if (/iPad/.test(ua)) return `iPadOS ${/OS (\d+)_(\d+)/.exec(ua)?.slice(1).join(".") ?? ""}`.trim();
  if (/Android (\d+(?:\.\d+)?)/.test(ua)) return `Android ${/Android (\d+(?:\.\d+)?)/.exec(ua)![1]}`;
  if (/Windows NT 10/.test(ua)) return "Windows 10/11";
  if (/Windows/.test(ua)) return "Windows";
  if (mac) return "macOS";
  if (/Linux/.test(ua)) return "Linux";
  return ua.slice(0, 80);
}
