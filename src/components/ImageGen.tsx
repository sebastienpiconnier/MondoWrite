// Images de référence générées (1.10.0), en mode Atelier seulement (ai/imageGen.ts) :
// - `useImageGen` : l'Atelier est actif et le service branché génère des images ;
// - `ImageGenButton` : « Générer une image » (fenêtre Photos, galerie d'une fiche) ;
// - `ImageGenUnavailable` : la phrase qui dit que ce service n'en génère pas ;
// - `ImageGenPanel` : description préremplie (sans noms propres), nombre d'images, « Générer », « Annuler »,
//   images proposées et « Garder » (rien n'entre sans ce clic) ;
// - `ImageModelField` : modèle d'image dans les Réglages (réglage de l'appareil, facultatif) ;
// - `IaImageBadge` : repère « IA » d'une image générée gardée (galerie) ; `IaImageStats` : leur nombre (Statistiques).

import { useEffect, useMemo, useRef, useState } from "react";
import { useCosmos } from "../store";
import { aiConfig, useSettings } from "../settings";
import { fmt, useT } from "../i18n";
import { AiError, aiErrorText, isReady, type AiProvider } from "../ai/providers";
import type { CardData } from "../types";
import {
  DEFAULT_IMAGE_MODELS,
  IMAGE_MAX,
  canGenerateImages,
  describeCard,
  generateImages,
  iaImageCount,
  iaImagesOf,
  imageModelOf,
  imagePrompt,
  properNames,
  readIaImageSource,
  stripNames,
  subjectOf,
  type GeneratedImage,
} from "../ai/imageGen";

/** L'Atelier est actif pour ce projet (IA prête), et le service génère-t-il des images ? */
export function useImageGen() {
  const mode = useCosmos((s) => s.aiMode);
  const ai = useSettings((s) => s.ai);
  const config = useMemo(() => aiConfig(ai), [ai]);
  const atelier = mode === "atelier" && isReady(config);
  const provider = config?.provider ?? null;
  return { atelier, provider, ready: atelier && canGenerateImages(provider), config, model: canGenerateImages(provider) ? imageModelOf(provider, ai.imageModels?.[provider]) : "" };
}

/** « Ollama ne génère pas d'images… » : la fonction est absente pour ce service. */
export function ImageGenUnavailable({ provider }: { provider: AiProvider | null }) {
  const t = useT();
  if (!provider || canGenerateImages(provider)) return null;
  return <p className="settings-hint image-gen-unavailable">{fmt(t.imageGen.unavailable, { service: t.ai.providers[provider] ?? provider })}</p>;
}

/** Bouton « Générer une image » pour une cible de la fenêtre Photos (rien si l'Atelier ou le service ne le permet pas). */
export function ImageGenButton({ target, className = "ghost-button", onOpen }: { target: NonNullable<ReturnType<typeof useCosmos.getState>["photoTarget"]>; className?: string; onOpen?: () => void }) {
  const t = useT();
  const { ready } = useImageGen();
  if (!ready) return null;
  return (
    <button type="button" className={`${className} image-gen-button`} onClick={() => (onOpen ? onOpen() : useCosmos.getState().openImageGen(target))}>
      <span aria-hidden="true">✦</span> {t.imageGen.generate}
    </button>
  );
}

interface Proposal {
  image: GeneratedImage;
  url: string;
  size?: { w: number; h: number };
}

