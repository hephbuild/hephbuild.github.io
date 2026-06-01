import {
  useEffect, useRef, useState, type CSSProperties,
} from 'react';
import {
  Button, Eyebrow, Coord, Cross, Corners, Dim, Ruler, Icon, Tooltip, Title,
} from '@heph/uikit';

// --- build graph model ----------------------------------------------------
type NodeId = 'proto' | 'core' | 'log' | 'auth' | 'server';
type BuildState = 'cache' | 'built';

interface GNode {
  id: NodeId;
  label: string;
  x: number;
  y: number;
  rule: string;
}

const NODES: Record<NodeId, GNode> = {
  proto: {
    id: 'proto', label: '//proto:api', x: 2, y: 16, rule: 'proto',
  },
  core: {
    id: 'core', label: '//lib/core', x: 2, y: 92, rule: 'go_lib',
  },
  log: {
    id: 'log', label: '//lib/log', x: 2, y: 168, rule: 'go_lib',
  },
  auth: {
    id: 'auth', label: '//lib/auth', x: 188, y: 92, rule: 'go_lib',
  },
  server: {
    id: 'server', label: '//app:server', x: 368, y: 92, rule: 'go_bin',
  },
};
const NW = 170;
const NH = 40;
const EDGES: [GNode, GNode][] = [
  [NODES.core, NODES.auth],
  [NODES.proto, NODES.server],
  [NODES.auth, NODES.server],
  [NODES.log, NODES.server],
];
const FWD: Record<NodeId, NodeId[]> = {
  proto: ['server'],
  core: ['auth'],
  log: ['server'],
  auth: ['server'],
  server: [],
};
const ORDER: NodeId[][] = [['proto', 'core', 'log'], ['auth'], ['server']];

type BuildMap = Partial<Record<NodeId, BuildState>>;

function dirtyFrom(seed: Set<NodeId>): Set<NodeId> {
  // Forward transitive closure over the DAG via an explicit worklist — `d` and
  // `stack` are const bindings, so the inner closure carries no loop-mutated refs.
  const d = new Set(seed);
  const stack: NodeId[] = Array.from(seed);
  while (stack.length > 0) {
    const n = stack.pop();
    if (n) {
      (FWD[n] ?? []).forEach((mn) => {
        if (!d.has(mn)) {
          d.add(mn);
          stack.push(mn);
        }
      });
    }
  }
  return d;
}

// cache = grey, built = blue, idle = faint
function edgeColor(state: BuildState | undefined): string {
  if (state === 'built') return 'var(--ac)';
  if (state === 'cache') return 'var(--muted)';
  return 'var(--hair-2)';
}
function nodeColor(state: BuildState | undefined): string {
  if (state === 'built') return 'var(--ac)';
  if (state === 'cache') return 'var(--muted)';
  return 'var(--faint)';
}
function borderColor(state: BuildState | undefined, changed: boolean): string {
  if (changed) return 'var(--amber-500)';
  return state ? nodeColor(state) : 'var(--hair-2)';
}
function dotColor(state: BuildState | undefined, changed: boolean): string {
  if (changed) return 'var(--amber-500)';
  return state ? nodeColor(state) : 'var(--hair-2)';
}
function subLabelColor(state: BuildState | undefined, changed: boolean): string {
  if (changed) return 'var(--amber-600)';
  if (state === 'built') return 'var(--ac-600)';
  if (state === 'cache') return 'var(--muted)';
  return 'var(--faint)';
}
function subLabelText(state: BuildState | undefined, changed: boolean): string {
  if (changed) return '✎ EDITED';
  if (state === 'built') return 'BUILT';
  if (state === 'cache') return 'CACHE HIT';
  return '—';
}

const STEP_MS = 230;

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
      <span style={{
        width: 7, height: 7, borderRadius: '50%', background: color,
      }}
      />
      {label}
    </span>
  );
}

