// Nœud TipTap `sceneImage` (lot 1 de #84, sceneImages.ts) : une image dans le texte d'une scène (éditeurs `prose` :
// manuscrit, carte Scène agrandie). Un bloc atome : le fichier est dans medias/, la description et la place sont
// des attributs. Choisie (clic, toucher, flèches), l'image montre sa description, sa place et « Retirer l'image ».
// Une image collée ou déposée dans le texte y entre aussi (copiée dans medias/ sous un nom neuf).

import { Node } from "@tiptap/react";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import type { EditorView } from "@tiptap/pm/view";
import type { Node as PMNode } from "@tiptap/pm/model";
import { SCENE_MARK } from "../bookDoc";
import { getT } from "../i18n";
import { IMAGE_PLACES, cleanAlt, isImagePlace, type ImagePlace } from "../sceneImages";
import { isMediaName } from "../media";
import { awaitTextImage, type TextImage } from "../textImageState";
import { loadMediaUrl } from "./useMediaUrl";
import { useCosmos } from "../store";

declare module "@tiptap/react" {
  interface Commands<ReturnType> {
    sceneImage: {
      /** Pose une image au curseur (un bloc à part), et sous elle le crédit d'une photo libre s'il y en a un. */
      insertSceneImage: (image: TextImage) => ReturnType;
    };
  }
}

/** Fichiers d'images d'un collage ou d'un dépôt. */
const imageFiles = (list: FileList | null | undefined): File[] => Array.from(list ?? []).filter((f) => f.type.startsWith("image/"));

/** Dans le livre, rien ne se pose avant le repère de la première scène : sinon l'image n'appartiendrait à aucune
 *  scène et ne serait jamais enregistrée. Rend la position, ramenée juste après ce repère si besoin. */
export function insideScene(doc: PMNode, pos: number): number {
  let offset = 0;
  for (let i = 0; i < doc.childCount; i++) {
    const child = doc.child(i);
    if (child.type.name === SCENE_MARK) return pos <= offset ? offset + child.nodeSize : pos;
    offset += child.nodeSize;
  }
  return pos;
}

/** Copie les fichiers dans medias/ et pose leurs images à la position donnée (sinon au curseur), dans l'ordre. */
async function addFiles(view: EditorView, files: File[], at?: number) {
  let pos = at;
  for (const file of files) {
    const data = new Uint8Array(await file.arrayBuffer());
    const media = await useCosmos.getState().storeTextImage({ name: file.name, data });
    if (!media || view.isDestroyed) continue;
    const node = view.state.schema.nodes.sceneImage.create({ media });
    const { doc, selection } = view.state;
    const target = pos !== undefined ? Math.min(pos, doc.content.size) : selection.from;
    const safe = insideScene(doc, target);
    const tr = pos === undefined && safe === target ? view.state.tr.replaceSelectionWith(node) : view.state.tr.insert(safe, node);
    if (pos !== undefined) pos = safe;
    view.dispatch(tr.scrollIntoView());
    if (pos !== undefined) pos += node.nodeSize;
  }
}

