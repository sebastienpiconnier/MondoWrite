// Poignée sur le bord d'un volet : un onglet qui le replie ou le rouvre (manuscrit, bible).
// Le chevron regarde vers où le volet va : ouvert, il pointe vers le bord ; fermé, vers le centre.

import { useT } from "../i18n";

export function EdgeHandle({ side, open, label, onClick }: { side: "left" | "right" | "top"; open: boolean; label: string; onClick: () => void }) {
  const t = useT();
  const text = `${open ? t.manuscript.panelHide : t.manuscript.panelShow} : ${label}`;
  return (
    <button type="button" className={`edge-handle is-${side}${open ? " is-open" : ""}`} aria-label={text} aria-expanded={open} title={text} onClick={onClick}>
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M15 5l-7 7 7 7" />
      </svg>
    </button>
  );
}
