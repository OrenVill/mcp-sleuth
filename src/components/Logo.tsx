interface Props {
  size?: number;
  className?: string;
  title?: string;
}

export function Logo({ size = 28, className, title = 'Sleuth' }: Props) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      role="img"
      aria-label={title}
    >
      <title>{title}</title>
      <defs>
        <linearGradient
          id="mcp-logo-bg"
          x1="0"
          y1="0"
          x2="64"
          y2="64"
          gradientUnits="userSpaceOnUse"
        >
          <stop offset="0" stopColor="#8b5cf6" />
          <stop offset="1" stopColor="#d946ef" />
        </linearGradient>
        <radialGradient
          id="mcp-logo-glow"
          cx="32"
          cy="32"
          r="22"
          gradientUnits="userSpaceOnUse"
        >
          <stop offset="0" stopColor="white" stopOpacity="0.35" />
          <stop offset="1" stopColor="white" stopOpacity="0" />
        </radialGradient>
      </defs>
      <rect width="64" height="64" rx="14" fill="url(#mcp-logo-bg)" />
      <circle cx="32" cy="32" r="22" fill="url(#mcp-logo-glow)" />
      <g
        stroke="white"
        strokeWidth="2.5"
        strokeLinecap="round"
        opacity="0.9"
      >
        <line x1="32" y1="32" x2="16" y2="16" />
        <line x1="32" y1="32" x2="48" y2="16" />
        <line x1="32" y1="32" x2="16" y2="48" />
        <line x1="32" y1="32" x2="48" y2="48" />
      </g>
      <g fill="white">
        <circle cx="16" cy="16" r="4.5" />
        <circle cx="48" cy="16" r="4.5" />
        <circle cx="16" cy="48" r="4.5" />
        <circle cx="48" cy="48" r="4.5" />
      </g>
      <circle cx="32" cy="32" r="7.5" fill="white" />
      <circle cx="32" cy="32" r="3.5" fill="#a855f7" />
    </svg>
  );
}
