// Profil de l'auteur (fenêtre « Toi, l'auteur », dialogue `profile`) : prénom, nom, nom de plume, coordonnées,
// parcours et œuvres. Ouverte depuis les Réglages, la page des projets (tant que le profil est vide) et l'export
// de la Bible. Gardé sur l'appareil ; chaque nouveau projet le reprend (page de titre du scénario, page de
// garde du manuscrit), la page « L'auteur » d'un dossier envoyé aussi.

import { useId, useState, type FormEvent } from "react";
import { useT } from "../i18n";
import { useSettings } from "../settings";
import { cleanProfile, type AuthorProfile } from "../profile";

type TextField = Exclude<keyof AuthorProfile, "address" | "bio" | "works">;

export function ProfileDialog({ onDone }: { onDone: () => void }) {
  const t = useT().home.profile;
  const profile = useSettings((s) => s.profile);
  const [draft, setDraft] = useState<AuthorProfile>(profile);
  const fieldId = useId();

  const submit = (e: FormEvent) => {
    e.preventDefault();
    useSettings.getState().setProfile(cleanProfile(draft));
    onDone();
  };
  const set = (field: keyof AuthorProfile, value: string) => setDraft((d) => ({ ...d, [field]: value }));

  // Champs d'une ligne, avec l'autocomplétion du navigateur pour ne rien retaper.
  const input = (field: TextField, type: string, autoComplete: string, first = false) => (
    <div className={`profile-field is-${field}`}>
      <label htmlFor={`${fieldId}-${field}`}>{t[field]}</label>
      <input
        id={`${fieldId}-${field}`}
        type={type}
        value={draft[field]}
        autoComplete={autoComplete}
        autoFocus={first}
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

  return (
    <div className="profile-dialog">
      <h2 id="app-dialog-title">{t.title}</h2>
      <p className="sp-empty">{t.intro}</p>
      <form className="profile-form" onSubmit={submit}>
        {input("firstName", "text", "given-name", true)}
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
          <button type="button" className="ghost-button" onClick={onDone}>
            {t.cancel}
          </button>
        </div>
      </form>
    </div>
  );
}
