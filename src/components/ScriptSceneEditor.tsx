// Une scène du scénario, écrite depuis sa carte agrandie : le même éditeur au format standard que la vue
// Scénario (Tab, Entrée, majuscules, éléments conservés), limité au corps de cette scène. L'en-tête est le
// titre de la carte, le synopsis s'écrit au-dessus. Le texte vit dans scenario.fountain, rien n'est recopié.

import { useStableEditor } from "./useStableEditor";
import { usePageSpell } from "./usePageSpell";
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { EditorContent, type Editor, type JSONContent } from "@tiptap/react";
import { useCosmos } from "../store";
import { useSettings } from "../settings";
import { getT, useT } from "../i18n";
import { EDITABLE_TYPES, type ScreenplayElement } from "../screenplay/model";
import { currentElement, fromDoc, screenplayExtensions, setElementType, toDoc, type EditableType } from "../screenplay/editor";
import { ADOPT_META, adoptNew } from "../screenplay/editor/adopt";
import { headingOf, sceneBody } from "../screenplay/sceneText";
import { sceneSynopsis, synopsisIsIa } from "../screenplay/scenes";
import { screenplaySceneText } from "./Atelier";
import { SynopsisField } from "./SynopsisField";
import type { CardData } from "../types";

const EMIT_DELAY = 250; // ms, comme la vue Scénario

/** Document de l'éditeur pour le corps d'une scène (une ligne d'action à remplir s'il est vide). */
function bodyDoc(body: ScreenplayElement[]): JSONContent {
  return body.length > 0 ? toDoc({ titlePage: {}, elements: body }) : { type: "doc", content: [{ type: "action" }] };
}

const sameBody = (a: ScreenplayElement[], b: ScreenplayElement[]) => JSON.stringify(a) === JSON.stringify(b);

export function ScriptSceneEditor({ card }: { card: CardData }) {
  const t = useT();
  const sp = t.screenplay;
  const lang = useSettings((s) => s.lang);
  const paper = useCosmos((s) => s.paper);
  const elements = useCosmos((s) => s.screenplay?.elements);
  const at = elements ? headingOf(elements, card.id) : -1;
  const body = useMemo(() => (elements && at >= 0 ? sceneBody(elements, at) : []), [elements, at]);
  const synopsis = elements && at >= 0 ? sceneSynopsis(elements, at) : "";
  const [type, setType] = useState<EditableType | null>(null);

  // Ce que l'éditeur a envoyé en dernier : le store qui revient avec ce même corps ne recharge rien.
  const synced = useRef<ScreenplayElement[]>(body);
  const pending = useRef<JSONContent | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const editorRef = useRef<Editor | null>(null);

  const emit = useCallback(() => {
    clearTimeout(timer.current);
    const waiting = pending.current;
    pending.current = null;
    const ed = editorRef.current;
    if (!waiting || !ed || ed.isDestroyed) return;
    let json: JSONContent = waiting;
    // Un personnage (ou une scène) écrit à l'instant reçoit sa carte, comme dans la vue Scénario.
    const adopted = adoptNew(ed, {
      addCard: (kind, title) => useCosmos.getState().addTitledCard(kind, title),
      locationCards: () => useCosmos.getState().nodes.filter((n) => n.data.type === "lieu").map((n) => ({ id: n.id, title: n.data.title })),
      linkSceneToLocation: (sceneId, locationId) => useCosmos.getState().linkCards(sceneId, locationId, getT().screenplay.linkSetIn),
      characterCards: () => useCosmos.getState().nodes.filter((n) => n.data.type === "personnage").map((n) => n.data.title),
      locale: useSettings.getState().lang,
    });
    if (adopted) json = adopted.toJSON();
    const next = fromDoc(json, {}).elements;
    synced.current = next;
    useCosmos.getState().setSceneText(card.id, next);
  }, [card.id]);

  const extensions = useMemo(
    () =>
      screenplayExtensions({
        locale: () => useSettings.getState().lang,
        placeholder: (kind) => getT().screenplay.placeholders[kind],
        // Échap rend la main au clavier : sur la barre des éléments.
        onEscape: () => document.querySelector<HTMLButtonElement>(".script-scene .sp-bar button[aria-pressed='true'], .script-scene .sp-bar button")?.focus(),
        continued: { resumes: () => useCosmos.getState().scriptPdf.resumes, contd: () => getT().screenplay.contd },
      }),
    [],
  );

  const editor = useStableEditor({
    extensions,
    content: bodyDoc(body),
    immediatelyRender: true,
    // Curseur à la fin seulement pour une scène encore vide : sur un long texte, la fenêtre descendrait tout en bas.
    autofocus: body.some((el) => el.text.trim()) ? false : "end",
    editorProps: { attributes: { class: "sp-editor", role: "textbox", "aria-multiline": "true", "aria-label": sp.editorAria } },
    onCreate: ({ editor: ed }) => setType(currentElement(ed.state)?.type ?? null),
    onSelectionUpdate: ({ editor: ed }) => setType(currentElement(ed.state)?.type ?? null),
    onUpdate: ({ editor: ed, transaction }) => {
      setType(currentElement(ed.state)?.type ?? null);
      if (transaction.getMeta(ADOPT_META)) return;
      pending.current = ed.state.doc.toJSON();
      clearTimeout(timer.current);
      timer.current = setTimeout(emit, EMIT_DELAY);
    },
    onBlur: () => emit(),
  });
  editorRef.current = editor;
  usePageSpell(editor);

  // En fermant la carte, ce qui attend part tout de suite.
  useEffect(() => () => emit(), [emit]);

  // Corps changé ailleurs (annuler dans le séquencier, synopsis) : l'éditeur suit, sauf pendant la frappe.
  useEffect(() => {
    if (!editor || editor.isDestroyed || pending.current || sameBody(body, synced.current)) return;
    synced.current = body;
    editor.commands.setContent(bodyDoc(body), { emitUpdate: false });
  }, [body, editor]);

  const labels = Object.fromEntries(Object.entries(sp.preserved).map(([kind, label]) => [`--sp-label-${kind}`, JSON.stringify(label)])) as CSSProperties;

  if (at < 0) return <p className="sp-empty">{t.draft.noHeading}</p>;

  return (
    <div className="script-scene">
      <SynopsisField
        value={synopsis}
        scene={card.title.trim() || sp.untitledScene}
        onSave={(text) => useCosmos.getState().setCardSceneSynopsis(card.id, text)}
        ia={!!elements && synopsisIsIa(elements, at)}
        atelier={{ sceneId: card.id, text: screenplaySceneText(at) }}
      />
      <div className="sp-bar" role="toolbar" aria-label={sp.barAria}>
        {EDITABLE_TYPES.filter((kind) => kind !== "sceneHeading").map((kind) => (
          <button
            key={kind}
            type="button"
            aria-pressed={type === kind}
            // Le focus reste dans le texte, à la souris comme au doigt.
            onPointerDown={(e) => e.preventDefault()}
            onClick={() => {
              editor.view.focus();
              setElementType(kind)(editor.state, editor.view.dispatch);
            }}
          >
            {sp.elements[kind]}
          </button>
        ))}
      </div>
      <div className="script-scene-sheet">
        <div className="sp-page is-scene" data-paper={paper} style={labels} lang={lang}>
          <EditorContent editor={editor} />
        </div>
      </div>
    </div>
  );
}
