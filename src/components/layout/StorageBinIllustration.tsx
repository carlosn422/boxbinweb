/** Decorative storage-bin artwork; the label is deliberately not a scannable QR. */
export function StorageBinIllustration({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 160 160" fill="none" aria-hidden="true" focusable="false">
      <ellipse cx="82" cy="143" rx="59" ry="8" fill="#392B18" opacity=".09" />
      <path d="M25 49h111l-8 83a9 9 0 0 1-9 8H42a9 9 0 0 1-9-8L25 49Z" fill="#2D2E32" stroke="#202126" strokeWidth="2" />
      <path d="m33 56 6 73a6 6 0 0 0 6 5h9V56H33Z" fill="#414247" />
      <path d="M111 56v78h7a6 6 0 0 0 6-5l7-73h-20Z" fill="#222328" />
      <path d="M21 34a7 7 0 0 1 7-7h106a7 7 0 0 1 7 7v22H21V34Z" fill="#FFC400" stroke="#E9AD00" strokeWidth="2" />
      <path d="M27 32h106v9H27z" fill="#FFDA4A" />
      <path d="M22 48h118v8H22z" fill="#ECAE00" />
      <rect x="35" y="47" width="14" height="18" rx="3" fill="#25262A" />
      <rect x="113" y="47" width="14" height="18" rx="3" fill="#25262A" />
      <rect x="62" y="79" width="39" height="38" rx="5" fill="#FFFAEF" />
      <path d="M71 90h21M71 97h21M71 104h13" stroke="#AAA393" strokeWidth="3" strokeLinecap="round" />
      <path d="M14 18 9 11M25 13V5M36 16l5-7" stroke="#FFC400" strokeWidth="4" strokeLinecap="round" />
    </svg>
  );
}
