// « Grands exemples » sur la page des projets : la liste du site (examples.ts), chacun avec son image, sa ligne
// de présentation et sa taille. « Télécharger » le récupère, le vérifie et l'ouvre comme un projet importé.
// Rien n'est chargé tant que la page ne s'affiche pas ; sans connexion, un message et « Réessayer ».

import { useEffect, useId } from "react";
import { useCosmos } from "../store";
import { fmt, useT } from "../i18n";
import { useSettings } from "../settings";
import { storage } from "../storage";
import { currentVersion } from "../updates";
import { examplesFor, loadExamples, useExamples } from "../examples";

export function ExamplesPanel({ disabled }: { disabled: boolean }) {
  const t = useT();
  const h = t.home;
  const lang = useSettings((s) => s.lang);
  const { status, list, busy, error } = useExamples();
  const titleId = useId();

  useEffect(() => {
    void loadExamples();
  }, []);

  // Il faut pouvoir importer un .zip (pas dans le navigateur de développement).
  if (!storage.canImportZip) return null;
  const shown = examplesFor(list, lang, currentVersion);
  // Langue de l'interface d'abord ; s'il n'y en a aucun dans cette langue, tous sont montrés.
  const inLang = shown.filter((e) => e.lang === lang);
  const mine = inLang.length > 0 ? inLang : shown;
  const others = inLang.length > 0 ? shown.filter((e) => e.lang !== lang) : [];
  const mb = (bytes: number) => new Intl.NumberFormat(lang, { maximumFractionDigits: 1 }).format(bytes / 1_000_000);

  const row = (e: (typeof shown)[number]) => {
    const loading = busy?.id === e.id;
    return (
      <li key={e.id}>
        {e.cover ? <img className="home-example-cover" src={e.cover} alt="" loading="lazy" /> : <span className="home-example-cover" aria-hidden="true" />}
        <span className="home-example-text">
          <span className="home-project-title">{e.title}</span>
          <span className="home-project-meta">{[e.subtitle || t.kinds[e.kind], e.lang.toUpperCase(), fmt(h.exampleSize, { n: mb(e.size) })].filter(Boolean).join(" · ")}</span>
          {error?.id === e.id && (
            <span className="home-example-error" role="alert">
              {h.exampleErrors[error.reason]}
            </span>
          )}
        </span>
        <button
          type="button"
          className="ghost-button home-example-open"
          disabled={disabled || !!busy}
          aria-label={fmt(h.exampleOpenAria, { title: e.title })}
          onClick={() => void useCosmos.getState().openExample(e)}
        >
          {loading ? (busy.share >= 1 ? h.exampleChecking : fmt(h.exampleProgress, { n: Math.round(busy.share * 100) })) : h.exampleOpen}
        </button>
      </li>
    );
  };

  return (
    <section className="home-panel home-examples" aria-labelledby={titleId}>
      <h2 id={titleId}>{h.examplesTitle}</h2>
      <p className="sp-empty">
        {h.examplesHint}
        {storage.canPickFolder && <> {h.examplesHintPc}</>}
      </p>
      {status === "loading" && <p className="settings-hint">{h.examplesLoading}</p>}
      {status === "offline" && (
        <p className="settings-hint" role="status">
          {h.examplesOffline}{" "}
          <button
            type="button"
            className="link-button"
            onClick={() => {
              useExamples.setState({ status: "idle" });
              void loadExamples();
            }}
          >
            {h.examplesRetry}
          </button>
        </p>
      )}
      {status === "ready" && shown.length === 0 && <p className="settings-hint">{h.examplesNone}</p>}
      {mine.length > 0 && <ul className="home-example-list">{mine.map(row)}</ul>}
      {/* Les exemples dans une autre langue : repliés, pour garder la page courte. */}
      {others.length > 0 && (
        <details className="home-hidden">
          <summary>{fmt(h.examplesOther, { n: others.length })}</summary>
          <ul className="home-example-list">{others.map(row)}</ul>
        </details>
      )}
    </section>
  );
}
