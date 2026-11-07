// Une valeur qui ne suit la valeur réelle qu'après une pause : pour les calculs lourds relancés à chaque frappe
// (relecture de tout le livre). La première valeur est immédiate. `active` faux : la valeur réelle est rendue
// telle quelle, sans minuterie ni changement d'état, et la valeur retenue la rejoint d'un coup quand `active`
// redevient vrai.

import { useEffect, useRef, useState } from "react";

export function useSettled<T>(value: T, delayMs: number, active = true): T {
  const [settled, setSettled] = useState(value);
  const latest = useRef(value);
  latest.current = value;
  // Activation : on repart de la valeur du moment (jamais d'une valeur retenue il y a longtemps).
  useEffect(() => {
    if (active) setSettled(latest.current);
  }, [active]);
  useEffect(() => {
    if (!active || Object.is(settled, value)) return;
    const timer = window.setTimeout(() => setSettled(value), delayMs);
    return () => window.clearTimeout(timer);
  }, [value, settled, delayMs, active]);
  return active ? settled : value;
}
