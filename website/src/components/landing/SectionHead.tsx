import type { ReactNode } from 'react';
import { Coord, Cross, Title } from '@heph/uikit';

export interface SectionHeadProps {
  fig: string;
  kicker: string;
  title: string;
  right?: ReactNode;
}

/** Shared blueprint section header: figure coordinate + kicker + display title. */
export function SectionHead({
  fig, kicker, title, right,
}: SectionHeadProps) {
  return (
    <div
      style={{
        position: 'relative',
        display: 'flex',
        alignItems: 'flex-end',
        justifyContent: 'space-between',
        padding: '26px 32px 22px',
        borderBottom: '1px solid var(--hair)',
      }}
    >
      <div>
        <Coord style={{
          display: 'inline-flex', alignItems: 'center', gap: 8, whiteSpace: 'nowrap',
        }}
        >
          <Cross size={9} accent />
          {`${fig} · ${kicker}`}
        </Coord>
        <Title
          level={2}
          style={{
            fontFamily: 'var(--font-display)',
            fontWeight: 600,
            fontSize: 27,
            letterSpacing: '-0.02em',
            color: 'var(--ink)',
            marginTop: 10,
            lineHeight: 1,
          }}
        >
          {title}
        </Title>
      </div>
      {right ? <Coord>{right}</Coord> : null}
    </div>
  );
}
