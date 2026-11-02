// Onglet « Commentaires » de la colonne de droite (1.13.0, comments.ts) : les commentaires de la scène en cours,
// dans l'ordre du texte. Chacun montre son passage (un clic le sélectionne dans le texte), son texte modifiable sur
// place, « Résoudre » et, dans ⋯, « Supprimer » (annulable). Un commentaire laissé vide disparaît, sa marque aussi.

import { useEffect, useMemo, useRef } from "react";
import { useCosmos } from "../store";
import { useSettings } from "../settings";
import { fmt, useT } from "../i18n";
import { isAnchored, orderComments, type SceneComment } from "../comments";
import { MoreMenu } from "./MoreMenu";

const NO_COMMENTS: SceneComment[] = [];

/** `anchors` : identifiants des commentaires encore présents dans le texte de la scène, dans l'ordre du texte. */
export function CommentsPanel({
  sceneId,
  anchors,
  empty,
  onGo,
  onNotice,
}: {
  sceneId: string;
  anchors: string[];
  /** Phrase quand la scène n'a aucun commentaire (roman : un passage ; scénario : un élément). */
  empty: string;
  onGo: (id: string) => void;
  onNotice: (n: { text: string; undo?: () => void }) => void;
}) {
  const t = useT().comments;
  const list = useCosmos((s) => s.comments[sceneId] ?? NO_COMMENTS);
  const focus = useCosmos((s) => s.commentFocus);
  const ordered = useMemo(() => orderComments(list, anchors), [list, anchors]);
  const open = ordered.filter((c) => !c.resolved);
  const resolved = ordered.filter((c) => c.resolved);

  const remove = (c: SceneComment) => {
    const undo = useCosmos.getState().deleteComment(sceneId, c.id);
    if (undo) onNotice({ text: t.removed, undo: () => useCosmos.getState().undoDeleteComment(undo) });
  };

  return (
    <section className="sp-box comments-panel" aria-label={t.title}>
      <h2 className="sp-box-title">{t.title}</h2>
      {ordered.length === 0 && <p className="sp-empty">{empty}</p>}
      {open.length > 0 && (
        <ol className="comments-list">
          {open.map((c) => (
            <CommentItem key={c.id} sceneId={sceneId} comment={c} anchored={isAnchored(c, anchors)} focused={focus?.id === c.id} edit={focus?.id === c.id && !!focus.edit} onGo={onGo} onRemove={remove} />
          ))}
        </ol>
      )}
      {resolved.length > 0 && (
        <details className="comments-resolved">
          <summary>{fmt(t.resolved, { n: resolved.length })}</summary>
          <ol className="comments-list">
            {resolved.map((c) => (
              <CommentItem key={c.id} sceneId={sceneId} comment={c} anchored={isAnchored(c, anchors)} focused={focus?.id === c.id} edit={false} onGo={onGo} onRemove={remove} />
            ))}
          </ol>
        </details>
      )}
    </section>
  );
}

function CommentItem({
  sceneId,
  comment: c,
  anchored,
  focused,
  edit,
  onGo,
  onRemove,
}: {
  sceneId: string;
  comment: SceneComment;
  anchored: boolean;
  focused: boolean;
  edit: boolean;
  onGo: (id: string) => void;
  onRemove: (c: SceneComment) => void;
}) {
  const t = useT().comments;
  const lang = useSettings((s) => s.lang);
  const field = useRef<HTMLTextAreaElement>(null);
  const item = useRef<HTMLLIElement>(null);
  const date = useMemo(() => {
    const d = new Date(c.date);
    return Number.isNaN(d.getTime()) ? "" : new Intl.DateTimeFormat(lang, { dateStyle: "medium", timeStyle: "short" }).format(d);
  }, [c.date, lang]);

  // Nouveau commentaire (ou choisi depuis « À faire ») : son champ prend le focus, l'élément vient à l'écran.
  useEffect(() => {
    if (edit) requestAnimationFrame(() => field.current?.focus({ preventScroll: false }));
    else if (focused) item.current?.scrollIntoView({ block: "nearest" });
  }, [edit, focused]);

  // Le champ grandit avec son texte.
  useEffect(() => {
    const el = field.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [c.text]);

  return (
    <li ref={item} className={`comment-item${focused ? " is-focused" : ""}${c.resolved ? " is-resolved" : ""}`}>
      {anchored ? (
        <button type="button" className="comment-quote" title={t.goTo} onClick={() => onGo(c.id)}>
          {c.quote}
        </button>
      ) : (
        <p className="comment-quote is-detached">
          <span>{c.quote}</span>
          <span className="comment-detached">{t.detached}</span>
        </p>
      )}
      <textarea
        ref={field}
        className="comment-text"
        rows={1}
        value={c.text}
        placeholder={t.placeholder}
        aria-label={fmt(t.fieldLabel, { quote: c.quote })}
        onChange={(e) => useCosmos.getState().editComment(sceneId, c.id, e.target.value)}
        onFocus={() => useCosmos.getState().setCommentFocus({ cardId: sceneId, id: c.id })}
        onBlur={() => {
          // Un commentaire laissé vide n'était qu'un essai : il part, avec sa marque, sans message.
          const now = useCosmos.getState().comments[sceneId]?.find((x) => x.id === c.id);
          if (now && !now.text.trim()) useCosmos.getState().deleteComment(sceneId, c.id);
        }}
        onKeyDown={(e) => {
          // Échap rend la main au texte, au passage commenté.
          if (e.key === "Escape" && anchored) {
            e.preventDefault();
            e.stopPropagation();
            onGo(c.id);
          }
        }}
      />
      <div className="comment-foot">
        {date && <span className="comment-date">{date}</span>}
        <button type="button" className="ghost-button comment-resolve" disabled={!c.text.trim()} onClick={() => useCosmos.getState().resolveComment(sceneId, c.id, !c.resolved)}>
          {c.resolved ? t.reopen : t.resolve}
        </button>
        <MoreMenu label={t.more} items={[{ label: t.remove, danger: true, onSelect: () => onRemove(c) }]} />
      </div>
    </li>
  );
}
