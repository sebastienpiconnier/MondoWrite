export function EyeIcon({ slashed = false }: { slashed?: boolean }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {slashed ? (
        <path d="m3 3 18 18M10 5.2a10 10 0 0 1 2-.2c6.2 0 10 7 10 7a19 19 0 0 1-3.2 4.1M6.2 6.8A20 20 0 0 0 2 12s3.8 7 10 7c1.7 0 3.3-.5 4.7-1.2M10 10a3 3 0 0 0 4 4" />
      ) : (
        <>
          <path d="M2 12s3.8-7 10-7 10 7 10 7-3.8 7-10 7S2 12 2 12Z" />
          <circle cx="12" cy="12" r="3" />
        </>
      )}
    </svg>
  );
}
