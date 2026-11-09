// Assistant externe par MCP (#62, docs/plan-mcp.md) : réglages de l'appareil (onglet IA) et accès du projet ouvert
// (onglet Ce projet). Rien n'est ouvert à l'assistant sans ces deux accords. App de bureau seulement.

import { useEffect, useId, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { fmt, useT } from "../i18n";
import { useSettings } from "../settings";
import { mcpAvailable } from "../mcp";
import { storage } from "../storage";

type ClaudeState = "missing" | "connected" | "other" | "no" | null;

/** Onglet IA : autoriser l'assistant externe, connecter Claude Desktop, copier la configuration. */
export function McpAppSettings() {
  const t = useT();
  const mcp = useSettings((s) => s.mcp);
  const setEnabled = useSettings((s) => s.setMcpEnabled);
  const [claude, setClaude] = useState<ClaudeState>(null);
  const [status, setStatus] = useState("");
  const ids = { on: useId(), hint: useId() };

  useEffect(() => {
    if (!mcp.enabled || !mcpAvailable()) return;
    let live = true;
    invoke<ClaudeState>("mcp_claude_state")
      .then((state) => live && setClaude(state))
      .catch(() => live && setClaude("missing"));
    return () => {
      live = false;
    };
  }, [mcp.enabled]);

  if (!mcpAvailable()) return null;
  const shared = Object.keys(mcp.projects).length;

  const connect = async () => {
    setStatus("");
    try {
      await invoke("mcp_connect_claude");
      setClaude("connected");
      setStatus(t.mcp.connected);
    } catch {
      setStatus(t.mcp.connectFailed);
    }
  };
  const copy = async () => {
    try {
      const config = await invoke<string>("mcp_client_config");
      await navigator.clipboard.writeText(config);
      setStatus(t.mcp.copied);
    } catch {
      setStatus(t.mcp.copyFailed);
    }
  };

  return (
    <>
      <div className="settings-label">{t.mcp.title}</div>
      <label className="settings-check" htmlFor={ids.on}>
        <input id={ids.on} type="checkbox" checked={mcp.enabled} aria-describedby={ids.hint} onChange={(e) => setEnabled(e.target.checked)} />
        {t.mcp.enable}
      </label>
      <div className="settings-hint" id={ids.hint}>
        <p>{t.mcp.hint}</p>
        {mcp.enabled && <p>{shared === 0 ? t.mcp.noProject : fmt(t.mcp.projects, { n: shared })}</p>}
      </div>
      {mcp.enabled && (
        <>
          {claude === "connected" ? (
            <p className="settings-hint">{t.mcp.claudeConnected}</p>
          ) : claude === "missing" ? (
            <p className="settings-hint">{t.mcp.claudeMissing}</p>
          ) : claude !== null ? (
            <button type="button" className="ghost-button" onClick={connect}>
              {claude === "other" ? t.mcp.reconnect : t.mcp.connect}
            </button>
          ) : null}
          <button type="button" className="ghost-button" onClick={copy}>
            {t.mcp.copy}
          </button>
          <p className="settings-hint" role="status">
            {status}
          </p>
        </>
      )}
    </>
  );
}

/** Onglet Ce projet : accès de l'assistant au projet ouvert (aucun, lecture, écriture). Seulement si l'assistant est autorisé. */
export function McpProjectSetting() {
  const t = useT();
  const mcp = useSettings((s) => s.mcp);
  const setProject = useSettings((s) => s.setMcpProject);
  const ids = { access: useId(), hint: useId() };
  const id = storage.current?.();
  if (!mcpAvailable() || !mcp.enabled || !id) return null;
  const access = mcp.projects[id] ?? "";
  return (
    <>
      <label htmlFor={ids.access}>{t.mcp.projectAccessLabel}</label>
      <select id={ids.access} value={access} aria-describedby={ids.hint} onChange={(e) => setProject(id, e.target.value === "read" || e.target.value === "write" ? e.target.value : null)}>
        <option value="">{t.mcp.accessNone}</option>
        <option value="read">{t.mcp.accessRead}</option>
        <option value="write">{t.mcp.accessWrite}</option>
      </select>
      <div className="settings-hint" id={ids.hint}>
        <p>{t.mcp.projectHint}</p>
        {access === "write" && <p>{t.mcp.writeHint}</p>}
      </div>
    </>
  );
}
