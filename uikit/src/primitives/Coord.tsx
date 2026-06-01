import type { CSSProperties, ReactNode } from 'react';

export interface CoordProps {
  children?: ReactNode;
  style?: CSSProperties;
}

/** Monospace micro coordinate / figure label (e.g. `FIG.01 / 06`). */
export function Coord({ children, style }: CoordProps) {
  return (
    <span
      style={{
        fontFamily: 'var(--font-mono)',
        fontSize: 11,
        letterSpacing: '0.1em',
        textTransform: 'uppercase',
        color: 'var(--muted)',
        ...style,
      }}
    >
      {children}
    </span>
  );
}
