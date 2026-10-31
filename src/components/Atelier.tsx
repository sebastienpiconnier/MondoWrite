// Mode Atelier (1.8.0) : ce que l'interface montre quand l'auteur a autorisé l'IA, pour ce projet, à proposer du
// texte. Rien n'apparaît hors de l'Atelier ni sans service d'IA branché. Toute proposition attend un clic ; ce qui
// est accepté est marqué (atelier.ts) et journalisé (`logAtelier` du store).
// - `useAtelier` : l'Atelier est-il actif, et une action IA avec son « Annuler » (signal) et son message d'erreur ;
// - `AtelierBadge` : repère « Atelier » de la barre du haut, qui ouvre le réglage ;
// - `AiWorking` : « L'IA réfléchit… » et « Annuler » ;
// - `FieldProposals` : propositions champ par champ (Ajouter / Remplacer / Ignorer), comme la description d'une photo ;
// - `SynopsisSuggest`, `DirectionsSuggest`, `PitchDraft`, `SheetDraft` : les fonctions b à e.

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useEditorState, type Editor } from "@tiptap/react";
import { selectionHasIa } from "./iaMark";
import { newId } from "../projectState";
import { countWords } from "../manuscript";
import { headingOf, sceneBody, sceneText } from "../screenplay/sceneText";
import { sceneSynopsis } from "../screenplay/scenes";
import { useCosmos } from "../store";
import { aiConfig, useSettings } from "../settings";
import { fmt, useT } from "../i18n";
import { AiError, aiErrorText, complete, isReady, type AiConfig } from "../ai/providers";
import { sendCommand } from "../commands";
import type { CardData } from "../types";
import { plainText } from "../search";
import { pitchFields, type Pitch, type PitchText } from "../pitch";
import { ficheCount } from "../character";
import {
  PITCH_DRAFT_FIELDS,
  SHEET_DRAFT_FIELDS,
  VARIANT_MAX,
  parseVariants,
  variantsPrompt,
  type VariantKind,
  directionsPrompt,
  parseDirections,
  parsePitchDraft,
  parseSheetDraft,
  parseSynopsis,
  pitchDraftPrompt,
  sheetDraftPrompt,
  synopsisPrompt,
  type PitchDraftField,
  type SheetDraftField,
} from "../ai/atelier";

/** Identifiant de la case du mode Atelier dans les Réglages (le repère de la barre du haut y mène). */
export const ATELIER_SETTING_ID = "atelier-setting";

/** L'Atelier est-il actif pour ce projet, avec un service d'IA prêt ? */
export function useAtelierOn(): boolean {
  const mode = useCosmos((s) => s.aiMode);
  const ai = useSettings((s) => s.ai);
  const config = useMemo(() => aiConfig(ai), [ai]);
  return mode === "atelier" && isReady(config);
}

/** Une action de l'Atelier : occupée, annulable, avec son erreur. Annulée si le composant disparaît. */
export function useAtelier() {
  const t = useT();
  const on = useAtelierOn();
  const ai = useSettings((s) => s.ai);
  const config = useMemo(() => aiConfig(ai), [ai]);
  const lang = useSettings((s) => s.lang);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const abort = useRef<AbortController | null>(null);
  useEffect(() => () => abort.current?.abort(), []);
  /** Lance la requête et rend la réponse lue, ou null (annulée, en échec : le message est posé). */
  const run = async <T,>(ask: (config: AiConfig, signal: AbortSignal) => Promise<T>): Promise<T | null> => {
    if (!isReady(config) || busy) return null;
    const controller = new AbortController();
    abort.current = controller;
    setBusy(true);
    setError("");
    try {
      return await ask(config, controller.signal);
    } catch (err) {
      console.error(err);
      setError(aiErrorText(err, t.ai.errors));
      return null;
    } finally {
      setBusy(false);
      if (abort.current === controller) abort.current = null;
    }
  };
  return { on, lang, busy, error, setError, run, cancel: () => abort.current?.abort() };
}

