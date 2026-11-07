// Une valeur qui ne suit la valeur réelle qu'après une pause : pour les calculs lourds relancés à chaque frappe
// (relecture de tout le livre). La première valeur est immédiate.

import { useEffect, useState } from "react";

export function useSettled<T>(value: T, delayMs: number): T {
  const [settled, setSettled] = useState(value);
  useEffect(() => {
    if (Object.is(settled, value)) return;
    const timer = window.setTimeout(() => setSettled(value), delayMs);
    return () => window.clearTimeout(timer);
  }, [value, settled, delayMs]);
  return settled;
}
