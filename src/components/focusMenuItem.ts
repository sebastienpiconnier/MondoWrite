import type { KeyboardEvent } from "react";

/** Déplace le focus entre les actions actives ; chaque menu décide comment il se ferme. */
export function focusMenuItem(event: KeyboardEvent, role: "menuitem" | "option" = "menuitem"): boolean {
  const { key } = event;
  if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(key)) return false;
  const items = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>(`[role="${role}"]:not(:disabled)`));
  if (!items.length) return false;
  const current = items.indexOf(document.activeElement as HTMLButtonElement);
  let index = 0;
  if (key === "End") index = items.length - 1;
  if (key === "ArrowDown") index = (current + 1) % items.length;
  if (key === "ArrowUp") index = (current <= 0 ? items.length : current) - 1;
  items[index].focus();
  event.preventDefault();
  event.stopPropagation();
  return true;
}