export const SceneImage = Node.create({
  name: "sceneImage",
  group: "block",
  atom: true,
  selectable: true,
  draggable: true,
  addAttributes() {
    return {
      media: {
        default: "",
        parseHTML: (el: HTMLElement) => (isMediaName(el.getAttribute("data-media")) ? el.getAttribute("data-media") : ""),
        renderHTML: (attrs: Record<string, unknown>) => ({ "data-media": String(attrs.media ?? "") }),
      },
      alt: {
        default: "",
        parseHTML: (el: HTMLElement) => cleanAlt(el.getAttribute("alt")),
        renderHTML: (attrs: Record<string, unknown>) => ({ alt: cleanAlt(attrs.alt) }),
      },
      place: {
        default: "inline",
        parseHTML: (el: HTMLElement) => {
          const p = el.getAttribute("data-place");
          return isImagePlace(p) ? p : "inline";
        },
        renderHTML: (attrs: Record<string, unknown>) => (isImagePlace(attrs.place) && attrs.place !== "inline" ? { "data-place": attrs.place } : {}),
      },
    };
  },
  parseHTML() {
    return [{ tag: "img[data-media]", getAttrs: (el) => (isMediaName((el as HTMLElement).getAttribute("data-media")) ? null : false) }];
  },
  renderHTML({ HTMLAttributes }) {
    return ["img", HTMLAttributes];
  },
  addCommands() {
    return {
      insertSceneImage:
        (image) =>
        ({ chain, editor }) => {
          if (!isMediaName(image.media)) return false;
          const content: Record<string, unknown>[] = [{ type: this.name, attrs: { media: image.media, alt: cleanAlt(image.alt ?? "") } }];
          if (image.credit) content.push({ type: "paragraph", content: [{ type: "text", text: image.credit, marks: [{ type: "italic" }] }] });
          const { doc, selection } = editor.state;
          const safe = insideScene(doc, selection.from);
          if (safe !== selection.from) return chain().insertContentAt(safe, content).scrollIntoView().run();
          return chain().insertContent(content).scrollIntoView().run();
        },
    };
  },
  addNodeView() {
    return ({ node, getPos, editor }) => {
      let current = node;
      const t = () => getT().textImage;
      const dom = document.createElement("figure");
      dom.className = "scene-image";
      dom.contentEditable = "false";
      const img = document.createElement("img");
      img.draggable = false;
      const missing = document.createElement("span");
      missing.className = "scene-image-missing";
      const bar = document.createElement("div");
      bar.className = "scene-image-bar";
      const altLabel = document.createElement("label");
      const altInput = document.createElement("input");
      altInput.type = "text";
      altInput.maxLength = 300;
      altLabel.append(altInput);
      const place = document.createElement("select");
      const remove = document.createElement("button");
      remove.type = "button";
      remove.className = "ghost-button scene-image-remove";
      bar.append(altLabel, place, remove);
      dom.append(img, missing, bar);

      const setAttrs = (patch: Record<string, unknown>) => {
        const pos = typeof getPos === "function" ? getPos() : undefined;
        if (pos === undefined) return;
        editor.view.dispatch(editor.view.state.tr.setNodeMarkup(pos, undefined, { ...current.attrs, ...patch }));
      };
      altInput.addEventListener("change", () => setAttrs({ alt: cleanAlt(altInput.value) }));
      altInput.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === "Escape") {
          e.preventDefault();
          setAttrs({ alt: cleanAlt(altInput.value) });
          editor.commands.focus();
        }
      });
      place.addEventListener("change", () => setAttrs({ place: isImagePlace(place.value) ? place.value : "inline" }));
      remove.addEventListener("click", () => {
        const pos = typeof getPos === "function" ? getPos() : undefined;
        if (pos === undefined) return;
        editor.chain().focus().deleteRange({ from: pos, to: pos + current.nodeSize }).run();
      });

      let shown = "";
      const render = () => {
        const a = current.attrs;
        const m = t();
        dom.dataset.place = String(a.place);
        img.alt = String(a.alt ?? "");
        altInput.placeholder = m.altPlaceholder;
        altInput.setAttribute("aria-label", m.altLabel);
        if (document.activeElement !== altInput) altInput.value = String(a.alt ?? "");
        place.setAttribute("aria-label", m.placeLabel);
        place.replaceChildren(
          ...IMAGE_PLACES.map((p: ImagePlace) => {
            const o = document.createElement("option");
            o.value = p;
            o.textContent = m.places[p];
            o.selected = p === a.place;
            return o;
          }),
        );
        remove.textContent = m.remove;
        const media = String(a.media);
        if (media === shown) return;
        shown = media;
        missing.textContent = "";
        dom.classList.add("is-loading");
        void loadMediaUrl(media).then((url) => {
          if (shown !== media) return;
          dom.classList.remove("is-loading");
          if (url) img.src = url;
          else missing.textContent = m.missing;
        });
      };
      render();

      return {
        dom,
        update: (next) => {
          if (next.type !== current.type) return false;
          current = next;
          render();
          return true;
        },
        selectNode: () => dom.classList.add("is-selected"),
        deselectNode: () => dom.classList.remove("is-selected"),
        // Les champs de la barre gardent leurs événements (frappe, clic) : ProseMirror ne s'en mêle pas.
        stopEvent: (event) => bar.contains(event.target as globalThis.Node),
        ignoreMutation: () => true,
      };
    };
  },
  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: new PluginKey("sceneImageFiles"),
        props: {
          handlePaste: (view, event) => {
            const files = imageFiles(event.clipboardData?.files);
            if (files.length === 0) return false;
            void addFiles(view, files);
            return true;
          },
          handleDrop: (view, event) => {
            const files = imageFiles((event as DragEvent).dataTransfer?.files);
            if (files.length === 0) return false;
            const at = view.posAtCoords({ left: (event as DragEvent).clientX, top: (event as DragEvent).clientY });
            event.preventDefault();
            const $at = at ? view.state.doc.resolve(at.pos) : null;
            void addFiles(view, files, $at ? ($at.depth >= 1 ? $at.after(1) : $at.pos) : undefined);
            return true;
          },
        },
      }),
    ];
  },
});

/**
 * « Insérer une image… » : l'éditeur attend l'image, la fenêtre Photos s'ouvre (photo libre, ou fichier de
 * l'appareil) ; l'image choisie est posée au curseur.
 */
export function requestTextImage(editor: import("@tiptap/react").Editor) {
  awaitTextImage((image) => {
    if (!editor.isDestroyed) editor.chain().focus().insertSceneImage(image).run();
  });
  useCosmos.getState().openPhotos({ kind: "text" });
}
