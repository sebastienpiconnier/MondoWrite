import { useEffect } from "react";
import { ReactFlowProvider } from "@xyflow/react";
import { useCosmos } from "./store";
import { TopBar } from "./components/TopBar";
import { Toile } from "./components/Toile";
import { Bible } from "./components/Bible";
import { ScreenplayView } from "./components/ScreenplayView";
import { Sequencier } from "./components/Sequencier";
import { Plan } from "./components/Plan";
import { Manuscript } from "./components/Manuscript";
import { Home } from "./components/Home";
import { Tour } from "./components/Tour";
import { Dialogs } from "./components/Dialogs";
import { TrashNotice } from "./components/TrashList";
import { UpdateNotice, useLaunchUpdateCheck } from "./components/Updates";
import { useT } from "./i18n";
import { storage } from "./storage";
import { forgetMediaUrls } from "./components/useMediaUrl";
import { ConflictNotice } from "./components/ConflictNotice";

const AUTOSAVE_DELAY = 800; // ms après la dernière modification

export function App() {
  const t = useT();
  const view = useCosmos((s) => s.view);
  const kind = useCosmos((s) => s.kind);
  const loaded = useCosmos((s) => s.loaded);
  const screen = useCosmos((s) => s.screen);
  const focusMode = useCosmos((s) => s.focusMode);
  const status = useCosmos((s) => s.status);
  const closeProject = useCosmos((s) => s.closeProject);
  const start = useCosmos((s) => s.start);
  const save = useCosmos((s) => s.save);
  // App de bureau : une nouvelle version est cherchée peu après le lancement (une fois par jour au plus).
  useLaunchUpdateCheck();

  // Au lancement : la liste des projets, puis l'accueil.
  useEffect(() => {
    start();
  }, [start]);

  // De retour à l'accueil : les images lues appartenaient au projet qu'on quitte.
  useEffect(() => {
    if (screen === "home") forgetMediaUrls();
  }, [screen]);

  // Projet ouvert : on surveille son dossier (app de bureau). Un fichier changé dans un autre logiciel est
  // repris aussitôt, ou devient un conflit s'il a aussi été modifié ici. Même relecture au retour dans la fenêtre.
  useEffect(() => {
    if (screen !== "project") return;
    const sync = () => void useCosmos.getState().syncFromDisk();
    let stop: (() => void) | null = null;
    let cancelled = false;
    storage
      .watch?.(sync)
      .then((unwatch) => {
        if (cancelled) unwatch();
        else stop = unwatch;
      })
      .catch((err) => console.error(err));
    window.addEventListener("focus", sync);
    return () => {
      cancelled = true;
      stop?.();
      window.removeEventListener("focus", sync);
    };
  }, [screen]);

  // Sauvegarde automatique : chaque modification relance le délai,
  // on enregistre quand l'auteur marque une pause.
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const unsubscribe = useCosmos.subscribe((s, prev) => {
      if (!s.loaded || s.screen !== "project" || s.status !== "modifie") return;
      const same =
        s.nodes === prev.nodes && s.frames === prev.frames && s.edges === prev.edges && s.screenplay === prev.screenplay && s.title === prev.title && s.kind === prev.kind && s.paper === prev.paper && s.sceneNumbers === prev.sceneNumbers && s.underlineHeadings === prev.underlineHeadings;
      if (same && s.status === prev.status) return;
      clearTimeout(timer);
      timer = setTimeout(() => useCosmos.getState().save(), AUTOSAVE_DELAY);
    });
    return () => {
      clearTimeout(timer);
      unsubscribe();
    };
  }, []);

  // Cmd/Ctrl + S : sauvegarde immédiate. Cmd/Ctrl + Z, Maj + Z ou Y : annuler, rétablir.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey)) return;
      const key = e.key.toLowerCase();
      // Cmd/Ctrl + / : la liste des raccourcis, partout (accueil compris).
      if (key === "/" || e.code === "Slash") {
        e.preventDefault();
        const { dialog, setDialog } = useCosmos.getState();
        setDialog(dialog === "shortcuts" ? null : "shortcuts");
        return;
      }
      if (useCosmos.getState().screen !== "project") return;
      // Cmd/Ctrl + 1 à 4 : Canevas, Plan, Bible, Manuscrit.
      const views = ["toile", "plan", "bible", "manuscrit"] as const;
      const digit = /^Digit([1-4])$/.exec(e.code)?.[1] ?? (/^[1-4]$/.test(key) ? key : null);
      if (digit && !e.shiftKey && !e.altKey) {
        e.preventDefault();
        useCosmos.getState().setView(views[Number(digit) - 1]);
        return;
      }
      if (key === "s") {
        e.preventDefault();
        save();
        return;
      }
      // Annuler / rétablir : dans un champ ou un éditeur, c'est leur propre historique qui répond.
      if (key !== "z" && key !== "y") return;
      if ((e.target as HTMLElement | null)?.closest("input, textarea, select, [contenteditable='true']")) return;
      e.preventDefault();
      if (key === "y" || e.shiftKey) useCosmos.getState().redo();
      else useCosmos.getState().undo();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [save]);

  if (!loaded) return <div className="loading">{t.app.loading}</div>;
  if (screen === "home")
    return (
      <>
        <Home />
        <UpdateNotice />
        <Dialogs />
      </>
    );

  return (
    <ReactFlowProvider>
      <div className="app">
        {/* Mode focus (scénario ou manuscrit) : la barre du haut s'efface, la page prend la place. */}
        {!(focusMode && view === "manuscrit") && <TopBar />}
        {status === "erreur" && (
          <div className="app-alert" role="alert">
            <span>{storage.canPickFolder ? t.app.saveFailedFolder : t.app.saveFailed}</span>
            <span className="app-alert-actions">
              <button type="button" className="ghost-button" onClick={save}>
                {t.app.retry}
              </button>
              <button type="button" className="ghost-button" onClick={() => closeProject(true)}>
                {t.app.leaveUnsaved}
              </button>
            </span>
          </div>
        )}
        <ConflictNotice />
        <main className="app-main">
          {view === "toile" && <Toile />}
          {view === "bible" && <Bible />}
          {view === "plan" && (kind === "scenario" ? <Sequencier /> : <Plan />)}
          {/* Même vue, deux ateliers : prose pour un roman (à venir), format cinéma pour un scénario. */}
          {view === "manuscrit" && (kind === "scenario" ? <ScreenplayView /> : <Manuscript />)}
        </main>
      </div>
      <Tour />
      <TrashNotice />
      {/* Le mode focus n'est pas dérangé : le bandeau attend qu'on en sorte. */}
      {!focusMode && <UpdateNotice />}
      <Dialogs />
    </ReactFlowProvider>
  );
}
