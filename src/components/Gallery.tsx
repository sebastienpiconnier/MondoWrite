// Galerie d'une fiche de la Bible (idée reprise de la Bible du fork de NEO) : l'image principale et les
// photos supplémentaires d'un personnage ou d'un lieu. On ajoute par le bouton ou en déposant des images ;
// une photo s'agrandit d'un clic, devient l'image principale (le portrait) ou quitte la galerie.
// Si une IA est branchée et que l'auteur le demande, l'IA décrit une photo : pour un lieu ou toute autre
// carte, des notes sur ce qu'elle montre ; pour un personnage, l'âge apparent et l'apparence pour sa fiche
// (à accepter un par un) et quelques notes. Rien n'entre dans la fiche sans un clic de l'auteur.

import { useEffect, useMemo, useRef, useState } from "react";
import { useCosmos } from "../store";
import { aiConfig, useSettings } from "../settings";
import { fmt, useT } from "../i18n";
import type { CardData } from "../types";
import { useMediaUrl } from "./useMediaUrl";
import { imageExtension } from "../media";
import { storage } from "../storage";
import { AiError, PROVIDERS, aiErrorText, complete, isLoopback, isReady } from "../ai/providers";
import { describeCharacterPrompt, describeImagePrompt, describePlacePrompt, parseCharacterPhoto, parseNotes, type PhotoField } from "../ai/tasks";
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
  // Personnage : champs de la fiche proposés d'après la photo, en attente d'un oui ou d'un non.
  const [fields, setFields] = useState<Partial<Record<PhotoField, string>> | null>(null);
  const setFiche = useCosmos((s) => s.setFiche);
  const [error, setError] = useState("");
  const dialogRef = useRef<HTMLDialogElement>(null);
  const openUrl = useMediaUrl(open ?? undefined);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal?.();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  const character = card.type === "personnage";
  const canDescribe = isReady(config);
  const describe = async (photo: string) => {
    if (!isReady(config) || busy) return;
    setBusy(true);
    setError("");
    setNotes(null);
    setFields(null);
    try {
      const url = await storage.mediaUrl(photo);
      if (!url) throw new AiError("other");
      const image = await imageForAi(url);
      if (character) {
        const prompt = describeCharacterPrompt(card, lang);
        const found = parseCharacterPhoto(await complete(config, prompt.system, prompt.user, { maxTokens: 700, images: [image], json: true }));
        if (Object.keys(found.fields).length === 0 && found.notes.length === 0) throw new AiError("empty");
        setFields(Object.keys(found.fields).length > 0 ? found.fields : null);
        setNotes(found.notes.length > 0 ? found.notes : null);
      } else {
        const prompt = card.type === "lieu" ? describePlacePrompt(card, lang) : describeImagePrompt(card, lang);
        const lines = parseNotes(await complete(config, prompt.system, prompt.user, { maxTokens: 600, images: [image] }));
        if (lines.length === 0) throw new AiError("empty");
        setNotes(lines);
      }
      setOpen(null);
    } catch (err) {
      console.error(err);
      // Erreur de modèle : le plus souvent, il ne lit pas les images.
      setError(aiErrorText(err, { ...all.ai.errors, model: g.visionModel }));
    } finally {
      setBusy(false);
    }
  };

  // Un champ proposé : il remplit la fiche (ou remplace ce qui y était), sur le clic de l'auteur seulement.
  const settle = (key: PhotoField, keep: boolean) => {
    if (keep && fields?.[key]) setFiche(card.id, key, fields[key]!);
    const rest = { ...fields };
    delete rest[key];
    setFields(Object.keys(rest).length > 0 ? rest : null);
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
      {canDescribe && photos.length > 0 && !notes && !fields && (
        <p className="gallery-hint">
          {character ? g.describeHintCharacter : g.describeHint} {PROVIDERS[config!.provider].local && isLoopback(config!.url) ? g.describeLocal : g.describeCloud}
        </p>
      )}

      {fields && (
        <div className="assistant-panel synthesis" role="group" aria-label={g.fieldsHeading}>
          <p className="assistant-hint">{g.fieldsProposal}</p>
          <dl className="photo-fields">
            {(Object.keys(fields) as PhotoField[]).map((key) => {
              const current = card.fiche?.[key]?.trim();
              return (
                <div key={key} className="photo-field">
                  <dt>{all.character.fields[key]}</dt>
                  <dd>
                    <p>{fields[key]}</p>
                    {current && <p className="photo-field-current">{fmt(g.fieldCurrent, { value: current })}</p>}
                    <div className="assistant-actions">
                      <button type="button" className="is-primary" onClick={() => settle(key, true)}>
                        {current ? g.fieldReplace : g.fieldAdd}
                      </button>
                      <button type="button" onClick={() => settle(key, false)}>
                        {all.ai.ignore}
                      </button>
                    </div>
                  </dd>
                </div>
              );
            })}
          </dl>
        </div>
      )}

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
