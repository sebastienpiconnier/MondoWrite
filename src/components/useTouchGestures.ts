// Gestes au doigt d'une vue (voir touchGestures.ts) : les gestionnaires sont relus à chaque geste.

import { useEffect, useRef, type RefObject } from "react";
import { attachTouchGestures, type GestureHandlers } from "../touchGestures";

export function useTouchGestures(ref: RefObject<HTMLElement | null>, handlers: GestureHandlers): void {
  const latest = useRef(handlers);
  latest.current = handlers;
  const attached = useRef<{ el: HTMLElement; detach: () => void } | null>(null);
  // Relu à chaque rendu : l'élément peut n'apparaître qu'ensuite (Bible vide, puis une première fiche).
  useEffect(() => {
    const el = ref.current;
    if (attached.current?.el === el) return;
    attached.current?.detach();
    attached.current = el ? { el, detach: attachTouchGestures(el, () => latest.current) } : null;
  });
  useEffect(
    () => () => {
      attached.current?.detach();
      attached.current = null;
    },
    [],
  );
}
