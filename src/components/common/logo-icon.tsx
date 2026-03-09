import { cn } from '@/lib/utils/cn';

interface LogoIconProps {
  className?: string;
}

export function LogoIcon({ className }: LogoIconProps) {
  return (
    <svg
      viewBox="0 0 64 64"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={cn('shrink-0', className)}
      aria-hidden="true"
    >
      <defs>
        <linearGradient id="af-bg" x1="0" y1="0" x2="64" y2="64" gradientUnits="userSpaceOnUse">
          <stop stopColor="#0a3529" />
          <stop offset="1" stopColor="#0f6b52" />
        </linearGradient>
        <linearGradient id="af-teal" x1="20" y1="10" x2="38" y2="28" gradientUnits="userSpaceOnUse">
          <stop stopColor="#5eead4" />
          <stop offset="1" stopColor="#14b8a6" />
        </linearGradient>
        <linearGradient id="af-violet" x1="42" y1="18" x2="36" y2="48" gradientUnits="userSpaceOnUse">
          <stop stopColor="#c4b5fd" />
          <stop offset="1" stopColor="#8b5cf6" />
        </linearGradient>
        <linearGradient id="af-emerald" x1="12" y1="36" x2="32" y2="50" gradientUnits="userSpaceOnUse">
          <stop stopColor="#6ee7b7" />
          <stop offset="1" stopColor="#10b981" />
        </linearGradient>
        <linearGradient id="af-gold" x1="26" y1="24" x2="38" y2="40" gradientUnits="userSpaceOnUse">
          <stop stopColor="#fde68a" />
          <stop offset="1" stopColor="#f59e0b" />
        </linearGradient>
        <filter id="af-glow">
          <feGaussianBlur in="SourceGraphic" stdDeviation="2.5" />
        </filter>
      </defs>

      {/* Background squircle */}
      <rect width="64" height="64" rx="16" fill="url(#af-bg)" />

      {/* Subtle radial ambiance */}
      <circle cx="32" cy="30" r="20" fill="#5eead4" opacity="0.05" />

      {/* --- Three RAG pipeline arcs (Retrieve / Augment / Generate) --- */}
      {/* Arc 1 – Retrieve (teal) — top */}
      <path
        d="M18.5 18 A20 20 0 0 1 45.5 18"
        stroke="url(#af-teal)"
        strokeWidth="2.8"
        strokeLinecap="round"
      />
      {/* Arc 2 – Augment (violet) — bottom-right */}
      <path
        d="M47 22 A20 20 0 0 1 33 50"
        stroke="url(#af-violet)"
        strokeWidth="2.8"
        strokeLinecap="round"
      />
      {/* Arc 3 – Generate (emerald) — bottom-left */}
      <path
        d="M29 50 A20 20 0 0 1 15 22"
        stroke="url(#af-emerald)"
        strokeWidth="2.8"
        strokeLinecap="round"
      />

      {/* --- Retrieval connection lines to center --- */}
      <line x1="22" y1="15" x2="32" y2="30" stroke="#5eead4" strokeWidth="1" opacity="0.25" />
      <line x1="46" y1="24" x2="32" y2="30" stroke="#8b5cf6" strokeWidth="1" opacity="0.25" />
      <line x1="28" y1="50" x2="32" y2="30" stroke="#10b981" strokeWidth="1" opacity="0.25" />

      {/* --- Knowledge source nodes --- */}
      {/* Node 1 – top-left (Retrieve) */}
      <circle cx="18" cy="17" r="4" fill="#2dd4bf" />
      <circle cx="18" cy="17" r="1.8" fill="white" opacity="0.85" />
      {/* Node 2 – top-right */}
      <circle cx="46" cy="17" r="4" fill="#14b8a6" />
      <circle cx="46" cy="17" r="1.8" fill="white" opacity="0.85" />
      {/* Node 3 – right (Augment) */}
      <circle cx="47" cy="34" r="3.5" fill="#a78bfa" />
      <circle cx="47" cy="34" r="1.5" fill="white" opacity="0.8" />
      {/* Node 4 – bottom (Generate) */}
      <circle cx="31" cy="51" r="3.5" fill="#34d399" />
      <circle cx="31" cy="51" r="1.5" fill="white" opacity="0.8" />
      {/* Node 5 – left */}
      <circle cx="15" cy="34" r="3.5" fill="#6ee7b7" />
      <circle cx="15" cy="34" r="1.5" fill="white" opacity="0.8" />

      {/* --- Secondary micro-nodes for richness --- */}
      <circle cx="34" cy="12" r="1.5" fill="#99f6e4" opacity="0.5" />
      <circle cx="50" cy="44" r="1.5" fill="#c4b5fd" opacity="0.45" />
      <circle cx="14" cy="46" r="1.5" fill="#a7f3d0" opacity="0.45" />

      {/* --- Central agent core (golden glow) --- */}
      <circle cx="32" cy="30" r="10" fill="#fbbf24" opacity="0.15" filter="url(#af-glow)" />
      <circle cx="32" cy="30" r="8.5" fill="url(#af-gold)" />
      <circle cx="32" cy="30" r="5.5" fill="white" opacity="0.92" />
      {/* Inner iris – the agent */}
      <circle cx="32" cy="30" r="3" fill="#f59e0b" />
      {/* Specular highlight */}
      <circle cx="30" cy="28" r="1.2" fill="white" opacity="0.7" />
    </svg>
  );
}
