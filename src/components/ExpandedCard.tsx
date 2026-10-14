// Une carte ouverte en grand (bouton « Agrandir », Cmd/Ctrl + Entrée) : son type, son titre, son image, son
// texte et sa fiche, avec la place d'écrire. C'est la même carte que sur le canevas (même état du store,
// rien n'est recopié) : ce qu'on écrit ici y est aussitôt. Échap ou un clic à côté ferme.

import { useT } from "../i18n";
import { useVocab } from "../vocab";
import { useCosmos } from "../store";
import { typeColor, type CardData } from "../types";
import { BibleBody } from "./BibleBody";
import { CardSheet } from "./CardSheet";
import { useMediaUrl } from "./useMediaUrl";
import { DraftEditor } from "./SceneDraft";

export function ExpandedCard({ card }: { card: CardData }) {
  const t = useT();
  const { types, kind } = useVocab();
  const novelScene = kind !== "scenario" && card.type === "scene";
  const updateCard = useCosmos((s) => s.updateCard);
  const imageUrl = useMediaUrl(card.image);

  return (
    <div className="expanded-card" style={{ ["--type" as string]: typeColor(card.type) }}>
      <p className="expanded-type">
        <span className="card-dot" aria-hidden="true" />
        {types[card.type].label}
      </p>
      <h2 id="app-dialog-title" className="sr-only">
        {t.card.expandedTitle}
      </h2>
      <textarea
        className="expanded-title"
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
      {novelScene ? (
        <>
          {/* Scène d'un roman : son synopsis (sa note de plan), puis son texte, qu'on écrit ici. */}
          <CardSheet card={card} />
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
