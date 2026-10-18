// La toile : on crée une carte n'importe où (double-clic à la souris, bouton « Nouvelle carte »
// au doigt, ou bouton « + »), on tire un fil d'un point de connexion vers une autre
// carte, on double-clique (ou touche, sur écran tactile) un fil pour l'étiqueter.

import { useEffect, useMemo, useRef, useState, type MouseEvent as ReactMouseEvent } from "react";
import {
  Background,
  BackgroundVariant,
  ConnectionMode,
  Controls,
  MiniMap,
  ReactFlow,
  SelectionMode,
  useReactFlow,
  type Edge,
} from "@xyflow/react";
import { heldCardIds, useCosmos } from "../store";
import { filterActive, hiddenCards } from "../canvasFilter";
import { CanvasFilterMenu } from "./CanvasFilterMenu";
import { CardNode } from "./CardNode";
import { FrameNode } from "./FrameNode";
import { FloatingEdge } from "./FloatingEdge";
import { NewCardMenu } from "./NewCardMenu";
import type { CardData, CardType } from "../types";
import { fmt, useT } from "../i18n";
import { useSettings } from "../settings";
import { isTouch } from "../platform";
import { useLifted } from "../lifted";
import { documentExtension, imageExtension } from "../media";
import { TEXT_FILE_RE, clipFromText } from "../clip";

/** Fichiers qui deviennent une carte quand on les dépose ou les colle sur le canevas. */
const isIncomingFile = (f: File) =>
  !!documentExtension(f.name) || f.type === "application/pdf" || !!imageExtension(f.name) || f.type.startsWith("image/") || TEXT_FILE_RE.test(f.name) || f.type === "text/plain" || f.type === "text/markdown";

const blankCard = (card: CardData | undefined) =>
  !!card && !card.fichier && !card.title.trim() && !card.image && !(card.html ?? "").replace(/<[^>]*>/g, "").trim();

/**
 * Fichiers déposés ou collés : une carte chacun, dans l'ordre, la première là où l'on est (les suivantes à la
 * première place libre à côté, jamais l'une sur l'autre). `target` : la carte sous le pointeur, qu'un fichier
 * seul peut remplir (PDF ou image dans une carte vide, image sur n'importe quelle carte).
 */
async function addIncomingFiles(files: File[], at: { x: number; y: number } | undefined, target?: string) {
  const store = useCosmos.getState();
  const wanted = files.filter(isIncomingFile);
  const card = target && wanted.length === 1 ? store.nodes.find((n) => n.id === target)?.data : undefined;
  let created: string | null = null;
  for (const [i, file] of wanted.entries()) {
    const here = at && i > 0 ? { x: at.x + 30 * i, y: at.y + 30 * i } : at;
    const bytes = async () => new Uint8Array(await file.arrayBuffer());
    if (documentExtension(file.name) || file.type === "application/pdf") {
      const doc = { name: documentExtension(file.name) ? file.name : "document.pdf", data: await bytes() };
      if (card && (blankCard(card) || (card.type === "document" && !card.fichier))) await store.setCardDocument(card.id, doc);
      else created = (await store.addDocument(doc, here)) ?? created;
    } else if (imageExtension(file.name) || file.type.startsWith("image/")) {
      const image = { name: imageExtension(file.name) ? file.name : `image.${file.type.split("/")[1] || "png"}`, data: await bytes() };
      if (card) await store.setCardImage(card.id, image);
      else created = (await store.addResearchImage(image, here)) ?? created;
    } else {
      created = store.addTextFile(file.name, await file.text(), here) ?? created;
    }
  }
  // Plusieurs cartes : la dernière est montrée (la place libre la plus proche peut être hors de l'écran).
  if (created && wanted.length > 1) useCosmos.setState({ focusId: created });
}

const LONG_PRESS_MS = 500;
const LONG_PRESS_TOLERANCE = 10; // px de mouvement avant d'abandonner

const nodeTypes = { card: CardNode, frame: FrameNode };
const edgeTypes = { floating: FloatingEdge };

