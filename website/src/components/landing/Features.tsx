import { Fragment } from 'react';
import {
  Coord, Cross, Corners, Dim, Icon, Title, type IconName,
} from '@heph/uikit';
import { SectionHead } from './SectionHead';

interface Feature {
  n: string;
  icon: IconName;
  title: string;
  body: string;
}

const FEATURES: Feature[] = [
  {
    n: '01',
    icon: 'fingerprint',
    title: 'Content-addressed',
    body: 'Every artifact is keyed by the hash of its inputs. A matching digest is a cache hit, not a rebuild.',
  },
  {
    n: '02',
    icon: 'box',
    title: 'Sandboxed actions',
    body: 'Each action runs isolated with its declared inputs only. No leaked state, no “works on my machine.”',
  },
  {
    n: '03',
    icon: 'git-branch',
    title: 'Minimal DAG',
    body: 'heph rebuilds only the targets whose exact sources or dependencies changed — never the world.',
  },
  {
    n: '04',
    icon: 'database',
    title: 'Remote cache',
    body: 'Share a content-addressed cache across the team and CI. One build populates it; everyone hits it.',
  },
  {
    n: '05',
    icon: 'cpu',
    title: 'Parallel by default',
    body: 'Independent targets run concurrently across every core.',
  },
  {
    n: '06',
    icon: 'workflow',
    title: 'Orchestrator',
    body: 'Not only builds — tests, tasks and pipelines run in one isolated, deterministic graph.',
  },
];

/** Six-cell guarantee grid with crosses at every intersection. Non-interactive. */
export function Features() {
  return (
    <section
      style={{ position: 'relative', borderBottom: '1px solid var(--hair)', background: 'var(--paper)' }}
    >
      <Corners />
      <SectionHead fig="FIG.02 / 06" kicker="The system" title="Built on six guarantees" right="＋ WHY HEPH" />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)' }}>
        {FEATURES.map((f, i) => (
          <div
            key={f.n}
            style={{
              position: 'relative',
              padding: '30px 26px 34px',
              borderRight: i % 3 !== 2 ? '1px solid var(--hair)' : 'none',
              borderTop: i >= 3 ? '1px solid var(--hair)' : 'none',
            }}
          >
            {/* intersection cross at top-left */}
            <div style={{
              position: 'absolute', top: 0, left: 0, transform: 'translate(-50%,-50%)', zIndex: 2,
            }}
            >
              <Cross size={11} />
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <span style={{
                fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--faint)', letterSpacing: '0.05em',
              }}
              >
                {f.n}
              </span>
              <Icon name={f.icon} size={18} color="var(--ac)" />
            </div>
            <Title
              level={3}
              style={{
                fontFamily: 'var(--font-display)',
                fontWeight: 600,
                fontSize: 18,
                letterSpacing: '-0.01em',
                margin: '26px 0 8px',
                color: 'var(--ink)',
              }}
            >
              <span style={{
                color: 'var(--faint)', fontFamily: 'var(--font-mono)', fontWeight: 400, fontSize: 14,
              }}
              >
                └─
                {' '}
              </span>
              {f.title}
            </Title>
            <p style={{
              fontSize: 13.5, lineHeight: 1.6, margin: 0, color: 'var(--muted)',
            }}
            >
              {f.body}
            </p>
          </div>
        ))}
      </div>
    </section>
  );
}

/* ---- ASCII pipeline ------------------------------------------------------ */
interface Step { label: string; cap: string; ac: boolean; }
const STEPS: Step[] = [
  { label: 'SOURCE', cap: 'inputs', ac: false },
  { label: 'HASH', cap: 'xxh3', ac: false },
  { label: 'SANDBOX', cap: 'hermetic', ac: false },
  { label: 'CACHE', cap: 'outputs', ac: true },
  { label: 'ARTIFACT', cap: '✓ cached', ac: false },
];

