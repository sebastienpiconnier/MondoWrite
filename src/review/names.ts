// Noms presque identiques (« INES » et « INÈS », « JEAN-PAUL » et « JEAN PAUL », une lettre d'écart) :
// repérés pour la vérification du texte. Fonctions pures.

/** Nom replié : sans accents, en capitales, tirets, apostrophes et espaces réduits à une espace. */
export function foldName(name: string): string {
  return name
    .normalize("NFD")
    .replace(/\p{M}+/gu, "")
    .toUpperCase()
    .replace(/[\s\-‐‑'’.]+/g, " ")
    .trim();
}

/** Distance d'édition (insertions, suppressions, remplacements), arrêtée dès qu'elle dépasse `max`. */
export function editDistance(a: string, b: string, max = 2): number {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const row = [i];
    let best = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      row[j] = Math.min(prev[j] + 1, row[j - 1] + 1, prev[j - 1] + cost);
      best = Math.min(best, row[j]);
    }
    if (best > max) return max + 1;
    prev = row;
  }
  return prev[b.length];
}

/**
 * Deux noms différents qui désignent sans doute la même personne : identiques une fois repliés, ou à une
 * lettre près pour des noms d'au moins 4 lettres (en deçà, « LÉA » et « LÉO » sont deux personnages).
 */
export function similarNames(a: string, b: string): boolean {
  if (a === b) return false;
  const fa = foldName(a);
  const fb = foldName(b);
  if (!fa || !fb) return false;
  if (fa === fb) return true;
  if (Math.min(fa.length, fb.length) < 4) return false;
  return editDistance(fa, fb, 1) <= 1;
}
