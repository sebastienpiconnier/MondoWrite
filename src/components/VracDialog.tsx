// Fenêtre « Du vrac aux cartes » (dialogue `vrac`, 1.8.0) : ouverte par le menu IA de la barre du haut, ou par le
// Carnet du téléphone pour une note longue. L'auteur colle un texte, l'IA propose des cartes et des fils (ai/vrac.ts) ;
// la liste se coche, se décoche, chaque type et chaque titre se changent, et « Créer les cartes » pose le tout en une
// seule étape d'annulation. Rien n'est créé sans ce clic. Sur téléphone, les cartes vont dans « À ranger ».

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { useCosmos } from "../store";
import { fmt } from "../i18n";
import { useVocab } from "../vocab";
import { aiConfig, useSettings } from "../settings";
import { aiErrorText, complete, isReady } from "../ai/providers";
import { keptLinks, parseVrac, VRAC_MAX, vracMaxTokens, vracPrompt, vracTypes, type VracCard, type VracLink } from "../ai/vrac";
import type { CardNames } from "../ai/tasks";
import { formOf } from "../pitch";
import { typeColor, type CardType } from "../types";
import { canvasCenter } from "../canvasCenter";
import { usePhone } from "./usePhone";

/** Délai laissé à un service en ligne : la réponse recopie le texte, elle est longue à écrire. */
const VRAC_TIMEOUT_MS = 240_000;

interface Row extends VracCard {
  checked: boolean;
}
interface Wire extends VracLink {
  checked: boolean;
}

