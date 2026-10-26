// Profil de l'auteur, sur la page des projets : prénom, nom, nom de plume et coordonnées. Rempli une fois
// (le formulaire est ouvert tant qu'il est vide), puis résumé avec un bouton pour le modifier. Gardé sur
// l'appareil ; chaque nouveau projet le reprend (page de titre du scénario, page de garde du manuscrit).

import { useId, useState, type FormEvent } from "react";
import { fmt, useT } from "../i18n";
import { useSettings } from "../settings";
import { authorName, cleanProfile, contactLines, hasProfile, legalName, type AuthorProfile } from "../profile";

type TextField = Exclude<keyof AuthorProfile, "address" | "bio" | "works">;

export function ProfilePanel() {
  const t = useT().home.profile;
  const profile = useSettings((s) => s.profile);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<AuthorProfile>(profile);
  const [saved, setSaved] = useState(false);
  const titleId = useId();
  const fieldId = useId();
  const open = editing || !hasProfile(profile);

  const edit = () => {
    setDraft(profile);
    setSaved(false);
    setEditing(true);
  };
  const submit = (e: FormEvent) => {
    e.preventDefault();
    useSettings.getState().setProfile(cleanProfile(draft));
    setEditing(false);
    setSaved(true);
  };
  const set = (field: keyof AuthorProfile, value: string) => setDraft((d) => ({ ...d, [field]: value }));

  // Champs d'une ligne, avec l'autocomplétion du navigateur pour ne rien retaper.
  const input = (field: TextField, type: string, autoComplete: string) => (
    <div className={`profile-field is-${field}`}>
      <label htmlFor={`${fieldId}-${field}`}>{t[field]}</label>
      <input
        id={`${fieldId}-${field}`}
        type={type}
        value={draft[field]}
        autoComplete={autoComplete}
        aria-describedby={field === "penName" ? `${fieldId}-penHint` : undefined}
        onChange={(e) => set(field, e.target.value)}
      />
      {field === "penName" && (
        <p className="settings-hint" id={`${fieldId}-penHint`}>
          {t.penNameHint}
        </p>
      )}
    </div>
  );

  const name = authorName(profile);
  const lines = contactLines(profile).filter((l) => l !== legalName(profile));

  return (
    <section className="home-panel profile-panel" aria-labelledby={titleId}>
      <h2 id={titleId}>{t.title}</h2>
      {open ? (
        <>
          <p className="sp-empty">{t.intro}</p>
          <form className="profile-form" onSubmit={submit}>
            {input("firstName", "text", "given-name")}
            {input("lastName", "text", "family-name")}
            {input("penName", "text", "nickname")}
            {input("email", "email", "email")}
            {input("phone", "tel", "tel")}
            <div className="profile-field is-address">
              <label htmlFor={`${fieldId}-address`}>{t.address}</label>
              <textarea id={`${fieldId}-address`} rows={3} value={draft.address} autoComplete="street-address" onChange={(e) => set("address", e.target.value)} />
            </div>
            {/* Pour la page « L'auteur » d'un dossier envoyé (Bible) : jamais écrit dans un projet. */}
            {(["bio", "works"] as const).map((field) => (
              <div key={field} className={`profile-field is-address is-${field}`}>
                <label htmlFor={`${fieldId}-${field}`}>{t[field]}</label>
                <textarea id={`${fieldId}-${field}`} rows={3} value={draft[field]} placeholder={t[`${field}Placeholder`]} aria-describedby={`${fieldId}-${field}Hint`} onChange={(e) => set(field, e.target.value)} />
                <p className="settings-hint" id={`${fieldId}-${field}Hint`}>
                  {t.dossierHint}
                </p>
              </div>
            ))}
            <div className="home-buttons">
              <button type="submit" className="home-create">
                {t.save}
              </button>
              {hasProfile(profile) && (
                <button type="button" className="ghost-button" onClick={() => setEditing(false)}>
                  {t.cancel}
                </button>
              )}
            </div>
          </form>
        </>
      ) : (
        <>
          <div className="profile-card">
            <p className="profile-name">{legalName(profile) || name}</p>
            {profile.penName && legalName(profile) && <p className="profile-meta">{fmt(t.signsAs, { name: profile.penName })}</p>}
            {lines.length > 0 && (
              <p className="profile-contact">
                {lines.map((line, i) => (
                  <span key={i}>{line}</span>
                ))}
              </p>
            )}
          </div>
          <p className="settings-hint" role="status">
            {saved ? t.saved : t.newProjects}
          </p>
          <button type="button" className="ghost-button" onClick={edit}>
            {t.edit}
          </button>
        </>
      )}
    </section>
  );
}
