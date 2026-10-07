import {
  useCallback, useEffect, useRef, useState, type ReactNode,
} from 'react';
import type { Vm } from 'arm64js';
import type { AttachedTerminal } from 'arm64js/terminal';
import { Eyebrow } from '@heph/uikit';
import '@xterm/xterm/css/xterm.css';
import { EXAMPLES } from './examples';
import { listReleases, type Release } from './releases';
import {
  bootPlayground, enterShell, type Progress, type Stage,
} from './vm';
import './playground.css';

const STAGES: { id: Stage; label: string }[] = [
  { id: 'download', label: 'Download heph + plugins' },
  { id: 'boot', label: 'Boot Alpine Linux' },
  { id: 'packages', label: 'Install packages' },
  { id: 'install', label: 'Install heph + examples' },
];

type Status =
  | { kind: 'idle' }
  | { kind: 'running'; progress: Progress }
  | { kind: 'ready'; vcpus: number; restored: boolean }
  | { kind: 'error'; message: string };

function errorMessage(e: unknown): string {
  const code = (e as { code?: string })?.code;
  if (code === 'unsupported-browser') {
    return 'This browser cannot run the VM here. Use Chrome or Edge 137 or newer.';
  }
  return e instanceof Error ? e.message : String(e);
}

function Stages({ progress }: { progress: Progress }) {
  const current = STAGES.findIndex((s) => s.id === progress.stage);
  const state = (i: number) => {
    if (i < current) return 'done';
    return i === current ? 'active' : 'todo';
  };
  return (
    <ol className="pg-stages">
      {STAGES.map((s, i) => (
        <li key={s.id} data-state={state(i)}>
          <span>{s.label}</span>
          {i === current && progress.detail && <small>{progress.detail}</small>}
          {i === current && progress.fraction !== undefined && (
            <progress value={progress.fraction} max={1} />
          )}
        </li>
      ))}
    </ol>
  );
}

function startLabel(status: Status): string {
  if (status.kind === 'running') return 'Starting…';
  return status.kind === 'ready' ? 'Restart' : 'Start VM';
}

export function Playground() {
  const [releases, setReleases] = useState<Release[] | null>(null);
  const [releasesError, setReleasesError] = useState<string | null>(null);
  const [tag, setTag] = useState('');
  const [status, setStatus] = useState<Status>({ kind: 'idle' });
  const termEl = useRef<HTMLDivElement>(null);
  const vmRef = useRef<Vm | null>(null);
  const termRef = useRef<AttachedTerminal | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    const ac = new AbortController();
    listReleases(ac.signal).then((rs) => {
      setReleases(rs);
      setTag((rs.find((r) => r.latest) ?? rs[0])?.tag ?? '');
    }).catch((e: unknown) => {
      if (!ac.signal.aborted) setReleasesError(errorMessage(e));
    });
    return () => ac.abort();
  }, []);

  const teardown = useCallback(() => {
    abortRef.current?.abort();
    termRef.current?.dispose();
    termRef.current = null;
    vmRef.current?.dispose();
    vmRef.current = null;
  }, []);

  useEffect(() => teardown, [teardown]);

  const release = releases?.find((r) => r.tag === tag);

  const start = async () => {
    if (!release || !termEl.current) return;
    teardown();
    const ac = new AbortController();
    abortRef.current = ac;
    setStatus({ kind: 'running', progress: { stage: 'download' } });
    try {
      const { vm, vcpus, restored } = await bootPlayground(release, (progress) => {
        if (!ac.signal.aborted) setStatus({ kind: 'running', progress });
      }, ac.signal);
      if (ac.signal.aborted) {
        vm.dispose();
        return;
      }
      vmRef.current = vm;
      const { attachTerminal } = await import('arm64js/terminal');
      termRef.current = attachTerminal(vm, termEl.current, {
        xterm: {
          fontFamily: 'IBM Plex Mono, ui-monospace, monospace',
          fontSize: 13,
          theme: { background: '#0b0c0f', foreground: '#e6e7ea', cursor: '#5a7dff' },
        },
      });
      await enterShell(vm);
      termRef.current.xterm.focus();
      setStatus({ kind: 'ready', vcpus, restored });
    } catch (e) {
      if (!ac.signal.aborted) setStatus({ kind: 'error', message: errorMessage(e) });
    }
  };

  const runExample = (dir: string, command: string) => {
    vmRef.current?.write(`cd ~/examples/${dir} && ${command}\r`).catch(() => {});
    termRef.current?.xterm.focus();
  };

  const running = status.kind === 'running';
  const ready = status.kind === 'ready';

  let placeholder: ReactNode = null;
  if (status.kind === 'idle') {
    placeholder = (
      <p>
        Pick a version and start the VM. The first start downloads about 200&nbsp;MB;
        later starts reuse the cached copy.
      </p>
    );
  } else if (status.kind === 'running') {
    placeholder = <Stages progress={status.progress} />;
  } else if (status.kind === 'error') {
    placeholder = <pre className="pg-error">{status.message}</pre>;
  }

  return (
    <div className="pg">
      <header className="pg-head">
        <Eyebrow>Playground</Eyebrow>
        <h1>Try heph in your browser</h1>
        <p>
          A real Linux VM — Alpine on an emulated arm64 CPU — boots in this tab with heph and
          every plugin of the release you pick. Nothing to install; nothing leaves your machine.
        </p>
      </header>

      <div className="pg-controls">
        <label className="pg-field" htmlFor="pg-version">
          <span>heph version</span>
          <select
            id="pg-version"
            value={tag}
            onChange={(e) => setTag(e.target.value)}
            disabled={!releases || running}
          >
            {!releases && <option>{releasesError ? 'unavailable' : 'loading releases…'}</option>}
            {releases?.map((r) => (
              <option key={r.tag} value={r.tag}>
                {r.latest ? `${r.tag} (latest)` : r.tag}
              </option>
            ))}
          </select>
        </label>
        <button type="button" className="pg-start" onClick={start} disabled={!release || running}>
          {startLabel(status)}
        </button>
        {release && (
          <div className="pg-plugins">
            <span>plugins</span>
            {release.plugins.length
              ? release.plugins.map((p) => <code key={p.stem}>{p.stem.replace(/^heph-|-plugin$/g, '')}</code>)
              : <em>none</em>}
          </div>
        )}
        {ready && (
          <div className="pg-plugins">
            <span>vm</span>
            <code>{`${status.vcpus} vCPU${status.vcpus > 1 ? 's' : ''}`}</code>
            {status.restored && <code>from snapshot</code>}
          </div>
        )}
      </div>
      {releasesError && (
        <div className="pg-error">
          {`Could not list releases: ${releasesError}`}
        </div>
      )}

      <div className="pg-body">
        <div className="pg-term-wrap">
          <div ref={termEl} className="pg-term" hidden={!ready} />
          {!ready && <div className="pg-term-placeholder">{placeholder}</div>}
        </div>

        <aside className="pg-examples">
          <Eyebrow>Examples</Eyebrow>
          <ul>
            {EXAMPLES.map((ex) => (
              <li key={ex.dir}>
                <button type="button" disabled={!ready} onClick={() => runExample(ex.dir, ex.try)}>
                  <strong>{ex.title}</strong>
                  <code>{ex.try}</code>
                </button>
              </li>
            ))}
          </ul>
          <p className="pg-note">
            Each example lives in
            {' '}
            <code>~/examples/&lt;name&gt;</code>
            {' '}
            with a README. Edit files with
            {' '}
            <code>vi</code>
            {' '}
            and rebuild to watch the cache work.
          </p>
        </aside>
      </div>
    </div>
  );
}
