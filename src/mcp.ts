// Assistant externe par MCP (#62, docs/plan-mcp.md) : réglage de l'appareil et écriture des instantanés lus par le
// serveur `--mcp`. Module léger (lu par les réglages) : l'instantané lui-même est fabriqué par mcpSnapshot.ts,
// chargé à la demande.

import { invoke } from "@tauri-apps/api/core";
import { isTauri, isMobileOS } from "./platform";
import { backupKey } from "./backups";
import { getT } from "./i18n";

/** Réglage de l'appareil : assistant externe autorisé, et accès de chaque projet (identifiant → niveau). */
export type McpAccess = "read";
export interface McpSettings {
  enabled: boolean;
  projects: Record<string, McpAccess>;
}
export const DEFAULT_MCP: McpSettings = { enabled: false, projects: {} };

/** Réglage relu prudemment : seulement « read » comme niveau, au plus 200 projets. */
export function readMcp(raw: unknown): McpSettings {
  const r = (raw && typeof raw === "object" ? raw : {}) as Partial<McpSettings>;
  const projects: Record<string, McpAccess> = {};
  if (r.projects && typeof r.projects === "object") {
    for (const [id, level] of Object.entries(r.projects).slice(0, 200)) if (typeof id === "string" && level === "read") projects[id] = "read";
  }
  return { enabled: r.enabled === true, projects };
}

/** Le projet est-il ouvert à l'assistant sur cet appareil ? */
export const mcpAllows = (mcp: McpSettings, projectId: string | null | undefined): boolean => !!projectId && mcp.enabled && mcp.projects[projectId] === "read";

/** L'assistant externe n'existe que dans l'app de bureau (le serveur est l'exécutable de MondoWrite). */
export const mcpAvailable = () => isTauri() && !isMobileOS();

/** Au plus un instantané toutes les quelques secondes par projet : la sauvegarde auto part 800 ms après chaque frappe. */
export const MCP_WRITE_EVERY_MS = 5000;

/** Garde seulement les instantanés des projets ouverts à l'assistant (tous retirés s'il est coupé). */
export async function syncMcpAccess(mcp: McpSettings): Promise<void> {
  if (!mcpAvailable()) return;
  const keys = mcp.enabled ? Object.keys(mcp.projects).map(backupKey) : [];
  await invoke("mcp_keep", { keys }).catch(() => {
    /* dossier privé illisible : rien à retirer */
  });
}

/** Ce que l'instantané lit du projet ouvert : rendu par le store, ou null si ce n'est plus le même projet. */
export type McpRead = () => import("./mcpSnapshot").McpSource | null;

const pending = new Map<string, { last: number; timer: ReturnType<typeof setTimeout> | null; read: McpRead }>();

async function writeNow(projectId: string, read: McpRead): Promise<void> {
  const source = read();
  if (!source) return;
  const [{ buildMcpSnapshot }, { getVersion }] = await Promise.all([import("./mcpSnapshot"), import("@tauri-apps/api/app")]);
  const app = await getVersion().catch(() => "");
  const snapshot = buildMcpSnapshot(source, getT(), new Date(), app);
  await invoke("mcp_publish", { key: backupKey(projectId), snapshot: JSON.stringify(snapshot) });
}

/**
 * Écrit l'instantané du projet ouvert pour l'assistant (après un enregistrement réussi, ou quand l'auteur ouvre le
 * projet à l'assistant). Au plus un toutes les `MCP_WRITE_EVERY_MS` ; le dernier état part toujours. Erreurs avalées :
 * l'instantané ne fait jamais échouer un enregistrement.
 */
export function publishMcp(projectId: string, read: McpRead, now = false): void {
  if (!mcpAvailable()) return;
  const entry = pending.get(projectId) ?? { last: 0, timer: null, read };
  entry.read = read;
  pending.set(projectId, entry);
  if (entry.timer) return;
  const wait = now ? 0 : Math.max(0, entry.last + MCP_WRITE_EVERY_MS - Date.now());
  entry.timer = setTimeout(() => {
    entry.timer = null;
    entry.last = Date.now();
    writeNow(projectId, entry.read).catch((err) => console.error(err));
  }, wait);
}
