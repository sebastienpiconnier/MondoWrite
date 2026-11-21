// Demande de note sur l'App Store (src/storeReview.ts) : jours d'utilisation, mises à jour fréquentes, délai entre
// deux demandes, état relu du stockage local.

import { describe, expect, it } from "vitest";
import { APP_STORE_REVIEW_URL, REVIEW_RULES, cleanReview, dayOf, noteUse, reviewDue, type ReviewState } from "../storeReview";

const DAY = 24 * 60 * 60 * 1000;
const t0 = new Date("2026-11-02T10:00:00").getTime();
const long = REVIEW_RULES.minSession;

/** Un auteur qui ouvre un projet chaque jour pendant `n` jours, toujours la même version. */
function regular(n: number, v = "1.43.0"): ReviewState {
  let state: ReviewState | null = null;
  for (let i = 0; i < n; i++) state = noteUse(state, t0 + i * DAY, v);
  return state!;
}

describe("demande de note sur l'App Store", () => {
  it("compte des jours différents, pas des ouvertures", () => {
    let s = noteUse(null, t0, "1.43.0");
    s = noteUse(s, t0 + 60_000, "1.43.0");
    s = noteUse(s, t0 + 3 * 60 * 60 * 1000, "1.43.0");
    expect(s.days).toEqual([dayOf(t0)]);
    expect(s.firstUse).toBe(t0);
  });

  it("ne garde que les derniers jours utiles", () => {
    expect(regular(12).days).toHaveLength(REVIEW_RULES.minDays);
  });

  it("demande chez un auteur qui revient, après une vraie séance", () => {
    const s = regular(8);
    const now = t0 + 8 * DAY;
    expect(reviewDue(s, now, long)).toBe(true);
    expect(reviewDue(s, now, long - 1)).toBe(false);
  });

  it("pas avant assez de jours ni assez d'ancienneté", () => {
    expect(reviewDue(regular(4), t0 + 10 * DAY, long)).toBe(false);
    // Cinq jours d'affilée : assez de jours, mais l'app n'a que cinq jours.
    expect(reviewDue(regular(5), t0 + 5 * DAY, long)).toBe(false);
    expect(reviewDue(null, t0, long)).toBe(false);
  });

  it("jamais dans les jours qui suivent une mise à jour, même fréquentes", () => {
    let s = regular(8);
    const update = t0 + 8 * DAY;
    s = noteUse(s, update, "1.44.0");
    expect(s.versionSince).toBe(update);
    expect(reviewDue(s, update + DAY, long)).toBe(false);
    expect(reviewDue(s, update + REVIEW_RULES.afterUpdate, long)).toBe(true);
    // Même version rouverte le lendemain : la date d'arrivée ne bouge pas.
    expect(noteUse(s, update + DAY, "1.44.0").versionSince).toBe(update);
  });

  it("au moins quatre mois entre deux demandes", () => {
    const now = t0 + 8 * DAY;
    const s = { ...regular(8), asked: now };
    expect(reviewDue(s, now + 30 * DAY, long)).toBe(false);
    expect(reviewDue(s, now + REVIEW_RULES.minGap, long)).toBe(true);
  });

  it("écarte un état abîmé du stockage local", () => {
    expect(cleanReview(null)).toBeNull();
    expect(cleanReview({ firstUse: "hier" })).toBeNull();
    const s = cleanReview({ firstUse: t0, days: ["2026-11-02", "x", "2026-11-02", 4], version: "1.43.0", versionSince: t0, asked: -1 });
    expect(s).toEqual({ firstUse: t0, days: ["2026-11-02"], version: "1.43.0", versionSince: t0 });
  });

  it("le bouton ouvre l'écriture d'un avis sur la page de l'app", () => {
    expect(APP_STORE_REVIEW_URL).toMatch(/^https:\/\/apps\.apple\.com\/app\/id6825299934\?action=write-review$/);
  });
});
