// Série (docs/plan-episodes.md, lot 1) : choix de l'épisode écrit, en tête de la liste des scènes de la vue Scénario
// et du séquencier. Un menu des épisodes de la saison (cartes Épisode, dans l'ordre de la série), les flèches de
// l'épisode précédent et suivant, et « Nouvel épisode ». Choisir un épisode qui n'a pas encore de texte le lui donne.
// Rien n'est affiché hors d'un scénario, ni tant que le projet n'a aucune carte Épisode.

import { useMemo } from "react";
import { MoreMenu, type MoreItem } from "./MoreMenu";
import { fmt, useT } from "../i18n";
import { useCosmos } from "../store";
import { episodeNumbers, episodeOrder } from "../episodes";
import { episodeIds, isSeason, resolveEpisode } from "../screenplay/season";

export function EpisodePicker({ beforeSwitch, onNotice }: { beforeSwitch?: () => void; onNotice?: (text: string) => void }) {
  const t = useT().season;
  const kind = useCosmos((s) => s.kind);
  const nodes = useCosmos((s) => s.nodes);
  const full = useCosmos((s) => s.screenplay);
  const current = useCosmos((s) => resolveEpisode(s.screenplay, s.currentEpisode));
  const cards = useMemo(() => nodes.map((n) => n.data), [nodes]);
  const order = useMemo(() => episodeOrder(cards), [cards]);
  const numbers = useMemo(() => episodeNumbers(order), [order]);
  const written = useMemo(() => episodeIds(full), [full]);
  if (kind !== "scenario" || !full || (order.length === 0 && !isSeason(full))) return null;

  // Les épisodes de la série, puis un texte écrit dont la carte n'existe plus (jamais caché).
  const ids = [...order.map((c) => c.id), ...written.filter((id) => !order.some((c) => c.id === id))];
  const labelOf = (id: string) => {
    const card = order.find((c) => c.id === id);
    const title = card?.title.trim() || t.untitled;
    const n = numbers.get(id);
    return n ? fmt(t.episodeTitled, { n, title }) : title;
  };
  const open = (id: string) => {
    if (id === current) return;
    beforeSwitch?.();
    const starting = !isSeason(useCosmos.getState().screenplay);
    useCosmos.getState().openEpisode(id);
    const now = useCosmos.getState();
    const opened = resolveEpisode(now.screenplay, now.currentEpisode);
    if (!opened) return;
    // Le texte déjà écrit vient de devenir celui du premier épisode : on le dit.
    if (starting && full.elements.length > 0) onNotice?.(fmt(t.started, { title: labelOf(episodeIds(now.screenplay)[0]) }));
    else onNotice?.(fmt(t.opened, { title: labelOf(opened) }));
  };
  const addEpisode = () => {
    const s = useCosmos.getState();
    const highest = Math.max(0, ...order.map((c) => Number(/\d+/.exec(c.fiche?.numero ?? "")?.[0] ?? 0)));
    const id = s.addTitledCard("episode", "");
    // Le numéro suit le dernier ; sans numéros, l'ordre du canevas le donne déjà.
    if (highest > 0) s.setFiche(id, "numero", String(highest + 1));
    open(id);
  };

  const at = current ? ids.indexOf(current) : -1;
  const label = current ? labelOf(current) : t.whole;
  const items: MoreItem[] = [
    ...ids.map((id) => ({
      label: labelOf(id),
      onSelect: () => open(id),
      hint: id === current ? t.current : written.includes(id) ? undefined : t.toWrite,
    })),
    { label: t.newEpisode, onSelect: addEpisode },
  ];
  return (
    <div className="episode-picker" role="group" aria-label={t.picker}>
      <button type="button" className="icon-button" aria-label={t.previous} title={t.previous} disabled={at <= 0} onClick={() => open(ids[at - 1])}>
        <span aria-hidden="true">‹</span>
      </button>
      <MoreMenu
        items={items}
        label={fmt(t.pickerAria, { title: label })}
        className="episode-picker-menu"
        icon={
          <>
            <span className="episode-picker-label">{label}</span>
            <span className="disclosure is-open" aria-hidden="true" />
          </>
        }
      />
      <button type="button" className="icon-button" aria-label={t.next} title={t.next} disabled={at >= ids.length - 1} onClick={() => open(ids[at + 1])}>
        <span aria-hidden="true">›</span>
      </button>
    </div>
  );
}

/** Ouvre le texte d'un épisode dans la vue Scénario (carte agrandie, Bible, menu ⋯ de la carte). */
export function writeEpisode(id: string) {
  const s = useCosmos.getState();
  s.openEpisode(id);
  if (s.dialog === "card") s.setDialog(null);
  s.setView("manuscrit");
}

/** « Écrire l'épisode », sur la fiche d'une carte Épisode d'un scénario. */
export function WriteEpisodeButton({ id }: { id: string }) {
  const t = useT().season;
  const kind = useCosmos((s) => s.kind);
  if (kind !== "scenario") return null;
  return (
    <button type="button" className="ghost-button episode-write" title={t.writeHint} onClick={() => writeEpisode(id)}>
      {t.write}
    </button>
  );
}
