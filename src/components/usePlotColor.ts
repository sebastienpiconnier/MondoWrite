// Couleur d'une scène par son intrigue principale (#143), quand le réglage de l'appareil `plotColors` est allumé.
// Le nom de chaque intrigue de la scène l'accompagne (#157) : au survol (`title`) et pour un lecteur d'écran.
import type { CSSProperties } from "react";
import { useMemo } from "react";
import { useCosmos } from "../store";
import { useSettings } from "../settings";
import { fmt, useT } from "../i18n";
import { plotColors, sceneBackground, sceneColor } from "../plotColors";

export interface PlotLook {
  className: string;
  style?: CSSProperties;
  /** « Intrigue : … » ou « Intrigues : …, … », dans l'ordre des bandes (la principale d'abord). */
  label?: string;
}

/** Pour chaque scène : classe, style et noms à poser sur sa ligne (rien si l'option est coupée ou sans intrigue). */
export function usePlotColor(): (sceneId: string | undefined) => PlotLook {
  const on = useSettings((s) => s.plotColors);
  const nodes = useCosmos((s) => s.nodes);
  const edges = useCosmos((s) => s.edges);
  const t = useT().plan;
  return useMemo(() => {
    if (!on) return () => ({ className: "" });
    const colors = plotColors(nodes, edges);
    const titles = new Map(nodes.map((n) => [n.id, n.data.title.trim() || t.untitled]));
    return (id: string | undefined) => {
      const color = sceneColor(colors, id);
      const bg = sceneBackground(colors, id);
      if (!color || !bg) return { className: "" };
      const names = (id ? colors.all.get(id) ?? [] : []).map((p) => titles.get(p) ?? "");
      const label = names.length === 1 ? fmt(t.plotNameOne, { name: names[0] }) : fmt(t.plotNameMany, { names: names.join(", ") });
      return { className: " has-plot", style: { ["--plot" as string]: color, ["--plot-bg" as string]: bg } as CSSProperties, label };
    };
  }, [on, nodes, edges, t]);
}
