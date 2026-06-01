import type { CSSProperties, ReactNode } from 'react';
import { Cross } from './Cross';

export interface EyebrowProps {
  children?: ReactNode;
  style?: CSSProperties;
}

/** Mono uppercase eyebrow label, prefixed with an accent registration cross. */
export function Eyebrow({ children, style }: EyebrowProps) {
  return (
    <div
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 9,
        fontFamily: 'var(--font-mono)',
        fontSize: 11.5,
        fontWeight: 500,
        letterSpacing: '0.15em',
        textTransform: 'uppercase',
        color: 'var(--muted)',
        ...style,
      }}
    >
      <Cross size={9} accent />
      {children}
    </div>
  );
}
