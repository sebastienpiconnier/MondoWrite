import { useEffect, useState } from "react";
import { undoableSteps, useAssistantNotice } from "../assistantNotice";
import { fmt, useT } from "../i18n";
import { useCosmos } from "../store";

/** Durée d'affichage (en pause tant que le pointeur ou le focus y sont). */
export const ASSISTANT_NOTICE_MS = 6000;

/** Message en haut de l'écran quand l'assistant externe (MCP) écrit dans le projet ouvert, avec « Annuler ». */
export function AssistantNotice() {
  const t = useT();
  const notice = useAssistantNotice((s) => s.notice);
  const clear = useAssistantNotice((s) => s.clear);
  const past = useCosmos((s) => s.past);
  const [paused, setPaused] = useState({ pointer: false, focus: false });
  const held = paused.pointer || paused.focus;
  useEffect(() => {
    if (!notice || held) return;
    const timer = window.setTimeout(() => {
      if (useAssistantNotice.getState().notice?.at === notice.at) clear();
    }, ASSISTANT_NOTICE_MS);
    return () => window.clearTimeout(timer);
  }, [notice, clear, held]);
  if (!notice) return null;
  const client = notice.client || t.mcp.noticeClient;
  const text = notice.count > 1 ? fmt(t.mcp.noticeMany, { client, n: notice.count }) : fmt(t.mcp.notice, { client });
  // Annuler ne défait que les étapes de l'assistant encore au sommet de l'historique.
  const n = undoableSteps(notice.steps, past);
  return (
    <div
      className="trash-notice assistant-notice"
      role="status"
      onPointerEnter={(e) => e.pointerType === "mouse" && setPaused((p) => ({ ...p, pointer: true }))}
      onPointerLeave={() => setPaused((p) => ({ ...p, pointer: false }))}
      onFocus={() => setPaused((p) => ({ ...p, focus: true }))}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setPaused((p) => ({ ...p, focus: false }));
      }}
    >
      <span>{text}</span>
      {n > 0 && (
        <button
          type="button"
          className="ghost-button"
          onClick={() => {
            for (let i = 0; i < n; i++) useCosmos.getState().undo();
            clear();
          }}
        >
          {t.trash.undo}
        </button>
      )}
      <button type="button" className="icon-button trash-notice-close" aria-label={t.gallery.close} title={t.gallery.close} onClick={clear}>
        <span aria-hidden="true">×</span>
      </button>
    </div>
  );
}
