// Verrou du projet ouvert : pose, rafraîchissement, libération (voir lock.ts).

import { storage } from "./storage";
import { BEAT_MS, deviceLabel, holder, lockPath, parseLock, serializeLock, type Lock } from "./lock";

const DEVICE_KEY = "mondowrite.device";
let memoryId: string | null = null;

/** Identifiant de cet appareil, gardé d'une session à l'autre. */
function deviceId(): string {
  try {
    const kept = localStorage.getItem(DEVICE_KEY);
    if (kept) return kept;
    const made = Math.random().toString(36).slice(2, 10);
    localStorage.setItem(DEVICE_KEY, made);
    return made;
  } catch {
    return (memoryId ??= Math.random().toString(36).slice(2, 10));
  }
}

function deviceName(): string {
  const label = typeof navigator === "undefined" ? "" : deviceLabel(navigator.userAgent, navigator.platform);
  return `${label || "appareil"} (${deviceId().slice(0, 4)})`;
}

let timer: ReturnType<typeof setInterval> | null = null;
let held = false;

async function beat() {
  const locks = storage.locks;
  if (!locks) return;
  const lock: Lock = { device: deviceId(), name: deviceName(), beat: Date.now() };
  try {
    await locks.write(lockPath(lock.device), serializeLock(lock));
  } catch {
    /* le verrou est une aide : s'il ne s'écrit pas, on n'empêche pas d'écrire */
  }
}

/** Nom de l'autre appareil qui tient le projet sélectionné, ou null. */
export async function otherHolder(): Promise<string | null> {
  const locks = storage.locks;
  if (!locks) return null;
  try {
    const texts = await locks.read();
    const all = Object.values(texts).map(parseLock).filter((l): l is Lock => !!l);
    return holder(all, deviceId(), Date.now())?.name ?? null;
  } catch {
    return null;
  }
}

/** Prend le projet : pose le verrou et le rafraîchit tant que le projet reste ouvert. */
export async function claimLock(): Promise<void> {
  if (!storage.locks) return;
  await releaseLock(false);
  held = true;
  await beat();
  timer = setInterval(() => void beat(), BEAT_MS);
}

/** Libère le projet. `remove` : supprime aussi le fichier (fermeture normale). */
export async function releaseLock(remove = true): Promise<void> {
  if (timer) clearInterval(timer);
  timer = null;
  const wasHeld = held;
  held = false;
  const locks = storage.locks;
  if (!remove || !wasHeld || !locks) return;
  try {
    await locks.remove(lockPath(deviceId()));
  } catch {
    /* le battement s'arrêtant, le verrou expire de lui-même */
  }
}
