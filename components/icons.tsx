// Ícones inline (sem dependência externa) — traços simples, 20x20, stroke atual.
type IconProps = { className?: string; style?: React.CSSProperties };

const base = "none";

export function IconGrid({ className, style }: IconProps) {
  return (
    <svg viewBox="0 0 20 20" fill={base} className={className} style={style}>
      <rect x="2.5" y="2.5" width="6" height="6" rx="1.3" stroke="currentColor" strokeWidth="1.5" />
      <rect x="11.5" y="2.5" width="6" height="6" rx="1.3" stroke="currentColor" strokeWidth="1.5" />
      <rect x="2.5" y="11.5" width="6" height="6" rx="1.3" stroke="currentColor" strokeWidth="1.5" />
      <rect x="11.5" y="11.5" width="6" height="6" rx="1.3" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}

export function IconList({ className, style }: IconProps) {
  return (
    <svg viewBox="0 0 20 20" fill={base} className={className} style={style}>
      <path d="M3.5 5.5h13M3.5 10h13M3.5 14.5h13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

export function IconChat({ className, style }: IconProps) {
  return (
    <svg viewBox="0 0 20 20" fill={base} className={className} style={style}>
      <path
        d="M3 9.5c0-3.6 3.1-6.5 7-6.5s7 2.9 7 6.5-3.1 6.5-7 6.5c-.9 0-1.8-.15-2.6-.44L4 17l.9-3.1C3.7 12.7 3 11.2 3 9.5Z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function IconBot({ className, style }: IconProps) {
  return (
    <svg viewBox="0 0 20 20" fill={base} className={className} style={style}>
      <rect x="4" y="7" width="12" height="9" rx="2" stroke="currentColor" strokeWidth="1.5" />
      <path d="M10 7V4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <circle cx="10" cy="3" r="1" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="7.5" cy="11.3" r="1" fill="currentColor" />
      <circle cx="12.5" cy="11.3" r="1" fill="currentColor" />
      <path d="M8 14h4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

export function IconCalendar({ className, style }: IconProps) {
  return (
    <svg viewBox="0 0 20 20" fill={base} className={className} style={style}>
      <rect x="3" y="4.5" width="14" height="12" rx="2" stroke="currentColor" strokeWidth="1.5" />
      <path d="M3 8.5h14M7 2.5v3M13 2.5v3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

export function IconMap({ className, style }: IconProps) {
  return (
    <svg viewBox="0 0 20 20" fill={base} className={className} style={style}>
      <path
        d="M10 17.5s6-5.2 6-9.6a6 6 0 1 0-12 0c0 4.4 6 9.6 6 9.6Z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <circle cx="10" cy="7.9" r="2" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}

export function IconBox({ className, style }: IconProps) {
  return (
    <svg viewBox="0 0 20 20" fill={base} className={className} style={style}>
      <path
        d="M3 6.5 10 3l7 3.5v7L10 17l-7-3.5v-7Z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <path d="M3 6.5 10 10l7-3.5M10 10v7" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
    </svg>
  );
}

export function IconCheckCircle({ className, style }: IconProps) {
  return (
    <svg viewBox="0 0 20 20" fill={base} className={className} style={style}>
      <circle cx="10" cy="10" r="7" stroke="currentColor" strokeWidth="1.5" />
      <path d="M7 10.2 9.1 12.3 13.3 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function IconChart({ className, style }: IconProps) {
  return (
    <svg viewBox="0 0 20 20" fill={base} className={className} style={style}>
      <path d="M3.5 16.5v-5M9 16.5v-9M14.5 16.5v-3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M2.5 16.5h15" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

export function IconUpload({ className, style }: IconProps) {
  return (
    <svg viewBox="0 0 20 20" fill={base} className={className} style={style}>
      <path d="M10 13V4M6.5 7.5 10 4l3.5 3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M3.5 14v1.5A1.5 1.5 0 0 0 5 17h10a1.5 1.5 0 0 0 1.5-1.5V14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

export function IconMotorbike({ className, style }: IconProps) {
  return (
    <svg viewBox="0 0 20 20" fill={base} className={className} style={style}>
      <circle cx="5.5" cy="14.5" r="2.2" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="14.5" cy="14.5" r="2.2" stroke="currentColor" strokeWidth="1.5" />
      <path d="M5.5 14.5 8 9h5l2 3.2M8 9l1.6-3.2h3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function IconUsers({ className, style }: IconProps) {
  return (
    <svg viewBox="0 0 20 20" fill={base} className={className} style={style}>
      <circle cx="7.3" cy="7" r="2.3" stroke="currentColor" strokeWidth="1.5" />
      <path d="M2.8 16c.4-2.7 2.3-4.3 4.5-4.3s4 1.6 4.5 4.3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <circle cx="14" cy="7.5" r="1.8" stroke="currentColor" strokeWidth="1.3" />
      <path d="M13 11.9c1.7.2 3 1.5 3.4 3.6" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
    </svg>
  );
}

export function IconGear({ className, style }: IconProps) {
  return (
    <svg viewBox="0 0 20 20" fill={base} className={className} style={style}>
      <circle cx="10" cy="10" r="2.6" stroke="currentColor" strokeWidth="1.5" />
      <path
        d="M10 3v1.6M10 15.4V17M17 10h-1.6M4.6 10H3M14.9 5.1l-1.1 1.1M6.2 13.8l-1.1 1.1M14.9 14.9l-1.1-1.1M6.2 6.2 5.1 5.1"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function IconShield({ className, style }: IconProps) {
  return (
    <svg viewBox="0 0 20 20" fill={base} className={className} style={style}>
      <path d="M10 2.5 16 5v5.2c0 4-2.7 6.5-6 7.3-3.3-.8-6-3.3-6-7.3V5l6-2.5Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
      <path d="M7.3 9.8 9.3 11.7 12.9 7.8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function IconSend({ className, style }: IconProps) {
  return (
    <svg viewBox="0 0 20 20" fill={base} className={className} style={style}>
      <path d="M17 3 3 9.2l5.6 1.9L17 3ZM8.6 11.1 10.5 17 17 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function IconTask({ className, style }: IconProps) {
  return (
    <svg viewBox="0 0 20 20" fill={base} className={className} style={style}>
      <rect x="4" y="3" width="12" height="14" rx="1.6" stroke="currentColor" strokeWidth="1.5" />
      <path d="M7 7.5h6M7 10.5h6M7 13.5h3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

export function IconTrophy({ className, style }: IconProps) {
  return (
    <svg viewBox="0 0 20 20" fill={base} className={className} style={style}>
      <path d="M6.5 3.5h7v4a3.5 3.5 0 0 1-7 0v-4Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
      <path d="M6.5 4.5H4a1 1 0 0 0-1 1v.5c0 1.7 1.3 3 3 3M13.5 4.5H16a1 1 0 0 1 1 1v.5c0 1.7-1.3 3-3 3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
      <path d="M10 11v3M7.5 16.5h5M8.3 14h3.4l.3 2.5H8l.3-2.5Z" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function IconChevron({ className, style }: IconProps) {
  return (
    <svg viewBox="0 0 20 20" fill={base} className={className} style={style}>
      <path d="M7 5.5 12 10l-5 4.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function IconSearch({ className, style }: IconProps) {
  return (
    <svg viewBox="0 0 20 20" fill={base} className={className} style={style}>
      <circle cx="8.7" cy="8.7" r="5.2" stroke="currentColor" strokeWidth="1.5" />
      <path d="M12.6 12.6 17 17" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

export function IconSun({ className, style }: IconProps) {
  return (
    <svg viewBox="0 0 20 20" fill={base} className={className} style={style}>
      <circle cx="10" cy="10" r="3.2" stroke="currentColor" strokeWidth="1.5" />
      <path
        d="M10 2.5v2M10 15.5v2M17.5 10h-2M4.5 10h-2M15.1 4.9l-1.4 1.4M6.3 13.7l-1.4 1.4M15.1 15.1l-1.4-1.4M6.3 6.3 4.9 4.9"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function IconMoon({ className, style }: IconProps) {
  return (
    <svg viewBox="0 0 20 20" fill={base} className={className} style={style}>
      <path
        d="M16.5 12.3A6.8 6.8 0 0 1 7.7 3.5a7 7 0 1 0 8.8 8.8Z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
    </svg>
  );
}
