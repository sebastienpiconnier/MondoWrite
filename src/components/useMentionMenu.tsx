// Mentions « @ » (ou « [[ ») dans un éditeur de texte d'une carte, hors du canevas : fiche de la Bible et
// carte agrandie. Même règles que sur le canevas (CardNode) : cartes proposées, « Créer … » jamais présélectionné,
// Échap ferme le menu jusqu'au prochain @, la mention tire un fil vers la carte choisie.

import { useRef, useState } from "react";
import type { Editor } from "@tiptap/react";
import { useCosmos } from "../store";
import { useSettings } from "../settings";
import { fmt } from "../i18n";
import { useVocab } from "../vocab";
import { typeColor } from "../types";
import { canCreateMention, mentionCandidates, mentionQuery, type MentionCandidate } from "../mentions";
import { SuggestionMenu } from "./SuggestionMenu";

interface MentionState {
  from: number;
  to: number;
  query: string;
  candidates: MentionCandidate[];
  create: boolean;
}

/** Délai avant de fermer le menu quand l'éditeur perd le focus : sur iPhone et iPad, toucher une suggestion
 *  fait d'abord perdre le focus au texte ; fermer tout de suite retirait le menu avant le toucher. */
const BLUR_CLOSE_MS = 300;

export function useMentionMenu(cardId: string) {
  const { t, types } = useVocab();
  const [mention, setMention] = useState<MentionState | null>(null);
  const [active, setActive] = useState(-1);
  const [up, setUp] = useState(false);
  const dismissed = useRef(-1);
  const editorRef = useRef<Editor | null>(null);
  const blurTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const count = mention ? mention.candidates.length + (mention.create ? 1 : 0) : 0;
  const state = useRef({ mention, active, count });
  state.current = { mention, active, count };

  const pick = (index: number) => {
    const m = state.current.mention;
    const editor = editorRef.current;
    clearTimeout(blurTimer.current);
    if (!m || !editor || editor.isDestroyed || index < 0) return;
    const store = useCosmos.getState();
    const found = m.candidates[index];
    const title = found ? found.title : m.query.trim();
    const target = found ? found.id : store.addTitledCard("idee", title);
    setMention(null);
    editor
      .chain()
      .focus()
      .insertContentAt({ from: m.from, to: m.to }, [{ type: "mention", attrs: { id: target, label: title } }, { type: "text", text: " " }])
      .run();
    store.linkCards(cardId, target, "");
  };

  /** À appeler à chaque frappe et chaque déplacement du curseur. */
  const detect = (editor: Editor) => {
    editorRef.current = editor;
    const { $from, empty } = editor.state.selection;
    const found = empty && $from.parent.isTextblock ? mentionQuery($from.parent.textBetween(0, $from.parentOffset, undefined, "￼")) : null;
    const from = found ? $from.pos - found.length : -1;
    if (!found || from === dismissed.current) {
      if (!found) dismissed.current = -1;
      if (state.current.mention) setMention(null);
      return;
    }
    const cards = useCosmos.getState().nodes.map((n) => n.data);
    const candidates = mentionCandidates(cards, found.query, cardId, useSettings.getState().lang);
    const create = canCreateMention(cards, found.query);
    if (!candidates.length && !create) {
      if (state.current.mention) setMention(null);
      return;
    }
    if (!state.current.mention) {
      // Près du bas de l'écran (ou au-dessus du clavier virtuel), le menu s'ouvre vers le haut.
      const coords = editor.view.coordsAtPos($from.pos);
      const visible = window.visualViewport?.height ?? window.innerHeight;
      setUp(coords.bottom > visible * 0.6);
    }
    setMention({ from, to: $from.pos, query: found.query, candidates, create });
    setActive(candidates.length ? 0 : -1);
  };

  /** Flèches, Entrée, Tab et Échap quand le menu est ouvert ; true si la touche est prise. */
  const handleKey = (event: KeyboardEvent): boolean => {
    const { mention: m, active: a, count: n } = state.current;
    if (!m || !n) return false;
    if (event.key === "ArrowDown") {
      setActive((a + 1) % n);
      return true;
    }
    if (event.key === "ArrowUp") {
      setActive((a - 1 + n) % n);
      return true;
    }
    if ((event.key === "Enter" || event.key === "Tab") && a >= 0) {
      pick(a);
      return true;
    }
    if (event.key === "Escape") {
      dismissed.current = m.from;
      setMention(null);
      return true;
    }
    return false;
  };

  const onBlur = () => {
    clearTimeout(blurTimer.current);
    blurTimer.current = setTimeout(() => setMention(null), BLUR_CLOSE_MS);
  };

  const menu =
    mention && count > 0 ? (
      <SuggestionMenu
        title={t.card.mentionTitle}
        className={up ? "opens-up" : ""}
        items={[
          ...mention.candidates.map((c) => ({ key: c.id, label: c.title, hint: types[c.type].label, color: typeColor(c.type) })),
          ...(mention.create
            ? [{ key: "+", label: fmt(t.card.mentionCreate, { title: mention.query.trim() }), hint: t.card.mentionCreateHint, color: typeColor("idee") }]
            : []),
        ]}
        active={active}
        onPick={pick}
      />
    ) : null;

  return { detect, handleKey, onBlur, menu };
}
