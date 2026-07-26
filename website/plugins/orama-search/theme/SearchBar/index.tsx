/**
 * The docs search field — blueprint DocTopNav chrome over a local hybrid index.
 *
 * The component itself is deliberately tiny: Orama, the index and the embedding
 * model are all behind dynamic imports in `engine.ts`, so the navbar costs
 * nothing on first paint. Warm-up is staged — the index loads when the browser
 * is idle, the model only once someone actually types — and results are answered
 * with whatever is ready, upgrading from keyword to hybrid mid-session.
 */
import {
  useCallback, useEffect, useRef, useState,
} from 'react';
import clsx from 'clsx';
import { useHistory } from '@docusaurus/router';
import useDocusaurusContext from '@docusaurus/useDocusaurusContext';
import {
  runSearch, subscribeSemantic, warmEmbedder, warmIndex,
} from './engine';
import type { SearchHit, SearchResult, SemanticStatus } from './engine';
import { snippet } from './highlight';
import styles from './styles.module.css';

/** Footer wording per ranking — `?search=` can pin either. */
const MODE_LABEL = {
  hybrid: 'keyword + semantic',
  keyword: 'keyword',
} as const;

const MAX_HITS = 8;
/** Keystroke settling time before a query runs. */
const DEBOUNCE_MS = 120;
const MIN_TERM = 2;

/** Matches the navbar breakpoint in custom.css, where the field stops fitting. */
const COMPACT_QUERY = '(max-width: 996px)';

function isEditable(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target.isContentEditable;
}

/**
 * Narrow viewports get a magnifier button and a full-screen sheet instead of an
 * inline field and dropdown: at 390 px the field leaves no room for the wordmark
 * and the dropdown is wider than the screen.
 *
 * Starts `false` so the server-rendered markup and the first client render agree;
 * the effect corrects it before paint matters.
 */
function useCompact(): boolean {
  const [compact, setCompact] = useState(false);
  useEffect(() => {
    const query = window.matchMedia(COMPACT_QUERY);
    const sync = () => setCompact(query.matches);
    sync();
    query.addEventListener('change', sync);
    return () => query.removeEventListener('change', sync);
  }, []);
  return compact;
}

function MagnifierIcon(): JSX.Element {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
      <circle cx="11" cy="11" r="8" />
      <path d="m21 21-4.3-4.3" />
    </svg>
  );
}

