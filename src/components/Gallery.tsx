// Galerie d'une fiche de la Bible (idée reprise de la Bible du fork de NEO) : l'image principale et les
// photos supplémentaires d'un personnage ou d'un lieu. On ajoute par le bouton ou en déposant des images ;
// une photo s'agrandit d'un clic, devient l'image principale (le portrait) ou quitte la galerie.
// Pour un lieu, si une IA est branchée et que l'auteur le demande, l'IA relève en notes ce que montre la
// photo ; ces notes sont proposées, l'auteur les ajoute à la fiche ou les ignore.

import { useEffect, useMemo, useRef, useState } from "react";
import { useCosmos } from "../store";
import { aiConfig, useSettings } from "../settings";
import { fmt, useT } from "../i18n";
import type { CardData } from "../types";
import { useMediaUrl } from "./useMediaUrl";
import { imageExtension } from "../media";
import { storage } from "../storage";
import { AiError, PROVIDERS, complete, isReady } from "../ai/providers";
import { describePlacePrompt, parseNotes } from "../ai/tasks";
import { imageForAi } from "../ai/image";

const escape = (text: string) => text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

function Thumb({ name, alt, onOpen }: { name: string; alt: string; onOpen: () => void }) {
  const url = useMediaUrl(name);
  return (
    <button type="button" className="gallery-thumb" aria-label={alt} onClick={onOpen}>
      {url && <img src={url} alt="" />}
    </button>
  );
}

export function Gallery({ card }: { card: CardData }) {
  const all = useT();
  const g = all.gallery;
  const addGalleryImages = useCosmos((s) => s.addGalleryImages);
  const removeGalleryImage = useCosmos((s) => s.removeGalleryImage);
  const useAsMainImage = useCosmos((s) => s.useAsMainImage);
  const updateCard = useCosmos((s) => s.updateCard);
  const aiSettings = useSettings((s) => s.ai);
  const config = useMemo(() => aiConfig(aiSettings), [aiSettings]);
  const lang = useSettings((s) => s.lang);
  const name = card.title.trim() || all.bible.untitled;

  const photos = [...(card.image ? [card.image] : []), ...(card.images ?? [])];
  const [open, setOpen] = useState<string | null>(null);
  const [over, setOver] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notes, setNotes] = useState<string[] | null>(null);
  const [error, setError] = useState("");
  const dialogRef = useRef<HTMLDialogElement>(null);
  const openUrl = useMediaUrl(open ?? undefined);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal?.();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  const canDescribe = card.type === "lieu" && isReady(config);
  const describe = async (photo: string) => {
    if (!isReady(config) || busy) return;
    setBusy(true);
    setError("");
    setNotes(null);
    try {
      const url = await storage.mediaUrl(photo);
      if (!url) throw new AiError("other");
      const image = await imageForAi(url);
      const prompt = describePlacePrompt(card, lang);
      const lines = parseNotes(await complete(config, prompt.system, prompt.user, { maxTokens: 600, images: [image] }));
      if (lines.length === 0) throw new AiError("empty");
      setNotes(lines);
      setOpen(null);
    } catch (err) {
      console.error(err);
      // Erreur de modèle : le plus souvent, il ne lit pas les images.
      const code = err instanceof AiError ? err.code : "other";
      setError(code === "model" ? g.visionModel : all.ai.errors[code]);
    } finally {
      setBusy(false);
    }
  };

  const keepNotes = () => {
    if (!notes) return;
    const current = useCosmos.getState().nodes.find((n) => n.id === card.id)?.data.html ?? "";
    const added = `<h3>${escape(g.notesHeading)}</h3><ul>${notes.map((n) => `<li><p>${escape(n)}</p></li>`).join("")}</ul>`;
    updateCard(card.id, { html: `${current === "<p></p>" ? "" : current}${added}` });
    setNotes(null);
  };

  return (
    <section
      className={`gallery${over ? " is-over" : ""}${photos.length === 0 ? " is-empty" : ""}`}
      aria-label={fmt(g.aria, { name })}
      onDragOver={(e) => {
        if (!e.dataTransfer.types.includes("Files")) return;
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={async (e) => {
        e.preventDefault();
        setOver(false);
        const files = [...e.dataTransfer.files].filter((f) => imageExtension(f.name));
        if (files.length > 0) await addGalleryImages(card.id, await Promise.all(files.map(async (f) => ({ name: f.name, data: new Uint8Array(await f.arrayBuffer()) }))));
      }}
    >
      <div className="gallery-row">
        {photos.map((photo, i) => (
          <Thumb key={photo} name={photo} alt={fmt(g.photoAlt, { n: i + 1, name })} onOpen={() => setOpen(photo)} />
        ))}
        {/* Un seul bouton : la fenêtre Photos propose les photos libres (Openverse, Pixabay, Unsplash) et un
            fichier de l'appareil. La première photo ajoutée devient l'image principale. */}
        <button type="button" className="gallery-add" title={photos.length === 0 ? g.hint : undefined} onClick={() => useCosmos.getState().openPhotos({ kind: "gallery", id: card.id })}>
          <span aria-hidden="true">+</span>
          {g.add}
        </button>
      </div>
      {canDescribe && photos.length > 0 && !notes && <p className="gallery-hint">{PROVIDERS[config!.provider].local ? g.describeHintLocal : g.describeHintCloud}</p>}

      {notes && (
        <div className="assistant-panel synthesis" role="group" aria-label={g.notesHeading}>
          <p className="assistant-hint">{g.notesProposal}</p>
          <ul className="synthesis-text">
            {notes.map((n, i) => (
              <li key={i}>{n}</li>
            ))}
          </ul>
          <div className="assistant-actions">
            <button type="button" className="is-primary" onClick={keepNotes}>
              {g.notesKeep}
            </button>
            <button type="button" onClick={() => setNotes(null)}>
              {all.ai.ignore}
            </button>
          </div>
        </div>
      )}
      {error && (
        <p className="ai-error" role="alert">
          {error}
        </p>
      )}

      <dialog ref={dialogRef} className="gallery-dialog" aria-label={name} onClose={() => setOpen(null)}>
        {open && openUrl && <img src={openUrl} alt={fmt(g.photoAlt, { n: photos.indexOf(open) + 1, name })} />}
        <div className="assistant-actions">
          {open && open !== card.image && (
            <button type="button" onClick={() => useAsMainImage(card.id, open)}>
              {card.type === "personnage" ? g.useAsPortrait : g.useAsMain}
            </button>
          )}
          {canDescribe && open && (
            <button type="button" className="is-primary" disabled={busy} onClick={() => void describe(open)}>
              {busy ? all.ai.working : g.describe}
            </button>
          )}
          {open && (
            <button
              type="button"
              onClick={() => {
                if (open === card.image) updateCard(card.id, { image: undefined });
                else removeGalleryImage(card.id, open);
                setOpen(null);
              }}
            >
              {g.remove}
            </button>
          )}
          <button type="button" onClick={() => setOpen(null)}>
            {g.close}
          </button>
        </div>
      </dialog>
    </section>
  );
}
