// Une carte ouverte en grand (bouton « Agrandir », Cmd/Ctrl + Entrée) : son type, son titre, son image, son
// texte et sa fiche, avec la place d'écrire. C'est la même carte que sur le canevas (même état du store,
// rien n'est recopié) : ce qu'on écrit ici y est aussitôt. Échap ou un clic à côté ferme.

import { useT } from "../i18n";
import { useVocab } from "../vocab";
import { useCosmos } from "../store";
import { typeColor, type CardData } from "../types";
import { BibleBody } from "./BibleBody";
import { CardSheet } from "./CardSheet";
import { BreakdownSheet } from "./StructureTools";
import { useMediaUrl } from "./useMediaUrl";
import { DraftEditor } from "./SceneDraft";
import { SynopsisSuggest, novelSceneText } from "./Atelier";
import { ScriptSceneEditor } from "./ScriptSceneEditor";
import { SceneStatusPicker } from "./SceneStatusPicker";

export function ExpandedCard({ card }: { card: CardData }) {
  const t = useT();
  const { types, kind } = useVocab();
  const novelScene = kind !== "scenario" && card.type === "scene";
  const scriptScene = kind === "scenario" && card.type === "scene";
  const updateCard = useCosmos((s) => s.updateCard);
  // Redessine quand le texte de la scène grandit (par paliers) : « Proposer un synopsis » paraît dès qu'il a assez de mots.
  useCosmos((s) => (novelScene ? Math.min(20, Math.floor((s.manuscript[card.id]?.length ?? 0) / 40)) : 0));
  const imageUrl = useMediaUrl(card.image);

  return (
    <div className="expanded-card" style={{ ["--type" as string]: typeColor(card.type) }}>
      {/* Bouton de fermeture visible : au doigt, Échap n'existe pas et le fond peut être hors d'atteinte. */}
      <button type="button" className="expanded-close" aria-label={t.card.closeExpanded} title={t.card.closeExpanded} onClick={() => useCosmos.getState().setDialog(null)}>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
          <path d="M6 6l12 12M18 6L6 18" />
        </svg>
      </button>
      <p className="expanded-type">
        <span className="card-dot" aria-hidden="true" />
        {types[card.type].label}
      </p>
      {card.type === "scene" && !card.page && <SceneStatusPicker card={card} className="expanded-status" />}
      <h2 id="app-dialog-title" className="sr-only">
        {t.card.expandedTitle}
      </h2>
      <textarea
        className={`expanded-title${scriptScene ? " is-slugline" : ""}`}
        rows={1}
        value={card.title}
        placeholder={types[card.type].titlePlaceholder}
        aria-label={t.card.titleAria}
        onChange={(e) => updateCard(card.id, { title: e.target.value.replace(/\n/g, " ") })}
        onKeyDown={(e) => {
          if (e.key === "Enter") e.preventDefault();
        }}
      />
      {imageUrl && <img className="expanded-image" src={imageUrl} alt="" />}
      {scriptScene ? (
        <>
          {/* Scène d'un scénario : le titre est son en-tête ; synopsis et texte au format standard. */}
          <section className="expanded-draft" aria-label={t.draft.heading}>
            <ScriptSceneEditor card={card} />
          </section>
          {!card.page && <BreakdownSheet card={card} />}
          <button
            type="button"
            className="link-button expanded-open"
            onClick={() => {
              useCosmos.getState().setDialog(null);
              useCosmos.getState().setView("manuscrit");
            }}
          >
            {t.draft.openScreenplay}
          </button>
        </>
      ) : novelScene ? (
        <>
          {/* Scène d'un roman : son synopsis (sa note de plan), puis son texte, qu'on écrit ici. */}
          <CardSheet card={card} />
          {/* Mode Atelier : synopsis vide et texte écrit, « Proposer un synopsis » (comme dans le Manuscrit). */}
          {!card.page && <SynopsisSuggest sceneId={card.id} title={card.title} text={novelSceneText(card.id)} synopsis={card.fiche?.synopsis ?? ""} />}
          <section className="expanded-draft" aria-label={t.draft.heading}>
            <h3 className="expanded-draft-title">{t.draft.heading}</h3>
            <DraftEditor card={card} autofocus />
          </section>
          <button type="button" className="link-button expanded-open" onClick={() => {
              useCosmos.getState().setDialog(null);
              useCosmos.getState().openInManuscript(card.id);
            }}>
            {t.draft.openManuscript}
          </button>
        </>
      ) : (
        <>
          <div className="expanded-body">
            <BibleBody card={card} />
          </div>
          <CardSheet card={card} />
        </>
      )}
    </div>
  );
}
