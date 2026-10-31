// Visite guidée : un panneau en bas de l'écran, une étape par vue (canevas, sources, Bible, plan, écriture,
// fichiers). Chaque étape ouvre la vue dont elle parle ; rien n'est modifié dans le projet.
// Lancée à l'ouverture du projet d'exemple, et depuis les Réglages. Échap la ferme.

import { useEffect, useRef } from "react";
import { useCosmos } from "../store";
import { fmt } from "../i18n";
import { useVocab } from "../vocab";
import { TOUR_STEPS, nextStep, prevStep, stepText } from "../tour";
import { usePhone } from "./usePhone";

export function Tour() {
  const { t, kind, views } = useVocab();
  const step = useCosmos((s) => s.tour);
  const setTour = useCosmos((s) => s.setTour);
  const setView = useCosmos((s) => s.setView);
  const nextRef = useRef<HTMLButtonElement>(null);
  // Sur téléphone, pas de visite : ses étapes montrent le canevas et le Plan, absents de l'écran.
  const phone = usePhone();

  useEffect(() => {
    if (phone && step !== null) setTour(null);
  }, [phone, step, setTour]);

  // Chaque étape montre sa vue.
  useEffect(() => {
    if (step === null || phone) return;
    setView(TOUR_STEPS[step].view);
    nextRef.current?.focus();
  }, [step, phone, setView]);

  useEffect(() => {
    if (step === null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setTour(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [step, setTour]);

  if (step === null || phone) return null;
  const current = TOUR_STEPS[step];
  const text = stepText(t.tour.steps, t.tour.scenario, current.key, kind);
  const next = nextStep(step);
  return (
    <section className="tour" role="dialog" aria-modal="false" aria-labelledby="tour-title">
      <div className="tour-head">
        <span className="eyebrow">
          {fmt(t.tour.progress, { n: step + 1, total: TOUR_STEPS.length })} · {views[current.view]}
        </span>
        <button type="button" className="icon-button" aria-label={t.tour.close} title={t.tour.close} onClick={() => setTour(null)}>
          <span aria-hidden="true">×</span>
        </button>
      </div>
      <h2 id="tour-title">{text.title}</h2>
      <p>{text.body}</p>
      <div className="tour-actions">
        {step > 0 && (
          <button type="button" className="ghost-button" onClick={() => setTour(prevStep(step))}>
            {t.tour.prev}
          </button>
        )}
        <button ref={nextRef} type="button" className="home-create" onClick={() => setTour(next)}>
          {next === null ? t.tour.done : t.tour.next}
        </button>
      </div>
    </section>
  );
}
