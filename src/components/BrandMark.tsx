// Logo de MondoWrite : une constellation (étoiles éparses, quelques-unes reliées, une qui brille), comme
// l'icône de l'app. Une seule source pour la barre du haut et la page des projets.

export function BrandMark({ size = 28 }: { size?: number }) {
  return (
    <svg className="brand-mark" width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <g fill="currentColor" opacity="0.45">
        <circle cx="4.2" cy="5" r="0.7" />
        <circle cx="12.5" cy="3.6" r="0.55" />
        <circle cx="19.6" cy="20" r="0.6" />
      </g>
      <path d="M4.5 16.8L8.5 10.9L12.6 13.3L16.3 7.6M12.6 13.3L16.8 17.6" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
      <g fill="currentColor">
        <circle cx="4.5" cy="16.8" r="1.5" />
        <circle cx="8.5" cy="10.9" r="1.8" />
        <circle cx="12.6" cy="13.3" r="1.6" />
        <circle cx="16.8" cy="17.6" r="1.4" />
        <path d="M16.3 3.2C16.6 5.6 17.4 6.4 19.8 6.7C17.4 7 16.6 7.8 16.3 10.2C16 7.8 15.2 7 12.8 6.7C15.2 6.4 16 5.6 16.3 3.2Z" />
      </g>
    </svg>
  );
}
