import { foldCommand } from "./commandList";

function oneEdit(a: string, b: string): boolean {
  if (Math.abs(a.length - b.length) > 1) return false;
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i++;
  if (a.length < b.length) return a.slice(i) === b.slice(i + 1);
  if (a.length > b.length) return a.slice(i + 1) === b.slice(i);
  return a.slice(i + 1) === b.slice(i + 1) ||
    (a[i] === b[i + 1] && a[i + 1] === b[i] && a.slice(i + 2) === b.slice(i + 2));
}

function tokens(text: string): string[] {
  const expanded = text.replace(/−/g, "-").replace(/⌘/g, " cmd ").replace(/⇧/g, " shift ").replace(/⌥/g, " alt ")
    .replace(/\bcommand\b/gi, "cmd").replace(/\bcontrol\b/gi, "ctrl").replace(/\boption\b/gi, "alt");
  return foldCommand(expanded).match(/[\p{L}\p{N}]+|[^\s\p{L}\p{N}]/gu) ?? [];
}

function keyTokens(key: string): string[] {
  const range = /^(\d)…(\d)$/.exec(key);
  if (!range) return tokens(key);
  const start = Number(range[1]);
  return Array.from({ length: Number(range[2]) - start + 1 }, (_, i) => String(start + i));
}

export function shortcutScore(query: string, label: string, group: string, keys: readonly string[], shiftLabel = "Shift"): number {
  if (!query.trim()) return 0;
  const localizedShift = foldCommand(shiftLabel);
  const terms = tokens(query).map(term => term === localizedShift ? "shift" : term);
  const modifiers = ["cmd", "ctrl", "shift", "alt"];
  const chord = terms.some(term => modifiers.includes(term));
  const keyWords = keys.flatMap(keyTokens);
  const words = tokens(label);
  const context = tokens(group);
  let score = 0;
  for (const term of terms) {
    if (term === "+" && chord && !query.trim().endsWith("+")) continue;
    if (keyWords.includes(term)) continue;
    if (chord && (term.length === 1 || modifiers.includes(term))) return Infinity;
    if (words.includes(term)) continue;
    if (context.includes(term) || words.some(w => w.startsWith(term))) score += 1;
    else if (context.some(w => w.startsWith(term)) || words.some(w => w.includes(term))) score += 2;
    else if (term.length >= 3 && words.some(w => oneEdit(term, w))) score += 3;
    else return Infinity;
  }
  return terms.length ? score : Infinity;
}
