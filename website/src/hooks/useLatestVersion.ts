import { useEffect, useState } from 'react';

// The latest released heph version, resolved from the GitHub releases API
// (`tag_name` of the latest release). `FALLBACK_VERSION` is used while the
// request is in flight and if it fails (offline, rate-limited, etc.).
const RELEASES_API_URL = 'https://api.github.com/repos/hephbuild/heph-artifacts-v1/releases/latest';
const FALLBACK_VERSION = '?.?.?';

export interface LatestVersionState {
  /** Resolved version, or `null` while still loading. */
  version: string | null;
  loading: boolean;
}

export function useLatestVersion(): LatestVersionState {
  const [version, setVersion] = useState<string | null>(null);

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
        setVersion(FALLBACK_VERSION);
      }
    })();

    return () => controller.abort();
  }, []);

  return { version, loading: version === null };
}
