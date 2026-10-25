// Barre du haut : d'abord plus compacte (icônes), puis les vues sur une seconde ligne, dès que la marque, les vues
// et les actions ne tiennent plus côte à côte. Une largeur de fenêtre fixe ne suffisait pas : sur iPad la taille du texte du système
// (textScale.ts), un scénario (durée en plus) ou une langue plus longue élargissent le contenu, et les vues
// passaient par-dessus le logo. On mesure donc le contenu réel. Pas sur téléphone (≤ 720 px), qui a sa barre.

import { useLayoutEffect, useRef, useState, type RefObject } from "react";

const PHONE = 720;
/** Marge gardée entre les blocs, pour ne pas basculer d'une ligne à deux au pixel près. */
const SLACK = 8;

/** Largeur naturelle d'une rangée d'éléments : du bord gauche du premier au bord droit du dernier. */
function rowWidth(el: Element | null): number {
  if (!el || el.children.length === 0) return 0;
  const kids = [...el.children].filter((k) => (k as HTMLElement).offsetParent !== null);
  if (kids.length === 0) return 0;
  const first = kids[0].getBoundingClientRect();
  const last = kids[kids.length - 1].getBoundingClientRect();
  const style = getComputedStyle(el);
  return last.right - first.left + parseFloat(style.paddingLeft) + parseFloat(style.paddingRight);
}

/** Vrai quand la barre doit passer sur deux lignes. Fonction pure, testée. */
export function needsTwoRows(available: number, brand: number, views: number, actions: number, gap: number): boolean {
  return brand + views + actions + 2 * gap + SLACK > available;
}

/**
 * Disposition de la barre, en deux crans avant de passer sur deux lignes :
 * 1. « compacte » : « Projets » et « Exporter » en icônes, le statut d'enregistrement dans le bouton Enregistrer ;
 * 2. « sur deux lignes » : les vues sous la marque, seulement si la barre compacte ne tient toujours pas.
 * Fonction pure, testée. `fullActions` est la largeur des actions avec leurs libellés (mesurée hors compact),
 * `actions` la largeur actuelle.
 */
export function topbarLayout(available: number, brand: number, views: number, fullActions: number, actions: number, compact: boolean, gap: number): { compact: boolean; stacked: boolean } {
  if (!needsTwoRows(available, brand, views, fullActions, gap)) return { compact: false, stacked: false };
  // La largeur compacte n'est connue qu'une fois la barre compacte affichée : en attendant, une seule ligne.
  return { compact: true, stacked: compact && needsTwoRows(available, brand, views, actions, gap) };
}

export interface TopbarFit {
  compact: boolean;
  stacked: boolean;
}

export function useTopbarFit(ref: RefObject<HTMLElement | null>, deps: unknown[]): TopbarFit {
  const [fit, setFit] = useState<TopbarFit>({ compact: false, stacked: false });
  const full = useRef(0);
  useLayoutEffect(() => {
    const bar = ref.current;
    if (!bar || typeof ResizeObserver === "undefined") return;
    const measure = () => {
      if (window.innerWidth <= PHONE) return setFit((f) => (f.compact || f.stacked ? { compact: false, stacked: false } : f));
      const style = getComputedStyle(bar);
      const available = bar.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
      const gap = parseFloat(style.columnGap) || 0;
      // La marque ne descend jamais sous le logo et le nom (le titre du projet, lui, peut raccourcir).
      const logo = bar.querySelector(".brand > :first-child")?.getBoundingClientRect().width ?? 0;
      const name = bar.querySelector(".brand .wordmark")?.getBoundingClientRect().width ?? 0;
      const brand = logo + 10 + name;
      const compact = bar.classList.contains("is-compact");
      const actions = rowWidth(bar.querySelector(".actions"));
      if (!compact) full.current = actions;
      const next = topbarLayout(available, brand, rowWidth(bar.querySelector(".views")), full.current, actions, compact, gap);
      setFit((f) => (f.compact === next.compact && f.stacked === next.stacked ? f : next));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(bar);
    for (const el of bar.querySelectorAll(".views, .actions")) observer.observe(el);
    window.addEventListener("resize", measure);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", measure);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ref, ...deps]);
  return fit;
}
