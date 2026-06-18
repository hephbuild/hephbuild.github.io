import { useEffect, useState } from 'react';

// The latest released heph version, resolved from the GitHub releases API
// (`tag_name` of the latest release).
const RELEASES_API_URL = 'https://api.github.com/repos/hephbuild/heph-artifacts-v1/releases/latest';
const FALLBACK_VERSION = '?.?.?';

// Human-facing releases page, surfaced when resolution fails so readers can look
// the version up themselves.
export const RELEASES_PAGE_URL = 'https://github.com/hephbuild/heph-artifacts-v1/releases/latest';

export interface LatestVersionState {
  /** Resolved version, or `null` while still loading or after an error. */
  version: string | null;
  loading: boolean;
  /** `true` when resolution failed (offline, rate-limited, etc.). */
  error: boolean;
}

export function useLatestVersion(): LatestVersionState {
  const [version, setVersion] = useState<string | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    const controller = new AbortController();

    (async () => {
      try {
        const res = await fetch(RELEASES_API_URL, {
          signal: controller.signal,
          headers: { Accept: 'application/vnd.github+json' },
        });
        if (!res.ok) throw new Error(`GitHub API ${res.status}`);
        const data: { tag_name?: string } = await res.json();
        const tag = data.tag_name?.replace(/^v/, '');
        setVersion(tag || FALLBACK_VERSION);
      } catch (err) {
        if ((err as Error).name === 'AbortError') return;
        setError(true);
      }
    })();

    return () => controller.abort();
  }, []);

  return { version, loading: version === null && !error, error };
}
