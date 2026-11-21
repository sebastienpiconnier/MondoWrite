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
import { checkText, ltCanBulk, ltLive, ltMissing, LtError, type LtMatch } from "../languagetool/api";
import { collectRanges, collectText, toRange, touchedBlocks, type MappedText } from "../languagetool/textMap";
import { Mapping } from "@tiptap/pm/transform";
import type { Transaction } from "@tiptap/pm/state";
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

/**
 * Suit les modifications du texte pendant une requête : les positions relevées sur le document d'avant sont
 * ramenées sur celui d'après (le texte a pu bouger plus haut pendant que LanguageTool relisait).
 */
function follow(editor: Editor) {
  const mapping = new Mapping();
  const onTr = ({ transaction }: { transaction: Transaction }) => {
    if (transaction.docChanged) mapping.appendMapping(transaction.mapping);
  };
  editor.on("transaction", onTr);
  return { mapping, stop: () => editor.off("transaction", onTr) };
}

/** Remarques placées dans le document actuel ; une remarque dont le passage a changé entre-temps est écartée. */
function placeIssues(editor: Editor, before: PMNode, mapped: MappedText, matches: LtMatch[], mapping: Mapping): LtIssue[] {
  const run = ++runs;
  const now = editor.state.doc;
  const issues: LtIssue[] = [];
  matches.forEach((m, i) => {
    const r = toRange(mapped, m.offset, m.length);
    if (!r) return;
    const original = before.textBetween(r.from, r.to, "\n", "");
    const from = mapping.map(r.from, 1);
    const to = mapping.map(r.to, -1);
    if (to <= from || to > now.content.size || now.textBetween(from, to, "\n", "") !== original) return;
    issues.push({ id: `lt${run}-${i}`, from, to, original, message: m.message, replacements: m.replacements, kind: m.kind, rule: m.rule });
  });
  return issues;
}

const mapRange = (mapping: Mapping, r: { from: number; to: number }) => ({ from: mapping.map(r.from, -1), to: mapping.map(r.to, 1) });

/** Message d'une erreur de LanguageTool, avec ce que le service a répondu. */
function errorText(e: unknown): string {
  const text = getT().languageTool.errors[e instanceof LtError ? e.code : "network"];
  return e instanceof LtError && e.detail ? `${text} (${e.detail})` : text;
}

/** Attente entre deux morceaux de tout le livre : sous les limites par minute du compte (80 en Premium). */
const BULK_PAUSE_MS = 1500;

/**
 * Vérification lancée par le menu ⋯ : la scène en cours (`scope`), ou tout le texte (`accept` écarte des blocs,
 * dans un scénario) avec un compte Premium ou un serveur personnel.
 */
export function useLanguageTool(getEditor: () => Editor | null | undefined, scope: (editor: Editor) => LtScope | null, accept?: (block: PMNode) => boolean) {
  const lt = useSettings((s) => s.languageTool);
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

  const run = useCallback(
    async (what: "scene" | "all" = "scene") => {
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
      const all = what === "all";
      if (all && !ltCanBulk(settings)) return;
      const range = all ? { from: 0, to: editor.state.doc.content.size, accept } : scope(editor);
      if (!range) return;
      const before = editor.state.doc;
      const mapped = collectText(before, range.from, range.to, range.accept);
      abort.current?.abort();
      const controller = new AbortController();
      abort.current = controller;
      setStatus({ text: all ? t.checkingAll : t.checking, busy: true });
      const tracked = follow(editor);
      try {
        const matches = await checkText(settings, mapped.text, checkLanguage(), controller.signal, undefined, {
          pauseMs: all ? BULK_PAUSE_MS : 0,
          onProgress: (n, total) => total > 1 && setStatus({ text: fmt(t.checkingPart, { i: n, n: total }), busy: true }),
        });
        if (controller.signal.aborted || editor.isDestroyed) return;
        const issues = placeIssues(editor, before, mapped, matches, tracked.mapping);
        const first = firstFrom(issues, editor.state.selection.from);
        editor.view.dispatch(ltMeta(editor.state.tr, { within: [mapRange(tracked.mapping, range)], add: issues, active: first?.id ?? null }));
        setHasIssues(issues.length > 0 || ltState(editor.state).issues.length > 0);
        if (first) reveal(editor, first.id);
        setStatus({ text: issues.length === 0 ? (all ? t.noneAll : t.none) : issues.length === 1 ? t.foundOne : fmt(t.found, { n: issues.length }) });
      } catch (e) {
        if (controller.signal.aborted) return;
        setStatus({ text: errorText(e), error: true });
      } finally {
        tracked.stop();
        if (abort.current === controller) abort.current = null;
      }
    },
    [getEditor, scope, accept],
  );

  const clear = useCallback(() => {
    const editor = getEditor();
    if (editor && !editor.isDestroyed) editor.view.dispatch(ltMeta(editor.state.tr, { clear: true }));
    setHasIssues(false);
  }, [getEditor]);

  return { available: lt.server !== "off", bulk: ltCanBulk(lt), run, clear, status, hasIssues: hasIssues || ltLive(lt) };
}

