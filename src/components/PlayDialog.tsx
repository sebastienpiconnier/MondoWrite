// Mode Lecture d'un roman interactif (lot 3, docs/plan-roman-interactif.md) : l'histoire se lit comme la lira le
// lecteur, choix compris. Le projet est composé en Ink (interactive/ink.ts) puis compilé par inkjs, chargé à la
// demande. Lecture depuis le début ou « à partir d'ici » (une scène), retour en arrière d'un choix, recommencer, et
// « Écrire cette scène » ramène au Manuscrit. Rien n'est enregistré : c'est un état d'affichage.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Story } from "inkjs/engine/Story";
import { fmt, useT } from "../i18n";
import { useCosmos } from "../store";
import { isMediaName } from "../media";
import { imagesOfTags, inkProblems, projectToInk, sceneOfPath, type InkProblem, type InkSource } from "../interactive/ink";
import { interactiveScenes, interactiveSlugs } from "../interactive/scenes";
import { readFactLabels, shownValue } from "../interactive/facts";
import { projectFacts } from "../interactive/projectFacts";
import { useMediaUrl } from "./useMediaUrl";
import { usePlay } from "../interactive/playState";
import { openingWords, pathLine, pathMarkdown, pathNotes, type PathStep } from "../interactive/readingPath";
import { projectSections } from "../interactive/projectSections";
import { markQuoteInHtml } from "../mcpWrite";
import { newId } from "../projectState";
import { storage } from "../storage";
import { fileName } from "../screenplay/export";

interface Passage {
  /** Ce que le lecteur a choisi pour arriver ici (rien au départ). */
  chose?: string;
  /** Scène où l'on est arrivé (lot 15 : parcours de lecture). */
  scene?: string | null;
  lines: { text: string; images: string[] }[];
}

interface Step {
  state: string;
  passages: number;
}

function PlayImage({ name }: { name: string }) {
  const url = useMediaUrl(name);
  return url ? <img className="play-image" src={url} alt="" /> : null;
}

