// Page de titre du scénario, en tête de la vue Scénario : la page de garde, modifiable sur place.
// Même disposition que sur le PDF : titre, mention et auteur centrés ; contact, date et copyright
// en bas à gauche. Les valeurs vivent dans la page de titre de scenario.fountain.

import { useState } from "react";
import { useT } from "../i18n";
import { currentScript, useCosmos } from "../store";
import { readTitleField, type TitleField } from "../screenplay/titlePage";

interface Props {
  paper: string;
  /** Écrit un champ dans la page de titre (la vue Scénario garde l'éditeur synchronisé). */
  onChange: (field: TitleField, value: string) => void;
}

function Field({ name, value, label, className = "", onChange }: { name: TitleField; value: string; label: string; className?: string; onChange: Props["onChange"] }) {
  // Pendant la frappe, on montre ce qui est tapé (espace ou retour en fin de ligne compris) ;
  // le fichier, lui, reçoit la valeur nettoyée.
  const [draft, setDraft] = useState<string | null>(null);
  return (
    <textarea
      rows={1}
      className={`sp-title-field ${className}`.trim()}
      value={draft ?? value}
      placeholder={label}
      aria-label={label}
      autoComplete="off"
      onChange={(e) => {
        setDraft(e.target.value);
        onChange(name, e.target.value);
      }}
      onBlur={() => setDraft(null)}
    />
  );
}

export function TitlePage({ paper, onChange }: Props) {
  const t = useT().screenplay.titlePage;
  const titlePage = useCosmos((s) => currentScript(s)?.titlePage);
  if (!titlePage) return null;

  const field = (name: TitleField, className?: string) => (
    <Field key={name} name={name} value={readTitleField(titlePage, name)} label={t[name]} className={className} onChange={onChange} />
  );

  return (
    <section className="sp-page sp-titlepage" data-paper={paper} aria-label={t.aria}>
      <div className="sp-title-center">
        {field("title", "is-title")}
        {field("credit")}
        {field("author")}
        {field("source")}
      </div>
      <div className="sp-title-bottom">
        {field("contact")}
        {field("date")}
        {field("copyright")}
      </div>
    </section>
  );
}
