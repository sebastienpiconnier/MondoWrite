// Aides qui s'effacent une fois apprises (#59). La consigne du canevas part quand l'auteur a fait les trois gestes
// (créer une carte, tirer un fil, changer un type) ; les touches du scénario (Tab, Entrée, Échap) quand il a changé
// cinq fois d'élément avec Tab. Le progrès est gardé sur l'appareil (jamais dans le projet), puis l'aide passe dans
// `learned` des réglages. La visite guidée les fait revenir (`unlearnAll`).

import { useSettings, type LearnedHint } from "./settings";

const KEY = "mondowrite.learn";

/** Gestes de la consigne du canevas. */
export const CANVAS_STEPS = ["card", "wire", "type"] as const;
/** Changements d'élément par Tab avant que les touches du scénario ne soient tenues pour apprises. */
export const TAB_USES = 5;

type Progress = Partial<Record<LearnedHint, string[]>>;

/** Progrès après un geste : la liste des gestes faits, sans doublon, et si tout ce qui est demandé est fait. Pur. */
export function stepsAfter(done: readonly string[], step: string, required: readonly string[]): { done: string[]; complete: boolean } {
  const next = done.includes(step) ? [...done] : [...done, step];
  return { done: next, complete: required.every((r) => next.includes(r)) };
}

function read(): Progress {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? "{}");
    return raw && typeof raw === "object" ? (raw as Progress) : {};
  } catch {
    return {};
  }
}

function write(p: Progress) {
  try {
    localStorage.setItem(KEY, JSON.stringify(p));
  } catch {
    /* le progrès vaut pour la session */
  }
}

/** Note un geste pour une aide ; l'aide est apprise quand tous les gestes demandés sont faits. */
export function noteStep(hint: LearnedHint, step: string, required: readonly string[]) {
  const settings = useSettings.getState();
  if (settings.learned.includes(hint)) return;
  const progress = read();
  const { done, complete } = stepsAfter(progress[hint] ?? [], step, required);
  if (complete) {
    delete progress[hint];
    write(progress);
    settings.learn(hint);
  } else {
    write({ ...progress, [hint]: done });
  }
}

/** Note un usage compté (le n-ième Tab) : l'aide est apprise au bout de `need` usages. */
export function noteUse(hint: LearnedHint, need: number) {
  if (useSettings.getState().learned.includes(hint)) return;
  const n = (read()[hint]?.length ?? 0) + 1;
  noteStep(hint, `use${n}`, Array.from({ length: need }, (_, k) => `use${k + 1}`));
}

/** Toutes les aides reviennent (visite guidée). */
export function unlearnAll() {
  write({});
  useSettings.getState().unlearnAll();
}
