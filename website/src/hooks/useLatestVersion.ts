import { useEffect, useState } from 'react';

// The latest released heph version. For now this is a stubbed async lookup
// (resolved after a tick via setTimeout). Swap the effect body for a real
// fetch — e.g. the GitHub releases API `tag_name` — without touching any
// consumer of the hook.
const LATEST_VERSION = '1.8.0';
const RESOLVE_DELAY_MS = 600;

export interface LatestVersionState {
  /** Resolved version, or `null` while still loading. */
  version: string | null;
  loading: boolean;
}

export function useLatestVersion(): LatestVersionState {
  const [version, setVersion] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const timer = setTimeout(() => {
      if (!cancelled) setVersion(LATEST_VERSION);
    }, RESOLVE_DELAY_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, []);

  return { version, loading: version === null };
}
