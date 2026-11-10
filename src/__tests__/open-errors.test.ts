// @vitest-environment happy-dom
// Ouverture en échec (1.30.1) : la cause est reconnue (iCloud, dossier introuvable, droits), une seconde lecture
// rattrape un accroc passager, et l'accueil garde le projet visé pour « Réessayer ».

import { afterEach, describe, expect, it, vi } from "vitest";
import { useCosmos } from "../store";
import { storage } from "../storage";
import { classifyOpenError } from "../saveErrors";

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe("classifyOpenError", () => {
  it("reconnaît un fichier iCloud pas encore là", () => {
    expect(classifyOpenError(new Error("Resource deadlock avoided (os error 11)"))).toBe("icloud");
    expect(classifyOpenError("Resource temporarily unavailable (os error 35)")).toBe("icloud");
  });
  it("reprend les causes de l'enregistrement", () => {
    expect(classifyOpenError(new Error("No such file or directory (os error 2)"))).toBe("missing");
    expect(classifyOpenError(new Error("Permission denied (os error 13)"))).toBe("permission");
    expect(classifyOpenError(new Error("No space left on device (os error 28)"))).toBe("other");
    expect(classifyOpenError(new Error("boom"))).toBe("other");
  });
});

describe("openProject", () => {
  it("relit une fois après un premier échec, puis garde la cause et le projet", async () => {
    vi.useFakeTimers();
    vi.spyOn(console, "error").mockImplementation(() => {});
    const read = vi.spyOn(storage, "readAll").mockRejectedValue(new Error("Resource deadlock avoided (os error 11)"));
    const opening = useCosmos.getState().openProject("abc123");
    await vi.runAllTimersAsync();
    await opening;
    expect(read).toHaveBeenCalledTimes(2);
    expect(useCosmos.getState().openFailed).toBe(true);
    expect(useCosmos.getState().openError).toEqual({ kind: "icloud", id: "abc123" });
    useCosmos.getState().dismissOpenFailed();
    expect(useCosmos.getState().openError).toBeNull();
  });
});
