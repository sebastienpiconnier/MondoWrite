import "../styles/chatgpt.css";
import { useEffect, useId, useState } from "react";
import { refreshUsage, useSubscriptionUsage, type UsageWindow } from "../ai/subscriptionUsage";
import { requestsToday } from "../ai/usage";
import { fmt, useT } from "../i18n";
import { openExternal } from "../platform";
import { useSettings } from "../settings";

export function ChatGPTUsage({ menuCard = false }: { menuCard?: boolean }) {
  const copy = useT().ai.chatgpt;
  const lang = useSettings((s) => s.lang);
  const { windows: current, busy } = useSubscriptionUsage();
  const [now, setNow] = useState(() => new Date());
  const [expanded, setExpanded] = useState(false);
  const id = useId();
  useEffect(() => {
    if (menuCard) void refreshUsage();
    const update = () => setNow(new Date());
    const timer = window.setInterval(update, 60000);
    window.addEventListener("mondowrite-usage", update);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("mondowrite-usage", update);
    };
  }, [menuCard]);
  const date = (d: Date) => d.toLocaleString(lang, { dateStyle: "medium", timeStyle: "short" });
  const remaining = (w: UsageWindow) => Math.max(0, Math.min(100, 100 - w.percent));
  const remainingLabel = (w: UsageWindow) => fmt(copy.remaining, { n: remaining(w).toLocaleString(lang) });
  const local = fmt(copy.requests, { n: requestsToday("chatgpt", now).toLocaleString(lang) });
  const summary = current.length ? current.map(remainingLabel).join(" · ") : copy.planUsage;
  return <div className={menuCard ? "provider-usage menu-usage" : "provider-usage"} onPointerEnter={(e) => { if (e.pointerType === "mouse") setExpanded(true); }}
    onPointerLeave={(e) => { if (e.pointerType === "mouse" && !e.currentTarget.contains(document.activeElement)) setExpanded(false); }}
    onFocus={(e) => { if (e.target.matches(":focus-visible")) setExpanded(true); }} onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget)) setExpanded(false); }}
    onKeyDown={(e) => { if (e.key === "Escape" && expanded) { e.stopPropagation(); setExpanded(false); } }}>
    <button type="button" className="usage-toggle" aria-label={menuCard && current.length ? copy.planUsage + ", " + remainingLabel(current[0]) : undefined} aria-expanded={expanded} aria-controls={id}
      onClick={() => setExpanded((open) => !open)}>
      {menuCard ? <><svg viewBox="0 0 20 16" width="18" height="16" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" aria-hidden="true">
        <path d="M3 13a8 8 0 1 1 14 0M10 10l4-4" /><circle cx="10" cy="10" r="1" />
      </svg><strong>{copy.planUsage}</strong>{(busy || current.length > 0) && <span className="usage-reading">{busy && <i className="usage-spinner" role="status" aria-label={copy.checkingUsage} />}{current.length > 0 && remainingLabel(current[0])}</span>}</> : summary}
    </button>
    <div id={id} hidden={!expanded} className="usage-detail settings-hint">
      {!menuCard && <strong>{copy.planUsage}</strong>}
      {current.length ? current.map((w, i) => <div className="usage-window" key={i}>
        <b>{remainingLabel(w)}</b><progress max={100} value={remaining(w)} aria-label={remainingLabel(w)} />
        <span>{w.reset ? fmt(copy.reset, { date: date(new Date(w.reset * 1000)) }) : copy.unknownReset}</span>
      </div>) : <div>{copy.viewAccount}</div>}
      <div>{local}</div><button type="button" className="usage-toggle" onClick={() => void openExternal("https://chatgpt.com/settings/usage")}>{copy.usage}
        <svg aria-hidden="true" viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M4 12l8-8M5 4h7v7"/></svg>
      </button>
    </div>
  </div>;
}
