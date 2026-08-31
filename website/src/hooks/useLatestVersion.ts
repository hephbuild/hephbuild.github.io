import { useEffect, useState } from 'react';
import {
  DEFAULT_RELEASE_CHANNEL,
  releasesApiUrl,
  releasesPageUrl,
  type ReleaseChannelId,
} from '../releaseChannels';

const FALLBACK_VERSION = '?.?.?';

/**
 * How long a failed lookup is remembered before another one is allowed. The
 * GitHub API gives 60 unauthenticated requests an hour per IP, so retrying a
 * failure on every channel flip is the fastest way to stay broken; a settled
 * success and an empty channel are remembered for the life of the page.
 */
const RETRY_AFTER_MS = 60_000;

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

const PENDING: LatestVersionState = {
  version: null, loading: true, error: false, empty: false,
};

// Settled lookups, and the ones still in the air. Both are keyed by channel and
// module-scoped, so every component on the page — the nav strip and each code
// block — shares one request per channel, and flipping the channel selector
// back and forth replays what is already known instead of asking again.
const settled = new Map<ReleaseChannelId, { state: LatestVersionState; until: number }>();
const inFlight = new Map<ReleaseChannelId, Promise<LatestVersionState>>();

/** The remembered result for `channel`, unless it was a failure that has aged out. */
function peek(channel: ReleaseChannelId): LatestVersionState | undefined {
  const hit = settled.get(channel);
  if (!hit) return undefined;
  if (hit.until !== Infinity && hit.until < Date.now()) {
    settled.delete(channel);
    return undefined;
  }
  return hit.state;
}

/** Resolves a channel, never rejecting — failure is a state, not an exception. */
async function fetchChannel(channel: ReleaseChannelId): Promise<LatestVersionState> {
  try {
    const res = await fetch(releasesApiUrl(channel), {
      headers: { Accept: 'application/vnd.github+json' },
    });
    if (res.status === 404) {
      return {
        version: null, loading: false, error: true, empty: true,
      };
    }
    if (!res.ok) throw new Error(`GitHub API ${res.status}`);
    const data: { tag_name?: string } = await res.json();
    return {
      version: data.tag_name?.replace(/^v/, '') || FALLBACK_VERSION,
      loading: false,
      error: false,
      empty: false,
    };
  } catch {
    return {
      version: null, loading: false, error: true, empty: false,
    };
  }
}

/**
 * One lookup per channel. Callers that arrive while a request is in the air
 * join it rather than starting a second one — deliberately not abortable, since
 * the component that started it is not the only one waiting on it.
 */
function resolveChannel(channel: ReleaseChannelId): Promise<LatestVersionState> {
  const known = peek(channel);
  if (known) return Promise.resolve(known);

  const pending = inFlight.get(channel);
  if (pending) return pending;

  const request = fetchChannel(channel).then((state) => {
    // A version and an empty channel are facts; a failure is worth retrying,
    // but not before the reader has stopped clicking.
    const until = state.error && !state.empty ? Date.now() + RETRY_AFTER_MS : Infinity;
    settled.set(channel, { state, until });
    inFlight.delete(channel);
    return state;
  });

  inFlight.set(channel, request);
  return request;
}

/**
 * The latest released heph version on `channel`, resolved from the GitHub
 * releases API (`tag_name` of the latest release, with any leading `v` cut).
 */
export function useLatestVersion(
  channel: ReleaseChannelId = DEFAULT_RELEASE_CHANNEL,
): LatestVersionState {
  const [state, setState] = useState<LatestVersionState>(() => peek(channel) ?? PENDING);

  useEffect(() => {
    const known = peek(channel);
    if (known) {
      setState(known);
      return undefined;
    }

    // Switching away mid-flight drops the answer on the floor rather than
    // cancelling it: the request is shared, and its result is still worth
    // caching for whoever asks next.
    let live = true;
    setState(PENDING);
    resolveChannel(channel).then((next) => {
      if (live) setState(next);
    });

    return () => { live = false; };
  }, [channel]);

  return state;
}
