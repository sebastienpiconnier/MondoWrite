// Série (plan des épisodes, lot 3) : ce que les exports du scénario prennent. Par défaut l'épisode ouvert dans
// la vue Scénario ; la fenêtre PDF permet de choisir tout le scénario, une saison ou un épisode (`exportPart`,
// état d'affichage). Une partie a sa page de titre : le titre du projet, puis le nom de la partie.

import { useMemo } from "react";
import { fmt, getT, useT } from "../i18n";
import { type CosmosState, useCosmos } from "../store";
import type { Screenplay } from "../screenplay/model";
import { allEpisodes, resolveEpisode, seriesOf, seriesPart } from "../screenplay/series";

type Part = { id: string; label: string };

/** Saisons et épisodes proposés, dans l'ordre (une saison sans titre a son numéro). */
export function exportParts(sp: Screenplay | null, t = getT()): Part[] {
  if (!sp) return [];
  const ts = t.season;
  return seriesOf(sp.elements).flatMap((season, i) => [
    ...(season.id ? [{ id: season.id, label: season.title.trim() || fmt(ts.seasonDefault, { n: i + 1 }) }] : []),
    ...season.episodes.map((ep) => ({ id: ep.id, label: fmt(ts.episodeTitled, { n: ep.number, title: ep.title || ts.untitled }) })),
  ]);
}

/** Partie exportée : celle choisie, sinon l'épisode ouvert ; null pour tout le scénario. */
export function exportPartOf(s: Pick<CosmosState, "screenplay" | "exportPart" | "currentEpisode">): string | null {
  const parts = exportParts(s.screenplay);
  if (s.exportPart === "") return null;
  if (s.exportPart && parts.some((p) => p.id === s.exportPart)) return s.exportPart;
  return resolveEpisode(s.screenplay, s.currentEpisode);
}

/** Texte à exporter (hors d'une série : le scénario entier, tel quel). */
export function exportScriptOf(s: Pick<CosmosState, "screenplay" | "exportPart" | "currentEpisode">): Screenplay | null {
  if (!s.screenplay) return null;
  if (allEpisodes(s.screenplay.elements).length === 0) return s.screenplay;
  const id = exportPartOf(s);
  const label = exportParts(s.screenplay).find((p) => p.id === id)?.label ?? "";
  return seriesPart(s.screenplay, id, label);
}

export function useExportScript(): { script: Screenplay | null; parts: Part[]; part: string | null } {
  const t = useT();
  const screenplay = useCosmos((s) => s.screenplay);
  const exportPart = useCosmos((s) => s.exportPart);
  const currentEpisode = useCosmos((s) => s.currentEpisode);
  return useMemo(() => {
    const state = { screenplay, exportPart, currentEpisode };
    return { script: exportScriptOf(state), parts: exportParts(screenplay, t), part: exportPartOf(state) };
  }, [screenplay, exportPart, currentEpisode, t]);
}
