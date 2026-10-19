// Verrou par appareil : un projet synchronisé (OneDrive, Dropbox, iCloud Drive, NAS) ne doit pas être ouvert
// en même temps sur deux machines. Chaque appareil écrit son propre petit fichier dans verrous/ et le
// rafraîchit tant que le projet est ouvert ; un fichier récent d'un autre appareil signale qu'il est pris.
// Un fichier par appareil (et non un fichier partagé) : la synchronisation ne peut pas en faire des copies en conflit.

export const LOCK_DIR = "verrous";
/** Le projet ouvert rafraîchit son verrou à ce rythme. */
export const BEAT_MS = 45_000;
/** Un verrou plus ancien que cela est périmé (app fermée de force, appareil éteint). */
export const STALE_MS = 150_000;

export interface Lock {
  device: string;
  name: string;
  /** Dernier rafraîchissement, en millisecondes. */
  beat: number;
}

export const lockPath = (device: string) => `${LOCK_DIR}/${device}.json`;

export const serializeLock = (lock: Lock) => JSON.stringify(lock);

export function parseLock(text: string): Lock | null {
  try {
    const raw = JSON.parse(text) as Partial<Lock>;
    if (typeof raw.device !== "string" || !raw.device || typeof raw.beat !== "number" || !Number.isFinite(raw.beat)) return null;
    return { device: raw.device, name: typeof raw.name === "string" && raw.name ? raw.name : raw.device, beat: raw.beat };
  } catch {
    return null;
  }
}

/** L'autre appareil qui tient le projet (le plus récent), ou null si personne d'autre ne l'a ouvert récemment. */
export function holder(locks: Lock[], me: string, now: number): Lock | null {
  let found: Lock | null = null;
  for (const lock of locks) {
    if (lock.device === me || now - lock.beat > STALE_MS || lock.beat > now + STALE_MS) continue;
    if (!found || lock.beat > found.beat) found = lock;
  }
  return found;
}

/** Nom lisible d'un appareil, d'après le système. */
export function deviceLabel(agent: string, platform = ""): string {
  const s = `${agent} ${platform}`;
  if (/iPad/i.test(s)) return "iPad";
  if (/iPhone|iPod/i.test(s)) return "iPhone";
  if (/Android/i.test(s)) return "Android";
  if (/Mac/i.test(s)) return "Mac";
  if (/Win/i.test(s)) return "Windows";
  if (/Linux|X11/i.test(s)) return "Linux";
  return "autre appareil";
}
