// Champ de texte de la Bible qui garde sa frappe avant de la pousser dans le store.
// Un champ contrôlé lié directement au store (`value={card.fiche.x}`, `onChange={setFiche}`) faisait refaire toute
// la Bible à chaque lettre, et la lettre n'apparaissait qu'après ce rendu : une à deux secondes sur un gros projet
// (novembre 2026, retour d'un auteur). Ici la lettre s'affiche tout de suite (état local) et part au store après une
// courte pause, en quittant le champ, ou dès que le projet va être lu, enregistré ou annulé (`flushPendingEdits`).

import { forwardRef, useCallback, useEffect, useRef, useState } from "react";
import type { ChangeEvent, FocusEvent, InputHTMLAttributes, TextareaHTMLAttributes } from "react";
import { registerPendingEdit } from "../pendingEdits";

const PUSH_DELAY = 350;

type Shared = {
  /** Valeur du store. */
  value: string;
  /** Pousse la valeur dans le store. */
  onCommit: (value: string) => void;
  /** Transforme la valeur tapée avant tout (une seule ligne, par exemple). */
  clean?: (value: string) => string;
};

/** État local d'un champ, poussé au store après une pause : valeur affichée, frappe, sortie du champ. */
export function useBufferedValue({ value, onCommit, clean }: Shared) {
  const [local, setLocal] = useState(value);
  const pending = useRef<{ value: string; timer: ReturnType<typeof setTimeout>; unregister: () => void } | null>(null);
  const commitRef = useRef(onCommit);
  commitRef.current = onCommit;

  const flush = useCallback(() => {
    const p = pending.current;
    if (!p) return;
    pending.current = null;
    clearTimeout(p.timer);
    p.unregister();
    commitRef.current(p.value);
  }, []);

  // Le store a changé sans nous (annuler, autre vue, IA) : on le suit tant qu'aucune frappe n'attend.
  useEffect(() => {
    if (!pending.current) setLocal(value);
  }, [value]);

  // Le champ disparaît (fiche repliée, autre projet) : ce qui attend part quand même.
  useEffect(() => flush, [flush]);

  const change = (raw: string) => {
    const next = clean ? clean(raw) : raw;
    setLocal(next);
    const p = pending.current;
    if (p) clearTimeout(p.timer);
    pending.current = {
      value: next,
      timer: setTimeout(flush, PUSH_DELAY),
      unregister: p ? p.unregister : registerPendingEdit(flush),
    };
  };

  return { value: local, change, flush };
}

type InputProps = Omit<InputHTMLAttributes<HTMLInputElement>, "value" | "defaultValue"> & Shared;
type TextareaProps = Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, "value" | "defaultValue"> & Shared;

export const BufferedInput = forwardRef<HTMLInputElement, InputProps>(function BufferedInput(
  { value, onCommit, clean, onChange, onBlur, ...rest },
  ref,
) {
  const field = useBufferedValue({ value, onCommit, clean });
  return (
    <input
      ref={ref}
      {...rest}
      value={field.value}
      onChange={(e: ChangeEvent<HTMLInputElement>) => {
        field.change(e.target.value);
        onChange?.(e);
      }}
      onBlur={(e: FocusEvent<HTMLInputElement>) => {
        field.flush();
        onBlur?.(e);
      }}
    />
  );
});

export const BufferedTextarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function BufferedTextarea(
  { value, onCommit, clean, onChange, onBlur, ...rest },
  ref,
) {
  const field = useBufferedValue({ value, onCommit, clean });
  return (
    <textarea
      ref={ref}
      {...rest}
      value={field.value}
      onChange={(e: ChangeEvent<HTMLTextAreaElement>) => {
        field.change(e.target.value);
        onChange?.(e);
      }}
      onBlur={(e: FocusEvent<HTMLTextAreaElement>) => {
        field.flush();
        onBlur?.(e);
      }}
    />
  );
});
