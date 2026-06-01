import type { ReactElement } from 'react';

export type GlyphName = 'slash' | 'layers' | 'lanes' | 'converge' | 'velocity';

export interface GlyphProps {
  name?: GlyphName;
  size?: number;
  c1?: string;
  c2?: string;
}

/**
 * Logo glyph set. The default `slash` mark is `//` — the target-path prefix
 * (`//app:server`), reading as "parallel". Alternates share the wordmark.
 */
export function Glyph({
  name = 'slash', size = 28, c1 = 'var(--ink)', c2 = 'var(--ac)',
}: GlyphProps): ReactElement | null {
  const p = {
    width: size,
    height: size,
    viewBox: '0 0 64 64',
    style: { display: 'block' },
  };
  switch (name) {
    case 'slash':
      return (
        <svg {...p} aria-hidden>
          <line x1={16} y1={47} x2={31} y2={17} stroke={c1} strokeWidth={8} strokeLinecap="square" />
          <line x1={33} y1={47} x2={48} y2={17} stroke={c2} strokeWidth={8} strokeLinecap="square" />
        </svg>
      );
    case 'layers':
      return (
        <svg {...p} aria-hidden>
          <rect x={14} y={21} width={36} height={6} rx={3} fill={c2} />
          <rect x={14} y={31} width={36} height={6} rx={3} fill={c1} />
          <rect x={14} y={41} width={36} height={6} rx={3} fill={c1} />
        </svg>
      );
    case 'lanes':
      return (
        <svg {...p} aria-hidden>
          <rect x={21} y={16} width={6} height={32} rx={3} fill={c1} />
          <rect x={30} y={16} width={6} height={32} rx={3} fill={c2} />
          <rect x={39} y={16} width={6} height={32} rx={3} fill={c1} />
        </svg>
      );
    case 'converge':
      return (
        <svg {...p} aria-hidden>
          <path d="M21 20 L41 32 M21 32 L41 32 M21 44 L41 32" stroke={c1} strokeWidth={2.4} />
          <circle cx={20} cy={20} r={3.2} fill={c1} />
          <circle cx={20} cy={32} r={3.2} fill={c1} />
          <circle cx={20} cy={44} r={3.2} fill={c1} />
          <circle cx={43} cy={32} r={5} fill={c2} />
        </svg>
      );
    case 'velocity':
      return (
        <svg {...p} aria-hidden>
          <path d="M19 18 L33 32 L19 46" stroke={c1} strokeWidth={7} fill="none" strokeLinecap="square" strokeLinejoin="miter" />
          <path d="M33 18 L47 32 L33 46" stroke={c2} strokeWidth={7} fill="none" strokeLinecap="square" strokeLinejoin="miter" />
        </svg>
      );
    default:
      return null;
  }
}

export interface LogoProps {
  height?: number;
  c1?: string;
  c2?: string;
  wordColor?: string;
  glyph?: GlyphName;
  markOnly?: boolean;
}

/** Mark + lowercase `heph` wordmark in Plex Sans SemiBold, tight tracking. */
export function Logo({
  height = 26,
  c1 = 'var(--ink)',
  c2 = 'var(--ac)',
  wordColor = 'var(--ink)',
  glyph = 'slash',
  markOnly = false,
}: LogoProps) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: height * 0.42 }}>
      <Glyph name={glyph} size={Math.round(height * 1.14)} c1={c1} c2={c2} />
      {!markOnly && (
        <span
          style={{
            fontFamily: 'var(--font-sans)',
            fontWeight: 600,
            fontSize: Math.round(height * 0.96),
            letterSpacing: '-0.035em',
            color: wordColor,
          }}
        >
          heph
        </span>
      )}
    </span>
  );
}
