function edgeDistance(pos: number, min: number, max: number, elapsed: number) {
  const band = Math.min(64, (max - min) / 4);
  if (band <= 0) return 0;
  const edge = Math.max(0, 1 - (max - pos) / band) - Math.max(0, 1 - (pos - min) / band);
  return Math.sign(edge) * Math.max(1, Math.abs(edge) * elapsed * 1.1);
}

function canScroll(el: HTMLElement, overflow: string) {
  return /^(auto|scroll|overlay)$/.test(overflow) || (el === document.scrollingElement && overflow === "visible");
}

// Un dialogue ouvert constitue la limite : le fond ne défile pas pendant le geste.
function* scrollAncestors(origin: Element) {
  for (let el = origin instanceof HTMLElement ? origin : origin.parentElement; el; el = el.parentElement) {
    const { overflowX, overflowY } = getComputedStyle(el);
    if (el === document.scrollingElement || overflowX !== "visible" || overflowY !== "visible") {
      yield {
        el,
        clipX: overflowX !== "visible", clipY: overflowY !== "visible",
        scrollX: canScroll(el, overflowX), scrollY: canScroll(el, overflowY),
      };
    }
    if (el.matches("dialog[open]")) break;
  }
}

export function nearestScrollPanel(origin: Element) {
  for (const { el, scrollX, scrollY } of scrollAncestors(origin)) {
    if ((scrollX && el.scrollWidth > el.clientWidth) || (scrollY && el.scrollHeight > el.clientHeight)) return el;
  }
  return null;
}

export function createDragEdgeScroll(origin: Element, onScroll: () => void) {
  const panels = Array.from(scrollAncestors(origin)).reverse();
  const root = document.scrollingElement;
  let x = 0, y = 0, frame = 0, lastTime = 0;

  function step(now: number) {
    frame = 0;
    let left = 0, top = 0, right = window.innerWidth, bottom = window.innerHeight;
    const visible = panels.map(panel => {
      const { el, clipX, clipY } = panel;
      if ((clipX || clipY) && el !== root) {
        const rect = el.getBoundingClientRect();
        const panelLeft = rect.left + el.clientLeft;
        const panelTop = rect.top + el.clientTop;
        if (clipX) {
          left = Math.max(left, panelLeft);
          right = Math.min(right, panelLeft + el.clientWidth);
        }
        if (clipY) {
          top = Math.max(top, panelTop);
          bottom = Math.min(bottom, panelTop + el.clientHeight);
        }
      }
      return { ...panel, left, right, top, bottom };
    });
    const elapsed = Math.min(now - lastTime, 32);
    lastTime = now;
    let movedX = false, movedY = false;
    for (const panel of visible.reverse()) {
      if (x < panel.left || x > panel.right || y < panel.top || y > panel.bottom) continue;
      const { el } = panel;
      if (!movedX && panel.scrollX && el.scrollWidth > el.clientWidth) {
        const before = el.scrollLeft;
        el.scrollLeft += edgeDistance(x, panel.left, panel.right, elapsed);
        movedX = before !== el.scrollLeft;
      }
      if (!movedY && panel.scrollY && el.scrollHeight > el.clientHeight) {
        const before = el.scrollTop;
        el.scrollTop += edgeDistance(y, panel.top, panel.bottom, elapsed);
        movedY = before !== el.scrollTop;
      }
    }
    if (movedX || movedY) {
      frame = requestAnimationFrame(step);
      onScroll();
    }
  }

  return {
    update(clientX: number, clientY: number) {
      x = clientX;
      y = clientY;
      if (!frame) {
        lastTime = performance.now();
        frame = requestAnimationFrame(step);
      }
    },
    stop() { cancelAnimationFrame(frame); frame = 0; },
  };
}
