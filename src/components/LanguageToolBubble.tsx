// LanguageTool dans le manuscrit et le scénario : la vérification de la scène ouverte (`useLanguageTool`, lancée
// par le menu ⋯), l'état de la vérification (« LanguageTool relit la scène… », erreurs) et la bulle d'une remarque :
// message, corrections proposées, Ignorer, Précédent et Suivant. Trois chemins : un clic sur un passage souligné,
// le doigt (même chose), le clavier (après la vérification, la bulle s'ouvre sur la première remarque et prend
// le focus ; Échap rend la main au texte).

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useEditorState, type Editor } from "@tiptap/react";
import type { Node as PMNode } from "@tiptap/pm/model";
import { fmt, useT, getT } from "../i18n";
import { useSettings } from "../settings";
import { checkText, ltMissing, LtError } from "../languagetool/api";
import { collectText, toRange } from "../languagetool/textMap";
import { firstFrom, ltMeta, ltState, neighbour, type LtIssue } from "../languagetool/extension";
import { isTypographySetting } from "../typography";

/** La partie du document à relire : la scène du curseur, et les blocs à écarter (scénario). */
export interface LtScope {
  from: number;
  to: number;
  accept?: (block: PMNode) => boolean;
}

type Status = { text: string; busy?: boolean; error?: boolean } | null;

/** Langue envoyée : celle choisie pour la typographie, sinon la détection de LanguageTool. */
function checkLanguage(): string {
  const typo = useSettings.getState().writing.typography;
  return isTypographySetting(typo) && typo !== "auto" && typo !== "off" ? typo : "auto";
}

/** Fait défiler jusqu'au passage souligné d'une remarque. */
function reveal(editor: Editor, id: string) {
  requestAnimationFrame(() => {
    if (editor.isDestroyed) return;
    const el = editor.view.dom.querySelector(`[data-lt="${CSS.escape(id)}"]`);
    el?.scrollIntoView({ block: "center", behavior: "smooth" });
  });
}

let runs = 0;

export function useLanguageTool(getEditor: () => Editor | null | undefined, scope: (editor: Editor) => LtScope | null) {
  const server = useSettings((s) => s.languageTool.server);
  const [status, setStatus] = useState<Status>(null);
  const [hasIssues, setHasIssues] = useState(false);
  const abort = useRef<AbortController | null>(null);

  // Un message s'efface seul ; une vérification en cours reste affichée.
  useEffect(() => {
    if (!status || status.busy) return;
    const timer = window.setTimeout(() => setStatus(null), status.error ? 8000 : 4000);
    return () => window.clearTimeout(timer);
  }, [status]);
  useEffect(() => () => abort.current?.abort(), []);

  const run = useCallback(async () => {
    const t = getT().languageTool;
    const editor = getEditor();
    if (!editor || editor.isDestroyed) return;
    const settings = useSettings.getState().languageTool;
    const missing = ltMissing(settings);
    if (missing === "off") return;
    if (missing) {
      setStatus({ text: t.missing[missing], error: true });
      return;
    }
    const range = scope(editor);
    if (!range) return;
    const doc = editor.state.doc;
    const mapped = collectText(doc, range.from, range.to, range.accept);
    abort.current?.abort();
    const controller = new AbortController();
    abort.current = controller;
    setStatus({ text: t.checking, busy: true });
    try {
      const matches = await checkText(settings, mapped.text, checkLanguage(), controller.signal);
      if (controller.signal.aborted || editor.isDestroyed) return;
      const run = ++runs;
      const now = editor.state.doc;
      const issues: LtIssue[] = [];
      matches.forEach((m, i) => {
        const r = toRange(mapped, m.offset, m.length);
        if (!r || r.to > now.content.size) return;
        const original = doc.textBetween(r.from, r.to, "\n", "");
        // Le texte a pu changer pendant la requête : seule une remarque dont le passage est intact est gardée.
        if (now.textBetween(r.from, r.to, "\n", "") !== original) return;
        issues.push({ id: `lt${run}-${i}`, from: r.from, to: r.to, original, message: m.message, replacements: m.replacements, kind: m.kind, rule: m.rule });
      });
      const first = firstFrom(issues, editor.state.selection.from);
      editor.view.dispatch(ltMeta(editor.state.tr, { set: issues, active: first?.id ?? null }));
      setHasIssues(issues.length > 0);
      if (first) reveal(editor, first.id);
      setStatus({ text: issues.length === 0 ? t.none : issues.length === 1 ? t.foundOne : fmt(t.found, { n: issues.length }) });
    } catch (e) {
      if (controller.signal.aborted) return;
      setStatus({ text: t.errors[e instanceof LtError ? e.code : "network"], error: true });
    } finally {
      if (abort.current === controller) abort.current = null;
    }
  }, [getEditor, scope]);

  const clear = useCallback(() => {
    const editor = getEditor();
    if (editor && !editor.isDestroyed) editor.view.dispatch(ltMeta(editor.state.tr, { clear: true }));
    setHasIssues(false);
  }, [getEditor]);

  return { available: server !== "off", run, clear, status, hasIssues };
}

/** L'état de la vérification, en bas de la vue (annoncé aux lecteurs d'écran). */
export function LanguageToolStatus({ status }: { status: Status }) {
  if (!status) return null;
  return createPortal(
    <div className={`lt-status${status.error ? " is-error" : ""}`} role="status" aria-live="polite">
      {status.busy && <span className="lt-spinner" aria-hidden="true" />}
      {status.text}
    </div>,
    document.body,
  );
}

