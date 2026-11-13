import { useEffect, useState } from "react";

/**
 * Grand écran (coque de verre, dès 1100 px) : l'élément de la colonne de gauche où une vue pose son propre sommaire
 * (liste des scènes du Manuscrit et du Scénario, sommaire de la Bible) par un portail. Null en dessous : la vue le
 * garde en ligne, comme avant.
 */
export function useShellSlot(): HTMLElement | null {
  const [slot, setSlot] = useState<HTMLElement | null>(null);
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 1100px)");
    const sync = () => setSlot(mq.matches ? document.getElementById("shell-slot") : null);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);
  return slot;
}
