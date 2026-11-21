// Mode Lecture, mise au point (#103, #104) : reprendre la lecture là où on l'avait laissée après une correction, et
// montrer les choix fermés avec leur raison. Fonctions pures ; l'état de la séance vit dans playState.ts.

import { choicesIn } from "./choices";
import { condValue, type Fact } from "./facts";
import { readableCond, type CondWords } from "./conditions";

/** Un choix fait pendant la lecture : la scène où on l'a fait, son texte tel qu'Ink le montre, son rang parmi les choix ouverts. */
export interface Pick {
  scene: string | null;
  text: string;
  rank: number;
}

/**
 * Choix à rejouer parmi ceux qu'Ink propose : celui qui a le même texte (au même rang s'il y en a plusieurs) ; null
 * si ce choix n'existe plus ou n'est plus ouvert (on ne le remplace jamais par un autre).
 */
export function matchPick(open: readonly { text: string; index: number }[], pick: Pick): number | null {
  const same = open.filter((c) => c.text === pick.text);
  if (!same.length) return null;
  return (same.find((c) => c.index === pick.rank) ?? same[0]).index;
}

export interface ClosedChoice {
  label: string;
  reason: string;
}

/**
 * Choix fermés d'une scène : ses choix à condition (hors renvois cachés) qu'Ink ne propose pas en ce moment. Un choix
 * est retrouvé dans ceux qu'Ink propose par son texte, chacun une fois ; la raison est dite avec les mots du canevas.
 */
export function closedChoices(
  html: string | undefined,
  open: readonly string[],
  facts: readonly Fact[],
  words: { ifFact: string; ifNot: string; ifCond: string; cond: CondWords },
  defaultLabel: string,
): ClosedChoice[] {
  const left = [...open];
  const fill = (template: string, vars: Record<string, string>) => template.replace(/\{(\w+)\}/g, (all, k: string) => vars[k] ?? all);
  const labelOf = (name: string) => facts.find((f) => f.name === name)?.label ?? name.replace(/_+/g, " ");
  const out: ClosedChoice[] = [];
  for (const line of choicesIn(html)) {
    if (line.kind !== "choice" || line.hidden) continue;
    const label = line.label.trim() || defaultLabel;
    const at = left.indexOf(label);
    if (at >= 0) {
      left.splice(at, 1);
      continue;
    }
    if (!line.cond?.trim()) continue;
    const cv = condValue(line.cond);
    const m = /^(has|not):(.+)$/.exec(cv);
    const reason = m ? fill(m[1] === "not" ? words.ifNot : words.ifFact, { fact: labelOf(m[2]) }) : fill(words.ifCond, { cond: readableCond(line.cond, facts, words.cond) });
    out.push({ label, reason });
  }
  return out;
}
