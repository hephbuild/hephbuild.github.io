import {
  useEffect, useId, useRef, useState, type KeyboardEvent,
} from 'react';
import type { Release } from './releases';

interface Props {
  id: string;
  releases: Release[] | null;
  /** Shown in place of the input while `releases` is null. */
  placeholder: string;
  value: string;
  onChange: (tag: string) => void;
  disabled?: boolean;
}

const label = (r: Release) => (r.latest ? `${r.tag} (latest)` : r.tag);

/** A version select you can type into: the list narrows to tags containing the query. */
export function VersionPicker({
  id, releases, placeholder, value, onChange, disabled,
}: Props) {
  const listId = useId();
  const listRef = useRef<HTMLUListElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);

  const q = query.trim().toLowerCase().replace(/^v/, '');
  const matches = (releases ?? []).filter((r) => r.tag.toLowerCase().replace(/^v/, '').includes(q));
  const selected = releases?.find((r) => r.tag === value);
  const shown = selected ? label(selected) : placeholder;

  useEffect(() => {
    listRef.current?.children[active]?.scrollIntoView({ block: 'nearest' });
  }, [active, open]);

  const show = () => {
    setQuery('');
    setActive(Math.max(0, (releases ?? []).findIndex((r) => r.tag === value)));
    setOpen(true);
  };
  const pick = (r: Release | undefined) => {
    if (r) onChange(r.tag);
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
        value={open ? query : shown}
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
          {matches.length === 0 && <li className="pg-picker-empty">no matching version</li>}
          {matches.map((r, i) => (
            <li
              key={r.tag}
              id={`${listId}-${i}`}
              role="option"
              aria-selected={r.tag === value}
              data-active={i === active}
              // mousedown, not click: it fires before the input's blur closes the list.
              onMouseDown={(e) => {
                e.preventDefault();
                pick(r);
              }}
              onMouseEnter={() => setActive(i)}
            >
              {label(r)}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