export default function SearchBar(): JSX.Element {
  const { siteConfig: { baseUrl } } = useDocusaurusContext();
  const history = useHistory();

  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const [term, setTerm] = useState('');
  /** `null` while a query is in flight, `'broken'` if the index would not load. */
  const [result, setResult] = useState<SearchResult | 'broken' | null>(null);
  const [active, setActive] = useState(0);
  const [open, setOpen] = useState(false);
  const [semantic, setSemantic] = useState<SemanticStatus>({ state: 'off', progress: 0 });

  const compact = useCompact();
  const hits = result && result !== 'broken' ? result.hits : null;
  const semanticReady = semantic.state === 'ready';

  const close = useCallback(() => {
    setOpen(false);
    setTerm('');
    inputRef.current?.blur();
  }, []);

  // The sheet is modal: focus the field it just put on screen, and stop the
  // page behind it from scrolling under the finger.
  useEffect(() => {
    if (!compact || !open) return undefined;
    inputRef.current?.focus();
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = previous; };
  }, [compact, open]);

  // The model's state is owned by the engine, not this component — it can land
  // long after the query that asked for it.
  useEffect(() => subscribeSemantic(setSemantic), []);

  // Pull the index down while the browser is idle: ~100 kB, so the first query
  // answers immediately. The model is not touched here — 34 MB is not something
  // to spend on a visitor who never searches.
  useEffect(() => {
    const schedule = window.requestIdleCallback
      ?? ((cb: () => void) => window.setTimeout(cb, 2000));
    schedule(() => { warmIndex(baseUrl); });
  }, [baseUrl]);

  useEffect(() => {
    const query = term.trim();
    if (query.length < MIN_TERM) {
      setResult(null);
      return undefined;
    }

    let cancelled = false;
    const timer = window.setTimeout(() => {
      // The first real query starts the model download in the background. This
      // query is answered on keywords alone; the effect re-runs once the model
      // goes live, so the same term is re-ranked without the user retyping.
      warmEmbedder(baseUrl);

      runSearch(baseUrl, query, MAX_HITS).then((results) => {
        if (cancelled) return;
        setResult(results ?? 'broken');
        setActive(0);
      });
    }, DEBOUNCE_MS);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
    // `semanticReady` — not `semantic` — so that only the model going live
    // re-runs the query; "loading" and "unavailable" must not cancel it.
  }, [term, baseUrl, semanticReady]);

  // Click outside dismisses the panel.
  useEffect(() => {
    // The sheet covers the screen, so there is no "outside" to click.
    if (!open || compact) return undefined;
    const onPointerDown = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onPointerDown);
    return () => document.removeEventListener('mousedown', onPointerDown);
  }, [open, compact]);

  // "/" and ⌘K focus the field from anywhere, except while typing elsewhere.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const combo = (event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k';
      if (!combo && (event.key !== '/' || event.metaKey || event.ctrlKey || event.altKey)) return;
      if (!combo && isEditable(event.target)) return;
      if (compact) {
        // Nothing to focus until the sheet exists; opening it does the focusing.
        event.preventDefault();
        setOpen(true);
        return;
      }
      // The landing page hides the navbar; leave its keys alone.
      if (!inputRef.current?.offsetParent) return;
      event.preventDefault();
      inputRef.current.focus();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [compact]);

  const go = useCallback((hit: SearchHit) => {
    close();
    history.push(hit.url);
  }, [history, close]);

  const onKeyDown = useCallback((event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Escape') {
      close();
      return;
    }
    if (!hits || hits.length === 0) return;

    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActive((i) => (i + 1) % hits.length);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActive((i) => (i - 1 + hits.length) % hits.length);
    } else if (event.key === 'Enter') {
      const hit = hits[active];
      if (!hit) return;
      event.preventDefault();
      go(hit);
    }
  }, [hits, active, go, close]);

  const showPanel = open && term.trim().length >= MIN_TERM;

  const results = (
    <>
      {/* An index that will not load is a broken deploy, not an empty result —
          say so instead of claiming the docs have no match. */}
      {result === 'broken' && (
        <div className={styles.status}>search index unavailable — try reloading</div>
      )}
      {hits?.length === 0 && (
        <div className={styles.status}>
          {/* One inline child: `.status` is a flex container, and a bare {' '}
              between items is whitespace-only, so it never renders. */}
          <span>
            {'no matches for '}
            <strong>{term.trim()}</strong>
          </span>
        </div>
      )}

      {hits?.map((hit, i) => {
        const groupStart = i === 0 || hits[i - 1]?.title !== hit.title;
        return (
          <div key={hit.url}>
            {groupStart && <div className={styles.group}>{hit.title}</div>}
            <a
              href={hit.url}
              className={clsx(styles.hit, i === active && styles.hitActive)}
              onMouseEnter={() => setActive(i)}
              onClick={(event) => {
                // Let modified clicks open a new tab as usual.
                if (event.metaKey || event.ctrlKey || event.shiftKey) return;
                event.preventDefault();
                go(hit);
              }}
            >
              {/* The page name is already the group eyebrow above; a chunk from
                  the page's lead has no heading of its own. */}
              <span className={styles.hitTitle}>{hit.breadcrumb || 'Overview'}</span>
              <span className={styles.hitText}>
                {snippet(hit.content, term).map((segment, index) => (segment.match ? (
                  // eslint-disable-next-line react/no-array-index-key
                  <mark key={index} className={styles.mark}>{segment.text}</mark>
                // eslint-disable-next-line react/no-array-index-key
                ) : <span key={index}>{segment.text}</span>))}
              </span>
            </a>
          </div>
        );
      })}
    </>
  );

  /* Left half states how these results were ranked and what the semantic half
     is doing — a download in progress, a live upgrade, or a mode this
     browser/connection is not getting. */
  const footer = (
    <div className={styles.footer}>
      <span className={styles.mode}>
        {result && result !== 'broken'
          ? `ranked by ${MODE_LABEL[result.mode]}`
          : 'ranked by keyword'}
        {result && result !== 'broken' && result.degraded && (
          <span className={styles.pending}> · pinned mode not ready</span>
        )}
        {semantic.state === 'loading' && (
          <span className={styles.pending}>
            {` · semantic model ${Math.round(semantic.progress * 100)}%`}
          </span>
        )}
        {semantic.state === 'unavailable' && (
          <span className={styles.pending}> · semantic unavailable</span>
        )}
      </span>
      <span className={styles.keys}>↑↓ move · ↵ open · esc close</span>
    </div>
  );

  if (compact) {
    return (
      <>
        <button
          type="button"
          className={styles.toggle}
          aria-label="Search the documentation"
          aria-expanded={open}
          onClick={() => setOpen(true)}
        >
          <MagnifierIcon />
        </button>

        {open && (
          <div className={styles.sheet} role="dialog" aria-modal="true" aria-label="Search">
            <div className={styles.sheetHead}>
              <span className={styles.sheetIcon}><MagnifierIcon /></span>
              <input
                ref={inputRef}
                type="search"
                className={styles.sheetInput}
                placeholder="search the docs…"
                aria-label="Search the documentation"
                value={term}
                autoComplete="off"
                autoCorrect="off"
                autoCapitalize="none"
                spellCheck={false}
                onChange={(event) => setTerm(event.target.value)}
                onKeyDown={onKeyDown}
              />
              <button type="button" className={styles.cancel} onClick={close}>
                Cancel
              </button>
            </div>

            <div className={styles.sheetBody}>
              {term.trim().length < MIN_TERM
                ? <div className={styles.status}>type to search the docs</div>
                : results}
            </div>

            {footer}
          </div>
        )}
      </>
    );
  }

  return (
    <div className={clsx('navbar__search', styles.search)} ref={rootRef}>
      <input
        ref={inputRef}
        type="search"
        className={clsx('navbar__search-input', styles.input)}
        placeholder="search the docs…"
        aria-label="Search the documentation"
        value={term}
        autoComplete="off"
        spellCheck={false}
        onChange={(event) => { setTerm(event.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        onKeyDown={onKeyDown}
      />

      {showPanel && (
        <div className={styles.panel}>
          {results}
          {footer}
        </div>
      )}
    </div>
  );
}
