import type { ReactNode } from "react";

/** Native disclosure shared by writing preferences and optional profile fields. */
export function SettingsDisclosure({ title, summary, name, initiallyOpen, children }: {
  title: string;
  summary?: string;
  name?: string;
  initiallyOpen?: boolean;
  children: ReactNode;
}) {
  return (
    <details className="settings-disclosure" name={name} open={initiallyOpen}>
      <summary>
        <strong>{title}</strong>
        {summary && <small>{summary}</small>}
      </summary>
      <div className="disclosure-fields">{children}</div>
    </details>
  );
}