/** ASCII pipeline diagram using `──▶` connectors. */
export function AsciiGraph() {
  return (
    <section
      style={{ position: 'relative', borderBottom: '1px solid var(--hair)', background: 'var(--paper)' }}
    >
      <Corners />
      <SectionHead
        fig="FIG.03 / 06"
        kicker="The pipeline"
        title="One deterministic pass"
        right="SOURCE ──▶ ARTIFACT"
      />
      <div style={{ position: 'relative', padding: '44px 40px 40px' }}>
        <div style={{ maxWidth: 520, margin: '0 auto 30px' }}>
          <Dim label="deterministic · hermetic · cached" />
        </div>
        {/* node row */}
        <div
          style={{
            display: 'flex',
            alignItems: 'flex-start',
            justifyContent: 'center',
            gap: 0,
            fontFamily: 'var(--font-mono)',
          }}
        >
          {STEPS.map((s, i) => (
            <Fragment key={s.label}>
              <div style={{
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, width: 116,
              }}
              >
                <div
                  style={{
                    width: '100%',
                    textAlign: 'center',
                    padding: '14px 6px',
                    fontSize: 13,
                    letterSpacing: '0.06em',
                    border: `1px solid ${s.ac ? 'var(--ac)' : 'var(--hair-strong)'}`,
                    color: s.ac ? 'var(--ac)' : 'var(--ink)',
                    background: s.ac ? 'var(--ac-soft)' : 'var(--paper)',
                  }}
                >
                  {s.label}
                </div>
                <span style={{
                  fontSize: 11,
                  color: s.cap.startsWith('✓') ? 'var(--ac)' : 'var(--muted)',
                  letterSpacing: '0.04em',
                }}
                >
                  {s.cap}
                </span>
              </div>
              {i < STEPS.length - 1 && (
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  height: 48,
                  color: 'var(--faint)',
                  fontSize: 15,
                  padding: '0 2px',
                }}
                >
                  ──▶
                </div>
              )}
            </Fragment>
          ))}
        </div>
        {/* baseline construction line */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 0,
            marginTop: 30,
            fontFamily: 'var(--font-mono)',
            fontSize: 11,
            color: 'var(--faint)',
          }}
        >
          <span>└</span>
          <span style={{ flex: 1, borderTop: '1px dashed var(--hair-strong)', margin: '0 10px' }} />
          <span style={{ color: 'var(--muted)', letterSpacing: '0.1em', whiteSpace: 'nowrap' }}>
            SAME INPUTS → SAME OUTPUT, BYTE FOR BYTE
          </span>
          <span style={{ flex: 1, borderTop: '1px dashed var(--hair-strong)', margin: '0 10px' }} />
          <span>┘</span>
        </div>
      </div>
    </section>
  );
}

/* ---- Metrics ------------------------------------------------------------- */
interface Stat { v: string; k: string; ac?: boolean; }
const STATS: Stat[] = [
  { v: '98.6%', k: 'median cache hit' },
  { v: '12×', k: 'faster CI, typical', ac: true },
  { v: '0', k: 'flaky builds' },
  { v: '1,284', k: 'targets / repo' },
];

/** Four-up metrics band. */
export function MetricsBand() {
  return (
    <section
      style={{
        position: 'relative',
        display: 'grid',
        gridTemplateColumns: 'repeat(4, 1fr)',
        borderBottom: '1px solid var(--hair)',
        background: 'var(--paper)',
      }}
    >
      <Corners />
      {STATS.map((s, i) => (
        <div
          key={s.k}
          style={{
            position: 'relative',
            padding: '36px 28px',
            borderRight: i < 3 ? '1px solid var(--hair)' : 'none',
          }}
        >
          {i > 0 && (
            <div style={{
              position: 'absolute', top: 0, left: 0, transform: 'translate(-50%,-50%)', zIndex: 2,
            }}
            >
              <Cross size={11} accent={i === 1} />
            </div>
          )}
          <div
            style={{
              fontFamily: 'var(--font-display)',
              fontWeight: 600,
              fontSize: 46,
              lineHeight: 0.9,
              letterSpacing: '-0.03em',
              color: s.ac ? 'var(--ac)' : 'var(--ink)',
            }}
          >
            {s.v}
          </div>
          <Coord style={{
            display: 'block', fontSize: 11.5, letterSpacing: '0.07em', marginTop: 14,
          }}
          >
            {s.k}
          </Coord>
        </div>
      ))}
    </section>
  );
}
