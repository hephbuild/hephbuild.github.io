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
import { runSearch, warmEmbedder, warmIndex } from './engine';
import type { SearchHit } from './engine';
import { snippet } from './highlight';
import styles from './styles.module.css';

const MAX_HITS = 8;
/** Keystroke settling time before a query runs. */
const DEBOUNCE_MS = 120;
const MIN_TERM = 2;

function isEditable(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target.isContentEditable;
}

export default function SearchBar(): JSX.Element {
  const { siteConfig: { baseUrl } } = useDocusaurusContext();
  const history = useHistory();

  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const [term, setTerm] = useState('');
  const [hits, setHits] = useState<SearchHit[] | null>(null);
  const [active, setActive] = useState(0);
  const [open, setOpen] = useState(false);
  const [semantic, setSemantic] = useState(false);

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
      setHits(null);
      return undefined;
    }

    let cancelled = false;
    const timer = window.setTimeout(() => {
      // First real query starts the model download in the background; this
      // query is answered on keywords alone and re-runs when the model lands.
      warmEmbedder(baseUrl).then((ready) => !cancelled && setSemantic(ready));

      runSearch(baseUrl, query, MAX_HITS).then((results) => {
        if (cancelled) return;
        setHits(results ?? []);
        setActive(0);
      });
    }, DEBOUNCE_MS);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [term, baseUrl, semantic]);

  // Click outside dismisses the panel.
  useEffect(() => {
    if (!open) return undefined;
    const onPointerDown = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onPointerDown);
    return () => document.removeEventListener('mousedown', onPointerDown);
  }, [open]);

  // "/" and ⌘K focus the field from anywhere, except while typing elsewhere.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const combo = (event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k';
      if (!combo && (event.key !== '/' || event.metaKey || event.ctrlKey || event.altKey)) return;
      if (!combo && isEditable(event.target)) return;
      // The landing page hides the navbar; leave its keys alone.
      if (!inputRef.current?.offsetParent) return;
      event.preventDefault();
      inputRef.current.focus();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  const go = useCallback((hit: SearchHit) => {
    setOpen(false);
    setTerm('');
    inputRef.current?.blur();
    history.push(hit.url);
  }, [history]);

  const onKeyDown = useCallback((event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Escape') {
      setOpen(false);
      inputRef.current?.blur();
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
  }, [hits, active, go]);

  const showPanel = open && term.trim().length >= MIN_TERM;

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
          {hits === null && <div className={styles.status}>searching…</div>}
          {hits?.length === 0 && (
            <div className={styles.status}>
              no matches for
              {' '}
              <strong>{term.trim()}</strong>
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
                  {/* The page name is already the group eyebrow above; a chunk
                      from the page's lead has no heading of its own. */}
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

          <div className={styles.footer}>
            <span>{semantic ? 'keyword + semantic' : 'keyword · semantic loading…'}</span>
            <span className={styles.keys}>↑↓ move · ↵ open · esc close</span>
          </div>
        </div>
      )}
    </div>
  );
}
