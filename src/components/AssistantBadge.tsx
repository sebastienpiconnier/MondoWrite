// Pastille « Assistant » de la barre du haut (#62, lot 2) : l'assistant externe (MCP) a lu le projet ouvert il y a peu.
// Le serveur note chaque lecture (`seen/<clé>`, commande `mcp_seen`) ; l'app la relit de temps en temps. Le menu de la
// pastille dit qui et quand, et coupe l'accès au projet d'un geste. App de bureau seulement, rien n'est enregistré.

import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { fmt, useT } from "../i18n";
import { useSettings } from "../settings";
import { useCosmos } from "../store";
import { storage } from "../storage";
import { backupKey } from "../backups";
import { mcpAllows, mcpAvailable } from "../mcp";
import { MoreMenu } from "./MoreMenu";
import { sendCommand } from "../commands";

/** La pastille reste tant que la dernière lecture date de moins de… */
export const SEEN_RECENT_MS = 10 * 60_000;
/** La lecture est relue toutes les… */
const POLL_MS = 15_000;

export interface Seen {
  at: number;
  client: string;
}

/** Note du serveur relue prudemment : une date en millisecondes, un nom court. */
export function readSeen(raw: string | null | undefined): Seen | null {
  if (!raw) return null;
  try {
    const v = JSON.parse(raw) as { at?: unknown; client?: unknown };
    if (typeof v.at !== "number" || !Number.isFinite(v.at) || v.at <= 0) return null;
    const client = typeof v.client === "string" ? v.client.replace(/[\u0000-\u001f]/g, "").trim().slice(0, 60) : "";
    return { at: v.at, client };
  } catch {
    return null;
  }
}

/** « à l'instant », « il y a 3 minutes » (Intl, dans la langue de l'interface). */
export function agoText(at: number, now: number, lang: string, justNow: string): string {
  const minutes = Math.floor((now - at) / 60_000);
  if (minutes < 1) return justNow;
  return new Intl.RelativeTimeFormat(lang, { numeric: "auto" }).format(-minutes, "minute");
}

export function AssistantBadge() {
  const t = useT();
  const lang = useSettings((s) => s.lang);
  const mcp = useSettings((s) => s.mcp);
  const setProject = useSettings((s) => s.setMcpProject);
  const open = useCosmos((s) => s.screen === "project");
  const id = open ? (storage.current?.() ?? null) : null;
  const allowed = mcpAvailable() && mcpAllows(mcp, id);
  const [seen, setSeen] = useState<Seen | null>(null);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    setSeen(null);
    if (!allowed || !id) return;
    let live = true;
    const key = backupKey(id);
    const read = () => {
      setNow(Date.now());
      invoke<string | null>("mcp_seen", { key })
        .then((raw) => live && setSeen(readSeen(raw)))
        .catch(() => {
          /* dossier privé illisible : pas de pastille */
        });
    };
    read();
    const timer = setInterval(read, POLL_MS);
    return () => {
      live = false;
      clearInterval(timer);
    };
  }, [allowed, id]);

  if (!allowed || !id || !seen || now - seen.at > SEEN_RECENT_MS) return null;
  const client = seen.client || t.mcp.noticeClient;
  const when = agoText(seen.at, now, lang, t.mcp.justNow);
  const said = fmt(t.mcp.seenBy, { client, when });
  return (
    <MoreMenu
      className="assistant-badge"
      label={said}
      icon={
        <>
          <span className="assistant-dot" aria-hidden="true" />
          <span aria-hidden="true">{t.mcp.badge}</span>
        </>
      }
      items={[
        { label: said, disabled: true, onSelect: () => {} },
        { label: t.settings.open, onSelect: () => sendCommand("settings") },
        {
          label: t.mcp.cut,
          danger: true,
          onSelect: () => {
            setProject(id, null);
            setSeen(null);
          },
        },
      ]}
    />
  );
}
