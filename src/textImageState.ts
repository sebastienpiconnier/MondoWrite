// Image à poser dans le texte d'une scène (lot 1 de #84) : l'éditeur qui la demande se déclare ici, la fenêtre
// Photos (ou le choix d'un fichier) rend le nom du fichier copié dans medias/. État d'affichage, rien n'est
// enregistré : comme `openSynonyms`, un seul éditeur à la fois.

export interface TextImage {
  /** Nom du fichier de medias/. */
  media: string;
  /** Description (texte alternatif), à compléter par l'auteur. */
  alt?: string;
  /** Crédit d'une photo libre : posé en légende, en italique, sous l'image (texte ordinaire, modifiable). */
  credit?: string;
}

type Deliver = (image: TextImage) => void;
let pending: Deliver | null = null;

/** L'éditeur qui demande une image se déclare (la dernière demande l'emporte). */
export function awaitTextImage(deliver: Deliver) {
  pending = deliver;
}

/** Pose l'image dans l'éditeur qui l'attend. Rend faux si aucun n'attend plus (fermé entre-temps). */
export function deliverTextImage(image: TextImage): boolean {
  const deliver = pending;
  pending = null;
  if (!deliver) return false;
  deliver(image);
  return true;
}

/** Plus d'image attendue (fenêtre fermée sans choix, éditeur démonté). */
export function forgetTextImage(deliver?: Deliver) {
  if (!deliver || pending === deliver) pending = null;
}
