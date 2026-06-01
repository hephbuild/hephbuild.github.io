import type { CSSProperties } from 'react';

export interface RulerProps {
  count?: number;
  gap?: number;
  style?: CSSProperties;
}

/** Vertical tick ruler — the blueprint margin alongside the hero. */
export function Ruler({ count = 7, gap = 26, style }: RulerProps) {
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', gap: gap - 1, ...style,
    }}
    >
      {Array.from({ length: count }).map((_, i) => (
        // eslint-disable-next-line react/no-array-index-key
        <div key={`tick-${i}`} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ width: i % 2 ? 6 : 11, height: 1, background: 'var(--hair-strong)' }} />
        </div>
      ))}
    </div>
  );
}