interface LabelEditor {
  edgeId: string;
  x: number;
  y: number;
  value: string;
}

export function Toile() {
  const { nodes, edges, onNodesChange, onEdgesChange, onConnect, addCard, renameLink, focusId, setView, undo, redo } =
    useCosmos();
  const frames = useCosmos((s) => s.frames);
  const addFrame = useCosmos((s) => s.addFrame);
  // Les cadres d'abord : ils se dessinent derrière les cartes.
  // Une carte tenue par un cadre verrouillé ne se déplace pas : React Flow ne la laisse pas glisser.
  // Filtre (cartes masquées, avec leurs fils) et mise en avant (une carte nette, le reste estompé) :
  // des états d'affichage, posés ici sur les nœuds passés à React Flow, jamais dans le projet.
  const filter = useCosmos((s) => s.filter);
  const spotlightId = useCosmos((s) => s.spotlightId);
  const hidden = useMemo(() => hiddenCards(nodes.map((n) => n.data), edges, filter), [nodes, edges, filter]);
  const allNodes = useMemo(() => {
    const held = heldCardIds(nodes, frames);
    if (held.size === 0 && hidden.size === 0 && !spotlightId) return [...frames, ...nodes];
    return [
      ...frames,
      ...nodes.map((n) => {
        const lock = held.has(n.id);
        const off = hidden.has(n.id);
        const lit = n.id === spotlightId;
        return lock || off || lit ? { ...n, ...(lock ? { draggable: false } : {}), ...(off ? { hidden: true } : {}), ...(lit ? { className: "is-spotlit" } : {}) } : n;
      }),
    ];
  }, [frames, nodes, hidden, spotlightId]);
  const shownEdges = useMemo(
    () => (hidden.size === 0 ? edges : edges.map((e) => (hidden.has(e.source) || hidden.has(e.target) ? { ...e, hidden: true } : e))),
    [edges, hidden],
  );
  const canUndo = useCosmos((s) => s.past.length > 0);
  const canRedo = useCosmos((s) => s.future.length > 0);
  const { screenToFlowPosition, fitView, getViewport } = useReactFlow();
  const wrapper = useRef<HTMLDivElement>(null);
  const [labelEditor, setLabelEditor] = useState<LabelEditor | null>(null);
  const edgeCountBeforeConnect = useRef(0);
  const touch = isTouch();
  const t = useT();
  const theme = useSettings((s) => s.theme);
  // Mode « Sélection » : glisser sur le canevas entoure des cartes au lieu de déplacer la vue (chemin du doigt).
  const [selecting, setSelecting] = useState(false);
  const selectedCards = nodes.filter((n) => n.selected).length;
  const selectedFrames = frames.filter((f) => f.selected).length;

  // Zone Recherche demandée (bouton ou nouvelle source) : on la cadre.
  const focusFrame = useCosmos((s) => s.focusFrame);
  useEffect(() => {
    if (!focusFrame) return;
    const timer = setTimeout(() => {
      fitView({ nodes: [{ id: focusFrame }], duration: 400, maxZoom: 1, padding: 0.15 });
      useCosmos.getState().clearFocusFrame();
    }, 60);
    return () => clearTimeout(timer);
  }, [focusFrame, fitView]);

  // Après « Organiser le canevas » : on cadre tout le projet.
  const fitRequest = useCosmos((s) => s.fitRequest);
  useEffect(() => {
    if (!fitRequest) return;
    const timer = setTimeout(() => fitView({ padding: 0.12, duration: 500 }), 60);
    return () => clearTimeout(timer);
  }, [fitRequest, fitView]);

  // Arrivée depuis la Bible : on centre la carte demandée.
  useEffect(() => {
    if (!focusId) return;
    const t = setTimeout(() => {
      fitView({ nodes: [{ id: focusId }], duration: 400, maxZoom: 1.2 });
      setView("toile", null);
    }, 50);
    return () => clearTimeout(t);
  }, [focusId, fitView, setView]);

  const createAt = (clientX: number, clientY: number) => {
    const pos = screenToFlowPosition({ x: clientX, y: clientY });
    addCard({ x: pos.x - 20, y: pos.y - 20 }); // la carte prend le focus elle-même
  };

  // Dépôt sur le canevas : chaque fichier devient une carte adaptée (PDF : Document, image : Image, .md ou
  // .txt : la carte qu'il annonce), là où on l'a lâché. Un seul fichier lâché sur une carte vide la remplit
  // (une image sur n'importe quelle carte devient son image). Un lien ou un texte venu d'un navigateur :
  // une carte Lien, Image, Scène ou Idée selon ce qu'il contient (une seule).
  const onDrop = async (e: React.DragEvent) => {
    const at = screenToFlowPosition({ x: e.clientX, y: e.clientY });
    const files = [...e.dataTransfer.files];
    if (files.some(isIncomingFile)) {
      e.preventDefault();
      const target = (e.target as HTMLElement).closest(".react-flow__node-card")?.getAttribute("data-id") ?? undefined;
      await addIncomingFiles(files, at, target);
      return;
    }
    // Une image glissée depuis une page web (sans fichier) : son adresse, pour en faire une carte Image.
    const html = e.dataTransfer.getData("text/html");
    const picture = html.replace(/<[^>]*>/g, "").trim() ? null : html.match(/<img[^>]+src=["'](https?:[^"']+)["']/i)?.[1];
    const link = e.dataTransfer.getData("text/uri-list").split("\n").find((l) => l && !l.startsWith("#"));
    const text = picture?.replace(/&amp;/g, "&") || link?.trim() || e.dataTransfer.getData("text/plain");
    if (text && clipFromText(text)) {
      e.preventDefault();
      useCosmos.getState().addResearchClip(text, at, !!picture && text === picture.replace(/&amp;/g, "&"));
    }
  };

  const isPane = (target: EventTarget | null) =>
    target instanceof HTMLElement && target.classList.contains("react-flow__pane");

  const onDoubleClick = (e: ReactMouseEvent) => {
    if (isPane(e.target)) createAt(e.clientX, e.clientY);
  };

  // Bouton « + » et touche N : nouvelle carte au centre de l'écran (le store la décale si la place est prise).
  const createInCenter = () => {
    const rect = wrapper.current?.getBoundingClientRect();
    if (!rect) return;
    createAt(rect.left + rect.width / 2 - 100, rect.top + rect.height / 2 - 60);
  };

  // Nouveau cadre : autour des cartes sélectionnées, sinon au centre de l'écran.
  const createFrame = () => {
    const rect = wrapper.current?.getBoundingClientRect();
    if (!rect) return;
    addFrame(screenToFlowPosition({ x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 }));
  };

  // Raccourcis clavier : N (carte) et C (cadre), hors d'un champ ou d'une carte en cours d'écriture.
  // Menu « Nouvelle carte » : au centre de la vue, comme le bouton.
  const centerAt = () => {
    const rect = wrapper.current?.getBoundingClientRect();
    return rect ? screenToFlowPosition({ x: rect.left + rect.width / 2 - 120, y: rect.top + rect.height / 2 - 120 }) : undefined;
  };
  const createKind = (type: CardType) => {
    const store = useCosmos.getState();
    if (type === "idee") createInCenter();
    // Image : la fenêtre Photos, qui propose aussi une image de l'appareil. Document : le choix d'un PDF.
    else if (type === "image") store.openPhotos({ kind: "canvas", at: centerAt() });
    else if (type === "document") void store.pickDocument(undefined, centerAt());
    else {
      const at = centerAt();
      if (at) store.addCard(at, type); // la carte prend le focus de son titre
    }
  };

  const createInCenterRef = useRef(createInCenter);
  createInCenterRef.current = createInCenter;
  const createFrameRef = useRef(createFrame);
  createFrameRef.current = createFrame;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const key = e.key.toLowerCase();
      const target = e.target as HTMLElement | null;
      if (target?.closest("input, textarea, select, [contenteditable='true']")) return;
      // Alt + flèche droite ou gauche : élargir ou rétrécir les cartes sélectionnées.
      if (e.altKey && !e.metaKey && !e.ctrlKey && (e.key === "ArrowRight" || e.key === "ArrowLeft")) {
        const { nodes: all, resizeCard } = useCosmos.getState();
        const chosen = all.filter((n) => n.selected);
        if (chosen.length === 0) return;
        e.preventDefault();
        for (const n of chosen) resizeCard(n.id, e.key === "ArrowRight" ? 40 : -40);
        return;
      }
      // Ctrl ou Cmd + A : toutes les cartes et tous les cadres. Échap : plus rien de sélectionné.
      if (key === "a" && (e.metaKey || e.ctrlKey) && !e.altKey && !e.shiftKey) {
        e.preventDefault();
        useCosmos.getState().selectAll();
        return;
      }
      // Cmd/Ctrl + Entrée : la carte choisie s'ouvre en grand (dans son texte, Cmd/Ctrl + Entrée reste un saut de ligne).
      if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && !e.altKey && !e.shiftKey) {
        const chosen = useCosmos.getState().nodes.filter((n) => n.selected);
        if (chosen.length === 1) {
          e.preventDefault();
          useCosmos.getState().expandCard(chosen[0].id);
        }
        return;
      }
      if (e.key === "Escape" && !e.metaKey && !e.ctrlKey && !e.altKey) {
        const { nodes: all, frames: boxesNow, clearSelection, spotlightId: lit, setSpotlight, cardMenu, setCardMenu } = useCosmos.getState();
        if (cardMenu) setCardMenu(null);
        if (lit) setSpotlight(null);
        if (all.some((n) => n.selected) || boxesNow.some((b) => b.selected)) clearSelection();
        setSelecting(false);
        return;
      }
      if ((key !== "n" && key !== "c") || e.metaKey || e.ctrlKey || e.altKey || e.repeat) return;
      e.preventDefault();
      if (key === "n") createInCenterRef.current();
      else createFrameRef.current();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Dernière position du pointeur sur le canevas : un collage y pose sa carte (sinon, au centre de la vue).
  const pointer = useRef<{ x: number; y: number } | null>(null);
  const pasteAt = () => {
    const rect = wrapper.current?.getBoundingClientRect();
    const p = pointer.current;
    const inside = p && rect && p.x >= rect.left && p.x <= rect.right && p.y >= rect.top && p.y <= rect.bottom;
    if (inside) return screenToFlowPosition(p);
    return rect ? screenToFlowPosition({ x: rect.left + rect.width / 2 - 120, y: rect.top + rect.height / 2 - 75 }) : undefined;
  };
  const pasteAtRef = useRef(pasteAt);
  pasteAtRef.current = pasteAt;

  // Coller hors d'un champ : un lien, un texte ou une image devient une carte Lien, Extrait ou Image, là où l'on est.
  useEffect(() => {
    const onPaste = async (e: ClipboardEvent) => {
      const target = e.target instanceof Element ? e.target : null;
      if (target?.closest("input, textarea, select, [contenteditable='true'], dialog")) return;
      const data = e.clipboardData;
      if (!data) return;
      const store = useCosmos.getState();
      const at = pasteAtRef.current();
      const files = [...data.files];
      if (files.some(isIncomingFile)) {
        e.preventDefault();
        await addIncomingFiles(files, at);
        return;
      }
      const text = data.getData("text/plain");
      if (!clipFromText(text)) return;
      e.preventDefault();
      store.addResearchClip(text, at);
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, []);

  // Appui long sur une carte (doigt, stylet ou souris) : elle est sélectionnée et « soulevée » (ombre portée)
  // pour être déplacée ; on peut enchaîner en la faisant glisser sans lever le doigt. L'appui long ne crée
  // plus de carte sur la toile : trop de cartes naissaient par erreur (création : double-clic, clic droit,
  // bouton « Nouvelle carte » ou touche N). Au relâchement, le navigateur émule mousedown/click sous le doigt :
  // on les avale un court instant, sinon ils ouvriraient un menu ou changeraient la sélection.
  useEffect(() => {
    const el = wrapper.current;
    if (!el) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let start: { x: number; y: number; id: string } | null = null;
    let fired = false;
    let swallowUntil = 0;
    // Carte soulevée en cours de déplacement (nous la déplaçons nous-mêmes : le texte de la carte est « nodrag »).
    let moving: { id: string; x: number; y: number } | null = null;
    const endMove = () => {
      if (!moving) return;
      const c = useCosmos.getState().nodes.find((n) => n.id === moving!.id);
      if (c) useCosmos.getState().onNodesChange([{ type: "position", id: c.id, position: c.position, dragging: false }]);
      moving = null;
    };
    const cancel = () => {
      clearTimeout(timer);
      start = null;
    };
    const down = (e: PointerEvent) => {
      fired = false;
      endMove();
      if (!e.isPrimary || (e.pointerType === "mouse" && e.button !== 0)) return;
      const target = e.target instanceof Element ? e.target : null;
      const node = target?.closest<HTMLElement>(".react-flow__node-card");
      // Ni les boutons ni les poignées ; un texte que l'on est en train d'écrire garde son appui long (loupe, sélection).
      if (!node || target?.closest("input, select, button, a, .react-flow__handle, .card-resize")) return;
      // Carte déjà soulevée : on la déplace tout de suite, depuis n'importe quel point (texte compris).
      if (useLifted.getState().id === node.getAttribute("data-id") && node.classList.contains("selected")) {
        moving = { id: node.getAttribute("data-id")!, x: e.clientX, y: e.clientY };
        e.preventDefault();
        return;
      }
      const field = target?.closest("textarea, [contenteditable='true']");
      if (field && (field === document.activeElement || field.contains(document.activeElement))) return;
      const id = node.getAttribute("data-id");
      if (!id) return;
      start = { x: e.clientX, y: e.clientY, id };
      timer = setTimeout(() => {
        if (!start) return;
        fired = true;
        navigator.vibrate?.(10);
        const store = useCosmos.getState();
        useCosmos.setState({
          nodes: store.nodes.map((n) => (n.selected === (n.id === start!.id) ? n : { ...n, selected: n.id === start!.id })),
          frames: store.frames.map((f) => (f.selected ? { ...f, selected: false } : f)),
        });
        useLifted.getState().set(start.id);
        moving = { id: start.id, x: start.x, y: start.y };
        start = null;
      }, LONG_PRESS_MS);
    };
    const move = (e: PointerEvent) => {
      if (moving) {
        const zoom = getViewport().zoom || 1;
        const dx = (e.clientX - moving.x) / zoom;
        const dy = (e.clientY - moving.y) / zoom;
        moving.x = e.clientX;
        moving.y = e.clientY;
        const c = useCosmos.getState().nodes.find((n) => n.id === moving!.id);
        if (c && (dx || dy)) {
          useCosmos.getState().onNodesChange([{ type: "position", id: c.id, position: { x: c.position.x + dx, y: c.position.y + dy }, dragging: true }]);
        }
        if (e.cancelable) e.preventDefault();
        return;
      }
      if (start && Math.hypot(e.clientX - start.x, e.clientY - start.y) > LONG_PRESS_TOLERANCE) cancel();
    };
    const touchEnd = (e: TouchEvent) => {
      if (fired) {
        if (e.cancelable) e.preventDefault();
        swallowUntil = Date.now() + 400;
      }
      fired = false;
    };
    const swallow = (e: Event) => {
      if (Date.now() < swallowUntil) {
        e.preventDefault();
        e.stopPropagation();
      }
    };
    const ghostEvents = ["mousedown", "mouseup", "click"] as const;
    ghostEvents.forEach((t) => window.addEventListener(t, swallow, true));
    // Phase de capture : la toile (d3-zoom) stoppe la propagation des événements tactiles.
    el.addEventListener("pointerdown", down, true);
    el.addEventListener("pointermove", move, true);
    const up = () => {
      cancel();
      endMove();
    };
    // Pas de focus ni de sélection de texte pendant qu'on déplace la carte.
    const noFocus = (e: Event) => {
      if (moving) e.preventDefault();
    };
    el.addEventListener("mousedown", noFocus, true);
    window.addEventListener("pointerup", up, true);
    window.addEventListener("pointercancel", up, true);
    el.addEventListener("touchend", touchEnd, { capture: true, passive: false });
    return () => {
      cancel();
      el.removeEventListener("pointerdown", down, true);
      el.removeEventListener("pointermove", move, true);
      el.removeEventListener("mousedown", noFocus, true);
      window.removeEventListener("pointerup", up, true);
      window.removeEventListener("pointercancel", up, true);
      el.removeEventListener("touchend", touchEnd, true);
      ghostEvents.forEach((t) => window.removeEventListener(t, swallow, true));
    };
  }, []);

  const openLabelEditor = (edge: Edge, x: number, y: number) => {
    const rect = wrapper.current?.getBoundingClientRect();
    setLabelEditor({ edgeId: edge.id, x: x - (rect?.left ?? 0), y: y - (rect?.top ?? 0), value: String(edge.label ?? "") });
  };

  // Le filtre actif, en mots : les types masqués, la carte dont on ne voit que le voisinage.
  const filterSummary = [
    filter.types.length === 1 ? t.filter.typesOne : filter.types.length > 1 ? fmt(t.filter.typesMany, { n: filter.types.length }) : "",
    filter.card ? fmt(t.filter.card, { title: nodes.find((n) => n.id === filter.card)?.data.title.trim() || t.bible.untitled }) : "",
  ]
    .filter(Boolean)
    .join(" · ");

  // Au doigt (iPad), toucher « Délier » retire le focus du champ avant le clic : le blur refermait l'éditeur et
  // le bouton disparaissait avant de recevoir son clic. On note l'appui et le blur l'attend.
  const unlinkPressed = useRef(false);
  const commitLabel = () => {
    if (unlinkPressed.current) return;
    if (labelEditor) renameLink(labelEditor.edgeId, labelEditor.value.trim());
    setLabelEditor(null);
  };

  return (
    <div
      className={`toile${selectedCards + selectedFrames > 1 ? " has-multi" : ""}${spotlightId ? " has-spotlight" : ""}`}
      ref={wrapper}
      onDoubleClick={onDoubleClick}
      onPointerMove={(e) => {
        pointer.current = { x: e.clientX, y: e.clientY };
      }}
      onDragOver={(e) => {
        const types = e.dataTransfer.types;
        if (!types.includes("Files") && !types.includes("text/uri-list") && !types.includes("text/plain")) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = "copy";
      }}
      onDrop={onDrop}
    >
      <ReactFlow
        nodes={allNodes}
        edges={shownEdges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnectStart={() => (edgeCountBeforeConnect.current = useCosmos.getState().edges.length)}
        onConnect={onConnect}
        // Un clic sur le fond rend tout le canevas : fin de la mise en avant, menu de carte fermé.
        onPaneClick={() => {
          const s = useCosmos.getState();
          if (s.spotlightId) s.setSpotlight(null);
          if (s.cardMenu) s.setCardMenu(null);
        }}
        // Clic droit sur une carte, hors de son texte (le menu du navigateur y reste, pour l'orthographe) : son menu.
        onNodeContextMenu={(event, node) => {
          if (node.type !== "card" || (event.target as HTMLElement).closest(".card-body, .card-title")) return;
          event.preventDefault();
          useCosmos.getState().setCardMenu(node.id);
        }}
        // Clic droit sur le canevas : nouvelle carte à cet endroit (le menu du navigateur reste sur les cartes).
        onPaneContextMenu={(event) => {
          event.preventDefault();
          createAt(event.clientX, event.clientY);
        }}
        onConnectEnd={(event) => {
          // Un fil vient d'être créé : on propose tout de suite de l'étiqueter.
          const all = useCosmos.getState().edges;
          if (all.length > edgeCountBeforeConnect.current) {
            const p = "changedTouches" in event ? event.changedTouches[0] : event;
            openLabelEditor(all[all.length - 1], p.clientX, p.clientY);
          }
        }}
        onEdgeDoubleClick={(e, edge) => {
          e.stopPropagation();
          openLabelEditor(edge, e.clientX, e.clientY);
        }}
        // Un clic (ou un appui) sur un fil ouvre son étiquette et le bouton « Délier ».
        onEdgeClick={(e, edge) => openLabelEditor(edge, e.clientX, e.clientY)}
        colorMode={theme}
        connectionMode={ConnectionMode.Loose}
        zoomOnDoubleClick={false}
        // Sélection multiple : Maj + glisser entoure (ou glisser seul en mode Sélection), Ctrl ou Cmd + clic ajoute.
        selectionOnDrag={selecting}
        panOnDrag={!selecting}
        selectionMode={SelectionMode.Partial}
        multiSelectionKeyCode={["Meta", "Control"]}
        deleteKeyCode={["Delete", "Backspace"]}
        minZoom={0.15}
        maxZoom={2}
        fitView
        fitViewOptions={{ padding: 0.3, maxZoom: 1 }}
        defaultEdgeOptions={{
          type: "floating",
          // Zone de toucher plus large autour du fil (20 px par défaut) : à l'index, le fil est trop fin.
          interactionWidth: 32,
          // Variables CSS : les fils suivent le mode clair/sombre.
          style: { stroke: "var(--edge)", strokeWidth: 1.6 },
          labelBgPadding: [8, 4],
          labelBgBorderRadius: 999,
          labelStyle: { fill: "var(--accent-ink)", fontWeight: 500, fontSize: 12 },
          labelBgStyle: { fill: "var(--surface)", stroke: "var(--line-2)" },
        }}
        proOptions={{ hideAttribution: false }}
      >
        <Background variant={BackgroundVariant.Dots} gap={22} size={1.2} />
        <Controls showInteractive={false} position="bottom-right" />
        <MiniMap
          position="top-right"
          pannable
          zoomable
          // Classe plutôt que couleur : la teinte vient du CSS (clair/sombre).
          nodeClassName={(n) => (n.type === "frame" ? "minimap-frame" : `minimap-node type-${(n.data as CardData).type}`)}
        />
      </ReactFlow>

      {labelEditor && (
        <div className="label-editor" style={{ left: labelEditor.x, top: labelEditor.y }}>
          <input
            autoFocus
            placeholder={t.toile.labelPlaceholder}
            aria-label={t.toile.labelAria}
            value={labelEditor.value}
            onChange={(e) => setLabelEditor({ ...labelEditor, value: e.target.value })}
            onBlur={commitLabel}
            onKeyDown={(e) => {
              if (e.key === "Enter") commitLabel();
              if (e.key === "Escape") setLabelEditor(null);
            }}
          />
          {/* Délier : le fil part (annulable). Le focus reste dans le champ jusqu'au clic. */}
          <button
            type="button"
            className="label-unlink"
            aria-label={t.toile.unlink}
            title={t.toile.unlink}
            onPointerDown={() => {
              unlinkPressed.current = true;
              setTimeout(() => (unlinkPressed.current = false), 1000);
            }}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => {
              unlinkPressed.current = false;
              useCosmos.getState().removeLink(labelEditor.edgeId);
              setLabelEditor(null);
            }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
              <path d="M9 7H7a5 5 0 0 0 0 10h2M15 7h2a5 5 0 0 1 3.5 8.5M8 12h3M4 4l16 16" />
            </svg>
            <span>{t.toile.unlinkShort}</span>
          </button>
        </div>
      )}

      {/* Une seule rangée en bas à gauche : « Nouvelle carte » puis les outils. Son menu s'ouvre au-dessus. */}
      <div className="canvas-dock">
      <NewCardMenu onCreate={createKind} />

      <div className="history-buttons">
        <button type="button" className="icon-button has-label" aria-label={t.toile.addFrame} title={t.toile.addFrameHint} aria-keyshortcuts="C" onClick={createFrame}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeDasharray="3 3.2" aria-hidden="true">
            <rect x="3.5" y="5" width="17" height="14" rx="2.5" />
          </svg>
          <span className="tool-label" aria-hidden="true">{t.toile.frameShort}</span>
        </button>
        <button type="button" className="icon-button has-label" aria-label={t.organize.button} title={t.organize.hint} onClick={() => useCosmos.getState().organizeCanvas()}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <rect x="3.5" y="3.5" width="7" height="7" rx="1.5" />
            <rect x="13.5" y="3.5" width="7" height="7" rx="1.5" />
            <rect x="3.5" y="13.5" width="7" height="7" rx="1.5" />
            <rect x="13.5" y="13.5" width="7" height="7" rx="1.5" />
          </svg>
          <span className="tool-label" aria-hidden="true">{t.organize.short}</span>
        </button>
        <CanvasFilterMenu />
        <button
          type="button"
          className={`icon-button has-label${selecting ? " is-on" : ""}`}
          aria-label={t.toile.select}
          aria-pressed={selecting}
          title={t.toile.selectHint}
          onClick={() => setSelecting(!selecting)}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M4 8V5.5A1.5 1.5 0 0 1 5.5 4H8M16 4h2.5A1.5 1.5 0 0 1 20 5.5V8M4 16v2.5A1.5 1.5 0 0 0 5.5 20H8" />
            <path d="M12 12l8.5 3-3.6 1.4L15.5 20z" />
          </svg>
          <span className="tool-label" aria-hidden="true">{t.toile.selectShort}</span>
        </button>
        <button type="button" className="icon-button" disabled={!canUndo} aria-label={t.toile.undo} title={t.toile.undoHint} onClick={undo}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M9 14L4 9l5-5" />
            <path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11" />
          </svg>
        </button>
        <button type="button" className="icon-button" disabled={!canRedo} aria-label={t.toile.redo} title={t.toile.redoHint} onClick={redo}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M15 14l5-5-5-5" />
            <path d="M20 9H9.5a5.5 5.5 0 0 0 0 11H13" />
          </svg>
        </button>
      </div>
      </div>

      {/* En haut du canevas, l'un sous l'autre : filtre actif, mise en avant, sélection multiple ou aide. */}
      <div className="canvas-top">
      {filterActive(filter) && (
        <div className="filter-banner" role="status">
          <span>{filterSummary}</span>
          <button type="button" className="ghost-button" onClick={() => useCosmos.getState().clearFilter()}>
            {t.filter.showAll}
          </button>
        </div>
      )}
      {spotlightId && <div className="toile-hint is-spotlight">{t.spotlight.hint}</div>}
      {/* Plusieurs cartes choisies : ce qu'on peut en faire d'un coup, aussi au doigt (pas de clavier). */}
      {selectedCards + selectedFrames > 1 && (
        <div className="selection-bar" role="toolbar" aria-label={t.toile.select}>
          <span className="selection-count" aria-live="polite">
            {selectedFrames > 0 ? fmt(t.toile.selectedCountFrames, { n: selectedCards, f: selectedFrames }) : fmt(t.toile.selectedCount, { n: selectedCards })}
          </span>
          {selectedCards > 0 && (
            <button type="button" className="ghost-button" title={t.toile.selectionFrameHint} onClick={createFrame}>
              {t.toile.selectionFrame}
            </button>
          )}
          {selectedCards > 0 && (
            <button
              type="button"
              className="ghost-button"
              title={t.toile.selectionTrashHint}
              onClick={() => {
                const s = useCosmos.getState();
                s.deleteCards(s.nodes.filter((n) => n.selected).map((n) => n.id));
              }}
            >
              {t.toile.selectionTrash}
            </button>
          )}
          <button
            type="button"
            className="ghost-button"
            onClick={() => {
              useCosmos.getState().clearSelection();
              setSelecting(false);
            }}
          >
            {t.toile.selectionClear}
          </button>
        </div>
      )}

      <div className="toile-hint" hidden={selectedCards + selectedFrames > 1 || !!spotlightId || filterActive(filter)}>
        {touch ? t.toile.hintTouch : t.toile.hintMouse} · {t.toile.hintLink} · <strong>/</strong> {t.toile.hintTransform}
      </div>
      </div>
    </div>
  );
}