/** Panneau de génération, dans la fenêtre Photos. */
export function ImageGenPanel({ onBack }: { onBack: () => void }) {
  const t = useT();
  const g = t.imageGen;
  const { ready, config, model } = useImageGen();
  const target = useCosmos((s) => s.photoTarget);
  const card = useCosmos((s) => (target && target.kind !== "canvas" ? s.nodes.find((n) => n.id === target.id)?.data : undefined));
  const nodes = useCosmos((s) => s.nodes);
  const profile = useSettings((s) => s.profile);
  // Noms propres connus : cartes du projet et nom de l'auteur (une personne réelle). Jamais envoyés.
  const names = useMemo(
    () => properNames(nodes.map((n) => n.data), [`${profile.firstName} ${profile.lastName}`, profile.penName].map((s) => s.trim()).filter(Boolean)),
    [nodes, profile],
  );
  const subject = subjectOf(card?.type ?? "image");
  const labels = useMemo<Record<string, string>>(() => ({ ...t.fiche.fields, ...t.character.fields }), [t]);
  const [description, setDescription] = useState(() => (card ? stripNames(describeCard(card, labels, g.fieldSep), names) : ""));
  const [count, setCount] = useState(2);
  const [busy, setBusy] = useState<"" | "generate" | "keep">("");
  const [error, setError] = useState("");
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const abort = useRef<AbortController | null>(null);
  const urls = useRef<string[]>([]);
  // Les adresses blob: des images proposées sont rendues quand la fenêtre se ferme, et la requête arrêtée.
  useEffect(
    () => () => {
      abort.current?.abort();
      urls.current.forEach((u) => URL.revokeObjectURL(u));
    },
    [],
  );

  const clear = () => {
    urls.current.forEach((u) => URL.revokeObjectURL(u));
    urls.current = [];
    setProposals([]);
  };

  const run = async () => {
    if (!ready || !config || busy) return;
    if (!description.trim()) {
      setError(g.noDescription);
      return;
    }
    const controller = new AbortController();
    abort.current = controller;
    setBusy("generate");
    setError("");
    clear();
    try {
      const images = await generateImages(config, model, imagePrompt(subject, description, names), count, subject, controller.signal);
      const next = images.map((image) => {
        const url = URL.createObjectURL(new Blob([image.data as BlobPart], { type: image.mime }));
        urls.current.push(url);
        return { image, url };
      });
      setProposals(next);
    } catch (err) {
      console.error(err);
      if (!(err instanceof AiError && err.code === "cancelled")) setError(aiErrorText(err, { ...t.ai.errors, model: g.modelError }));
    } finally {
      setBusy("");
      if (abort.current === controller) abort.current = null;
    }
  };

  const keep = async (p: Proposal) => {
    if (busy || !config) return;
    setBusy("keep");
    setError("");
    const detail = p.size ? fmt(g.size, { w: p.size.w, h: p.size.h }) : "";
    const ok = await useCosmos.getState().keepGeneratedImage(p.image, { provider: config.provider, model, detail, title: description.split("\n")[0] });
    setBusy("");
    if (ok) useCosmos.getState().setDialog(null);
    else setError(g.saveFailed);
  };

  if (!ready) return null;
  return (
    <div className="image-gen">
      <p className="settings-hint">{g.generateHint}</p>
      <form
        className="image-gen-form"
        onSubmit={(e) => {
          e.preventDefault();
          void run();
        }}
      >
        <label htmlFor="image-gen-description">{g.descriptionLabel}</label>
        <textarea
          id="image-gen-description"
          rows={5}
          value={description}
          placeholder={g.descriptionPlaceholder}
          aria-describedby="image-gen-description-hint"
          onChange={(e) => setDescription(e.target.value)}
          onKeyDown={(e) => {
            // Cmd/Ctrl + Entrée lance la génération (Entrée seule va à la ligne).
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              void run();
            }
          }}
        />
        <p className="settings-hint" id="image-gen-description-hint">
          {g.descriptionHint}
        </p>
        <div className="image-gen-row">
          <div className="photos-sources image-gen-count" role="group" aria-label={g.countLabel}>
            {Array.from({ length: IMAGE_MAX }, (_, i) => i + 1).map((n) => (
              <button key={n} type="button" aria-pressed={n === count} aria-label={n === 1 ? g.countOne : fmt(g.countOption, { n })} className={n === count ? "is-on" : ""} disabled={busy !== ""} onClick={() => setCount(n)}>
                {n}
              </button>
            ))}
          </div>
          <button type="submit" className="ghost-button is-primary image-gen-run" disabled={busy !== ""}>
            {busy === "generate" ? g.running : g.run}
          </button>
          {busy === "generate" && (
            <button type="button" className="ghost-button" onClick={() => abort.current?.abort()}>
              {t.ai.cancel}
            </button>
          )}
        </div>
      </form>
      <p className="settings-hint" role="status">
        {busy === "generate" ? g.running : busy === "keep" ? t.photos.adding : ""}
      </p>
      {error && (
        <p className="photos-error" role="alert">
          {error}
        </p>
      )}
      {proposals.length > 0 && (
        <>
          <p>{g.proposals}</p>
          <ul className="photos-grid image-gen-grid">
            {proposals.map((p, i) => (
              <li key={p.url}>
                <img
                  className="image-gen-image"
                  src={p.url}
                  alt={fmt(g.imageAlt, { n: i + 1 })}
                  draggable={false}
                  onLoad={(e) => {
                    const { naturalWidth: w, naturalHeight: h } = e.currentTarget;
                    setProposals((list) => list.map((o) => (o.url === p.url ? { ...o, size: { w, h } } : o)));
                  }}
                />
                <button type="button" className="ghost-button is-primary" disabled={busy !== ""} aria-label={fmt(g.keepAria, { n: i + 1 })} onClick={() => void keep(p)}>
                  {g.keep}
                </button>
              </li>
            ))}
          </ul>
          <button type="button" className="link-button" disabled={busy !== ""} onClick={clear}>
            {g.none}
          </button>
        </>
      )}
      <div className="photos-foot">
        <button type="button" className="link-button" disabled={busy !== ""} onClick={onBack}>
          {g.back}
        </button>
      </div>
    </div>
  );
}

