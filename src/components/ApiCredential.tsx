import { useId, useRef, useState } from "react";
import { useT } from "../i18n";
import { EyeIcon } from "./EyeIcon";

interface Props {
  value: string;
  onChange: (value: string) => void;
  server?: { url: string; placeholder?: string; onChange: (value: string) => void };
}

/** La clé React du fournisseur masque de nouveau le secret au changement de service. */
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
              <EyeIcon slashed={visible} />
            </button>
          </div>
          <p className="settings-hint" id={id + "-hint"}>{server ? t.ai.tokenHint : t.ai.keyHint}</p>
        </>
      )}
    </>
  );
}