export function VracDialog() {
  const { t: all, types, kind } = useVocab();
  const t = all.vrac;
  const draft = useCosmos((s) => s.vracDraft);
  const nodes = useCosmos((s) => s.nodes);
  const pitch = useCosmos((s) => s.pitch);
  const aiSettings = useSettings((s) => s.ai);
  const config = useMemo(() => aiConfig(aiSettings), [aiSettings]);
  const lang = useSettings((s) => s.lang);
  const phone = usePhone();
  const allowed = useMemo(() => vracTypes(kind, formOf(kind, pitch) === "film"), [kind, pitch]);

  const [text, setText] = useState(draft?.text ?? "");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [rows, setRows] = useState<Row[] | null>(null);
  const [wires, setWires] = useState<Wire[]>([]);
  const [rejected, setRejected] = useState(0);
  const abortRef = useRef<AbortController | null>(null);
  const fieldRef = useRef<HTMLTextAreaElement>(null);
  const id = useId();

  // Fenêtre fermée pendant le travail : la requête s'arrête.
  useEffect(() => () => abortRef.current?.abort(), []);
  useEffect(() => {
    fieldRef.current?.focus({ preventScroll: true });
  }, []);

  const tooLong = text.length > VRAC_MAX;
  const inbox = phone || !!draft?.inbox;

  const run = async () => {
    if (busy || !isReady(config) || !text.trim() || tooLong) return;
    const cards = useCosmos.getState().nodes.map((n) => n.data);
    const names: CardNames = { type: (type) => types[type].label.toLocaleLowerCase(lang), untitled: all.bible.untitled };
    const controller = new AbortController();
    abortRef.current = controller;
    setBusy(true);
    setMessage(t.working);
    try {
      const prompt = vracPrompt(text, cards, lang, kind, allowed);
      const reply = await complete(config, prompt.system, prompt.user, { json: true, maxTokens: vracMaxTokens(text), signal: controller.signal, timeoutMs: VRAC_TIMEOUT_MS });
      const proposal = parseVrac(reply, text, cards, allowed, names);
      setRows(proposal.cards.map((c) => ({ ...c, checked: true })));
      setWires(proposal.links.map((l) => ({ ...l, checked: true })));
      setRejected(proposal.rejected);
      setMessage(proposal.cards.length === 0 ? t.empty : "");
    } catch (err) {
      console.error(err);
      setMessage(aiErrorText(err, all.ai.errors));
    } finally {
      if (abortRef.current === controller) abortRef.current = null;
      setBusy(false);
    }
  };

  const unchecked = useMemo(() => new Set((rows ?? []).filter((r) => !r.checked).map((r) => r.key)), [rows]);
  // Un fil vers une carte décochée part avec elle (et revient si on la recoche).
  const shownWires = useMemo(() => keptLinks(wires, unchecked) as Wire[], [wires, unchecked]);
  const chosen = (rows ?? []).filter((r) => r.checked);

  const nameOf = (ref: string) => {
    const row = rows?.find((r) => r.key === ref);
    if (row) return row.title.trim() || t.untitled;
    return nodes.find((n) => n.id === ref)?.data.title.trim() || t.untitled;
  };
  const patchRow = (key: string, patch: Partial<Row>) => setRows((list) => list?.map((r) => (r.key === key ? { ...r, ...patch } : r)) ?? null);

  const create = () => {
    if (chosen.length === 0) return;
    const store = useCosmos.getState();
    store.createVracCards(chosen, shownWires.filter((w) => w.checked), { at: inbox ? undefined : canvasCenter(), inbox });
    store.setDialog(null);
    // Fait : le Carnet, qui attendait, vide sa note (voir Carnet.tsx). Fermer sans créer garde le brouillon.
    useCosmos.setState({ vracDraft: null });
    // Sur ordinateur et iPad, on montre les cartes là où elles sont nées.
    if (!phone && store.view !== "toile") store.setView("toile");
  };

  return (
    <div className="replace-panel vrac-panel">
      <h2 id="app-dialog-title">{t.title}</h2>
      {!rows && (
        <>
          <p className="vrac-intro">{t.intro}</p>
          <textarea
            ref={fieldRef}
            id={`${id}-text`}
            className="vrac-field"
            rows={10}
            value={text}
            placeholder={t.placeholder}
            aria-label={t.fieldAria}
            aria-describedby={`${id}-count`}
            aria-invalid={tooLong || undefined}
            disabled={busy}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              // Cmd/Ctrl + Entrée lance le découpage.
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                void run();
              }
            }}
          />
          <p id={`${id}-count`} className={`vrac-count${tooLong ? " is-over" : ""}`}>
            {tooLong ? fmt(t.tooLong, { max: VRAC_MAX.toLocaleString(lang) }) : fmt(t.count, { n: text.length.toLocaleString(lang), max: VRAC_MAX.toLocaleString(lang) })}
          </p>
        </>
      )}

      <p className="replace-count" role="status">
        {message}
      </p>

      {rows && rows.length > 0 && (
        <>
          {rejected > 0 && <p className="settings-hint">{fmt(t.rejected, { n: rejected })}</p>}
          <h3>{fmt(t.cards, { n: rows.length })}</h3>
          <ul className="vrac-list">
            {rows.map((row) => {
              const name = row.title.trim() || t.untitled;
              return (
                <li key={row.key} className={`vrac-item${row.checked ? "" : " is-off"}`} style={{ ["--type" as string]: typeColor(row.type) }}>
                  <div className="vrac-head">
                    <input type="checkbox" className="vrac-check" checked={row.checked} aria-label={fmt(t.keep, { title: name })} onChange={(e) => patchRow(row.key, { checked: e.target.checked })} />
                    <select className="vrac-type" value={row.type} aria-label={fmt(t.typeAria, { title: name })} onChange={(e) => patchRow(row.key, { type: e.target.value as CardType })}>
                      {allowed.map((type) => (
                        <option key={type} value={type}>
                          {types[type].label}
                        </option>
                      ))}
                    </select>
                    <input className="vrac-title" value={row.title} aria-label={t.titleAria} placeholder={t.untitled} onChange={(e) => patchRow(row.key, { title: e.target.value })} />
                  </div>
                  <p className="vrac-text">{row.text}</p>
                </li>
              );
            })}
          </ul>
          {shownWires.length > 0 && (
            <>
              <h3>{fmt(t.links, { n: shownWires.length })}</h3>
              <ul className="vrac-wires">
                {shownWires.map((w) => {
                  const from = nameOf(w.from);
                  const to = nameOf(w.to);
                  const existing = (ref: string) => (ref.startsWith("new:") ? "" : ` (${t.existing})`);
                  return (
                    <li key={`${w.from}|${w.to}`}>
                      <label>
                        <input
                          type="checkbox"
                          checked={w.checked}
                          aria-label={fmt(t.keepLink, { from, to })}
                          onChange={(e) => setWires((list) => list.map((x) => (x.from === w.from && x.to === w.to ? { ...x, checked: e.target.checked } : x)))}
                        />
                        <span>
                          {from}
                          {existing(w.from)}
                          <span aria-hidden="true"> → </span>
                          {to}
                          {existing(w.to)}
                          {w.label && <span className="vrac-label"> {fmt(t.linkLabel, { label: w.label })}</span>}
                        </span>
                      </label>
                    </li>
                  );
                })}
              </ul>
            </>
          )}
        </>
      )}

      <div className="assistant-actions replace-actions">
        {busy ? (
          <button type="button" onClick={() => abortRef.current?.abort()}>
            {t.cancel}
          </button>
        ) : (
          <button type="button" onClick={() => useCosmos.getState().setDialog(null)}>
            {t.close}
          </button>
        )}
        {rows ? (
          <>
            <button
              type="button"
              onClick={() => {
                setRows(null);
                setWires([]);
                setMessage("");
              }}
            >
              {t.back}
            </button>
            {rows.length > 0 && (
              <button type="button" className="is-primary" disabled={chosen.length === 0} title={chosen.length === 0 ? t.noneChecked : undefined} onClick={create}>
                {fmt(inbox ? t.createInbox : t.create, { n: chosen.length })}
              </button>
            )}
          </>
        ) : (
          <button type="button" className="is-primary" disabled={busy || !text.trim() || tooLong || !isReady(config)} onClick={() => void run()}>
            {t.run}
          </button>
        )}
      </div>
    </div>
  );
}
