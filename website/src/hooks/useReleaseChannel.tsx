import {
  createContext, useContext, useEffect, useMemo, useState, type ReactNode,
} from 'react';
import {
  DEFAULT_RELEASE_CHANNEL,
  isReleaseChannelId,
  type ReleaseChannelId,
} from '../releaseChannels';

// A reader who picked a channel on one page expects the next page to keep it.
const STORAGE_KEY = 'heph.releaseChannel';

interface ReleaseChannelContextValue {
  channel: ReleaseChannelId;
  setChannel: (channel: ReleaseChannelId) => void;
}

const ReleaseChannelContext = createContext<ReleaseChannelContextValue>({
  channel: DEFAULT_RELEASE_CHANNEL,
  setChannel: () => {},
});

/**
 * Holds the channel the reader is browsing in. Every `.hephconfig` sample on
 * the page renders from the same one, so switching the selector on one block
 * switches them all.
 *
 * The initial state is the default channel on both server and client — the
 * stored choice is applied in an effect, after hydration, so the markup matches
 * what was prerendered.
 */
export function ReleaseChannelProvider({ children }: { children: ReactNode }): ReactNode {
  const [channel, setChannel] = useState<ReleaseChannelId>(DEFAULT_RELEASE_CHANNEL);

  useEffect(() => {
    // `?channel=stable` pins the channel for this visit — a shareable link that
    // shows a page as another channel reads it. It wins over the stored choice
    // and is deliberately not persisted.
    const pinned = new URLSearchParams(window.location.search).get('channel');
    if (isReleaseChannelId(pinned)) {
      setChannel(pinned);
      return;
    }
    try {
      const stored = window.localStorage.getItem(STORAGE_KEY);
      if (isReleaseChannelId(stored)) setChannel(stored);
    } catch {
      // Private mode / storage disabled — the default channel is fine.
    }
  }, []);

  const value = useMemo<ReleaseChannelContextValue>(() => ({
    channel,
    setChannel: (next) => {
      setChannel(next);
      try {
        window.localStorage.setItem(STORAGE_KEY, next);
      } catch {
        // Not persisting is survivable; the page still switches.
      }
    },
  }), [channel]);

  return (
    <ReleaseChannelContext.Provider value={value}>
      {children}
    </ReleaseChannelContext.Provider>
  );
}

export function useReleaseChannel(): ReleaseChannelContextValue {
  return useContext(ReleaseChannelContext);
}
