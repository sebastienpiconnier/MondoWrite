// Nouvelles versions de MondoWrite (app de bureau seulement : sur mobile, ce sont les boutiques qui mettent à jour).
// Deux chemins :
// - installation dans l'app (tauri-plugin-updater) quand la version a été publiée avec sa signature de mise à
//   jour (`latest.json` dans la Release GitHub, clé publique dans l'app) : téléchargement, vérification de la
//   signature, installation, redémarrage ;
// - sinon, simple vérification : la dernière Release publiée sur GitHub (API publique, sans clé), et un bouton
//   qui ouvre sa page de téléchargement.
// Au lancement, une vérification par jour au plus (réglage de l'appareil, désactivable) ; à la demande dans
// « À propos de MondoWrite ». Rien n'est jamais installé sans un clic de l'auteur, et le projet ouvert est
// enregistré avant le redémarrage.

import { create } from "zustand";
import { isMobileOS, isTauri, openExternal } from "./platform";
import { version as CURRENT } from "../package.json";

export const REPO = "sebastienpiconnier/MondoWrite";
export const RELEASES_API = `https://api.github.com/repos/${REPO}/releases/latest`;
export const RELEASES_PAGE = `https://github.com/${REPO}/releases/latest`;
/** Au lancement, pas plus d'une vérification par jour. */
export const CHECK_EVERY_MS = 24 * 60 * 60 * 1000;

export const currentVersion = CURRENT;

/** « v0.1.6 », « 0.1.6-beta.2 » → nombres comparables ; null si ce n'est pas une version. */
export function parseVersion(text: string): { parts: [number, number, number]; pre: string } | null {
  const m = /^v?(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?(?:\+.*)?$/.exec(text.trim());
  if (!m) return null;
  return { parts: [Number(m[1]), Number(m[2]), Number(m[3])], pre: m[4] ?? "" };
}

/** `latest` est-elle plus récente que `current` ? Une préversion (0.2.0-beta) passe avant la version finale (0.2.0). */
export function isNewer(latest: string, current: string): boolean {
  const a = parseVersion(latest);
  const b = parseVersion(current);
  if (!a || !b) return false;
  for (let i = 0; i < 3; i++) if (a.parts[i] !== b.parts[i]) return a.parts[i] > b.parts[i];
  if (a.pre === b.pre) return false;
  if (!a.pre) return true;
  if (!b.pre) return false;
  return a.pre.localeCompare(b.pre, "en", { numeric: true }) > 0;
}

/** Faut-il vérifier au lancement ? */
export const dueForCheck = (auto: boolean, lastCheck: number, now: number) => auto && (now - lastCheck >= CHECK_EVERY_MS || now < lastCheck);

export interface ReleaseInfo {
  version: string;
  /** Page de la version sur GitHub (notes et fichiers à télécharger). */
  url: string;
  /** Notes de version (Markdown de GitHub), abrégées. */
  notes: string;
}

/** Réponse de l'API GitHub pour la dernière Release publiée ; null si elle ne ressemble pas à une version. */
export function parseRelease(raw: unknown): ReleaseInfo | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  if (r.draft === true || r.prerelease === true) return null;
  const tag = typeof r.tag_name === "string" ? r.tag_name.trim() : "";
  if (!parseVersion(tag)) return null;
  const page = typeof r.html_url === "string" && r.html_url.startsWith(`https://github.com/${REPO}/releases/`) ? r.html_url : RELEASES_PAGE;
  const notes = typeof r.body === "string" ? r.body.replace(/\r\n?/g, "\n").trim().slice(0, 4000) : "";
  return { version: tag.replace(/^v/, ""), url: page, notes };
}

/** Les mises à jour ont un sens ici : l'app de bureau. */
export const canUpdate = () => isTauri() && !isMobileOS();

// ---------- État partagé (bandeau et fenêtre « À propos ») ----------

export type UpdateStatus = "idle" | "checking" | "current" | "available" | "downloading" | "restarting" | "error";

interface UpdateState {
  status: UpdateStatus;
  release: ReleaseInfo | null;
  /** L'app sait l'installer elle-même (sinon : page de téléchargement). */
  installable: boolean;
  /** Avancement du téléchargement, de 0 à 1 (null si la taille est inconnue). */
  progress: number | null;
  /** Bandeau refermé (« Plus tard ») : il ne revient pas avant le prochain lancement. */
  dismissed: boolean;
  error: "network" | "install" | null;
}

