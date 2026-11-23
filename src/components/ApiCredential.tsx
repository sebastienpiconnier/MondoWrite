import { useId, useRef, useState } from "react";
import { useT } from "../i18n";

interface Props {
  value: string;
  onChange: (value: string) => void;
  server?: { url: string; placeholder?: string; onChange: (value: string) => void };
}

/** The provider key on this component resets visibility when the service changes. */
export function ApiCredential({ value, onChange, server }: Props) {
  const t = useT();
  const id = useId();
  const input = useRef<HTMLInputElement>(null);
  const [expanded, setExpanded] = useState(Boolean(value));
  const urlId = id + "-url";
  const [visible, setVisible] = useState(false);
  const toggleLabel = visible ? t.settings.hideKey : t.settings.showKey;
  return (
    <>
      {server && (
        <>
          <div className="credential-heading">
            <label htmlFor={urlId}>{t.ai.url}</label>
            <button type="button" className="link-button" aria-expanded={expanded} onClick={() => {
              setExpanded(!expanded);
              setVisible(false);
              if (!expanded) requestAnimationFrame(() => input.current?.focus());
            }}>
              {expanded ? t.settings.hideTokenField : t.settings.addToken}
            </button>
          </div>
          <input id={urlId} type="url" value={server.url} placeholder={server.placeholder} autoComplete="off" spellCheck={false} onChange={(e) => server.onChange(e.target.value)} />
        </>
      )}
      {(!server || expanded) && (
        <>
          <label htmlFor={id}>{server ? t.ai.token : t.ai.key}</label>
          <div className="credential-field">
            <input id={id} ref={input} type={visible ? "text" : "password"} value={value} autoComplete="off" spellCheck={false} aria-describedby={id + "-hint"} onChange={(e) => onChange(e.target.value)} />
            <button type="button" className="icon-button" title={toggleLabel} aria-label={toggleLabel} onClick={() => setVisible(!visible)}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                {visible ? <path d="m3 3 18 18M10 5.2a10 10 0 0 1 2-.2c6.2 0 10 7 10 7a19 19 0 0 1-3.2 4.1M6.2 6.8A20 20 0 0 0 2 12s3.8 7 10 7c1.7 0 3.3-.5 4.7-1.2M10 10a3 3 0 0 0 4 4" /> :
                  <><path d="M2 12s3.8-7 10-7 10 7 10 7-3.8 7-10 7S2 12 2 12Z" /><circle cx="12" cy="12" r="3" /></>}
              </svg>
            </button>
          </div>
          <p className="settings-hint" id={id + "-hint"}>{server ? t.ai.tokenHint : t.ai.keyHint}</p>
        </>
      )}
    </>
  );
}
