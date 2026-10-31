// Synopsis d'une scène : une phrase affichée sous son en-tête, qu'on modifie sur place.
// Utilisé dans le volet des scènes de la vue Scénario et dans le séquencier.

import { useState } from "react";
import { fmt, useT } from "../i18n";
import { SynopsisSuggest } from "./Atelier";

interface Props {
  value: string;
  /** Titre de la scène, pour les libellés lus par les lecteurs d'écran. */
  scene: string;
  onSave: (text: string) => void;
  /** Mode Atelier : la carte de la scène et son texte (lu au clic), pour « Proposer un synopsis » quand il est vide. */
  atelier?: { sceneId: string; text: () => string };
  /** Synopsis proposé par l'IA et pas encore retouché (souligné en pointillé). */
  ia?: boolean;
}

export function SynopsisField({ value, scene, onSave, atelier, ia = false }: Props) {
  const all = useT();
  const t = all.screenplay.synopsis;
  const [draft, setDraft] = useState<string | null>(null);

  if (draft === null) {
    const show = (
      <button
        type="button"
        className={`synopsis-show${value ? "" : " is-empty"}${value && ia ? " is-ia" : ""}`}
        aria-label={fmt(value ? t.editFor : t.addFor, { title: scene })}
        title={value && ia ? all.atelier.marked : undefined}
        onClick={() => setDraft(value)}
      >
        {value || t.add}
      </button>
    );
    if (value.trim() || !atelier) return show;
    return (
      <>
        {show}
        <SynopsisSuggest sceneId={atelier.sceneId} title={scene} text={atelier.text} synopsis={value} />
      </>
    );
  }

  const commit = () => {
    // Un synopsis tient sur une ligne dans le fichier : les retours deviennent des espaces.
    const text = draft.replace(/\s+/g, " ").trim();
    setDraft(null);
    if (text !== value) onSave(text);
  };

  return (
    <textarea
      className="synopsis-edit"
      autoFocus
      rows={2}
      value={draft}
      placeholder={t.placeholder}
      aria-label={fmt(t.field, { title: scene })}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter" && !e.shiftKey) {
          e.preventDefault();
          commit();
        } else if (e.key === "Escape") {
          e.stopPropagation();
          setDraft(null);
        }
      }}
    />
  );
}
