// Césure algorithmique pour le catalan (norme IEC), sans dépendance externe.

const VOWELS = "aeiouàèéíòóúïüAEIOUÀÈÉÍÒÓÚÏÜ";
const WEAK_VOWELS = "iuIU";
const isVowel = (ch: string) => VOWELS.includes(ch);
const isConsonant = (ch: string) => /[a-zA-ZçÇñÑ·]/.test(ch) && !isVowel(ch);

const INSEPARABLE_CLUSTERS = new Set([
  "bl", "br", "cl", "cr", "dr", "fl", "fr", "gl", "gr", "pl", "pr", "tr",
  "ll", "ny", "gu", "qu",
]);

function hyphenateWord(word: string, hyphenChar: string, minWordLength: number): string {
  const len = word.length;
  if (len < minWordLength) return word;

  const lower = word.toLowerCase();
  const points: number[] = [];

  for (let i = 2; i <= len - 3; i++) {
    const prev = lower[i - 1];
    const curr = lower[i];
    const next = lower[i + 1] ?? "";
    const prev2 = lower[i - 2] ?? "";

    if (prev === "'" || prev === "’" || curr === "'" || curr === "’" || prev === "-" || curr === "-") {
      continue;
    }

    // Ela geminada (l·l -> col-legi)
    if (curr === "·" && prev === "l" && next === "l") {
      points.push(i);
      continue;
    }
    if (prev === "·" || next === "·") continue;

    // Vocal + Vocal (hiats vs diftongs)
    if (isVowel(prev) && isVowel(curr)) {
      if ((prev2 === "g" || prev2 === "q") && (prev === "u" || prev === "ü")) continue;
      if (WEAK_VOWELS.includes(curr)) continue;
      points.push(i);
      continue;
    }

    // Vocal + Consonant + Vocal
    if (isVowel(prev) && isConsonant(curr) && isVowel(next)) {
      points.push(i);
      continue;
    }

    // Consonant + Consonant
    if (isConsonant(prev) && isConsonant(curr)) {
      const pair = prev + curr;
      if ((pair === "gu" || pair === "qu") && "eiéèíï".includes(next)) continue;
      if (INSEPARABLE_CLUSTERS.has(pair) && isVowel(prev2)) continue;
      if ([...lower.slice(0, i)].some(isVowel) && [...lower.slice(i)].some(isVowel)) {
        points.push(i);
      }
    }
  }

  if (points.length === 0) return word;

  let out = "";
  let last = 0;
  for (const idx of points) {
    out += word.slice(last, idx) + hyphenChar;
    last = word[idx] === "·" ? idx + 1 : idx;
  }
  return out + word.slice(last);
}

export function hyphenateSync(
  text: string,
  options?: { hyphenChar?: string; minWordLength?: number },
): string {
  const hyphenChar = options?.hyphenChar ?? "\u00ad";
  const minWordLength = options?.minWordLength ?? 6;
  return text.replace(/[a-zA-ZàèéíòóúïüçÇñÑÀÈÉÍÒÓÚÏÜ·'’-]+/g, (w) =>
    hyphenateWord(w, hyphenChar, minWordLength),
  );
}