function BuildDiagram() {
  const [changed, setChanged] = useState<Set<NodeId>>(new Set<NodeId>(['auth']));
  const [state, setState] = useState<BuildMap>({});
  const [running, setRunning] = useState(false);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  function clearTimers(): void {
    timers.current.forEach(clearTimeout);
    timers.current = [];
  }

  function run(): void {
    clearTimers();
    setState({});
    setRunning(true);
    const dirty = dirtyFrom(changed);
    ORDER.forEach((layer, step) => {
      const tmr = setTimeout(() => {
        setState((s) => {
          const next: BuildMap = { ...s };
          layer.forEach((id) => { next[id] = dirty.has(id) ? 'built' : 'cache'; });
          return next;
        });
      }, STEP_MS * (step + 1));
      timers.current.push(tmr);
    });
    const tEnd = setTimeout(() => setRunning(false), STEP_MS * (ORDER.length + 1));
    timers.current.push(tEnd);
  }

  useEffect(() => {
    run();
    return clearTimers;
    // run once on mount — `run` intentionally closes over the initial `changed`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function toggle(id: NodeId): void {
    setChanged((c) => {
      const next = new Set(c);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  const values = Object.values(state);
  const hits = values.filter((v) => v === 'cache').length;
  const builts = values.filter((v) => v === 'built').length;

  // anchor helpers
  const rc = (n: GNode) => ({ x: n.x + NW, y: n.y + NH / 2 });
  const lc = (n: GNode) => ({ x: n.x, y: n.y + NH / 2 });

  return (
    <div
      style={{
        position: 'relative',
        borderLeft: '1px solid var(--hair)',
        background: 'var(--paper)',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <Corners accentIndex={0} />
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '14px 18px',
          borderBottom: '1px dashed var(--hair-2)',
        }}
      >
        <Coord style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
          <Cross size={9} accent />
          FIG.01 — BUILD GRAPH
        </Coord>
        <button
          type="button"
          onClick={run}
          disabled={running}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            background: 'transparent',
            border: '1px solid var(--hair-2)',
            color: running ? 'var(--faint)' : 'var(--ink)',
            borderRadius: 0,
            padding: '5px 11px',
            fontSize: 11,
            fontFamily: 'var(--font-mono)',
            letterSpacing: '0.06em',
            textTransform: 'uppercase',
            cursor: running ? 'default' : 'pointer',
          }}
        >
          <Icon name="play" size={11} />
          {' '}
          {running ? 'running' : 'run'}
        </button>
      </div>

      {/* diagram */}
      <div
        style={{
          flex: 1,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '12px 0',
        }}
      >
        <div style={{
          position: 'relative', height: 216, width: 540, maxWidth: '100%',
        }}
        >
          <svg
            width="540"
            height="216"
            style={{ position: 'absolute', inset: 0, overflow: 'visible' }}
            aria-hidden
          >
            {EDGES.map(([a, b]) => {
              const p1 = rc(a);
              const p2 = lc(b);
              const mx = (p1.x + p2.x) / 2;
              const d = `M${p1.x},${p1.y} C${mx},${p1.y} ${mx},${p2.y} ${p2.x},${p2.y}`;
              return (
                <path
                  key={`${a.id}-${b.id}`}
                  d={d}
                  fill="none"
                  stroke={edgeColor(state[a.id])}
                  strokeWidth="1.5"
                  style={{ transition: 'stroke .3s' }}
                />
              );
            })}
          </svg>

          {Object.values(NODES).map((node) => {
            const st = state[node.id];
            const ch = changed.has(node.id);
            const bdr = borderColor(st, ch);
            const nodeStyle: CSSProperties = {
              position: 'absolute',
              left: node.x,
              top: node.y,
              width: NW,
              height: NH,
              padding: '0 12px',
              display: 'flex',
              alignItems: 'center',
              gap: 9,
              textAlign: 'left',
              cursor: 'pointer',
              background: 'var(--paper)',
              border: `1px solid ${bdr}`,
              transition: 'background .25s, border-color .25s',
            };
            return (
              <Tooltip key={node.id} title="Toggle source change">
                <button
                  type="button"
                  onClick={() => toggle(node.id)}
                  className={ch ? 'heph-node-edited' : undefined}
                  style={nodeStyle}
                >
                  <span
                    style={{
                      width: 7,
                      height: 7,
                      borderRadius: '50%',
                      background: dotColor(st, ch),
                      flex: '0 0 auto',
                      transition: 'background .25s',
                    }}
                  />
                  <span style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
                    <span
                      style={{
                        fontFamily: 'var(--font-mono)',
                        fontSize: 12,
                        color: 'var(--ink)',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {node.label}
                    </span>
                    <span
                      style={{
                        fontFamily: 'var(--font-mono)',
                        fontSize: 9.5,
                        letterSpacing: '0.04em',
                        color: subLabelColor(st, ch),
                      }}
                    >
                      {subLabelText(st, ch)}
                    </span>
                  </span>
                </button>
              </Tooltip>
            );
          })}
        </div>
      </div>

      {/* footer: legend + result */}
      <div
        style={{
          marginTop: 'auto',
          borderTop: '1px dashed var(--hair-2)',
          padding: '11px 18px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          fontFamily: 'var(--font-mono)',
          fontSize: 11,
        }}
      >
        <div style={{ display: 'flex', gap: 14, color: 'var(--muted)' }}>
          <LegendDot color="var(--muted)" label="cache" />
          <LegendDot color="var(--ac)" label="built" />
          <LegendDot color="var(--amber-500)" label="edited" />
        </div>
        <span style={{ color: 'var(--faint)' }}>
          {running ? 'building…' : (
            <span>
              <span style={{ color: 'var(--muted)' }}>
                {hits}
                {' cached'}
              </span>
              {' · '}
              <span style={{ color: 'var(--ac-600)' }}>
                {builts}
                {' built'}
              </span>
            </span>
          )}
        </span>
      </div>
    </div>
  );
}

const INSTALL_CMD = 'curl -fsSL https://heph.dev/install | sh';

/** Headline, install command, margin ruler, dimension line, and build graph. */
export function Hero() {
  const [copied, setCopied] = useState(false);

  function copy(): void {
    navigator.clipboard?.writeText(INSTALL_CMD);
    setCopied(true);
    setTimeout(() => setCopied(false), 1400);
  }

  return (
    <section style={{ position: 'relative', borderBottom: '1px solid var(--hair)' }}>
      <Corners />
      <div style={{ display: 'grid', gridTemplateColumns: '1.02fr 0.98fr' }}>
        {/* left */}
        <div style={{ position: 'relative', display: 'flex' }}>
          <div
            style={{
              width: 38,
              borderRight: '1px solid var(--hair)',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'flex-start',
              paddingTop: 64,
              background: 'var(--paper)',
            }}
          >
            <Ruler count={9} gap={30} />
          </div>
          <div
            style={{
              flex: 1,
              padding: '48px 44px 40px 32px',
              display: 'flex',
              flexDirection: 'column',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <Coord style={{ color: '#565b63' }}>FIG.01 / 06</Coord>
              <Coord style={{ color: '#565b63' }}>＋ OPEN SOURCE</Coord>
            </div>
            <div style={{ marginTop: 28 }}>
              <Eyebrow style={{ color: '#565b63' }}>Open-source build system</Eyebrow>
            </div>
            <Title
              level={1}
              style={{
                fontFamily: 'var(--font-display)',
                fontWeight: 600,
                fontSize: 'clamp(38px, 4.4vw, 56px)',
                lineHeight: 1.02,
                letterSpacing: '-0.03em',
                margin: '18px 0 0',
                color: 'var(--ink)',
              }}
            >
              Build once.
              <br />
              Trust the
              {' '}
              <span style={{ position: 'relative', color: 'var(--ac)' }}>
                cache
                <span style={{
                  position: 'absolute', left: 0, right: 0, bottom: -4, height: 2, background: 'var(--ac)',
                }}
                />
              </span>
              .
            </Title>
            <p
              style={{
                fontSize: 16,
                lineHeight: 1.6,
                color: 'var(--ink-2)',
                margin: '22px 0 0',
                maxWidth: 400,
              }}
            >
              heph hashes every input, runs each action in a sandbox, and content-addresses the
              output. Same inputs, byte-identical artifacts — every machine, every time.
            </p>
            <div style={{ margin: '24px 0 28px', maxWidth: 400 }}>
              <Dim label="byte-identical" labelColor="#565b63" />
            </div>
            <div style={{ display: 'flex', gap: 0, marginTop: 'auto' }}>
              <Button variant="primary" icon="terminal" href="/docs">Start building</Button>
              <Button
                variant="secondary"
                icon="book-open"
                href="/docs"
                style={{ marginLeft: -1, background: 'var(--paper)' }}
              >
                Read docs
              </Button>
            </div>
          </div>
        </div>
        {/* right diagram */}
        <BuildDiagram />
      </div>

      {/* install bar */}
      <button
        type="button"
        onClick={copy}
        style={{
          display: 'flex',
          alignItems: 'stretch',
          width: '100%',
          borderTop: '1px solid var(--hair)',
          borderLeft: 0,
          borderRight: 0,
          borderBottom: 0,
          cursor: 'pointer',
          fontFamily: 'var(--font-mono)',
          fontSize: 13.5,
          background: 'var(--paper)',
          padding: 0,
          textAlign: 'left',
        }}
      >
        <span style={{ padding: '15px 20px', color: 'var(--ac)', borderRight: '1px solid var(--hair)' }}>
          $
        </span>
        <span
          style={{
            padding: '15px 20px',
            color: 'var(--ink)',
            flex: 1,
            display: 'flex',
            alignItems: 'center',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
          }}
        >
          {INSTALL_CMD}
        </span>
        <span
          style={{
            padding: '15px 22px',
            color: copied ? 'var(--ac)' : 'var(--muted)',
            borderLeft: '1px solid var(--hair)',
            display: 'inline-flex',
            alignItems: 'center',
            gap: 8,
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            fontSize: 11.5,
          }}
        >
          <Icon name={copied ? 'check' : 'copy'} size={14} />
          {copied ? 'copied' : 'copy'}
        </span>
      </button>
    </section>
  );
}
