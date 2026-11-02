// Fenêtre « Versions de la scène » (1.13.0, `docs/plan-versions-scene.md`) : garder le texte du moment (titre
// facultatif), lire une version gardée, la comparer au texte actuel ou à une autre version, y revenir. Les versions
// sont lues à l'ouverture de la fenêtre, jamais à l'ouverture du projet. Rien n'est effacé sans le menu ⋯, et une
// suppression s'annule tant que le message est là.

import { useEffect, useMemo, useRef, useState } from "react";
import { useCosmos } from "../store";
import { useSettings } from "../settings";
import { fmt, useT } from "../i18n";
import { storage } from "../storage";
import { markdownToHtml } from "../storage/markdown";
import { cleanTitle, readVersionFile, sortVersions, versionFile, type SceneVersion } from "../versions";
import { diffText, markdownPlain } from "../textDiff";
import { MoreMenu } from "./MoreMenu";

/** Ce qu'on compare à la version choisie : rien, le texte actuel, ou une autre version (son nom). */
type Against = "" | "current" | string;

const NOTICE_MS = 4000;

export function VersionsDialog() {
  const t = useT();
  const v = t.versions;
  const lang = useSettings((s) => s.lang);
  const cardId = useCosmos((s) => s.versionsFor);
  const keepFirst = useCosmos((s) => s.versionsKeep);
  const kind = useCosmos((s) => s.kind);
  const sceneTitle = useCosmos((s) => s.nodes.find((n) => n.id === s.versionsFor)?.data.title ?? "");
  // Le texte actuel suit la frappe et les retours en arrière : relu quand le manuscrit ou le scénario changent.
  const manuscriptHtml = useCosmos((s) => (s.versionsFor ? s.manuscript[s.versionsFor] : undefined));
  const screenplay = useCosmos((s) => s.screenplay);
  const current = useMemo(
    () => (cardId ? useCosmos.getState().sceneVersionText(cardId) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [cardId, manuscriptHtml, screenplay, kind],
  );

  const [versions, setVersions] = useState<SceneVersion[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [chosen, setChosen] = useState<string | null>(null);
  const [against, setAgainst] = useState<Against>("");
  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ text: string; undo?: () => void } | null>(null);
  const [renaming, setRenaming] = useState<string | null>(null);
  const keepRef = useRef<HTMLInputElement>(null);

  const load = async (select?: string) => {
    if (!cardId) return;
    try {
      const files = await storage.readVersions(cardId);
      const list = sortVersions(Object.entries(files).flatMap(([name, raw]) => readVersionFile(name, raw) ?? []));
      setVersions(list);
      setFailed(false);
      setChosen((was) => (select && list.some((x) => x.name === select) ? select : was && list.some((x) => x.name === was) ? was : (list[0]?.name ?? null)));
    } catch {
      setVersions([]);
      setFailed(true);
    }
  };

  useEffect(() => {
    setVersions(null);
    setChosen(null);
    setAgainst("");
    setTitle("");
    setNotice(null);
    setRenaming(null);
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cardId]);

  // « Garder cette version… » (menu, Cmd/Ctrl + Alt + S) : le champ du titre prend le focus.
  useEffect(() => {
    if (keepFirst && cardId) requestAnimationFrame(() => keepRef.current?.focus());
  }, [keepFirst, cardId]);

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(null), NOTICE_MS);
    return () => window.clearTimeout(timer);
  }, [notice]);

  const dateText = useMemo(() => {
    const format = new Intl.DateTimeFormat(lang, { dateStyle: "medium", timeStyle: "short" });
    return (iso: string) => {
      const d = new Date(iso);
      return Number.isNaN(d.getTime()) ? iso : format.format(d);
    };
  }, [lang]);
  const wordsText = (n: number) => fmt(n === 1 ? v.wordOne : v.wordMany, { n: n.toLocaleString(lang) });

  const version = versions?.find((x) => x.name === chosen) ?? null;
  const other = against && against !== "current" ? (versions?.find((x) => x.name === against) ?? null) : null;
  const plain = (text: string) => (kind === "scenario" ? text : markdownPlain(text));
  // Comparaison : de l'ancien (la version choisie, ou la plus ancienne des deux) au plus récent.
  const diff = useMemo(() => {
    if (!version || !against) return null;
    if (against === "current") return diffText(plain(version.text), plain(current?.text ?? ""));
    if (!other) return null;
    const [older, newer] = other.name < version.name ? [other, version] : [version, other];
    return diffText(plain(older.text), plain(newer.text));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [version, against, other, current, kind]);

  if (!cardId) return null;
  const close = () => useCosmos.getState().setDialog(null);

  const keep = async () => {
    if (!current || busy) return;
    setBusy(true);
    try {
      const name = await useCosmos.getState().keepVersion(cardId, cleanTitle(title));
      if (!name) throw new Error("empty");
      setTitle("");
      setNotice({ text: v.kept });
      await load(name);
    } catch {
      setNotice({ text: v.writeError });
    } finally {
      setBusy(false);
    }
  };

  const restore = async () => {
    if (!version || busy) return;
    setBusy(true);
    try {
      const ok = await useCosmos.getState().restoreVersion(cardId, version.name, fmt(v.before, { date: dateText(version.date) }));
      setNotice({ text: ok ? v.restored : v.otherKind });
      if (ok) {
        setAgainst("");
        await load(version.name);
      }
    } catch {
      setNotice({ text: v.writeError });
    } finally {
      setBusy(false);
    }
  };

  const copy = async () => {
    if (!version) return;
    try {
      await navigator.clipboard.writeText(version.text);
      setNotice({ text: v.copied });
    } catch {
      /* presse-papiers refusé : rien à faire de plus */
    }
  };

  const rename = async (target: SceneVersion, next: string) => {
    setRenaming(null);
    const clean = cleanTitle(next);
    if (clean === target.title) return;
    try {
      await storage.writeVersion(cardId, target.name, versionFile({ ...target, title: clean }));
      await load(target.name);
    } catch {
      setNotice({ text: v.writeError });
    }
  };

  const remove = async (target: SceneVersion) => {
    try {
      await storage.deleteVersion(cardId, target.name);
      if (against === target.name) setAgainst("");
      await load();
      // Annuler réécrit le même fichier, au même nom : rien ne se perd tant que le message est là.
      setNotice({
        text: v.removed,
        undo: async () => {
          setNotice(null);
          await storage.writeVersion(cardId, target.name, versionFile(target)).catch(() => setNotice({ text: v.writeError }));
          await load(target.name);
        },
      });
    } catch {
      setNotice({ text: v.writeError });
    }
  };

  const label = (x: SceneVersion) => (x.title ? `${x.title} · ${dateText(x.date)}` : dateText(x.date));

  return (
    <div className="versions-panel">
      <button type="button" className="expanded-close" aria-label={t.gallery.close} title={t.gallery.close} onClick={close}>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
          <path d="M6 6l12 12M18 6L6 18" />
        </svg>
      </button>
      <h2 id="app-dialog-title">{fmt(v.title, { title: sceneTitle.trim() || v.untitledScene })}</h2>

      <div className="versions-body">
        <div className="versions-side">
          <form
            className="versions-keep"
            onSubmit={(e) => {
              e.preventDefault();
              void keep();
            }}
          >
            <label htmlFor="versions-keep-title">{v.keepLabel}</label>
            <input
              id="versions-keep-title"
              ref={keepRef}
              type="text"
              value={title}
              maxLength={120}
              placeholder={v.keepPlaceholder}
              disabled={!current}
              onChange={(e) => setTitle(e.target.value)}
            />
            <button type="submit" className="is-primary" disabled={!current || busy}>
              {v.keep}
            </button>
            {!current && <p className="versions-hint">{v.emptyScene}</p>}
          </form>

          {failed && <p className="versions-hint">{v.loadError}</p>}
          {versions && versions.length === 0 && !failed && <p className="versions-hint">{v.none}</p>}
          {versions && versions.length > 0 && (
            <ul className="versions-list" aria-label={v.listAria}>
              {versions.map((x) => (
                <li key={x.name}>
                  {renaming === x.name ? (
                    <RenameField version={x} label={v.renameLabel} save={v.save} cancel={v.cancel} onDone={(next) => (next === null ? setRenaming(null) : void rename(x, next))} />
                  ) : (
                    <button type="button" className="versions-item" aria-pressed={chosen === x.name} onClick={() => setChosen(x.name)}>
                      <span className="versions-item-title">{x.title || v.untitled}</span>
                      <span className="versions-item-meta">
                        {dateText(x.date)} · {wordsText(x.words)}
                      </span>
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>

        {version && (
          <div className="versions-main">
            <div className="versions-tools">
              <label className="versions-compare">
                <span>{v.compareLabel}</span>
                <select value={against} onChange={(e) => setAgainst(e.target.value)}>
                  <option value="">{v.compareNone}</option>
                  <option value="current" disabled={!current}>
                    {v.compareCurrent}
                  </option>
                  {versions
                    ?.filter((x) => x.name !== version.name)
                    .map((x) => (
                      <option key={x.name} value={x.name}>
                        {label(x)}
                      </option>
                    ))}
                </select>
              </label>
              <div className="versions-actions">
                <button type="button" className="is-primary" disabled={busy || version.kind !== kind} title={version.kind !== kind ? v.otherKind : undefined} onClick={() => void restore()}>
                  {v.restore}
                </button>
                <MoreMenu
                  label={v.more}
                  items={[
                    { label: v.copy, onSelect: () => void copy() },
                    { label: v.rename, onSelect: () => setRenaming(version.name) },
                    { label: v.remove, danger: true, onSelect: () => void remove(version) },
                  ]}
                />
              </div>
            </div>

            {diff ? (
              <>
                <p className="versions-summary">
                  {diff.added || diff.removed ? fmt(v.summary, { added: diff.added.toLocaleString(lang), removed: diff.removed.toLocaleString(lang) }) : v.noChange}
                  {(diff.added > 0 || diff.removed > 0) && <span className="versions-legend"> · {v.legend}</span>}
                </p>
                <div className={`versions-text is-diff${kind === "scenario" ? " is-script" : ""}`}>
                  <DiffView parts={diff.parts} removedAria={v.removedAria} addedAria={v.addedAria} />
                </div>
              </>
            ) : kind === "scenario" || version.kind === "scenario" ? (
              <div className="versions-text is-script">{version.text}</div>
            ) : (
              // Le Markdown lu sur disque passe par markdownToHtml, donc par sanitizeHtml.
              <div className="versions-text" dangerouslySetInnerHTML={{ __html: markdownToHtml(version.text) }} />
            )}
          </div>
        )}
      </div>

      <div className="versions-notice" role="status" aria-live="polite">
        {notice && (
          <>
            <span>{notice.text}</span>
            {notice.undo && (
              <button type="button" className="ghost-button" onClick={notice.undo}>
                {v.undo}
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function DiffView({ parts, removedAria, addedAria }: { parts: ReturnType<typeof diffText>["parts"]; removedAria: string; addedAria: string }) {
  // Un paragraphe par `break` ; les morceaux gardent leurs espaces (le texte se relit tel quel).
  const paragraphs: (typeof parts)[] = [[]];
  for (const part of parts) {
    paragraphs[paragraphs.length - 1].push(part);
    if (part.break) paragraphs.push([]);
  }
  return (
    <>
      {paragraphs
        .filter((p) => p.length)
        .map((p, i) => (
          <p key={i}>
            {p.map((part, j) => {
              // Un mot retiré collé au mot ajouté (fin de paragraphe) : une espace entre les deux.
              const gap = part.kind === "del" && p[j + 1]?.kind === "add" && !/\s$/.test(part.text) ? " " : "";
              return part.kind === "del" ? (
                <span key={j}>
                  <del>
                    <span className="sr-only">{removedAria} </span>
                    {part.text}
                  </del>
                  {gap}
                </span>
              ) : part.kind === "add" ? (
                <ins key={j}>
                  <span className="sr-only">{addedAria} </span>
                  {part.text}
                </ins>
              ) : (
                <span key={j}>{part.text}</span>
              );
            })}
          </p>
        ))}
    </>
  );
}

function RenameField({ version, label, save, cancel, onDone }: { version: SceneVersion; label: string; save: string; cancel: string; onDone: (title: string | null) => void }) {
  const [value, setValue] = useState(version.title);
  return (
    <form
      className="versions-rename"
      onSubmit={(e) => {
        e.preventDefault();
        onDone(value);
      }}
    >
      <input
        type="text"
        aria-label={label}
        value={value}
        maxLength={120}
        autoFocus
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            e.preventDefault();
            e.stopPropagation();
            onDone(null);
          }
        }}
      />
      <button type="submit" className="is-primary">
        {save}
      </button>
      <button type="button" onClick={() => onDone(null)}>
        {cancel}
      </button>
    </form>
  );
}
