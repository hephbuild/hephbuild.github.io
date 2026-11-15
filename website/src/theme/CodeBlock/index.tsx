import type { ReactNode } from 'react';
import CodeBlock from '@theme-original/CodeBlock';
import Admonition from '@theme/Admonition';
import type CodeBlockType from '@theme/CodeBlock';
import type { WrapperProps } from '@docusaurus/types';
import { useLatestVersion } from '../../hooks/useLatestVersion';
import { useReleaseChannel } from '../../hooks/useReleaseChannel';
import { ReleaseChannelSelector } from '../../components/ReleaseChannelSelector';
import {
  DEFAULT_RELEASE_CHANNEL,
  RELEASE_CHANNELS,
  releaseAssetsUrl,
  releaseAssetsUrlForTag,
  releaseAssetsUrlLatest,
  releasesPageUrl,
} from '../../releaseChannels';

type Props = WrapperProps<typeof CodeBlockType>;

// Shown in place of the version when resolution fails — the reader swaps it out.
const VERSION_PLACEHOLDER = '<VERSION>';

// Placeholders a doc block can carry. Any of them turns the block into a
// channel-aware one: it gets the channel selector and is rewritten for the
// channel the reader is on.
//
//   <HEPH_VERSION>      the bare version         -> 1.2.3
//   <HEPH_VERSION_URL>  the same, URL-encoded    -> 1.2.3
//   <HEPH_ARTIFACTS_URL> assets base URL         -> https://github.com/<repo>/releases/download/v1.2.3
//   <HEPH_INSTALL_ENV>  installer env prefix     -> "" on the default channel,
//                                                  `HEPH_CHANNEL=<id> ` otherwise
const PLACEHOLDERS = /<HEPH_(?:VERSION|VERSION_URL|ARTIFACTS_URL|INSTALL_ENV)>/;
const VERSION_PLACEHOLDERS = /<HEPH_(?:VERSION|VERSION_URL|ARTIFACTS_URL)>/;

/**
 * Wraps the theme `CodeBlock`. A block containing any `<HEPH_…>` placeholder is
 * rendered for the reader's [release channel](/docs/reference/release-channels):
 * a selector is drawn above it and the placeholders are substituted with that
 * channel's latest version and asset URLs. While loading, the version falls back
 * to `latest`; if resolution fails the block renders `<VERSION>` and an error
 * notice pointing at the channel's releases page. Other blocks pass through.
 */
export default function CodeBlockWrapper(props: Props): ReactNode {
  const { channel } = useReleaseChannel();
  const { version, error, empty } = useLatestVersion(channel);
  const { children } = props;

  if (typeof children !== 'string' || !PLACEHOLDERS.test(children)) {
    return <CodeBlock {...props} />;
  }

  const v = error ? VERSION_PLACEHOLDER : (version ?? 'latest');
  // Until the version lands, point at GitHub's `latest` alias — a URL that
  // actually resolves — rather than at a tag spelled out of a placeholder.
  let assetsUrl: string;
  if (error) assetsUrl = releaseAssetsUrlForTag(channel, VERSION_PLACEHOLDER);
  else if (version === null) assetsUrl = releaseAssetsUrlLatest(channel);
  else assetsUrl = releaseAssetsUrl(channel, version);

  const installEnv = channel === DEFAULT_RELEASE_CHANNEL ? '' : `HEPH_CHANNEL=${channel} `;
  const code = children
    .replace(/<HEPH_ARTIFACTS_URL>/g, assetsUrl)
    .replace(/<HEPH_VERSION>/g, v)
    .replace(/<HEPH_VERSION_URL>/g, encodeURIComponent(v))
    .replace(/<HEPH_INSTALL_ENV>/g, installEnv);

  return (
    <div className="hephChannelBlock">
      <ReleaseChannelSelector />
      {error && empty && VERSION_PLACEHOLDERS.test(children) && (
        <Admonition type="warning" title={`No ${RELEASE_CHANNELS[channel].label.toLowerCase()} release yet`}>
          <p>
            The
            {' '}
            <code>{channel}</code>
            {' '}
            channel has not published a release. Stay on
            {' '}
            <code>{DEFAULT_RELEASE_CHANNEL}</code>
            {' '}
            until it does — the
            {' '}
            <a href={releasesPageUrl(channel)} target="_blank" rel="noreferrer">
              releases page
            </a>
            {' '}
            is where the first one will show up.
          </p>
        </Admonition>
      )}
      {error && !empty && VERSION_PLACEHOLDERS.test(children) && (
        <Admonition type="danger" title="Could not resolve the latest version">
          <p>
            Open the
            {' '}
            <a href={releasesPageUrl(channel)} target="_blank" rel="noreferrer">
              releases page
            </a>
            {' '}
            and replace
            {' '}
            <code>{VERSION_PLACEHOLDER}</code>
            {' '}
            below with the latest tag.
          </p>
        </Admonition>
      )}
      <CodeBlock {...props}>{code}</CodeBlock>
    </div>
  );
}