/** Pause dans la frappe avant de relire les paragraphes modifiés. */
export const LIVE_PAUSE_MS = 2000;
/** Écart minimal entre deux requêtes pendant la frappe (au plus 20 par minute, sous les 80 du Premium). */
export const LIVE_GAP_MS = 3000;

/** Paragraphes relus au plus par requête pendant la frappe. */
const LIVE_MAX_BLOCKS = 12;

/**
 * Vérification pendant la frappe (compte Premium ou serveur personnel, case cochée) : après une pause, seuls les
 * paragraphes modifiés partent chez LanguageTool, une requête à la fois, espacées d'au moins `LIVE_GAP_MS`.
 * Les remarques de ces paragraphes sont remplacées ; la bulle ne s'ouvre pas d'elle-même.
 */
export function LanguageToolLive({ editor, accept }: { editor: Editor; accept?: (block: PMNode) => boolean }) {
  const on = useSettings((s) => ltLive(s.languageTool));
  const [status, setStatus] = useState<Status>(null);
  useEffect(() => {
    if (!status) return;
    const timer = window.setTimeout(() => setStatus(null), 8000);
    return () => window.clearTimeout(timer);
  }, [status]);

  useEffect(() => {
    if (!on || editor.isDestroyed) return;
    let dirty: number[] = [];
    let timer: ReturnType<typeof setTimeout> | null = null;
    let busy = false;
    let last = 0;
    let stopped = false;
    let failures = 0;
    const controller = new AbortController();

    const schedule = (ms: number) => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => void flush(), ms);
    };
    const onTr = ({ transaction: tr }: { transaction: Transaction }) => {
      if (!tr.docChanged) return;
      dirty = dirty.map((p) => tr.mapping.map(p, -1));
      const touched = touchedBlocks(tr);
      // Un grand changement d'un coup (texte rechargé, long collage) n'est pas de la frappe : on ne relit rien.
      if (touched.length > LIVE_MAX_BLOCKS) return;
      for (const p of touched) if (!dirty.includes(p)) dirty.push(p);
      if (dirty.length > LIVE_MAX_BLOCKS) dirty = dirty.slice(-LIVE_MAX_BLOCKS);
      if (!busy) schedule(LIVE_PAUSE_MS);
    };
    const flush = async () => {
      timer = null;
      if (stopped || busy || dirty.length === 0 || editor.isDestroyed) return;
      const wait = last + LIVE_GAP_MS - Date.now();
      if (wait > 0) return schedule(wait);
      const settings = useSettings.getState().languageTool;
      if (!ltLive(settings)) return;
      const doc = editor.state.doc;
      const ranges: { from: number; to: number }[] = [];
      for (const pos of dirty) {
        const node = pos >= 0 && pos < doc.content.size ? doc.nodeAt(pos) : null;
        if (!node?.isTextblock || (accept && !accept(node))) continue;
        if (!ranges.some((r) => r.from === pos)) ranges.push({ from: pos, to: pos + node.nodeSize });
      }
      dirty = [];
      if (ranges.length === 0) return;
      const mapped = collectRanges(doc, ranges, accept);
      busy = true;
      last = Date.now();
      const tracked = follow(editor);
      try {
        const matches = mapped.text.trim() ? await checkText(settings, mapped.text, checkLanguage(), controller.signal) : [];
        if (stopped || editor.isDestroyed) return;
        failures = 0;
        const issues = placeIssues(editor, doc, mapped, matches, tracked.mapping);
        editor.view.dispatch(ltMeta(editor.state.tr, { within: ranges.map((r) => mapRange(tracked.mapping, r)), add: issues }));
      } catch (e) {
        if (stopped) return;
        // Une erreur se montre une fois ; après trois de suite (connexion coupée), on attend la prochaine frappe.
        failures++;
        if (failures === 1 || (e instanceof LtError && (e.code === "auth" || e.code === "limit"))) setStatus({ text: errorText(e), error: true });
        if (e instanceof LtError && e.code === "limit") last = Date.now() + 60_000;
        if (failures < 3) for (const r of ranges) dirty.push(tracked.mapping.map(r.from, -1));
      } finally {
        tracked.stop();
        busy = false;
        if (dirty.length > 0 && !stopped) schedule(Math.max(LIVE_PAUSE_MS, last + LIVE_GAP_MS - Date.now()));
      }
    };
    editor.on("transaction", onTr);
    return () => {
      stopped = true;
      controller.abort();
      if (timer) clearTimeout(timer);
      editor.off("transaction", onTr);
    };
  }, [editor, on, accept]);

  return <LanguageToolStatus status={status} />;
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