export const useUpdates = create<UpdateState>(() => ({ status: "idle", release: null, installable: false, progress: null, dismissed: false, error: null }));

/** Mise à jour trouvée par le plugin, gardée hors de l'état React (objet du plugin, pas une donnée). */
let pending: { downloadAndInstall: (onEvent?: (e: DownloadEvent) => void) => Promise<void> } | null = null;
type DownloadEvent = { event: "Started"; data: { contentLength?: number } } | { event: "Progress"; data: { chunkLength: number } } | { event: "Finished" };

/** Dernière Release publiée sur GitHub (plugin HTTP de Tauri : pas de CORS). */
async function latestRelease(): Promise<ReleaseInfo | null> {
  const doFetch: typeof fetch = isTauri() ? ((await import("@tauri-apps/plugin-http")).fetch as typeof fetch) : fetch;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15_000);
  try {
    const response = await doFetch(RELEASES_API, { method: "GET", headers: { accept: "application/vnd.github+json" }, signal: controller.signal });
    if (response.status === 404) return null; // aucune version publiée
    if (!response.ok) throw new Error(String(response.status));
    return parseRelease(await response.json());
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Cherche une nouvelle version. D'abord le plugin de mise à jour (absent tant que l'app n'a pas été construite
 * avec sa clé publique : il répond alors par une erreur), sinon la dernière Release de GitHub.
 */
export async function checkForUpdate(): Promise<UpdateStatus> {
  const s = useUpdates.getState();
  if (!canUpdate() || s.status === "checking" || s.status === "downloading" || s.status === "restarting") return s.status;
  useUpdates.setState({ status: "checking", error: null });
  try {
    try {
      const { check } = await import("@tauri-apps/plugin-updater");
      const update = await check({ timeout: 15_000 });
      if (update && isNewer(update.version, CURRENT)) {
        pending = update;
        const release = (await latestRelease().catch(() => null)) ?? { version: update.version, url: RELEASES_PAGE, notes: update.body ?? "" };
        useUpdates.setState({ status: "available", installable: true, release: { ...release, version: update.version.replace(/^v/, "") } });
        return "available";
      }
      if (update === null) {
        useUpdates.setState({ status: "current", release: null, installable: false });
        return "current";
      }
    } catch {
      /* pas de plugin (app construite sans clé de mise à jour) : vérification simple */
    }
    pending = null;
    const release = await latestRelease();
    const found = release && isNewer(release.version, CURRENT) ? release : null;
    useUpdates.setState({ status: found ? "available" : "current", release: found, installable: false });
    return found ? "available" : "current";
  } catch {
    useUpdates.setState({ status: "error", error: "network" });
    return "error";
  }
}

/**
 * Installe la version trouvée : téléchargement (signature vérifiée par le plugin), installation, puis
 * redémarrage. `beforeRestart` enregistre le projet ouvert (avant l'installation). Sans installation possible : page de téléchargement.
 */
export async function installUpdate(beforeRestart: () => Promise<void>): Promise<void> {
  const { release, installable } = useUpdates.getState();
  if (!release) return;
  if (!installable || !pending) {
    await openExternal(release.url);
    return;
  }
  let total = 0;
  let received = 0;
  useUpdates.setState({ status: "downloading", progress: null, error: null });
  try {
    // Enregistré avant l'installation : sous Windows, l'installeur ferme l'app dès qu'il démarre.
    await beforeRestart().catch(() => undefined);
    await pending.downloadAndInstall((e) => {
      if (e.event === "Started") total = e.data.contentLength ?? 0;
      else if (e.event === "Progress") {
        received += e.data.chunkLength;
        useUpdates.setState({ progress: total > 0 ? Math.min(1, received / total) : null });
      }
    });
    useUpdates.setState({ status: "restarting", progress: 1 });
    const { relaunch } = await import("@tauri-apps/plugin-process");
    await relaunch();
  } catch (err) {
    console.error(err);
    useUpdates.setState({ status: "available", error: "install", progress: null });
  }
}
