// Moteur de la lecture à voix haute : la synthèse vocale du système (speechSynthesis), une phrase à la fois,
// pour savoir où l'on en est (surlignage, pause, arrêt). Rien n'est envoyé en ligne : ce sont les voix de
// l'appareil. Absente (certains Linux), le bouton « Écouter » n'apparaît pas.

import { useEffect, useState } from "react";
import { create } from "zustand";
import type { Editor } from "@tiptap/react";
import { useSettings } from "../settings";
import { voiceForSpeaker, type Utterance, type VoiceInfo } from "../reading";
import { setReadingMark } from "./readingMark";

/** La synthèse vocale existe ici (capacité, pas système). */
export const canSpeak = () => typeof window !== "undefined" && "speechSynthesis" in window && typeof SpeechSynthesisUtterance !== "undefined";

interface ReaderState {
  status: "idle" | "playing" | "paused";
  /** Personnages entendus pendant cette lecture (pour le choix des voix). */
  speakers: string[];
  set: (patch: Partial<Omit<ReaderState, "set">>) => void;
}

export const useReaderState = create<ReaderState>((set) => ({ status: "idle", speakers: [], set: (patch) => set(patch) }));

let session: { editor: Editor; queue: Utterance[]; at: number; offUpdate: () => void } | null = null;

const synth = () => window.speechSynthesis;

/** Les voix de l'appareil (la liste arrive parfois après coup : `voiceschanged`). */
export function systemVoices(): VoiceInfo[] {
  if (!canSpeak()) return [];
  return synth()
    .getVoices()
    .map((v) => ({ uri: v.voiceURI, name: v.name, lang: v.lang }));
}

export function useSystemVoices(): VoiceInfo[] {
  const [voices, setVoices] = useState<VoiceInfo[]>(systemVoices);
  useEffect(() => {
    if (!canSpeak()) return;
    const update = () => setVoices(systemVoices());
    synth().addEventListener?.("voiceschanged", update);
    update();
    return () => synth().removeEventListener?.("voiceschanged", update);
  }, []);
  return voices;
}

function mark(index: number | null) {
  const ed = session?.editor;
  if (!ed || ed.isDestroyed) return;
  ed.view.dispatch(setReadingMark(ed.state, index));
  if (index === null || index >= ed.state.doc.childCount) return;
  let pos = 0;
  for (let i = 0; i < index; i++) pos += ed.state.doc.child(i).nodeSize;
  const dom = ed.view.nodeDOM(pos);
  if (dom instanceof HTMLElement) dom.scrollIntoView({ block: "center", behavior: "smooth" });
}

function speakNext() {
  if (!session) return;
  const item = session.queue[session.at];
  if (!item) return stopReading();
  mark(item.index);
  const { reading, lang } = useSettings.getState();
  const voices = synth().getVoices();
  const info = voiceForSpeaker(item.speaker, systemVoices(), reading, lang);
  const utterance = new SpeechSynthesisUtterance(item.text);
  const voice = info ? voices.find((v) => v.voiceURI === info.uri) : undefined;
  if (voice) {
    utterance.voice = voice;
    utterance.lang = voice.lang;
  } else utterance.lang = lang;
  utterance.rate = reading.rate;
  const current = session;
  utterance.onend = () => {
    // Une lecture arrêtée ou remplacée entre-temps ne continue pas.
    if (session !== current || useReaderState.getState().status !== "playing") return;
    current.at++;
    speakNext();
  };
  utterance.onerror = (e) => {
    if (e.error === "interrupted" || e.error === "canceled") return;
    console.error(e.error);
    stopReading();
  };
  synth().speak(utterance);
}

/** Lit des blocs d'un éditeur, à la suite. Taper dans le texte arrête la lecture. */
export function startReading(editor: Editor, queue: Utterance[]) {
  stopReading();
  if (!canSpeak() || queue.length === 0) return;
  const onUpdate = () => stopReading();
  editor.on("update", onUpdate);
  session = { editor, queue, at: 0, offUpdate: () => editor.off("update", onUpdate) };
  const speakers = [...new Set(queue.flatMap((u) => (u.speaker ? [u.speaker] : [])))];
  useReaderState.getState().set({ status: "playing", speakers });
  speakNext();
}

export function pauseReading() {
  if (!session || useReaderState.getState().status !== "playing") return;
  useReaderState.getState().set({ status: "paused" });
  // Reprendre au début de la phrase en cours : pause() n'est pas fiable partout (WebKit, Chrome sous Linux).
  synth().cancel();
}

export function resumeReading() {
  if (!session || useReaderState.getState().status !== "paused") return;
  useReaderState.getState().set({ status: "playing" });
  speakNext();
}

export function stopReading() {
  const was = session;
  session = null;
  if (canSpeak()) synth().cancel();
  if (was) {
    was.offUpdate();
    if (!was.editor.isDestroyed) was.editor.view.dispatch(setReadingMark(was.editor.state, null));
  }
  if (useReaderState.getState().status !== "idle") useReaderState.getState().set({ status: "idle" });
}

/** Une voix, pour l'essayer dans le choix des voix. */
export function previewVoice(uri: string, text: string) {
  if (!canSpeak()) return;
  synth().cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  const voice = synth()
    .getVoices()
    .find((v) => v.voiceURI === uri);
  if (voice) {
    utterance.voice = voice;
    utterance.lang = voice.lang;
  }
  utterance.rate = useSettings.getState().reading.rate;
  synth().speak(utterance);
}
