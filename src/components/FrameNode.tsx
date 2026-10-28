// Un cadre de regroupement : un rectangle nommé posé derrière les cartes. On le déplace par son
// en-tête (les cartes qu'il contient suivent, voir le store), on le redimensionne par ses bords.
// Son intérieur laisse passer les clics : on peut toujours créer une carte dedans.

import { memo, useEffect } from "react";
import { NodeResizer, type NodeProps } from "@xyflow/react";
import { useCosmos, type FrameNode as FrameNodeT } from "../store";
import { useT } from "../i18n";
import { useLifted } from "../lifted";
import { boxes, frameBox } from "../projectState";

function FrameNodeImpl({ id, data, selected }: NodeProps<FrameNodeT>) {
  const t = useT().toile;
  const updateFrame = useCosmos((s) => s.updateFrame);
  const deleteFrame = useCosmos((s) => s.deleteFrame);
  const toggleFrameLock = useCosmos((s) => s.toggleFrameLock);
  const locked = data.locked === true;
  // Case du gabarit : vide tant qu'aucune carte n'a son centre dedans.
  const empty = useCosmos((s) => {
    if (!data.beat) return false;
    const frame = s.frames.find((f) => f.id === id);
    if (!frame) return false;
    const box = frameBox(frame);
    const sizes = boxes(s.nodes);
    return !sizes.some((b) => {
      const cx = b.x + b.width / 2;
      const cy = b.y + b.height / 2;
      return cx >= box.x && cx <= box.x + box.width && cy >= box.y && cy <= box.y + box.height;
    });
  });
  // Soulevé par un appui long dans la toile (Toile.tsx) ; perdre la sélection le repose, comme une carte.
  const lifted = useLifted((s) => s.id === id) && !!selected;
  useEffect(() => {
    if (!selected && useLifted.getState().id === id) useLifted.getState().set(null);
  }, [selected, id]);

  return (
    <div className={`frame${selected ? " is-selected" : ""}${data.kind === "research" ? " is-research" : ""}${locked ? " is-locked" : ""}${lifted ? " is-lifted" : ""}`}>
      <NodeResizer minWidth={220} minHeight={140} isVisible={selected && !locked} lineClassName="frame-resize-line" handleClassName="frame-resize-handle" />
      <div className="frame-handle">
        <input
          type="text"
          className="frame-title nodrag"
          value={data.title}
          // Titre coupé quand le cadre est étroit : il se lit en entier au survol.
          title={data.title || undefined}
          size={Math.max(10, data.title.length)}
          placeholder={t.frameTitle}
          aria-label={t.frameTitleAria}
          autoComplete="off"
          onChange={(e) => updateFrame(id, { title: e.target.value })}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === "Escape") e.currentTarget.blur();
          }}
        />
        {/* Verrou : « Organiser » laisse ce cadre et ses cartes à leur place ; il ne bouge plus par mégarde. */}
        <button
          type="button"
          className="frame-lock nodrag"
          aria-label={t.lockFrame}
          aria-pressed={locked}
          title={locked ? t.unlockFrameHint : t.lockFrameHint}
          onClick={() => toggleFrameLock(id)}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <rect x="5" y="11" width="14" height="9.5" rx="2" />
            <path d={locked ? "M8 11V8a4 4 0 0 1 8 0v3" : "M8 11V8a4 4 0 0 1 7.6-1.7"} />
          </svg>
        </button>
        {!locked && (
          <button type="button" className="card-delete nodrag" aria-label={t.deleteFrame} title={t.deleteFrame} onClick={() => deleteFrame(id)}>
            ×
          </button>
        )}
      </div>
      {/* Case du gabarit encore vide : on voit le trou dans la structure, et où déposer une scène. */}
      {empty && <p className="frame-empty">{t.beatEmpty}</p>}
    </div>
  );
}

export const FrameNode = memo(FrameNodeImpl);
