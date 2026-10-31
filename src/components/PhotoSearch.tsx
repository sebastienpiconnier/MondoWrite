// Recherche de photos libres, dans la fenêtre commune (<dialog>, Échap ferme). Trois sources au choix
// (Openverse sans clé, Pixabay et Unsplash avec la clé de l'auteur, gardée sur l'appareil). Une source à clé
// sans clé explique comment en obtenir une. Les résultats sont une grille de vrais boutons (souris, doigt,
// clavier) ; la photo choisie devient une carte Image créditée, ou rejoint une galerie.

import { useEffect, useState } from "react";
import { useCosmos } from "../store";
import { useSettings } from "../settings";
import { fmt, useT } from "../i18n";
import { openExternal } from "../platform";
import { PHOTO_SOURCES, SOURCE_INFO, type Photo, type PhotoError, type PhotoSourceId } from "../imageSources";
import { ImageGenButton, ImageGenPanel, ImageGenUnavailable, useImageGen } from "./ImageGen";

const host = (url: string) => new URL(url).hostname.replace(/^www\./, "");

export function PhotoSearch() {
  const t = useT().photos;
  const tg = useT().imageGen;
  const source = useSettings((s) => s.photos.source);
  const keys = useSettings((s) => s.photos.keys);
  const key = source === "openverse" ? "" : keys[source];
  const info = SOURCE_INFO[source];
  const [draftKey, setDraftKey] = useState("");
  const [editingKey, setEditingKey] = useState(false);
  const [query, setQuery] = useState("");
  const [asked, setAsked] = useState("");
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [more, setMore] = useState(false);
  const [busy, setBusy] = useState<"" | "search" | "add">("");
  const [error, setError] = useState("");

  const errorText = (e: unknown) => {
    const code = (e instanceof Error ? e.message : "network") as PhotoError;
    const vars = { source: info.name };
    return fmt(code === "key" ? t.errorKey : code === "limit" ? t.errorLimit : t.errorNetwork, vars);
  };

  const run = async (from: PhotoSourceId, q: string, n: number) => {
    const k = from === "openverse" ? "" : useSettings.getState().photos.keys[from];
    if (!q.trim() || busy || (SOURCE_INFO[from].needsKey && !k)) return;
    setBusy("search");
    setError("");
    try {
      const { searchPhotos } = await import("../imageSources");
      const result = await searchPhotos(from, k, q, n, useSettings.getState().lang);
      setPhotos((before) => (n === 1 ? result.photos : [...before, ...result.photos.filter((p) => !before.some((o) => o.id === p.id))]));
      setTotal(result.total);
      setMore(result.more);
      setPage(n);
      setAsked(q.trim());
    } catch (e) {
      if (n === 1) setPhotos([]);
      setError(errorText(e));
      if (e instanceof Error && e.message === "key") setEditingKey(true);
    } finally {
      setBusy("");
    }
  };

  // Changer de source relance la même recherche ailleurs (si la source est prête).
  const choose = (next: PhotoSourceId) => {
    if (next === source || busy) return;
    useSettings.getState().setPhotoSource(next);
    setError("");
    setEditingKey(false);
    setPhotos([]);
    setMore(false);
    setAsked("");
    if (query.trim()) void run(next, query, 1);
  };

  const pick = async (photo: Photo) => {
    if (busy) return;
    setBusy("add");
    setError("");
    const ok = await useCosmos.getState().addPhoto(photo);
    setBusy("");
    if (ok) useCosmos.getState().setDialog(null);
    else setError(t.errorDownload);
  };

  // Nouvelle carte Image, image d'une carte ou galerie d'une fiche : un fichier de l'appareil reste possible.
  const target = useCosmos((st) => st.photoTarget);
  // Mode Atelier (1.10.0) : « Générer une image » à côté des sources libres. Ouverte par la galerie sur ce mode.
  const gen = useImageGen();
  const [generating, setGenerating] = useState(() => useCosmos.getState().photoGenerate);
  useEffect(() => {
    if (useCosmos.getState().photoGenerate) useCosmos.setState({ photoGenerate: false });
  }, []);
  const fromDevice =
    target ? (
      <button
        type="button"
        className="ghost-button photos-device"
        disabled={busy !== ""}
        onClick={() => {
          useCosmos.getState().setDialog(null);
          if (target.kind === "card") void useCosmos.getState().pickCardImage(target.id);
          else if (target.kind === "canvas") void useCosmos.getState().pickImageCard(target.at);
          else void useCosmos.getState().addGalleryImages(target.id);
        }}
      >
        {target.kind === "gallery" ? t.fromDeviceMany : t.fromDevice}
      </button>
    ) : null;

  const sources = (
    <div className="photos-sources" role="group" aria-label={t.sourceLabel}>
      {PHOTO_SOURCES.map((s) => (
        <button key={s} type="button" aria-pressed={s === source} className={s === source ? "is-on" : ""} disabled={busy !== ""} onClick={() => choose(s)}>
          {SOURCE_INFO[s].name}
        </button>
      ))}
    </div>
  );

  const needKey = info.needsKey && (!key || editingKey);

  if (generating && gen.ready) {
    const g = useCosmos.getState().photoTarget?.kind;
    return (
      <div className="photos">
        <div className="photos-head">
          <h2 id="app-dialog-title">{g === "card" ? tg.titleCard : g === "gallery" ? tg.titleGallery : tg.title}</h2>
        </div>
        <ImageGenPanel onBack={() => setGenerating(false)} />
      </div>
    );
  }

  return (
    <div className="photos">
      <div className="photos-head">
        <h2 id="app-dialog-title">{target?.kind === "card" ? t.titleCard : target?.kind === "gallery" ? t.titleGallery : t.title}</h2>
        {fromDevice}
      </div>
      {sources}
      {target && gen.ready && (
        <div className="image-gen-entry">
          <ImageGenButton target={target} onOpen={() => setGenerating(true)} />
        </div>
      )}
      {gen.atelier && <ImageGenUnavailable provider={gen.provider} />}
      <p className="settings-hint">{t.about[source]}</p>
      {needKey && source !== "openverse" ? (
        <>
          <h3 className="photos-key-title">{fmt(t.keyTitle, { source: info.name })}</h3>
          <p>{t.keyIntro[source]}</p>
          <button type="button" className="link-button" onClick={() => void openExternal(info.keyPage!)}>
            ↗ {fmt(t.keyGet, { site: host(info.keyPage!) })}
          </button>
          <form
            className="photos-key"
            onSubmit={(e) => {
              e.preventDefault();
              if (!draftKey.trim()) return;
              useSettings.getState().setPhotoKey(source, draftKey);
              setDraftKey("");
              setEditingKey(false);
              setError("");
              if (query.trim()) void run(source, query, 1);
            }}
          >
            <label htmlFor="photos-key">{fmt(t.keyLabel, { source: info.name })}</label>
            <input id="photos-key" type="password" autoComplete="off" spellCheck={false} value={draftKey} onChange={(e) => setDraftKey(e.target.value)} />
            <button type="submit" className="ghost-button" disabled={!draftKey.trim()}>
              {t.keySave}
            </button>
          </form>
          {error && <p className="photos-error" role="alert">{error}</p>}
          <button type="button" className="link-button" onClick={() => choose("openverse")}>
            {t.keyLater}
          </button>
        </>
      ) : (
        <>
          <form
            className="photos-search"
            role="search"
            onSubmit={(e) => {
              e.preventDefault();
              void run(source, query, 1);
            }}
          >
            <label className="sr-only" htmlFor="photos-query">
              {t.queryLabel}
            </label>
            <input id="photos-query" type="search" autoFocus value={query} placeholder={t.queryPlaceholder} onChange={(e) => setQuery(e.target.value)} />
            <button type="submit" className="ghost-button" disabled={!query.trim() || busy !== ""}>
              {busy === "search" ? t.searching : t.search}
            </button>
          </form>
          <p className="settings-hint" role="status">
            {busy === "add" ? t.adding : error ? "" : asked ? (photos.length === 0 ? t.noResult : fmt(t.results, { n: total.toLocaleString(useSettings.getState().lang) })) : ""}
          </p>
          {error && <p className="photos-error" role="alert">{error}</p>}
          {photos.length > 0 && (
            <ul className="photos-grid">
              {photos.map((p) => (
                <li key={p.id}>
                  <button type="button" className="photos-photo" disabled={busy !== ""} onClick={() => void pick(p)} aria-label={fmt(t.pick, { alt: p.alt || fmt(t.photoBy, { name: p.author || info.name }) })}>
                    <img src={p.thumb} alt="" loading="lazy" draggable={false} referrerPolicy="no-referrer" />
                  </button>
                  {(p.author || p.credit !== info.name) && <span className="photos-by">{[p.author && fmt(t.by, { name: p.author }), p.credit !== info.name && p.credit].filter(Boolean).join(" · ")}</span>}
                </li>
              ))}
            </ul>
          )}
          {more && (
            <button type="button" className="ghost-button photos-more" disabled={busy !== ""} onClick={() => void run(source, asked, page + 1)}>
              {t.more}
            </button>
          )}
          <div className="photos-foot">
            <button type="button" className="link-button" onClick={() => void openExternal(info.site)}>
              {fmt(t.credit, { source: info.name })}
            </button>
            {info.needsKey && (
              <button type="button" className="link-button" onClick={() => setEditingKey(true)}>
                {t.keyChange}
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}