/** Bulle de la remarque choisie, sous son passage. */
export function LanguageToolBubble({ editor }: { editor: Editor }) {
  const t = useT().languageTool;
  const lt = useEditorState({ editor, selector: ({ editor: e }) => ltState(e.state), equalityFn: (a, b) => a === b });
  const active = lt.issues.find((i) => i.id === lt.active) ?? null;
  const box = useRef<HTMLDivElement>(null);
  const [place, setPlace] = useState<{ left: number; top: number } | null>(null);

  useLayoutEffect(() => {
    if (!active) {
      setPlace(null);
      return;
    }
    const measure = () => {
      if (editor.isDestroyed) return;
      try {
        const a = editor.view.coordsAtPos(active.from);
        const width = Math.min(360, window.innerWidth - 16);
        const below = a.bottom + 8;
        const height = box.current?.offsetHeight ?? 180;
        const top = below + height > window.innerHeight - 8 ? Math.max(8, a.top - height - 8) : below;
        setPlace({ left: Math.max(8, Math.min(a.left - 16, window.innerWidth - width - 8)), top });
      } catch {
        setPlace(null);
      }
    };
    measure();
    window.addEventListener("scroll", measure, true);
    window.addEventListener("resize", measure);
    return () => {
      window.removeEventListener("scroll", measure, true);
      window.removeEventListener("resize", measure);
    };
  }, [active?.id, active?.from, editor]); // eslint-disable-line react-hooks/exhaustive-deps

  // Ouverture au clavier (après la vérification) : le focus va dans la bulle.
  const asked = useRef(lt.focus);
  useEffect(() => {
    if (lt.focus === asked.current || !place) return;
    asked.current = lt.focus;
    requestAnimationFrame(() => box.current?.querySelector<HTMLButtonElement>("button")?.focus());
  }, [lt.focus, place]);

  if (!active || !place) return null;

  /** Après une action : la remarque suivante prend la place, et le focus reste dans la bulle s'il y était. */
  const keep = () => {
    if (!box.current?.contains(document.activeElement)) return;
    requestAnimationFrame(() => {
      const first = box.current?.querySelector<HTMLButtonElement>("button");
      if (first) first.focus();
      else editor.view.focus();
    });
  };
  const after = (issue: LtIssue) => neighbour(lt.issues, issue.id, 1);
  const go = (step: 1 | -1) => {
    const next = neighbour(lt.issues, active.id, step);
    if (!next) return;
    editor.view.dispatch(ltMeta(editor.state.tr, { active: next.id }));
    reveal(editor, next.id);
    keep();
  };
  const replace = (value: string) => {
    const following = after(active);
    const tr = value ? editor.state.tr.insertText(value, active.from, active.to) : editor.state.tr.delete(active.from, active.to);
    editor.view.dispatch(ltMeta(tr, { remove: active.id, active: following && following.id !== active.id ? following.id : null }));
    if (following && following.id !== active.id) reveal(editor, following.id);
    keep();
  };
  const ignore = () => {
    const following = after(active);
    editor.view.dispatch(ltMeta(editor.state.tr, { remove: active.id, active: following && following.id !== active.id ? following.id : null }));
    keep();
  };
  const close = () => {
    editor.view.dispatch(ltMeta(editor.state.tr, { active: null }));
    editor.view.focus();
  };

  const index = lt.issues.findIndex((i) => i.id === active.id);
  const titleId = `lt-bubble-${active.id}`;
  return createPortal(
    <div
      ref={box}
      className={`lt-bubble nodrag nopan is-${active.kind}`}
      role="dialog"
      aria-labelledby={titleId}
      style={{ left: place.left, top: place.top }}
      onPointerDown={(e) => e.stopPropagation()}
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.preventDefault();
          e.stopPropagation();
          close();
        }
      }}
    >
      <div className="lt-bubble-head">
        <span className="lt-bubble-kind" id={titleId}>
          {t.kinds[active.kind]}
          <span className="sr-only"> · {t.bubble}</span>
        </span>
        {lt.issues.length > 1 && <span className="lt-bubble-count">{fmt(t.position, { i: index + 1, n: lt.issues.length })}</span>}
      </div>
      {active.message && <p className="lt-bubble-message">{active.message}</p>}
      {active.replacements.length > 0 ? (
        <div className="lt-bubble-fixes">
          {active.replacements.map((r, i) => (
            <button key={`${i}-${r}`} type="button" className="lt-fix" aria-label={fmt(t.replaceWith, { value: r || t.empty })} onClick={() => replace(r)}>
              {r || t.empty}
            </button>
          ))}
        </div>
      ) : (
        <p className="lt-bubble-none">{t.noSuggestion}</p>
      )}
      <div className="lt-bubble-foot">
        <button type="button" className="ghost-button" onClick={ignore}>
          {t.ignore}
        </button>
        <span className="lt-bubble-nav">
          {lt.issues.length > 1 && (
            <>
              <button type="button" className="icon-button" aria-label={t.previous} title={t.previous} onClick={() => go(-1)}>
                <span aria-hidden="true">←</span>
              </button>
              <button type="button" className="icon-button" aria-label={t.next} title={t.next} onClick={() => go(1)}>
                <span aria-hidden="true">→</span>
              </button>
            </>
          )}
          <button type="button" className="icon-button" aria-label={t.close} title={t.close} onClick={close}>
            <span aria-hidden="true">×</span>
          </button>
        </span>
      </div>
    </div>,
    document.body,
  );
}
