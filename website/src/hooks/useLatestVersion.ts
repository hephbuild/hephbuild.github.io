import { useEffect, useState } from 'react';
import {
  DEFAULT_RELEASE_CHANNEL,
  releasesApiUrl,
  releasesPageUrl,
  type ReleaseChannelId,
} from '../releaseChannels';

const FALLBACK_VERSION = '?.?.?';

// Resolved versions, kept per channel for the life of the page so flipping the
// channel selector back and forth doesn't re-hit the (rate-limited) API.
const cache = new Map<ReleaseChannelId, string>();

/**
 * Human-facing releases page of the default channel, surfaced when resolution
 * fails so readers can look the version up themselves.
 */
export const RELEASES_PAGE_URL = releasesPageUrl(DEFAULT_RELEASE_CHANNEL);

export interface LatestVersionState {
  /** Resolved version, or `null` while still loading or after an error. */
  version: string | null;
  loading: boolean;
  /** `true` when resolution failed (offline, rate-limited, nothing published). */
  error: boolean;
  /**
   * `true` when the channel has no release at all — GitHub answered 404 rather
   * than failing. Worth saying out loud: it is a property of the channel, not a
   * hiccup the reader should retry.
   */
  empty: boolean;
}

/**
 * The latest released heph version on `channel`, resolved from the GitHub
 * releases API (`tag_name` of the latest release, with any leading `v` cut).
 */
export function useLatestVersion(
  channel: ReleaseChannelId = DEFAULT_RELEASE_CHANNEL,
): LatestVersionState {
  const [version, setVersion] = useState<string | null>(cache.get(channel) ?? null);
  const [error, setError] = useState(false);
  const [empty, setEmpty] = useState(false);

  useEffect(() => {
    const cached = cache.get(channel);
    if (cached) {
      setVersion(cached);
      setError(false);
      setEmpty(false);
      return undefined;
    }

    const controller = new AbortController();
    setVersion(null);
    setError(false);
    setEmpty(false);

    (async () => {
      try {
        const res = await fetch(releasesApiUrl(channel), {
          signal: controller.signal,
          headers: { Accept: 'application/vnd.github+json' },
        });
        if (res.status === 404) {
          setEmpty(true);
          setError(true);
          return;
        }
        if (!res.ok) throw new Error(`GitHub API ${res.status}`);
        const data: { tag_name?: string } = await res.json();
        const tag = data.tag_name?.replace(/^v/, '') || FALLBACK_VERSION;
        cache.set(channel, tag);
        setVersion(tag);
      } catch (err) {
        if ((err as Error).name === 'AbortError') return;
        setError(true);
      }
    })();

    return () => controller.abort();
  }, [channel]);

  return {
    version, loading: version === null && !error, error, empty,
  };
}