export function PlayDialog() {
  const t = useT();
  const p = t.interactive.play;
  const from = usePlay((s) => s.from);
  const title = useCosmos((s) => s.title);
  const nodes = useCosmos((s) => s.nodes);
  const plan = useCosmos((s) => s.plan);
  const manuscript = useCosmos((s) => s.manuscript);
  const scenes = interactiveScenes(nodes, plan);
  const titleOf = (id?: string | null) => (id && scenes.find((s) => s.id === id)?.title.trim()) || t.interactive.map.untitled;

  // Le texte est relu à l'ouverture : modifier une scène puis rouvrir la lecture prend la nouvelle version.
  const source = useMemo<InkSource>(() => projectToInk(scenes, interactiveSlugs(nodes, plan), manuscript, readFactLabels(useCosmos.getState().metaKeep), t.interactive.map.defaultLabel), []); // eslint-disable-line react-hooks/exhaustive-deps

  const [story, setStory] = useState<Story | null>(null);
  const [problems, setProblems] = useState<InkProblem[] | null>(null);
  const [passages, setPassages] = useState<Passage[]>([]);
  const [choices, setChoices] = useState<{ text: string; index: number }[]>([]);
  const [current, setCurrent] = useState<string | null>(null);
  const currentRef = useRef<string | null>(null);
  const history = useRef<Step[]>([]);
  // Parcours annoté (lot 15) : une note par étape, gardée le temps de la lecture.
  const [notes, setNotes] = useState<Record<number, string>>({});
  const [noting, setNoting] = useState<number | null>(null);
  const [message, setMessage] = useState("");
  // Faits et compteurs (lot 4) : relus après chaque pas, montrés quand le lecteur les a.
  const facts = useMemo(() => projectFacts(useCosmos.getState()), []);
  const [known, setKnown] = useState<{ label: string; value: string }[]>([]);
  const readKnown = useCallback(
    (s: Story) =>
      setKnown(
        facts.flatMap((f) => {
          let raw: unknown;
          try {
            raw = s.variablesState.$(f.name);
          } catch {
            raw = undefined;
          }
          const value = shownValue(raw);
          return value === null ? [] : [{ label: f.label, value }];
        }),
      ),
    [facts],
  );
  const endRef = useRef<HTMLDivElement>(null);
  const runtimeErrors = useRef<string[]>([]);

  /** Passages de chaque scène (nombre de visites), pour savoir où l'on est même dans une scène sans texte. */
  const visits = useCallback(
    (s: Story) => new Map([...source.knots].map(([id, knot]) => [id, s.state.VisitCountAtPathString(knot) ?? 0])),
    [source],
  );

  /** Lit tout ce qui vient jusqu'au prochain choix. */
  const advance = useCallback(
    (s: Story, chose?: string) => {
      const before = visits(s);
      const lines: Passage["lines"] = [];
      let path: string | null = null;
      while (s.canContinue) {
        const text = (s.Continue() ?? "").trim();
        path = s.state.previousPointer?.path?.toString() ?? s.state.currentPathString ?? path;
        const images = imagesOfTags(s.currentTags).filter(isMediaName);
        if (text || images.length) lines.push({ text, images });
      }
      // La scène lue en dernier ; à défaut (scène sans texte), celle qu'on vient de visiter.
      const after = visits(s);
      const entered = [...after].filter(([id, n]) => n > (before.get(id) ?? 0)).map(([id]) => id);
      const scene = sceneOfPath(path, source.knots) ?? (entered.length === 1 ? entered[0] : null);
      if (scene) {
        currentRef.current = scene;
        setCurrent(scene);
      }
      setPassages((all) => [...all, { ...(chose !== undefined ? { chose } : {}), scene: scene ?? currentRef.current, lines }]);
      setChoices(s.currentChoices.map((c) => ({ text: c.text, index: c.index })));
      readKnown(s);
    },
    [source, visits, readKnown],
  );

  const start = useCallback(
    (s: Story) => {
      s.ResetState();
      history.current = [];
      setPassages([]);
      setNotes({});
      setNoting(null);
      setMessage("");
      currentRef.current = from;
      setCurrent(from);
      if (from && source.knots.get(from)) s.ChoosePathString(source.knots.get(from)!);
      advance(s);
    },
    [advance, from, source],
  );

  // Compilation, une fois par ouverture ; inkjs (et son compilateur) n'est chargé qu'ici.
  useEffect(() => {
    let alive = true;
    void import("inkjs/full").then(({ Compiler }) => {
      if (!alive) return;
      const compiler = new Compiler(source.ink);
      try {
        const compiled = compiler.Compile();
        if (!alive) return;
        // Une erreur d'Ink pendant la lecture ne doit jamais rendre un choix inerte : elle est dite au lecteur.
        compiled.onError = (msg) => runtimeErrors.current.push(msg);
        setStory(compiled);
        start(compiled);
      } catch {
        if (alive) setProblems(inkProblems(compiler.errors.length ? compiler.errors : [p.failed], source));
      }
    });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [source]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end", behavior: "smooth" });
  }, [passages]);

  const choose = (index: number, text: string) => {
    if (!story) return;
    history.current.push({ state: story.state.ToJson(), passages: passages.length });
    runtimeErrors.current = [];
    try {
      story.ChooseChoiceIndex(index);
      advance(story, text || t.interactive.map.defaultLabel);
    } catch (e) {
      runtimeErrors.current.push(e instanceof Error ? e.message : String(e));
    }
    const error = runtimeErrors.current[0];
    if (error) setMessage(fmt(p.runtime, { error: error.replace(/^.*?(RUNTIME ERROR:\s*)?('[^']*'\s*line \d+:\s*)?/, "") }));
  };
  const back = () => {
    const last = history.current.pop();
    if (!story || !last) return;
    story.state.LoadJson(last.state);
    setPassages((all) => all.slice(0, last.passages));
    setNotes((all) => Object.fromEntries(Object.entries(all).filter(([k]) => Number(k) < last.passages)));
    setChoices(story.currentChoices.map((c) => ({ text: c.text, index: c.index })));
    readKnown(story);
  };

  // 1 à 9 choisissent, comme dans un livre qu'on lit au clavier.
  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.metaKey || e.ctrlKey || e.altKey || (e.target as HTMLElement).closest("input, textarea")) return;
    const n = Number(e.key);
    if (n >= 1 && n <= choices.length) {
      e.preventDefault();
      choose(choices[n - 1].index, choices[n - 1].text);
    }
  };

  const close = () => useCosmos.getState().setDialog(null);
  const write = (id: string | null) => {
    close();
    if (id) useCosmos.getState().openInManuscript(id);
  };
  const ended = !!story && choices.length === 0 && !story.canContinue;

  // Parcours de lecture (lot 15) : chemin en numéros du livre-jeu, notes gardées en commentaires, export Markdown.
  const steps: PathStep[] = passages.map((pa, i) => ({ scene: pa.scene ?? null, ...(pa.chose !== undefined ? { chose: pa.chose } : {}), ...(notes[i]?.trim() ? { note: notes[i] } : {}) }));
  const numbers = projectSections(useCosmos.getState()).numbers;
  const path = pathLine(steps, numbers);
  const toKeep = pathNotes(steps);
  const keepNotes = () => {
    const st = useCosmos.getState();
    let kept = 0;
    for (const { scene, note } of toKeep) {
      const html = st.manuscript[scene];
      // Le commentaire s'ancre sur les premiers mots de la scène (une scène sans texte ne peut pas en porter).
      const quote = openingWords(html);
      const commentId = newId();
      const marked = quote ? markQuoteInHtml(html ?? "", quote, commentId) : null;
      if (!quote || !marked) continue;
      st.setManuscriptText(scene, marked);
      st.addComment(scene, commentId, quote);
      st.editComment(scene, commentId, fmt(p.commentText, { note }));
      kept++;
    }
    st.setCommentFocus(null);
    const skipped = toKeep.length - kept;
    setNotes({});
    setMessage([kept ? fmt(p.notesKept, { n: kept }) : "", skipped ? fmt(p.notesSkipped, { n: skipped }) : ""].filter(Boolean).join(" "));
  };
  const exportPath = async () => {
    const name = fmt(p.pathFile, { title: title.trim() || t.home.untitled });
    const text = pathMarkdown(steps, numbers, new Map(scenes.map((sc) => [sc.id, sc.title])), {
      title: fmt(p.pathTitle, { title: title.trim() || t.home.untitled }),
      choice: p.pathChoice,
      note: p.pathNote,
      untitled: t.interactive.map.untitled,
    });
    const saved = await storage.saveAs({ name: `${fileName(name, "mondowrite")}.md`, extension: "md", mime: "text/markdown", data: new TextEncoder().encode(text) }, p.exportPath);
    if (saved) setMessage(p.pathSaved);
  };

  return (
    <div className="play-panel" onKeyDown={onKeyDown}>
      <button type="button" className="expanded-close" aria-label={t.gallery.close} title={t.gallery.close} onClick={close}>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
          <path d="M6 6l12 12M18 6L6 18" />
        </svg>
      </button>
      <h2 id="app-dialog-title">{fmt(p.title, { title: title.trim() || t.home.untitled })}</h2>
      <div className="play-bar">
        {from && <span className="play-from">{fmt(p.from, { title: titleOf(from) })}</span>}
        <button type="button" className="ghost-button" disabled={!story} onClick={() => story && start(story)}>
          {p.restart}
        </button>
        <button type="button" className="ghost-button" disabled={!story || history.current.length === 0} onClick={back}>
          {p.back}
        </button>
        <button type="button" className="ghost-button" disabled={!current} onClick={() => write(current)}>
          {current ? fmt(p.write, { title: titleOf(current) }) : p.writeNone}
        </button>
      </div>

      {passages.length > 0 && (
        <div className="play-path">
          {path && (
            <p className="play-path-line">
              <span>{p.path}</span> {path}
            </p>
          )}
          <button type="button" className="ghost-button" disabled={toKeep.length === 0} onClick={keepNotes} title={p.keepNotesHint}>
            {fmt(p.keepNotes, { n: toKeep.length })}
          </button>
          <button type="button" className="ghost-button" onClick={() => void exportPath()}>
            {p.exportPath}
          </button>
          {message && (
            <span className="play-path-message" role="status">
              {message}
            </span>
          )}
        </div>
      )}

      {known.length > 0 && (
        <p className="play-known">
          <span>{t.interactive.facts.known}</span>
          {known.map((k) => (
            <span key={k.label} className="choice-tag">
              {k.value ? fmt(t.interactive.facts.value, { fact: k.label, value: k.value }) : k.label}
            </span>
          ))}
        </p>
      )}
      {problems && (
        <div className="play-problems" role="alert">
          <p>{p.problems}</p>
          <ul>
            {problems.map((pb, i) => (
              <li key={i}>
                {pb.scene && <strong>{titleOf(pb.scene)} · </strong>}
                <code>{pb.message}</code>
                {pb.scene && (
                  <button type="button" className="ghost-button" onClick={() => write(pb.scene!)}>
                    {p.openScene}
                  </button>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
      {!story && !problems && <p className="sp-empty">{p.loading}</p>}

      <div className="play-text" aria-live="polite">
        {passages.map((passage, i) => (
          <section key={i} className="play-passage">
            {passage.chose !== undefined && <p className="play-chose">› {passage.chose}</p>}
            {passage.lines.map((line, j) => (
              <div key={j}>
                {line.images.map((name) => (
                  <PlayImage key={name} name={name} />
                ))}
                {line.text && <p>{line.text}</p>}
              </div>
            ))}
            {noting === i ? (
              <textarea
                className="play-note-field"
                autoFocus
                rows={2}
                value={notes[i] ?? ""}
                placeholder={p.notePlaceholder}
                aria-label={fmt(p.noteAria, { title: titleOf(passage.scene) })}
                onChange={(e) => setNotes((all) => ({ ...all, [i]: e.target.value }))}
                onBlur={() => setNoting(null)}
                onKeyDown={(e) => {
                  if (e.key === "Escape" || (e.key === "Enter" && !e.shiftKey)) {
                    e.preventDefault();
                    e.stopPropagation();
                    setNoting(null);
                  }
                }}
              />
            ) : notes[i]?.trim() ? (
              <button type="button" className="play-note" aria-label={fmt(p.noteAria, { title: titleOf(passage.scene) })} onClick={() => setNoting(i)}>
                {notes[i]}
              </button>
            ) : (
              <button type="button" className="play-note-add" aria-label={fmt(p.noteAria, { title: titleOf(passage.scene) })} onClick={() => setNoting(i)}>
                {p.note}
              </button>
            )}
          </section>
        ))}
        {story && choices.length > 0 && (
          <ol className="play-choices">
            {choices.map((c, i) => (
              <li key={c.index}>
                <button type="button" onClick={() => choose(c.index, c.text)}>
                  <span className="play-key" aria-hidden="true">
                    {i + 1}
                  </span>
                  {c.text || t.interactive.map.defaultLabel}
                </button>
              </li>
            ))}
          </ol>
        )}
        {ended && (
          <div className="play-end">
            <p>{p.end}</p>
            <button type="button" className="ghost-button" onClick={() => start(story!)}>
              {p.restart}
            </button>
          </div>
        )}
        <div ref={endRef} />
      </div>
    </div>
  );
}
