import type { ReactNode } from 'react';
import { Tooltip } from '@heph/uikit';
import { useReleaseChannel } from '../hooks/useReleaseChannel';
import {
  DEFAULT_RELEASE_CHANNEL,
  RELEASE_CHANNELS,
  RELEASE_CHANNEL_IDS,
} from '../releaseChannels';

/**
 * Segmented control sitting on top of a code block whose contents depend on the
 * release channel — the version pin, plugin manifest URLs, the installer.
 * Picking a channel switches every such block on the page at once.
 */
export function ReleaseChannelSelector(): ReactNode {
  const { channel, setChannel } = useReleaseChannel();

  return (
    <div className="hephChannelBar">
      <span className="hephChannelBar__label">channel</span>
      <div className="hephChannelBar__group" role="radiogroup" aria-label="Release channel">
        {RELEASE_CHANNEL_IDS.map((id) => {
          const c = RELEASE_CHANNELS[id];
          const selected = id === channel;
          return (
            <Tooltip key={id} title={c.description}>
              <button
                type="button"
                role="radio"
                aria-checked={selected}
                className={`hephChannelBar__option${selected ? ' hephChannelBar__option--on' : ''}`}
                onClick={() => setChannel(id)}
              >
                {c.label}
                {id === DEFAULT_RELEASE_CHANNEL && <span className="hephChannelBar__default">default</span>}
              </button>
            </Tooltip>
          );
        })}
      </div>
    </div>
  );
}
