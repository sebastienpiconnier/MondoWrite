// Une carte sur la toile : en-tête (type + titre, sert de poignée de déplacement)
// et corps éditable avec TipTap. Le menu « Transformer en… » s'ouvre de deux façons :
// en tapant "/" en début de ligne (clavier) ou en touchant l'étiquette du type
// (souris, doigt, et sans clavier physique sur mobile).
// « @ » dans le texte cite une autre carte : un menu propose les cartes du projet, et un fil est tiré.

import { formOf } from "../pitch";
import { autosize } from "./autosize";
import { documentExtension, imageExtension } from "../media";
import { memo, useEffect, useMemo, useRef, useState } from "react";
import { useLifted } from "../lifted";
import { Handle, NodeResizeControl, Position, ResizeControlVariant, useConnection, type NodeProps } from "@xyflow/react";
import { type Editor, type UseEditorOptions } from "@tiptap/react";
import { LiveBody, StaticBody, type FocusTarget } from "./lazyEditor";
import { richTextExtensions } from "./editorKit";
import { FormatBar } from "./FormatBar";
import { sourceUrl } from "../character";
import { openExternal } from "../platform";
import { hostOf } from "../research";
import Placeholder from "@tiptap/extension-placeholder";
import { typesFor, typeColor, type CardType } from "../types";
import { useCosmos, type CardNode as CardNodeT } from "../store";
import { fmt, getT } from "../i18n";
import { useVocab } from "../vocab";
import { useSettings } from "../settings";
import { CardActions } from "./CardActions";
import { CardLinks } from "./CardLinks";
import { SceneCardBody } from "./SceneDraft";
import { SuggestionMenu } from "./SuggestionMenu";
import { useMediaUrl } from "./useMediaUrl";
import { CARD_MAX_WIDTH, CARD_MIN_WIDTH } from "../media";
import { MentionNode } from "./MentionNode";
import { canCreateMention, mentionCandidates, mentionQuery, type MentionCandidate } from "../mentions";

/** Hauteur du texte d'une carte au-delà de laquelle elle se replie (px). */
const CARD_BODY_MAX = 220;

const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** Menu ouvert par "/" (avec la plage de texte à effacer) ou par l'étiquette du type. */
type MenuState = { via: "slash"; from: number; to: number; query: string } | { via: "label"; query: "" };

/** Mention en cours de frappe : plage à remplacer, cartes proposées, et offre de créer la carte. */
interface MentionState {
  from: number;
  to: number;
  query: string;
  candidates: MentionCandidate[];
  create: boolean;
}

