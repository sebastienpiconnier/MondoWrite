// Fenêtres par-dessus l'app : la liste des raccourcis clavier (Cmd/Ctrl + /) et « À propos de MondoWrite ».
// Ouvertes depuis les Réglages ou au clavier ; <dialog> natif : Échap ferme, le focus est retenu dedans.

import { BrandMark, Wordmark } from "./BrandMark";
import { useEffect, useRef } from "react";
import { useCosmos } from "../store";
import { useT } from "../i18n";
import { SHORTCUT_GROUPS, type ShortcutGroup } from "../shortcuts";
import { isAppleKeyboard, openExternal } from "../platform";
import { version } from "../../package.json";
import { TrashList } from "./TrashList";
import { DocumentViewer } from "./DocumentViewer";
import { PhotoSearch } from "./PhotoSearch";
import { UpdateSettings } from "./Updates";
import { ExpandedCard } from "./ExpandedCard";
import { ReplacePanel } from "./ReplacePanel";

const REPO = "https://github.com/sebastienpiconnier/MondoWrite";

export function Dialogs() {
  const dialog = useCosmos((s) => s.dialog);
  const expanded = useCosmos((s) => (s.dialog === "card" ? s.nodes.find((n) => n.id === s.expandedId)?.data : undefined));
  const setDialog = useCosmos((s) => s.setDialog);
  const ref = useRef<HTMLDialogElement>(null);
  const t = useT();

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (dialog && !el.open) el.showModal?.();
    if (!dialog && el.open) el.close();
  }, [dialog]);

  // La carte agrandie a disparu (supprimée, annulée) : la fenêtre se ferme.
  useEffect(() => {
    if (dialog === "card" && !expanded) setDialog(null);
  }, [dialog, expanded, setDialog]);

  const apple = isAppleKeyboard();
  const keyName = (k: string) =>
    ({ Mod: apple ? "⌘" : "Ctrl", Shift: apple ? "⇧" : t.shortcuts.shift, Alt: apple ? "⌥" : "Alt", Entrée: t.shortcuts.enter, Échap: t.shortcuts.escape, Suppr: t.shortcuts.delete, Glisser: t.shortcuts.drag, Clic: t.shortcuts.click })[k] ?? k;

  return (
    <dialog
      ref={ref}
      className={`app-dialog${dialog === "document" ? " is-document" : dialog === "photos" ? " is-photos" : dialog === "card" ? " is-card" : dialog === "replace" ? " is-replace" : ""}`}
      aria-labelledby="app-dialog-title"
      onClose={() => setDialog(null)}
      // Carte agrandie : un clic à côté de la fenêtre (sur le fond) la ferme.
      onClick={(e) => {
        if (dialog === "card" && e.target === e.currentTarget) setDialog(null);
      }}
    >
      {dialog === "card" && expanded && <ExpandedCard card={expanded} />}
      {dialog === "shortcuts" && (
        <>
          <h2 id="app-dialog-title">{t.shortcuts.title}</h2>
          <div className="shortcut-groups">
            {(Object.keys(SHORTCUT_GROUPS) as ShortcutGroup[]).map((group) => (
              <section key={group}>
                <h3>{t.shortcuts.groups[group]}</h3>
                <dl>
                  {SHORTCUT_GROUPS[group].map(([item, keys]) => (
                    <div key={item}>
                      <dt>{t.shortcuts.items[item]}</dt>
                      <dd>
                        {keys.map((k, i) => (
                          <kbd key={i}>{keyName(k)}</kbd>
                        ))}
                      </dd>
                    </div>
                  ))}
                </dl>
              </section>
            ))}
          </div>
        </>
      )}
      {dialog === "trash" && <TrashList />}
      {dialog === "replace" && <ReplacePanel />}
      {dialog === "document" && <DocumentViewer />}
      {dialog === "photos" && <PhotoSearch />}
      {dialog === "about" && (
        <div className="about">
          <div className="about-brand">
            <BrandMark size={72} />
            <h2 id="app-dialog-title">
              <Wordmark /> <span className="about-version">{version}</span>
            </h2>
          </div>
          <p className="about-tagline">{t.app.tagline}</p>
          {/* Nouvelle version : recherche à la demande (app de bureau). */}
          <div className="about-updates">
            <UpdateSettings withAuto={false} />
          </div>
          <p>{t.about.intro}</p>
          <ul>
            {t.about.pillars.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
          <h3>{t.about.creditsTitle}</h3>
          <p>{t.about.author}</p>
          <p>{t.about.credits}</p>
          <p>{t.about.license}</p>
          <p>
            {t.about.source}{" "}
            <a className="about-link" href={REPO} onClick={(e) => (e.preventDefault(), void openExternal(REPO))}>
              {REPO}
            </a>
          </p>
        </div>
      )}
      {/* La liseuse a son bouton « Fermer » en haut : la place en bas va aux pages. */}
      {dialog !== "document" && (
        <div className="assistant-actions app-dialog-actions">
          <button type="button" className={dialog === "replace" ? "" : "is-primary"} onClick={() => setDialog(null)} autoFocus={dialog !== "replace"}>
            {t.gallery.close}
          </button>
        </div>
      )}
    </dialog>
  );
}
