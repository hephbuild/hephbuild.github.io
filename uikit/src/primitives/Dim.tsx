import type { CSSProperties } from 'react';

export interface DimProps {
  label: string;
  labelColor?: string;
  style?: CSSProperties;
}

/** Blueprint dimension line: `├───  LABEL  ───┤`. */
export function Dim({ label, labelColor = 'var(--muted)', style }: DimProps) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        fontFamily: 'var(--font-mono)',
        fontSize: 11,
        color: 'var(--faint)',
        ...style,
      }}
    >
      <span>├</span>
      <span style={{ flex: 1, height: 1, background: 'var(--hair-strong)' }} />
      <span
        style={{
          letterSpacing: '0.14em',
          textTransform: 'uppercase',
          color: labelColor,
          whiteSpace: 'nowrap',
        }}
      >
        {label}
      </span>
      <span style={{ flex: 1, height: 1, background: 'var(--hair-strong)' }} />
      <span>┤</span>
    </div>
  );
}