/** Repère « Atelier » de la barre du haut : il dit que l'IA peut proposer du texte ici, et ouvre le réglage. */
export function AtelierBadge() {
  const t = useT();
  const mode = useCosmos((s) => s.aiMode);
  if (mode !== "atelier") return null;
  return (
    <button
      type="button"
      className="atelier-badge"
      title={t.atelier.badgeHint}
      aria-label={t.atelier.badgeHint}
      onClick={() => {
        sendCommand("settings");
        // Le panneau s'ouvre au rendu suivant : la case reçoit alors le focus.
        requestAnimationFrame(() => requestAnimationFrame(() => document.getElementById(ATELIER_SETTING_ID)?.focus()));
      }}
    >
      {t.atelier.badge}
    </button>
  );
}

/** Pendant qu'une action de l'Atelier tourne : le message et « Annuler ». Puis l'erreur, s'il y en a une. */
export function AiWorking({ busy, error, onCancel }: { busy: boolean; error: string; onCancel: () => void }) {
  const t = useT();
  return (
    <>
      {busy && (
        <div className="atelier-working" role="status">
          <span>{t.ai.working}</span>
          <button type="button" className="ghost-button" onClick={onCancel}>
            {t.ai.cancel}
          </button>
        </div>
      )}
      {error && (
        <p className="ai-error" role="alert">
          {error}
        </p>
      )}
    </>
  );
}

/**
 * Sous un champ dont le texte vient de l'IA (couverture, fiche, synopsis) : le dire, et « Je l'ai repris ».
 * Retoucher le champ retire aussi la marque. `onCover` : sur la jaquette sombre de la couverture.
 */
export function IaFieldNote({ onRework, onCover = false }: { onRework: () => void; onCover?: boolean }) {
  const t = useT();
  return (
    <p className={`ia-field-note${onCover ? " is-on-cover" : ""}`}>
      <span>{t.atelier.marked}</span>
      <button type="button" className="ghost-button" title={t.atelier.reworkedHint} onClick={onRework}>
        {t.atelier.reworked}
      </button>
    </p>
  );
}

/** Propositions champ par champ : chacune s'ajoute (ou remplace la valeur actuelle, montrée) ou s'ignore. */
export function FieldProposals({
  heading,
  items,
  onAccept,
  onDone,
}: {
  heading: string;
  items: { key: string; label: string; value: string; current?: string }[];
  onAccept: (key: string, value: string) => void;
  onDone: (key: string) => void;
}) {
  const t = useT();
  if (items.length === 0) return null;
  return (
    <div className="assistant-panel synthesis atelier-panel" role="group" aria-label={heading}>
      <p className="assistant-hint">{t.atelier.proposal}</p>
      <dl className="photo-fields">
        {items.map((item) => (
          <div key={item.key} className="photo-field">
            <dt>{item.label}</dt>
            <dd>
              <p className="atelier-proposed">{item.value}</p>
              {item.current?.trim() && <p className="photo-field-current">{fmt(t.atelier.current, { value: item.current.trim() })}</p>}
              <div className="assistant-actions">
                <button
                  type="button"
                  className="is-primary"
                  onClick={() => {
                    onAccept(item.key, item.value);
                    onDone(item.key);
                  }}
                >
                  {item.current?.trim() ? t.atelier.replace : t.atelier.add}
                </button>
                <button type="button" onClick={() => onDone(item.key)}>
                  {t.ai.ignore}
                </button>
              </div>
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

/**
 * Panneau posé par-dessus une barre (directions, variantes du scénario) : Échap ou un appui ailleurs le ferme,
 * le focus revient sur le bouton qui l'a ouvert.
 */
function useDismiss(open: boolean, root: React.RefObject<HTMLElement | null>, close: () => void) {
  const ref = useRef(close);
  ref.current = close;
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.stopPropagation();
      ref.current();
      root.current?.querySelector<HTMLElement>(".atelier-button")?.focus();
    };
    const onDown = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) ref.current();
    };
    document.addEventListener("keydown", onKey, true);
    document.addEventListener("pointerdown", onDown);
    return () => {
      document.removeEventListener("keydown", onKey, true);
      document.removeEventListener("pointerdown", onDown);
    };
  }, [open, root]);
}

