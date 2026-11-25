// Couleur d'une scène par son intrigue principale (#143), quand le réglage de l'appareil `plotColors` est allumé.
import type { CSSProperties } from "react";
import { useMemo } from "react";
import { useCosmos } from "../store";
import { useSettings } from "../settings";
import { plotColors, sceneBackground, sceneColor } from "../plotColors";

/** Pour chaque scène : classe et style à poser sur sa ligne (rien si l'option est coupée ou sans intrigue). */
export function usePlotColor(): (sceneId: string | undefined) => { className: string; style?: CSSProperties } {
  const on = useSettings((s) => s.plotColors);
  const nodes = useCosmos((s) => s.nodes);
  const edges = useCosmos((s) => s.edges);
  return useMemo(() => {
    if (!on) return () => ({ className: "" });
    const colors = plotColors(nodes, edges);
    return (id: string | undefined) => {
      const color = sceneColor(colors, id);
      const bg = sceneBackground(colors, id);
      return color && bg ? { className: " has-plot", style: { ["--plot" as string]: color, ["--plot-bg" as string]: bg } as CSSProperties } : { className: "" };
    };
  }, [on, nodes, edges]);
}