function CardNodeImpl({ id, data, selected, width }: NodeProps<CardNodeT>) {
  const updateCard = useCosmos((s) => s.updateCard);
  const deleteCard = useCosmos((s) => s.deleteCard);
  // Soulevée par un appui long : sélectionnée + ombre portée ; elle se repose dès qu'elle n'est plus sélectionnée.
  const lifted = useLifted((s) => s.id === id) && !!selected;
  useEffect(() => {
    if (!selected && useLifted.getState().id === id) useLifted.getState().set(null);
  }, [selected, id]);
  const imageUrl = useMediaUrl(data.image);
  const { t, types, kind } = useVocab();
  // Pas de carte Épisode proposée dans un film (pastille Format).
  const film = useCosmos((s) => formOf(kind, s.pitch) === "film");
  // Scénario : le titre d'une scène est un en-tête de scène (INT./EXT. DÉCOR - MOMENT).
  const slugline = kind === "scenario" && data.type === "scene";
  // Le corps d'une carte Scène est son texte (manuscrit d'un roman, scène du scénario) : un aperçu ici, on
  // l'écrit dans la carte agrandie. Une scène de scénario sans en-tête garde encore ses notes.
  const sceneBody = useCosmos((s) => data.type === "scene" && (s.kind !== "scenario" || !!s.screenplay?.elements.some((el) => el.type === "sceneHeading" && el.cardId === id)));
  const novelScene = sceneBody;
  const lang = useSettings((s) => s.lang);

  const [slash, setSlash] = useState<MenuState | null>(null);
  const [active, setActive] = useState(0);
  // Près du bas de l'écran (petits écrans, bouton « Nouvelle carte »), le menu s'ouvre vers le haut.
  const [menuUp, setMenuUp] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);
  const openMenu = (menu: MenuState | null) => {
    const rect = cardRef.current?.getBoundingClientRect();
    if (menu && rect) setMenuUp(rect.bottom > window.innerHeight * 0.6);
    setSlash(menu);
  };
  const options = useMemo(
    () => (slash ? typesFor(kind, data.type === "episode", film).filter((type) => norm(types[type].label).includes(norm(slash.query))) : []),
    [slash, types, kind, data.type, film],
  );

  const [mention, setMention] = useState<MentionState | null>(null);
  // -1 : rien de présélectionné (Entrée garde son rôle tant qu'on ne propose que de créer une carte).
  const [mentionActive, setMentionActive] = useState(-1);
  // Position du « @ » d'un menu fermé par Échap : il ne se rouvre pas à la lettre suivante.
  const dismissed = useRef(-1);
  const blurTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const mentionCount = mention ? mention.candidates.length + (mention.create ? 1 : 0) : 0;

  // Refs pour que les gestionnaires TipTap (créés une seule fois) voient l'état courant.
  const stateRef = useRef({ slash, options, active, mention, mentionActive, mentionCount });
  stateRef.current = { slash, options, active, mention, mentionActive, mentionCount };

  const pick = (type: CardType) => {
    const s = stateRef.current.slash;
    if (s?.via === "slash" && editor) editor.chain().focus().deleteRange({ from: s.from, to: s.to }).run();
    updateCard(id, { type });
    setSlash(null);
  };
  const pickRef = useRef(pick);
  pickRef.current = pick;

  /** Remplace « @… » par la mention de la carte choisie (ou d'une carte créée à l'instant) et tire le fil. */
  const pickMention = (index: number) => {
    const m = stateRef.current.mention;
    clearTimeout(blurTimer.current);
    if (!m || !editor || index < 0) return;
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
    store.linkCards(id, target, "");
  };
  const pickMentionRef = useRef(pickMention);
  pickMentionRef.current = pickMention;

  const detectMention = (ed: Editor) => {
    const { $from, empty } = ed.state.selection;
    const found = empty && $from.parent.isTextblock ? mentionQuery($from.parent.textBetween(0, $from.parentOffset, undefined, "\ufffc")) : null;
    const from = found ? $from.pos - found.length : -1;
    if (!found || from === dismissed.current) {
      if (!found) dismissed.current = -1;
      if (stateRef.current.mention) setMention(null);
      return;
    }
    const cards = useCosmos.getState().nodes.map((n) => n.data);
    const candidates = mentionCandidates(cards, found.query, id, useSettings.getState().lang);
    const create = canCreateMention(cards, found.query);
    if (!candidates.length && !create) {
      if (stateRef.current.mention) setMention(null);
      return;
    }
    if (!stateRef.current.mention) {
      const rect = cardRef.current?.getBoundingClientRect();
      if (rect) setMenuUp(rect.bottom > window.innerHeight * 0.6);
    }
    setMention({ from, to: $from.pos, query: found.query, candidates, create });
    setMentionActive(candidates.length ? 0 : -1);
  };

  const detectSlash = (ed: Editor) => {
    const { $from, empty } = ed.state.selection;
    const text = $from.parent.textContent;
    if (empty && $from.parent.type.name === "paragraph" && /^\/[^\s/]{0,20}$/.test(text)) {
      const fresh = stateRef.current.slash?.via !== "slash";
      const menu: MenuState = { via: "slash", from: $from.start(), to: $from.end(), query: text.slice(1) };
      if (fresh) openMenu(menu);
      else setSlash(menu);
      setActive(0);
    } else if (stateRef.current.slash?.via === "slash") {
      setSlash(null);
    }
  };

  /** Coller dans la carte (titre ou texte) : une adresse ou une image collée dans une carte vide la transforme. */
  const pasteIntoCard = (event: ClipboardEvent | React.ClipboardEvent): boolean => {
    const data = event.clipboardData;
    if (!data) return false;
    const store = useCosmos.getState();
    // Un PDF collé dans une carte vide (ou une carte Document sans fichier) : elle devient ce Document.
    const pdf = [...data.files].find((f) => documentExtension(f.name) || f.type === "application/pdf");
    if (pdf) {
      const card = store.nodes.find((n) => n.id === id)?.data;
      const blank = card && !card.title.trim() && !card.image && !(card.html ?? "").replace(/<[^>]*>/g, "").trim();
      if (!card || card.fichier || !(blank || card.type === "document")) return false;
      event.preventDefault();
      const name = documentExtension(pdf.name) ? pdf.name : "document.pdf";
      void pdf.arrayBuffer().then((buf) => store.setCardDocument(id, { name, data: new Uint8Array(buf) }));
      return true;
    }
    const image = [...data.files].find((f) => imageExtension(f.name) || f.type.startsWith("image/"));
    if (image) {
      const card = store.nodes.find((n) => n.id === id)?.data;
      if (!card || card.title.trim() || card.image || (card.html ?? "").replace(/<[^>]*>/g, "").trim()) return false;
      event.preventDefault();
      const name = imageExtension(image.name) ? image.name : `image.${image.type.split("/")[1] || "png"}`;
      void image.arrayBuffer().then((buf) => store.turnIntoImage(id, { name, data: new Uint8Array(buf) }));
      return true;
    }
    if (!store.turnIntoLink(id, data.getData("text/plain"))) return false;
    event.preventDefault();
    return true;
  };

  const seenHtml = useRef(data.html);
  // L'éditeur n'est créé qu'au moment d'écrire dans la carte (clic, toucher, Tab, Entrée depuis le titre) :
  // avant, la carte montre son texte tel que l'éditeur l'afficherait (StaticBody). Ouvrir un projet de
  // plusieurs centaines de cartes ne crée donc plus des centaines d'éditeurs.
  const [editor, setEditor] = useState<Editor | null>(null);
  const [live, setLive] = useState<FocusTarget | null>(null);
  const goLive = (at: FocusTarget) => setLive((prev) => prev ?? at);
  const editorOptions: UseEditorOptions = {
    extensions: [
      ...richTextExtensions(),
      // Fonction : relue à chaque rendu, donc suit le changement de langue.
      Placeholder.configure({ placeholder: () => getT().card.bodyPlaceholder }),
      MentionNode,
    ],
    content: data.html,
    immediatelyRender: true,
    editorProps: {
      attributes: { class: "card-editor", "aria-label": getT().card.bodyAria },
      // Coller une adresse ou une image dans une carte vide : elle devient la carte Lien ou Image elle-même.
      handlePaste: (_view, event) => pasteIntoCard(event),
      handleKeyDown: (_view, event) => {
        const { slash: s, options: opts, active: a, mention: m, mentionActive: ma, mentionCount: count } = stateRef.current;
        if (m && count) {
          if (event.key === "ArrowDown") {
            setMentionActive((ma + 1) % count);
            return true;
          }
          if (event.key === "ArrowUp") {
            setMentionActive((ma - 1 + count) % count);
            return true;
          }
          if ((event.key === "Enter" || event.key === "Tab") && ma >= 0) {
            pickMentionRef.current(ma);
            return true;
          }
          if (event.key === "Escape") {
            dismissed.current = m.from;
            setMention(null);
            return true;
          }
        }
        if (!s || !opts.length) return false;
        if (event.key === "ArrowDown") {
          setActive((a + 1) % opts.length);
          return true;
        }
        if (event.key === "ArrowUp") {
          setActive((a - 1 + opts.length) % opts.length);
          return true;
        }
        if (event.key === "Enter") {
          pickRef.current(opts[a]);
          return true;
        }
        if (event.key === "Escape") {
          setSlash(null);
          return true;
        }
        return false;
      },
    },
    onUpdate: ({ editor: ed }) => {
      const html = ed.getHTML();
      seenHtml.current = html;
      updateCard(id, { html });
      detectSlash(ed);
      detectMention(ed);
    },
    onSelectionUpdate: ({ editor: ed }) => {
      detectSlash(ed);
      detectMention(ed);
    },
    // Sur iPhone et iPad, toucher une suggestion fait d'abord perdre le focus au texte : fermer tout de suite
    // retirait le menu avant le toucher (la mention ne se faisait pas). On laisse le temps au toucher d'arriver.
    onBlur: () => {
      clearTimeout(blurTimer.current);
      blurTimer.current = setTimeout(() => setMention(null), 300);
    },
  };

  // Carte soulevée = mode déplacement : le texte n'est plus modifiable (React Flow ne déplace pas une carte
  // saisie dans un champ éditable), donc on peut la saisir par n'importe quel endroit.
  useEffect(() => {
    if (!editor || editor.isDestroyed) return;
    editor.setEditable(!lifted, false);
  }, [editor, lifted]);

  // Le texte a changé sans passer par cet éditeur (annuler, rétablir) : il se remet à jour.
  // Pendant la frappe, les deux sont égaux et rien ne se passe.
  // Le texte reçu à la création (ou écrit par l'éditeur) n'est pas relu : à l'ouverture d'un gros projet,
  // chaque carte refaisait sinon son contenu une seconde fois.
  useEffect(() => {
    if (!editor || editor.isDestroyed || data.html === seenHtml.current) return;
    seenHtml.current = data.html;
    if (data.html === editor.getHTML()) return;
    if (data.html === "" && editor.isEmpty) return;
    editor.commands.setContent(data.html, { emitUpdate: false });
  }, [data.html, editor]);

  // Changement de langue : on met à jour ce que TipTap a figé à la création (pas au montage, il est à jour).
  const builtLang = useRef(lang);
  useEffect(() => {
    if (!editor || editor.isDestroyed || builtLang.current === lang) return;
    builtLang.current = lang;
    editor.setOptions({
      editorProps: { ...editor.options.editorProps, attributes: { class: "card-editor", "aria-label": t.card.bodyAria } },
    });
    editor.view.dispatch(editor.state.tr.setMeta("cosmos:lang", lang)); // redessine le texte indicatif
  }, [lang, editor, t]);

  // Menu ouvert depuis l'étiquette : on le ferme avec Échap ou en touchant ailleurs.
  const labelMenuOpen = slash?.via === "label";
  useEffect(() => {
    if (!labelMenuOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setSlash(null);
    };
    const onDown = (e: PointerEvent) => {
      if (!cardRef.current?.contains(e.target as Node)) setSlash(null);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onDown);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onDown);
    };
  }, [labelMenuOpen]);

  // Hauteur du titre ajustée à son contenu (repli si `field-sizing` n'est pas pris en charge).
  const titleRef = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    autosize(titleRef.current);
    // La largeur compte : un titre sur deux lignes peut tenir sur une seule dans une carte élargie.
  }, [data.title, slugline, width]);

  const source = sourceUrl(data);

  // Texte trop long : la carte se replie (hauteur mesurée, suit les modifications et la largeur).
  const bodyRef = useRef<HTMLDivElement>(null);
  const [tall, setTall] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [writing, setWriting] = useState(false);
  const [wrote, setWrote] = useState(false);
  useEffect(() => {
    const el = bodyRef.current?.querySelector<HTMLElement>(".card-editor");
    if (!el || typeof ResizeObserver === "undefined") return;
    const check = () => setTall(el.scrollHeight > CARD_BODY_MAX + 40);
    const observer = new ResizeObserver(check);
    // L'observateur donne aussi la première mesure, après la mise en page (pas de calcul forcé par carte).
    observer.observe(el);
    return () => observer.disconnect();
  }, [editor, novelScene]);
  useEffect(() => {
    if (!editor) return;
    const on = () => {
      setWriting(true);
      setWrote(true);
    };
    const off = () => setWriting(false);
    editor.on("focus", on);
    editor.on("blur", off);
    // Éditeur créé par un clic : il a déjà le focus quand on l'apprend.
    if (editor.isFocused) on();
    return () => {
      editor.off("focus", on);
      editor.off("blur", off);
    };
  }, [editor]);
  const clamped = tall && !expanded && !writing;

  // Pendant qu'on tire un fil, toute la carte devient une cible de dépôt.
  const connection = useConnection();
  const isDropTarget = connection.inProgress && connection.fromNode?.id !== id;

  // Nouvelle carte : on écrit tout de suite son titre (Entrée passe ensuite au corps).
  const pendingFocus = useCosmos((s) => s.pendingFocusId === id);
  useEffect(() => {
    if (!pendingFocus) return;
    // React Flow masque un nœud tant qu'il n'est pas mesuré : on réessaie brièvement.
    let tries = 0;
    let timer: ReturnType<typeof setTimeout>;
    const tryFocus = () => {
      const el = titleRef.current;
      if (el) {
        el.focus({ preventScroll: true });
        el.setSelectionRange(el.value.length, el.value.length);
      }
      if ((el && document.activeElement === el) || tries++ > 10) useCosmos.getState().clearPendingFocus();
      else timer = setTimeout(tryFocus, 30);
    };
    tryFocus();
    return () => clearTimeout(timer);
  }, [pendingFocus]);

  return (
    <div ref={cardRef} className={`card type-${data.type}${selected ? " is-selected" : ""}${lifted ? " is-lifted" : ""}${data.type === "image" || data.type === "lien" || data.type === "document" ? ` is-${data.type}-card` : ""}${data.inbox ? " is-inbox" : ""}`} style={{ ["--type" as string]: typeColor(data.type) }}>
      {(["top", "right", "bottom", "left"] as const).map((side) => (
        <Handle
          key={side}
          id={side}
          type="source"
          position={Position[(side[0].toUpperCase() + side.slice(1)) as keyof typeof Position]}
          className="card-port"
        />
      ))}

      {isDropTarget && <Handle id="drop" type="target" position={Position.Top} className="card-dropzone" />}

      {/* Largeur : on tire la poignée du coin bas droit (ou Alt + flèches). La hauteur suit le contenu.
          Une poignée de coin plutôt que tout le bord droit : le point d'accroche du milieu reste libre pour tirer un fil. */}
      {selected && (
        <NodeResizeControl
          position="bottom-right"
          variant={ResizeControlVariant.Handle}
          resizeDirection="horizontal"
          minWidth={CARD_MIN_WIDTH}
          maxWidth={CARD_MAX_WIDTH}
          className="card-resize"
        />
      )}

      {imageUrl && (
        <div className="card-image">
          {/* Fond flou tiré de la même image : il comble les côtés quand l'image garde ses proportions. */}
          <img className="card-image-backdrop" src={imageUrl} alt="" aria-hidden="true" draggable={false} />
          <img className="card-image-main" src={imageUrl} alt={data.title ? fmt(t.card.imageAlt, { title: data.title }) : t.card.imageAltUntitled} draggable={false} />
          <button
            type="button"
            className="card-image-remove nodrag"
            aria-label={t.card.removeImage}
            title={t.card.removeImage}
            onClick={() => updateCard(id, { image: undefined })}
          >
            ×
          </button>
        </div>
      )}

      <div className="card-handle">
        <button
          type="button"
          className="card-type nodrag"
          aria-haspopup="listbox"
          aria-expanded={slash?.via === "label"}
          aria-label={fmt(t.card.changeType, { type: types[data.type].label })}
          onClick={() => {
            setActive(Math.max(0, typesFor(kind, data.type === "episode", film).indexOf(data.type)));
            openMenu(slash?.via === "label" ? null : { via: "label", query: "" });
          }}
        >
          <span className="card-dot" />
          {types[data.type].label}
        </button>
        {/* Fiche dans la Bible : toutes les cartes typées en ont une (les idées en vrac n'y sont qu'une liste). */}
        {data.type !== "idee" && (
          <button
            type="button"
            className="card-delete card-bible nodrag"
            aria-label={t.card.openSheet}
            title={t.card.openSheet}
            onClick={() => useCosmos.getState().openInBible(id)}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M5 4.5h9.5a3 3 0 0 1 3 3V20H8a3 3 0 0 1-3-3z" />
              <path d="M5 17a3 3 0 0 1 3-3h9.5" />
              <path d="M9 8h5" />
            </svg>
          </button>
        )}
        {/* Agrandir : titre, texte, fiche et image dans une grande fenêtre (aussi Cmd/Ctrl + Entrée). */}
        <button
          type="button"
          className="card-delete card-expand nodrag"
          aria-label={t.card.expand}
          title={t.card.expand}
          onClick={() => useCosmos.getState().expandCard(id)}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M14 4h6v6M10 20H4v-6M20 4l-7 7M4 20l7-7" />
          </svg>
        </button>
        <CardActions id={id} hasImage={!!data.image} title={data.title} />
        <button
          type="button"
          className="card-delete nodrag"
          aria-label={t.card.delete}
          onClick={() => deleteCard(id)}
        >
          ×
        </button>
      </div>

      {/* Titre sur plusieurs lignes si besoin (zone qui grandit), mais sans retour à la ligne :
          Entrée passe au corps de la carte. */}
      <textarea
        ref={titleRef}
        rows={1}
        className={`card-title nodrag${slugline ? " is-slugline" : ""}`}
        value={data.title}
        placeholder={data.type === "lien" && !data.fiche?.url ? t.card.linkAddress : types[data.type].titlePlaceholder}
        aria-label={t.card.titleAria}
        onChange={(e) => updateCard(id, { title: e.target.value.replace(/\n/g, " ") })}
        onPaste={(e) => {
          if (pasteIntoCard(e)) e.preventDefault();
        }}
        onKeyDown={(e) => {
          // Menu des types ouvert depuis le titre : flèches, Entrée, Échap.
          const menu = stateRef.current;
          if (menu.slash?.via === "label" && menu.options.length > 0) {
            if (e.key === "ArrowDown" || e.key === "ArrowUp") {
              e.preventDefault();
              setActive((menu.active + (e.key === "ArrowDown" ? 1 : -1) + menu.options.length) % menu.options.length);
              return;
            }
            if (e.key === "Enter") {
              e.preventDefault();
              pick(menu.options[menu.active]);
              return;
            }
          }
          // « / » dans un titre encore vide : le menu des types, au clavier (le corps d'une carte Scène n'est
          // plus un éditeur, c'est le chemin clavier qui reste pour toutes les cartes).
          if (e.key === "/" && !data.title) {
            e.preventDefault();
            setActive(Math.max(0, typesFor(kind, data.type === "episode", film).indexOf(data.type)));
            openMenu({ via: "label", query: "" });
            return;
          }
          if (e.key === "Enter") {
            e.preventDefault();
            // Carte Lien sans adresse : l'adresse tapée dans le titre devient son lien.
            if (useCosmos.getState().linkFromTitle(id)) return;
            if (novelScene) useCosmos.getState().expandCard(id);
            else if (editor) editor.commands.focus("start");
            else goLive("start");
          }
        }}
        onBlur={() => {
          useCosmos.getState().linkFromTitle(id);
        }}
      />

      {/* Texte long : replié au-delà de CARD_BODY_MAX, « Plus de détails » le déplie. Pendant l'écriture,
          il reste déplié. Un état d'affichage, rien n'est enregistré. */}
      {novelScene ? (
        <div className={`card-body is-scene nodrag nowheel nopan`}>
          <SceneCardBody card={data} />
        </div>
      ) : (
        <div ref={bodyRef} className={`card-body nodrag nowheel nopan${clamped ? " is-clamped" : ""}`}>
          {live ? (
            <LiveBody options={editorOptions} at={live} onEditor={setEditor} />
          ) : (
            <StaticBody html={data.html} className="card-editor" label={t.card.bodyAria} placeholder={t.card.bodyPlaceholder} disabled={lifted} onActivate={goLive} />
          )}
          {/* La barre de mise en forme ne s'installe qu'à la première écriture dans la carte : posée sur chacune
              à l'ouverture, elle redessinait tous les éditeurs du canevas (une extension par carte). */}
          {editor && wrote && <FormatBar editor={editor} />}
        </div>
      )}
      {!novelScene && tall && !writing && (
        <button type="button" className="card-more nodrag" aria-expanded={expanded} onClick={() => setExpanded(!expanded)}>
          {expanded ? t.character.fewerDetails : t.card.moreDetails}
        </button>
      )}

      {/* Source : son adresse, à ouvrir dans le navigateur. */}
      {source && (
        <button type="button" className="card-source nodrag" title={source} onClick={() => void openExternal(source)}>
          <span aria-hidden="true">↗</span> {fmt(t.research.open, { host: hostOf(source) })}
        </button>
      )}

      {/* Document : le lire dans l'app, ou choisir son PDF s'il n'en a pas encore. */}
      {data.type === "document" &&
        (data.fichier ? (
          <button type="button" className="card-source nodrag" onClick={() => useCosmos.getState().openDocument(id)}>
            <span aria-hidden="true">▤</span> {t.documents.read}
            {data.fiche?.pages ? ` · ${data.fiche.pages === "1" ? t.documents.onePage : fmt(t.documents.pages, { n: data.fiche.pages })}` : ""}
          </button>
        ) : (
          <button type="button" className="card-source nodrag" onClick={() => void useCosmos.getState().pickDocument(id)}>
            <span aria-hidden="true">+</span> {t.documents.choose}
          </button>
        ))}

      {/* Questions gardées pour plus tard : un simple lien vers la fiche, pas de cartes sur le canevas. */}
      {data.type === "personnage" && (data.questions?.length ?? 0) > 0 && (
        <button type="button" className="card-questions nodrag" onClick={() => useCosmos.getState().openInBible(id, true)}>
          <span className="card-questions-count">{data.questions!.length}</span>
          {fmt(data.questions!.length === 1 ? t.character.pendingOne : t.character.pendingMany, { n: data.questions!.length })}
        </button>
      )}

      {/* À quoi la carte est reliée : lisible même fils masqués. */}
      <CardLinks id={id} />

      {mention && mentionCount > 0 && !slash && (
        <SuggestionMenu
          title={t.card.mentionTitle}
          className={menuUp ? "opens-up" : ""}
          items={[
            ...mention.candidates.map((c) => ({ key: c.id, label: c.title, hint: types[c.type].label, color: typeColor(c.type) })),
            ...(mention.create
              ? [{ key: "+", label: fmt(t.card.mentionCreate, { title: mention.query.trim() }), hint: t.card.mentionCreateHint, color: typeColor("idee") }]
              : []),
          ]}
          active={mentionActive}
          onPick={pickMention}
        />
      )}

      {slash && options.length > 0 && (
        <SuggestionMenu
          title={t.card.menuTitle}
          className={menuUp ? "opens-up" : ""}
          items={options.map((type) => ({ key: type, label: types[type].label, color: typeColor(type) }))}
          active={active}
          onPick={(i) => pick(options[i])}
        />
      )}
    </div>
  );
}

export const CardNode = memo(CardNodeImpl);
