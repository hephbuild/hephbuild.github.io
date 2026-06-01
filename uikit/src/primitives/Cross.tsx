import type { CSSProperties } from 'react';

export interface CrossProps {
  size?: number;
  color?: string;
  accent?: boolean;
  style?: CSSProperties;
}

/** Technical registration cross "+", drawn on hairline intersections. */
export function Cross({
  size = 11, color = 'var(--hair-strong)', accent = false, style,
}: CrossProps) {
  const c = accent ? 'var(--ac)' : color;
  const m = size / 2;
  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      style={{ display: 'block', ...style }}
      aria-hidden
    >
      <line x1={m} y1={0} x2={m} y2={size} stroke={c} strokeWidth={1} />
      <line x1={0} y1={m} x2={size} y2={m} stroke={c} strokeWidth={1} />
    </svg>
  );
}

interface Corner {
  id: string;
  pos: CSSProperties;
}

const CORNERS: Corner[] = [
  { id: 'tl', pos: { top: 0, left: 0, transform: 'translate(-50%,-50%)' } },
  { id: 'tr', pos: { top: 0, right: 0, transform: 'translate(50%,-50%)' } },
  { id: 'bl', pos: { bottom: 0, left: 0, transform: 'translate(-50%,50%)' } },
  { id: 'br', pos: { bottom: 0, right: 0, transform: 'translate(50%,50%)' } },
];

export interface CornersProps {
  /** Index (0-3, in tl/tr/bl/br order) of the cross to render in the accent color. */
  accentIndex?: number;
  size?: number;
}

/** Four crosses pinned to the corners of a `position: relative` parent. */
export function Corners({ accentIndex = -1, size = 11 }: CornersProps) {
  return (
    <>
      {CORNERS.map((corner, i) => (
        <div
          key={corner.id}
          style={{
            position: 'absolute', zIndex: 3, pointerEvents: 'none', ...corner.pos,
          }}
        >
          <Cross size={size} accent={i === accentIndex} />
        </div>
      ))}
    </>
  );
}
