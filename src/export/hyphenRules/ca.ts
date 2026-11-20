// Césure du catalan pour le livre broché, écrite pour MondoWrite d'après les règles de partició de mots a final de
// ratlla de l'IEC (Ortografia catalana, 2017 : sil·labificació gràfica). Pas de motifs de TeX : ceux du catalan
// (hyph-ca.tex) sont sous LPPL, qui ne se marie pas avec l'AGPL de MondoWrite. Première version d'Aitor Cereceto (#97).
//
// Règles suivies :
// - une consonne entre deux voyelles va avec la seconde (ca-sa) ;
// - deux consonnes se séparent (par-tir, ter-ra, pas-sar, cot-xe, met-ge, set-ze), sauf un groupe consonne + l ou r
//   qui ouvre la syllabe (pro-gra-ma, re-dre-çar ; jamais dl ni tl : at-les) ;
// - trois consonnes ou plus : coupure avant la dernière, ou avant le groupe consonne + l ou r (ins-pi-ra-ció,
//   amb-dós, es-crip-tu-ra, cons-trè-nyer) ;
// - ll, ny, et gu, qu devant une voyelle ne se séparent jamais (ca-llem, mun-ta-nya, guer-ra, qua-ran-ta) ;
// - l·l se sépare et le point tombe à la coupure (col-legi, no-vel-la) : la coupure est posée après le point,
//   que la mise en page retire (`splitWord` de paperback.ts) ;
// - diphtongues jamais séparées (ai-re, ciu-tat, cui-na, fei-na) ; i et u en tête de mot ou entre deux voyelles sont
//   des consonnes (io-gurt, no-ia) ;
// - hiatus : coupure entre deux voyelles fortes ou devant une voyelle accentuée (po-e-ta, ve-ï-na), jamais après un
//   i ou un u sans accent (ci-ència serait juste, mais se lit mal : on s'en abstient).
// La mise en page ajoute ses propres bornes : trois lettres au moins de chaque côté, jamais un mot à majuscule.
// Fonctions pures, testées (src/__tests__/hyphen-ca.test.ts).

const SHY = "­";
const VOWELS = "aeiouàèéíòóúïü";
/** Voyelles qui portent toujours une syllabe (fortes, ou faibles accentuées ou à tréma). */
const NUCLEI = "aeoàèéòóíúï";
const STOPS = "bcdfgkpt";

type Kind = "V" | "G" | "C" | "D";

/** Rôle de chaque lettre : voyelle qui porte la syllabe, semi-voyelle, consonne, point de l'ela geminada. */
function kinds(w: string): { kind: Kind[]; glued: Set<number> } {
  const kind: Kind[] = [];
  const glued = new Set<number>();
  const isVowel = (i: number) => i >= 0 && i < w.length && VOWELS.includes(w[i]);
  for (let i = 0; i < w.length; i++) {
    const ch = w[i];
    if (ch === "·") kind.push("D");
    else if (!VOWELS.includes(ch)) kind.push("C");
    else if ((ch === "u" || ch === "ü") && (w[i - 1] === "g" || w[i - 1] === "q") && isVowel(i + 1)) {
      // gu, qu, gü, qü devant une voyelle : le u fait partie de la consonne (guer-ra, qua-ran-ta, pin-güí).
      kind.push("C");
      glued.add(i);
    } else if (NUCLEI.includes(ch)) kind.push("V");
    else if (ch === "ü") kind.push("V");
    else if ((i === 0 || kind[i - 1] === "V" || kind[i - 1] === "G") && isVowel(i + 1)) kind.push("C"); // io-gurt, no-ia
    else if (kind[i - 1] === "V") kind.push("G"); // ai, ei, oi, ui, au, eu, iu, ou
    else kind.push("V");
  }
  return { kind, glued };
}

/** Groupe consonne + l ou r qui ouvre une syllabe (bl, br, cl, cr, dr, fl, fr, gl, gr, pl, pr, tr…). */
const isOnset = (a: string, b: string) => STOPS.includes(a) && (b === "r" || (b === "l" && a !== "d" && a !== "t"));

/** Places où un mot (en minuscules) peut se couper : la coupure se fait avant chacun de ces rangs. */
export function catalanBreaks(word: string): number[] {
  const w = word.toLowerCase();
  if (w.length !== word.length) return [];
  const { kind, glued } = kinds(w);
  const nuclei = kind.flatMap((k, i) => (k === "V" ? [i] : []));
  const breaks: number[] = [];
  for (let n = 0; n + 1 < nuclei.length; n++) {
    const p = nuclei[n];
    const q = nuclei[n + 1];
    let s = p + 1;
    while (s < q && kind[s] === "G") s++;
    if (s === q) {
      // Hiatus : seulement après une voyelle forte ou accentuée.
      if (NUCLEI.includes(w[q - 1]) && NUCLEI.includes(w[q])) breaks.push(q);
      continue;
    }
    // Consonnes en unités : ll, ny, gu, qu et l· restent entiers.
    const units: { at: number; text: string }[] = [];
    for (let i = s; i < q; i++) {
      const last = units[units.length - 1];
      const joins =
        last &&
        (glued.has(i) ||
          kind[i] === "D" ||
          (w[i] === "l" && last.text === "l" && w[i - 1] === "l") ||
          (w[i] === "y" && last.text === "n"));
      if (joins) last.text += w[i];
      else units.push({ at: i, text: w[i] });
    }
    if (units.some((u) => kind[u.at] === "D")) continue;
    const k = units.length;
    if (k === 1) breaks.push(units[0].at);
    else {
      const a = units[k - 2].text;
      const b = units[k - 1].text;
      breaks.push(a.length === 1 && b.length === 1 && isOnset(a, b) ? units[k - 2].at : units[k - 1].at);
    }
  }
  return breaks;
}

/** Le mot avec ses coupures possibles (traits d'union conditionnels). */
export function hyphenateCatalan(word: string, hyphenChar = SHY): string {
  const breaks = new Set(catalanBreaks(word));
  let out = "";
  for (let i = 0; i < word.length; i++) {
    if (breaks.has(i)) out += hyphenChar;
    out += word[i];
  }
  return out;
}

/** Même interface que les motifs du paquet `hyphen` : chaque mot du texte reçoit ses coupures. */
export function hyphenateSync(text: string, options?: { hyphenChar?: string; minWordLength?: number }): string {
  const hyphenChar = options?.hyphenChar ?? SHY;
  const min = options?.minWordLength ?? 6;
  return text.replace(/[\p{L}\p{M}]+(?:·[\p{L}\p{M}]+)*/gu, (w) => (w.length < min ? w : hyphenateCatalan(w, hyphenChar)));
}

export default { hyphenateSync };