/** Bouton discret d'une action de l'Atelier (repère « IA » devant le libellé). */
function AtelierButton({ label, hint, disabled, onClick }: { label: string; hint: string; disabled?: boolean; onClick: () => void }) {
  return (
    <button type="button" className="ghost-button atelier-button" title={hint} disabled={disabled} onClick={onClick}>
      <span className="atelier-spark" aria-hidden="true">
        ✦
      </span>
      {label}
    </button>
  );
}

// ---------- b. Synopsis d'une scène ----------

/** Texte d'une scène du scénario (élément d'en-tête `at`), lu dans le store au moment voulu. */
export const screenplaySceneText = (at: number) => () => sceneText(sceneBody(useCosmos.getState().screenplay?.elements ?? [], at));
/** Texte d'une scène du roman (manuscrit), lu dans le store au moment voulu. */
export const novelSceneText = (id: string) => () => plainText(useCosmos.getState().manuscript[id] ?? "");

/**
 * « Proposer un synopsis » : seulement quand le synopsis est vide et que la scène a du texte. La proposition
 * attend « Garder ce synopsis » ; gardée, elle porte la marque de l'IA (fiche `ia` ou note [[ia]]).
 */
export function SynopsisSuggest({ sceneId, title, text: textOf, synopsis, accept }: { sceneId: string; title: string; text: () => string; synopsis: string; accept?: (text: string) => void }) {
  const t = useT();
  const a = useAtelier();
  const kind = useCosmos((s) => s.kind);
  const [proposal, setProposal] = useState("");
  // Le texte est lu au rendu seulement quand l'Atelier est actif et le synopsis vide (une liste de scènes reste légère).
  const text = a.on && !synopsis.trim() ? textOf() : "";
  if (!a.on || synopsis.trim() || (!proposal && text.trim().split(/\s+/).filter(Boolean).length < 8)) return null;
  const ask = async () => {
    setProposal("");
    const found = await a.run(async (config, signal) => {
      const prompt = synopsisPrompt(title, text, a.lang, kind);
      const reply = parseSynopsis(await complete(config, prompt.system, prompt.user, { maxTokens: 300, signal }));
      if (!reply) throw new AiError("empty");
      return reply;
    });
    if (found) setProposal(found);
  };
  return (
    <div className="atelier-inline nodrag">
      {!proposal && <AtelierButton label={t.atelier.synopsis.button} hint={t.atelier.synopsis.hint} disabled={a.busy} onClick={() => void ask()} />}
      <AiWorking busy={a.busy} error={a.error} onCancel={a.cancel} />
      {proposal && (
        <div className="assistant-panel synthesis atelier-panel" role="group" aria-label={t.atelier.synopsis.button}>
          <p className="assistant-hint">{t.atelier.proposal}</p>
          <p className="atelier-proposed">{proposal}</p>
          <div className="assistant-actions">
            <button
              type="button"
              className="is-primary"
              onClick={() => {
                // La vue Scénario passe par son éditeur (`accept`) : une frappe qui attend d'être envoyée n'est pas perdue.
                if (accept) {
                  const value = proposal.replace(/\s+/g, " ").trim();
                  accept(value);
                  useCosmos.getState().logAtelier("synopsis", title, countWords(value));
                } else useCosmos.getState().acceptIaSynopsis(sceneId, proposal);
                setProposal("");
              }}
            >
              {t.atelier.synopsis.accept}
            </button>
            <button type="button" onClick={() => setProposal("")}>
              {t.ai.ignore}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------- c. Trois directions ----------

/** « Trois directions » au bout d'une scène : trois pistes d'une ligne, chacune peut devenir une carte Idée reliée. */
export function DirectionsSuggest({ sceneId, title, text, synopsis }: { sceneId: string; title: string; text: string; synopsis?: string }) {
  const t = useT();
  const a = useAtelier();
  const kind = useCosmos((s) => s.kind);
  const [lines, setLines] = useState<string[] | null>(null);
  const [made, setMade] = useState<number[]>([]);
  const rootRef = useRef<HTMLDivElement>(null);
  useDismiss(!!lines || !!a.error, rootRef, () => {
    setLines(null);
    a.setError("");
  });
  // Une autre scène : les pistes de la précédente ne valent plus.
  useEffect(() => {
    setLines(null);
    setMade([]);
  }, [sceneId]);
  if (!a.on) return null;
  const empty = !text.trim();
  const ask = async () => {
    setLines(null);
    setMade([]);
    const cards = useCosmos.getState().nodes.map((n) => n.data);
    const found = await a.run(async (config, signal) => {
      const prompt = directionsPrompt({ title, synopsis, text }, a.lang, kind, cards);
      const reply = parseDirections(await complete(config, prompt.system, prompt.user, { maxTokens: 500, json: true, signal }));
      if (reply.length === 0) throw new AiError("empty");
      return reply;
    });
    if (found) setLines(found);
  };
  return (
    <div className="atelier-inline atelier-directions" ref={rootRef}>
      {!lines && <AtelierButton label={t.atelier.directions.button} hint={empty ? t.atelier.directions.empty : t.atelier.directions.hint} disabled={a.busy || empty} onClick={() => void ask()} />}
      <AiWorking busy={a.busy} error={a.error} onCancel={a.cancel} />
      {lines && (
        <div className="assistant-panel synthesis atelier-panel" role="group" aria-label={t.atelier.directions.heading}>
          <p className="assistant-hint">{t.atelier.directions.heading}</p>
          <ol className="atelier-choices">
            {lines.map((line, i) => (
              <li key={i}>
                <p className="atelier-proposed">{line}</p>
                {made.includes(i) ? (
                  <p className="settings-hint" role="status">
                    {t.atelier.directions.done}
                  </p>
                ) : (
                  <div className="assistant-actions">
                    <button
                      type="button"
                      onClick={() => {
                        if (useCosmos.getState().acceptIaDirection(sceneId, line)) setMade([...made, i]);
                      }}
                    >
                      {t.atelier.directions.toCard}
                    </button>
                  </div>
                )}
              </li>
            ))}
          </ol>
          <div className="assistant-actions">
            <button type="button" onClick={() => setLines(null)}>
              {t.ai.ignore}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------- d. Brouillon de la couverture ----------

/** « Proposer un brouillon » sur la couverture : accroche, logline, résumé, comparables, note d'intention vides. */
export function PitchDraft({ pitch, kind, form }: { pitch: Pitch; kind: "roman" | "scenario"; form?: Parameters<typeof pitchFields>[1] }) {
  const t = useT();
  const a = useAtelier();
  const title = useCosmos((s) => s.title);
  const [found, setFound] = useState<Partial<Record<PitchDraftField, string>> | null>(null);
  if (!a.on) return null;
  const shown = pitchFields(kind, form);
  const empty = PITCH_DRAFT_FIELDS.filter((k) => shown.includes(k) && !pitch[k]?.trim());
  const labels = t.pitch.fields as Record<string, string>;
  const ask = async () => {
    setFound(null);
    const cards = useCosmos.getState().nodes.map((n) => n.data);
    const filled = Object.fromEntries(PITCH_DRAFT_FIELDS.filter((k) => pitch[k]?.trim()).map((k) => [k, pitch[k]!.trim()]));
    const draft = await a.run(async (config, signal) => {
      const prompt = pitchDraftPrompt({ title, kind, filled }, empty, cards, a.lang);
      const reply = parsePitchDraft(await complete(config, prompt.system, prompt.user, { maxTokens: 1800, json: true, signal }), empty);
      if (Object.keys(reply).length === 0) throw new AiError("empty");
      return reply;
    });
    if (draft) setFound(draft);
  };
  const items = found
    ? (Object.keys(found) as PitchDraftField[]).map((key) => ({ key, label: labels[key] ?? key, value: found[key]!, current: pitch[key] }))
    : [];
  return (
    <div className="atelier-inline">
      {!found && (
        <AtelierButton label={t.atelier.pitch.button} hint={empty.length === 0 ? t.atelier.pitch.nothing : t.atelier.pitch.hint} disabled={a.busy || empty.length === 0} onClick={() => void ask()} />
      )}
      <AiWorking busy={a.busy} error={a.error} onCancel={a.cancel} />
      <FieldProposals
        heading={t.atelier.pitch.heading}
        items={items}
        onAccept={(key, value) => useCosmos.getState().acceptIaPitch(key as PitchText, value)}
        onDone={(key) => {
          const rest = { ...found };
          delete rest[key as PitchDraftField];
          setFound(Object.keys(rest).length > 0 ? rest : null);
        }}
      />
    </div>
  );
}

// ---------- e. Fiche d'un personnage secondaire ----------

/** Un personnage « presque vide » : au plus deux champs de fiche remplis et des notes courtes. */
export const isSketchyCharacter = (card: CardData) => card.type === "personnage" && ficheCount(card) <= 2 && plainText(card.html).split(/\s+/).filter(Boolean).length <= 120;

/** « Proposer une fiche » d'un personnage presque vide : propositions champ par champ, d'après ses notes et ses fils. */
export function SheetDraft({ card }: { card: CardData }) {
  const t = useT();
  const a = useAtelier();
  const [found, setFound] = useState<Partial<Record<SheetDraftField, string>> | null>(null);
  const edges = useCosmos((s) => s.edges);
  const nodes = useCosmos((s) => s.nodes);
  const links = useMemo(() => {
    const byId = new Map(nodes.map((n) => [n.id, n.data]));
    return edges
      .filter((e) => e.source === card.id || e.target === card.id)
      .map((e) => {
        const other = byId.get(e.source === card.id ? e.target : e.source);
        return other ? { label: String(e.label ?? ""), title: other.title.trim(), type: other.type } : null;
      })
      .filter((l): l is { label: string; title: string; type: CardData["type"] } => !!l && !!l.title);
  }, [edges, nodes, card.id]);
  const hasNotes = plainText(card.html).trim().length > 0;
  if (!a.on || (!found && (!isSketchyCharacter(card) || (!hasNotes && links.length === 0)))) return null;
  const labels = t.character.fields as Record<string, string>;
  const wanted = SHEET_DRAFT_FIELDS.filter((k) => !card.fiche?.[k]?.trim());
  const ask = async () => {
    setFound(null);
    const draft = await a.run(async (config, signal) => {
      const prompt = sheetDraftPrompt(card, links, wanted, labels, a.lang);
      const reply = parseSheetDraft(await complete(config, prompt.system, prompt.user, { maxTokens: 900, json: true, signal }), wanted);
      if (Object.keys(reply).length === 0) throw new AiError("empty");
      return reply;
    });
    if (draft) setFound(draft);
  };
  const items = found ? (Object.keys(found) as SheetDraftField[]).map((key) => ({ key, label: labels[key] ?? key, value: found[key]!, current: card.fiche?.[key] })) : [];
  return (
    <div className="atelier-inline">
      {!found && <AtelierButton label={t.atelier.sheet.button} hint={t.atelier.sheet.hint} disabled={a.busy || wanted.length === 0} onClick={() => void ask()} />}
      <AiWorking busy={a.busy} error={a.error} onCancel={a.cancel} />
      <FieldProposals
        heading={t.atelier.sheet.heading}
        items={items}
        onAccept={(key, value) => useCosmos.getState().acceptIaFiche(card.id, key as SheetDraftField, value)}
        onDone={(key) => {
          const rest = { ...found };
          delete rest[key as SheetDraftField];
          setFound(Object.keys(rest).length > 0 ? rest : null);
        }}
      />
    </div>
  );
}

// ---------- a. Trois variantes (barre de mise en forme des cartes, de la Bible et du manuscrit) ----------

/** Boutons de l'Atelier dans la barre de mise en forme, et le panneau des variantes qu'ils ouvrent. */
export interface AtelierFormat {
  actions: { key: string; label: string; glyph: ReactNode; active: boolean; run: () => void }[];
  panel: ReactNode;
}

/**
 * « Trois variantes » quand du texte est sélectionné (Atelier actif), « Je l'ai repris » quand la sélection touche
 * un passage de l'IA (toujours, même Atelier arrêté). La variante prise remplace la sélection en une seule
 * transaction de l'éditeur (une étape d'annulation), marquée `ia`, et sa ligne va au journal.
 */
export function useAtelierFormat(editor: Editor, target: string, kind: VariantKind = "prose"): AtelierFormat {
  const t = useT();
  const a = useAtelier();
  const on = useEditorState({
    editor,
    selector: ({ editor: e }) => {
      const { from, to, empty } = e.state.selection;
      return { ia: selectionHasIa(e.state), text: empty ? "" : e.state.doc.textBetween(from, to, " ").trim() };
    },
  });
  const [asked, setAsked] = useState<{ from: number; to: number; text: string; variants: string[] } | null>(null);
  const ask = async () => {
    const { from, to } = editor.state.selection;
    const text = editor.state.doc.textBetween(from, to, " ");
    if (!text.trim() || text.length > VARIANT_MAX) {
      a.setError(fmt(t.atelier.variants.tooLong, { n: VARIANT_MAX }));
      return;
    }
    setAsked(null);
    const $from = editor.state.doc.resolve(from);
    const $to = editor.state.doc.resolve(to);
    const before = $from.parent.textBetween(0, $from.parentOffset, " ");
    const after = $to.parent.textBetween($to.parentOffset, $to.parent.content.size, " ");
    const variants = await a.run(async (config, signal) => {
      const prompt = variantsPrompt(text, kind, a.lang, { before, after });
      const found = parseVariants(await complete(config, prompt.system, prompt.user, { maxTokens: 900, json: true, signal }), text);
      if (found.length === 0) throw new AiError("empty");
      return found;
    });
    if (variants) setAsked({ from, to, text, variants });
  };
  const take = (variant: string) => {
    if (!asked) return;
    const { from, to, text } = asked;
    setAsked(null);
    // Le texte a changé pendant que l'IA réfléchissait : on ne remplace rien à l'aveugle.
    if (to > editor.state.doc.content.size || editor.state.doc.textBetween(from, to, " ") !== text) return;
    const keep = (editor.state.doc.nodeAt(from)?.marks ?? []).filter((m) => m.type.name !== "ia").map((m) => m.toJSON() as { type: string; attrs?: Record<string, unknown> });
    editor
      .chain()
      .focus()
      .insertContentAt({ from, to }, { type: "text", text: variant, marks: [...keep, { type: "ia", attrs: { id: newId() } }] })
      .run();
    useCosmos.getState().logAtelier("variants", target, countWords(variant));
  };
  const actions: AtelierFormat["actions"] = [
    ...(a.on && on.text
      ? [{ key: "ia-variants", label: t.atelier.variants.button, glyph: <span className="atelier-spark">✦</span>, active: !!asked || a.busy, run: () => void ask() }]
      : []),
    ...(on.ia ? [{ key: "ia-rework", label: t.atelier.reworkedHint, glyph: <span className="format-text">{t.atelier.reworked}</span>, active: false, run: () => editor.chain().focus().unsetIa().run() }] : []),
  ];
  const panel =
    a.busy || a.error || asked ? (
      <div className="atelier-variants" onPointerDown={(e) => e.preventDefault()}>
        <AiWorking busy={a.busy} error={a.error} onCancel={a.cancel} />
        {asked && (
          <div role="group" aria-label={t.atelier.variants.heading}>
            <ol className="atelier-choices">
              {asked.variants.map((v, i) => (
                <li key={i}>
                  <button type="button" className="atelier-choice" aria-label={fmt(t.atelier.variants.pickAria, { n: i + 1 })} onClick={() => take(v)}>
                    {v}
                  </button>
                </li>
              ))}
            </ol>
            <div className="assistant-actions">
              <button type="button" onClick={() => setAsked(null)}>
                {t.atelier.variants.none}
              </button>
            </div>
          </div>
        )}
      </div>
    ) : null;
  return { actions, panel };
}

// ---------- Scénario : variantes d'un élément, « Je l'ai repris », trois directions ----------

/**
 * Boutons de l'Atelier dans la barre du scénario. Le texte du Fountain ne porte pas de marque : un élément
 * proposé par l'IA reçoit l'attribut `ia` (note [[ia]] dans le fichier, souligné en pointillé à l'écran).
 * « Trois variantes » vaut pour l'action, la réplique ou la didascalie où est le curseur (ou la sélection dedans).
 */
export function ScreenplayAtelier({ editor, scene = "" }: { editor: Editor; scene?: string }) {
  const t = useT();
  const a = useAtelier();
  const info = useEditorState({
    editor,
    selector: ({ editor: e }) => {
      const { $from, from, to } = e.state.selection;
      if ($from.depth < 1) return null;
      const node = $from.node(1);
      const index = $from.index(0);
      return { index, pos: $from.before(1), type: node.type.name, ia: node.attrs.ia === true, text: node.textContent, sel: from < to && $from.sameParent(e.state.selection.$to) ? e.state.doc.textBetween(from, to) : "" };
    },
  });
  const [asked, setAsked] = useState<{ pos: number; whole: string; part: string; variants: string[] } | null>(null);
  const rootRef = useRef<HTMLSpanElement>(null);
  useDismiss(!!asked || !!a.error, rootRef, () => {
    setAsked(null);
    a.setError("");
  });
  const editable = !!info && (info.type === "action" || info.type === "dialogue" || info.type === "parenthetical");
  const ask = async () => {
    if (!info || !editable) return;
    const part = info.sel || info.text;
    if (!part.trim()) {
      a.setError(t.atelier.variants.select);
      return;
    }
    if (part.length > VARIANT_MAX) {
      a.setError(fmt(t.atelier.variants.tooLong, { n: VARIANT_MAX }));
      return;
    }
    setAsked(null);
    // Le personnage d'une réplique : l'élément « personnage » qui la précède.
    let speaker = "";
    const doc = editor.state.doc;
    for (let i = info.index - 1; i >= 0 && info.type !== "action"; i--) {
      const n = doc.child(i);
      if (n.type.name === "character") {
        speaker = n.textContent;
        break;
      }
      if (n.type.name !== "parenthetical" && n.type.name !== "dialogue") break;
    }
    const kind: VariantKind = info.type === "action" ? "action" : "dialogue";
    const variants = await a.run(async (config, signal) => {
      const prompt = variantsPrompt(part, kind, a.lang, { speaker, ...(info.sel ? { before: info.text } : {}) });
      const found = parseVariants(await complete(config, prompt.system, prompt.user, { maxTokens: 900, json: true, signal }), part);
      if (found.length === 0) throw new AiError("empty");
      return found;
    });
    if (variants) setAsked({ pos: info.pos, whole: info.text, part, variants });
  };
  const take = (variant: string) => {
    if (!asked) return;
    setAsked(null);
    const { state } = editor;
    const node = state.doc.nodeAt(asked.pos);
    // L'élément a changé pendant que l'IA réfléchissait : rien n'est remplacé à l'aveugle.
    if (!node || node.textContent !== asked.whole) return;
    const at = asked.whole.indexOf(asked.part);
    const start = asked.pos + 1 + Math.max(0, at);
    const end = at < 0 ? asked.pos + 1 + node.content.size : start + asked.part.length;
    const tr = state.tr.insertText(variant, start, end).setNodeMarkup(asked.pos, undefined, { ...node.attrs, ia: true });
    editor.view.dispatch(tr);
    editor.view.focus();
    // Dans une carte agrandie, l'éditeur n'a que le corps de la scène : son titre vient de la carte.
    useCosmos.getState().logAtelier("variants", sceneTitleBefore(editor, asked.pos) || scene, countWords(variant));
  };
  const rework = () => {
    if (!info?.ia) return;
    const node = editor.state.doc.nodeAt(info.pos);
    if (!node) return;
    editor.view.dispatch(editor.state.tr.setNodeMarkup(info.pos, undefined, { ...node.attrs, ia: false }));
    editor.view.focus();
  };
  if (!a.on && !info?.ia) return null;
  return (
    <span className="atelier-sp" ref={rootRef}>
      {a.on && editable && (
        <button type="button" className="sp-option atelier-button" title={t.atelier.variants.hint} disabled={a.busy} onPointerDown={(e) => e.preventDefault()} onClick={() => void ask()}>
          <span className="atelier-spark" aria-hidden="true">
            ✦
          </span>
          {t.atelier.variants.button}
        </button>
      )}
      {info?.ia && (
        <button type="button" className="sp-option" title={t.atelier.reworkedHint} onPointerDown={(e) => e.preventDefault()} onClick={rework}>
          {t.atelier.reworked}
        </button>
      )}
      {(a.busy || a.error || asked) && (
        <div className="atelier-variants atelier-pop" onPointerDown={(e) => e.preventDefault()}>
          <AiWorking busy={a.busy} error={a.error} onCancel={a.cancel} />
          {asked && (
            <div role="group" aria-label={t.atelier.variants.heading}>
              <ol className="atelier-choices">
                {asked.variants.map((v, i) => (
                  <li key={i}>
                    <button type="button" className="atelier-choice" aria-label={fmt(t.atelier.variants.pickAria, { n: i + 1 })} onClick={() => take(v)}>
                      {v}
                    </button>
                  </li>
                ))}
              </ol>
              <div className="assistant-actions">
                <button type="button" onClick={() => setAsked(null)}>
                  {t.atelier.variants.none}
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </span>
  );
}

/** Titre de la scène où se trouve la position (l'en-tête qui la précède), pour le journal. */
function sceneTitleBefore(editor: Editor, pos: number): string {
  const doc = editor.state.doc;
  const index = doc.resolve(Math.min(pos + 1, doc.content.size)).index(0);
  for (let i = index; i >= 0; i--) {
    const n = doc.child(i);
    if (n.type.name === "sceneHeading") return n.textContent;
  }
  return "";
}

/** « Trois directions » de la scène où est le curseur, dans la barre du scénario. */
export function ScreenplayDirections({ editor }: { editor: Editor }) {
  const at = useEditorState({
    editor,
    selector: ({ editor: e }) => {
      const doc = e.state.doc;
      const { $from } = e.state.selection;
      for (let i = Math.min($from.index(0), doc.childCount - 1); i >= 0; i--) {
        const n = doc.child(i);
        if (n.type.name === "sceneHeading") return { index: i, cardId: (n.attrs.cardId as string | null) ?? "", title: n.textContent };
      }
      return null;
    },
  });
  const elements = useCosmos((s) => s.screenplay?.elements);
  if (!at?.cardId || !elements) return null;
  const heading = headingOf(elements, at.cardId);
  if (heading < 0) return null;
  return <DirectionsSuggest sceneId={at.cardId} title={at.title} text={sceneText(sceneBody(elements, heading))} synopsis={sceneSynopsis(elements, heading)} />;
}
