// Identité de MondoWrite (octobre 2026) : un M tracé comme une constellation, dont la quatrième étoile
// brille (le monde ordonné qui naît du chaos), et le logotype « Mondo » droit + « Write » italique
// (Playfair Display). Même dessin que l'icône de l'app (src-tauri/icons/icon.svg), mêmes coordonnées.
// Couleurs : points à l'encre du thème, traits et étoile par jetons (--brand-line, --brand-star).

/** Étoile à quatre branches, côtés creusés. */
const star = (cx: number, cy: number, r: number, k: number) =>
  `M${cx} ${cy - r}Q${cx + k} ${cy - k} ${cx + r} ${cy}Q${cx + k} ${cy + k} ${cx} ${cy + r}Q${cx - k} ${cy + k} ${cx - r} ${cy}Q${cx - k} ${cy - k} ${cx} ${cy - r}Z`;

/** Le M constellation. `size` : hauteur en pixels ; aux petites tailles, traits et points sont épaissis. */
export function BrandMark({ size = 28 }: { size?: number }) {
  const small = size < 64;
  const line = small ? 18 : 8;
  const r = small ? [32, 28, 28, 28] : [22, 18, 19.5, 19.5];
  return (
    <svg className="brand-mark" height={size} width={Math.round((size * 520) / 465)} viewBox="255 245 520 465" aria-hidden="true">
      <circle cx="682.5" cy="339" r="87" fill="var(--brand-star)" fillOpacity="0.22" />
      <polyline
        points="282.5,683 340,340 511,569 682.5,339 740,683"
        fill="none"
        stroke="var(--brand-line)"
        strokeWidth={line}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <g fill="currentColor">
        <circle cx="340" cy="340" r={r[0]} />
        <circle cx="511" cy="569" r={r[1]} />
        <circle cx="282.5" cy="683" r={r[2]} />
        <circle cx="740" cy="683" r={r[3]} />
      </g>
      <path d={star(682.5, 339, small ? 84 : 73, small ? 12 : 9)} fill="var(--brand-star)" />
    </svg>
  );
}

/** Le logotype : « Mondo » droit et gras, « Write » en italique. Lu « MondoWrite » par un lecteur d'écran. */
export function Wordmark({ className = "" }: { className?: string }) {
  return (
    <span className={`wordmark ${className}`.trim()}>
      Mondo<i>Write</i>
    </span>
  );
}
