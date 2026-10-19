// @vitest-environment happy-dom
// Verrou par appareil : un projet n'est pas ouvert en écriture sur deux machines à la fois.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BEAT_MS, STALE_MS, deviceLabel, holder, lockPath, parseLock, serializeLock, type Lock } from "../lock";
import { claimLock, otherHolder, releaseLock } from "../projectLock";
import { storage, type LockStore } from "../storage";
import type { FileMap } from "../storage/paths";

const lock = (device: string, beat: number): Lock => ({ device, name: `${device} (x)`, beat });

describe("holder", () => {
  const now = 1_000_000;
  it("ignore son propre verrou", () => {
    expect(holder([lock("moi", now)], "moi", now)).toBeNull();
  });
  it("voit un autre appareil récent", () => {
    expect(holder([lock("autre", now - 10_000)], "moi", now)?.device).toBe("autre");
  });
  it("ignore un verrou périmé", () => {
    expect(holder([lock("autre", now - STALE_MS - 1)], "moi", now)).toBeNull();
  });
  it("garde le plus récent quand plusieurs appareils ont ouvert", () => {
    expect(holder([lock("a", now - 60_000), lock("b", now - 5_000)], "moi", now)?.device).toBe("b");
  });
  it("le battement est plus fréquent que la péremption", () => {
    expect(BEAT_MS * 2).toBeLessThan(STALE_MS);
  });
});

describe("parseLock", () => {
  it("relit ce qui a été écrit", () => {
    const l = lock("a", 5);
    expect(parseLock(serializeLock(l))).toEqual(l);
  });
  it("refuse un fichier abîmé", () => {
    expect(parseLock("pas du json")).toBeNull();
    expect(parseLock('{"device":"a"}')).toBeNull();
  });
});

describe("deviceLabel", () => {
  it("reconnaît les systèmes", () => {
    expect(deviceLabel("Mozilla/5.0 (iPad; CPU OS 17)")).toBe("iPad");
    expect(deviceLabel("", "MacIntel")).toBe("Mac");
    expect(deviceLabel("", "Win32")).toBe("Windows");
  });
});

describe("pose et libération", () => {
  let files: FileMap;
  const fake: LockStore = {
    read: async () => ({ ...files }),
    write: async (path, text) => void (files[path.replace("verrous/", "")] = text),
    remove: async (path) => void delete files[path.replace("verrous/", "")],
  };
  beforeEach(() => {
    files = {};
    vi.useFakeTimers();
    (storage as { locks?: LockStore }).locks = fake;
  });
  afterEach(async () => {
    await releaseLock();
    vi.useRealTimers();
    (storage as { locks?: LockStore }).locks = undefined;
  });

  it("pose un verrou, le rafraîchit, puis le retire", async () => {
    await claimLock();
    expect(Object.keys(files)).toHaveLength(1);
    const first = parseLock(Object.values(files)[0])!;
    await vi.advanceTimersByTimeAsync(BEAT_MS + 100);
    expect(parseLock(Object.values(files)[0])!.beat).toBeGreaterThan(first.beat);
    await releaseLock();
    expect(files).toEqual({});
  });

  it("son propre verrou ne bloque pas, celui d'un autre appareil oui", async () => {
    await claimLock();
    expect(await otherHolder()).toBeNull();
    files["autre.json"] = serializeLock({ device: "autre", name: "Mac (ab12)", beat: Date.now() });
    expect(await otherHolder()).toBe("Mac (ab12)");
    files["autre.json"] = serializeLock({ device: "autre", name: "Mac (ab12)", beat: Date.now() - STALE_MS - 1000 });
    expect(await otherHolder()).toBeNull();
  });

  it("lockPath range le verrou dans verrous/", () => {
    expect(lockPath("abc")).toBe("verrous/abc.json");
  });
});

describe("lecture seule", () => {
  it("rien n'est écrit tant que le projet est tenu par un autre appareil", async () => {
    const { useCosmos } = await import("../store");
    const write = vi.spyOn(storage, "write").mockResolvedValue();
    useCosmos.setState({ lockedBy: "Mac (ab12)" });
    await useCosmos.getState().save();
    expect(write).not.toHaveBeenCalled();
    useCosmos.setState({ lockedBy: null });
    write.mockRestore();
  });
});