/** Réglages : modèle d'image du service (facultatif), ou la phrase qui dit que le service n'en génère pas. */
export function ImageModelField({ provider }: { provider: AiProvider | null }) {
  const t = useT();
  const ai = useSettings((s) => s.ai);
  if (!provider) return null;
  if (!canGenerateImages(provider)) return <ImageGenUnavailable provider={provider} />;
  const value = ai.imageModels?.[provider] ?? "";
  return (
    <>
      <label htmlFor="ai-image-model">{t.imageGen.modelLabel}</label>
      <input
        id="ai-image-model"
        type="text"
        value={value}
        placeholder={DEFAULT_IMAGE_MODELS[provider]}
        aria-describedby="ai-image-model-hint"
        autoComplete="off"
        spellCheck={false}
        onChange={(e) => {
          const now = useSettings.getState().ai;
          useSettings.getState().setAi({ ...now, imageModels: { ...now.imageModels, [provider]: e.target.value } });
        }}
      />
      <p className="settings-hint" id="ai-image-model-hint">
        {fmt(t.imageGen.modelHint, { model: DEFAULT_IMAGE_MODELS[provider] })}
      </p>
    </>
  );
}

/** Repère « IA » posé sur la vignette d'une image générée gardée (le service et le modèle dans son nom). */
export function IaImageBadge({ card, name }: { card: CardData; name: string }) {
  const t = useT();
  const source = iaImagesOf(card)?.[name];
  if (!source) return null;
  const label = fmt(t.imageGen.badgeAria, { source: readIaImageSource(source, t.ai.providers) });
  return (
    <span className="ia-image-badge" role="img" aria-label={label} title={label}>
      {t.imageGen.badge}
    </span>
  );
}

/** Crédit d'une image générée gardée, sous l'image agrandie. */
export function IaImageCredit({ card, name }: { card: CardData; name: string }) {
  const t = useT();
  const source = iaImagesOf(card)?.[name];
  if (!source) return null;
  return <p className="ia-image-credit">{fmt(t.imageGen.credit, { source: readIaImageSource(source, t.ai.providers) })}</p>;
}

/** Fenêtre Statistiques : nombre d'images générées que le projet garde encore. */
export function IaImageStats() {
  const t = useT();
  const nodes = useCosmos((s) => s.nodes);
  const n = useMemo(() => iaImageCount(nodes.map((node) => node.data)), [nodes]);
  if (n === 0) return null;
  return <p>{fmt(t.imageGen.stats, { n })}</p>;
}
