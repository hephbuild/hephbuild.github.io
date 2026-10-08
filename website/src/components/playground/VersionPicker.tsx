import {
  useEffect, useId, useRef, useState, type KeyboardEvent,
} from 'react';
import { listTags, type Release } from './releases';

interface Props {
  id: string;
  /** Recent releases, listed before anything is typed. */
  releases: Release[] | null;
  /** Shown in place of the input while `releases` is null. */
  placeholder: string;
  value: string;
  onChange: (tag: string) => void;
  disabled?: boolean;
}

// Matches shown at once; the query narrows the rest.
const MAX_MATCHES = 50;
const SEARCH_DELAY_MS = 200;

const norm = (s: string) => s.trim().toLowerCase().replace(/^v/, '');

type Search =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'done'; tags: string[] }
  | { kind: 'error'; message: string };

/**
 * A version select you can type into. Before typing it lists the recent
 * releases; a query searches every release tag on GitHub for tags containing it.
 */
export function VersionPicker({
  id, releases, placeholder, value, onChange, disabled,
}: Props) {
  const listId = useId();
  const listRef = useRef<HTMLUListElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const [search, setSearch] = useState<Search>({ kind: 'idle' });

  const q = norm(query);
  const latest = releases?.find((r) => r.latest)?.tag;
  const recent = (releases ?? []).map((r) => r.tag);
  let matches = recent;
  if (q) {
    // Until GitHub answers, narrow the recent releases already on hand.
    const pool = search.kind === 'done' ? search.tags : recent;
    matches = pool.filter((t) => norm(t).includes(q)).slice(0, MAX_MATCHES);
  }

  useEffect(() => {
    if (!q) return undefined;
    let live = true;
    const timer = setTimeout(() => {
      setSearch((s) => (s.kind === 'done' ? s : { kind: 'loading' }));
      listTags().then(
        (tags) => live && setSearch({ kind: 'done', tags }),
        (e: unknown) => live && setSearch({ kind: 'error', message: e instanceof Error ? e.message : String(e) }),
      );
    }, SEARCH_DELAY_MS);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [q]);

  useEffect(() => {
    listRef.current?.querySelector('[data-active="true"]')?.scrollIntoView({ block: 'nearest' });
  }, [active, open]);

  const label = (tag: string) => (tag === latest ? `${tag} (latest)` : tag);

  const show = () => {
    setQuery('');
    setActive(Math.max(0, recent.indexOf(value)));
    setOpen(true);
  };
  const pick = (tag: string | undefined) => {
    if (tag) onChange(tag);
    setOpen(false);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (!open) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        show();
      }
      return;
    }
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      const step = e.key === 'ArrowDown' ? 1 : -1;
      setActive((i) => Math.min(Math.max(i + step, 0), matches.length - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      pick(matches[active]);
    } else if (e.key === 'Escape') {
      setOpen(false);
    }
  };

  let status: string | null = null;
  if (q && search.kind === 'error') status = `search unavailable: ${search.message}`;
  else if (q && search.kind !== 'done') status = 'searching GitHub releases…';
  else if (matches.length === 0) status = 'no matching version';

  return (
    <div className="pg-picker">
      <input
        id={id}
        type="text"
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={open && matches[active] ? `${listId}-${active}` : undefined}
        autoComplete="off"
        spellCheck={false}
        disabled={disabled || !releases}
        placeholder={open ? 'search versions…' : undefined}
        value={open ? query : (value && label(value)) || placeholder}
        onFocus={show}
        onClick={() => !open && show()}
        onBlur={() => setOpen(false)}
        onChange={(e) => {
          setQuery(e.target.value);
          setActive(0);
        }}
        onKeyDown={onKeyDown}
      />
      {open && (
        <ul id={listId} ref={listRef} role="listbox" className="pg-picker-list">
          {matches.map((tag, i) => (
            <li
              key={tag}
              id={`${listId}-${i}`}
              role="option"
              aria-selected={tag === value}
              data-active={i === active}
              // mousedown, not click: it fires before the input's blur closes the list.
              onMouseDown={(e) => {
                e.preventDefault();
                pick(tag);
              }}
              onMouseEnter={() => setActive(i)}
            >
              {label(tag)}
            </li>
          ))}
          {status && <li className="pg-picker-empty">{status}</li>}
        </ul>
      )}
    </div>
  );
}
