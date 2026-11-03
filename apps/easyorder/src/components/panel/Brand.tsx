import { useId } from "react";

/** Símbolo de Konnecttia: las dos figuras (teal = Konnecttia, coral = el cliente). */
export function KonnecttiaSymbol({ size = 32 }: { readonly size?: number }) {
  const mask = `ks-${useId().replace(/:/g, "")}`;
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 120 120"
      width={size}
      height={size}
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        <mask id={mask} maskUnits="userSpaceOnUse" x="-20" y="-20" width="160" height="160">
          <rect x="-20" y="-20" width="160" height="160" fill="#fff" />
          <g transform="rotate(-9 40 102.5)">
            <path
              d="M40 102.5 L40 46 M16 46 L86 46"
              stroke="#000"
              strokeWidth="21.4"
              strokeLinecap="round"
              fill="none"
            />
          </g>
        </mask>
      </defs>
      <g mask={`url(#${mask})`}>
        <g transform="rotate(9 80 102.5)">
          <path
            d="M80 102.5 L80 46 M104 46 L42 46"
            stroke="#FF6A4D"
            strokeWidth="15"
            strokeLinecap="round"
            fill="none"
          />
          <circle cx="80" cy="23.30" r="11.70" fill="#FF6A4D" />
        </g>
      </g>
      <g transform="rotate(-9 40 102.5)">
        <path
          d="M40 102.5 L40 46 M16 46 L86 46"
          stroke="var(--k-symbol-teal, #0D7C72)"
          strokeWidth="15"
          strokeLinecap="round"
          fill="none"
        />
        <circle cx="40" cy="23.30" r="11.70" fill="var(--k-symbol-teal, #0D7C72)" />
      </g>
    </svg>
  );
}

/** Marca del producto: «EasyOrder» con el respaldo «de Konnecttia». */
export function EasyOrderLockup({ compact = false }: { readonly compact?: boolean }) {
  return (
    <span className="k-lockup">
      <KonnecttiaSymbol size={compact ? 28 : 34} />
      <span className="k-lockup-text">
        <span className="k-lockup-name">EasyOrder</span>
        {compact ? null : <span className="k-lockup-by">de Konnecttia</span>}
      </span>
    </span>
  );
}
