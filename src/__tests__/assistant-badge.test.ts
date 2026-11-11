// Pastille « Assistant » (#62, lot 2) : note du serveur relue prudemment, temps écoulé dans la langue de l'interface.
import { describe, expect, it } from "vitest";
import { agoText, readSeen } from "../components/AssistantBadge";

describe("pastille de l'assistant externe", () => {
  it("relit la note du serveur, refuse le reste", () => {
    expect(readSeen('{"at":1700000000000,"client":"Claude"}')).toEqual({ at: 1700000000000, client: "Claude" });
    expect(readSeen('{"at":1700000000000}')).toEqual({ at: 1700000000000, client: "" });
    expect(readSeen('{"at":"hier","client":"Claude"}')).toBeNull();
    expect(readSeen("pas du JSON")).toBeNull();
    expect(readSeen(null)).toBeNull();
    expect(readSeen(`{"at":1,"client":"${"x".repeat(200)}\\n"}`)?.client).toHaveLength(60);
  });

  it("dit depuis quand, dans la langue de l'interface", () => {
    const now = 1_700_000_000_000;
    expect(agoText(now - 20_000, now, "fr", "à l’instant")).toBe("à l’instant");
    expect(agoText(now - 3 * 60_000, now, "fr", "à l’instant")).toBe("il y a 3 minutes");
    expect(agoText(now - 3 * 60_000, now, "en", "just now")).toBe("3 minutes ago");
  });
});
