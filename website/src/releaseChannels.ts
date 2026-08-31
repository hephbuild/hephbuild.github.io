// Release channels — where a heph release (the binary and the plugin manifests
// that ship with it) is published.
//
// Everything the site renders about versions goes through here: the version in
// the nav strip, the `version:` pin in `.hephconfig` samples, and the plugin
// `url:` entries in the docs. Flipping which channel a reader gets by default
// is a one-line change to DEFAULT_RELEASE_CHANNEL below.

export type ReleaseChannelId = 'nightly' | 'stable';

export interface ReleaseChannel {
  id: ReleaseChannelId;
  /** Short label — what the channel selector shows. */
  label: string;
  /** One line, user-facing: what a reader gets by picking this channel. */
  description: string;
  /** `owner/name` of the GitHub repository the channel's releases live in. */
  repo: string;
}

export const RELEASE_CHANNELS: Record<ReleaseChannelId, ReleaseChannel> = {
  nightly: {
    id: 'nightly',
    label: 'Nightly',
    description: 'Cut from every change on main. Newest features, fastest moving.',
    repo: 'hephbuild/heph-artifacts-v1',
  },
  stable: {
    id: 'stable',
    label: 'Stable',
    description: 'Tagged releases. Fewer, slower, vetted.',
    repo: 'hephbuild/heph',
  },
};

/** Order the channels are offered in. */
export const RELEASE_CHANNEL_IDS: ReleaseChannelId[] = ['nightly', 'stable'];

/**
 * The channel a reader gets until they pick another one — every version the
 * site shows without an explicit channel comes from here. Change this constant
 * (and nothing else) to make another channel the default.
 */
export const DEFAULT_RELEASE_CHANNEL: ReleaseChannelId = 'nightly';

export function isReleaseChannelId(value: unknown): value is ReleaseChannelId {
  return typeof value === 'string' && value in RELEASE_CHANNELS;
}

export function releaseChannel(id: ReleaseChannelId): ReleaseChannel {
  return RELEASE_CHANNELS[id];
}

/** GitHub API endpoint resolving the channel's latest release. */
export function releasesApiUrl(id: ReleaseChannelId): string {
  return `https://api.github.com/repos/${RELEASE_CHANNELS[id].repo}/releases/latest`;
}

/** Human-facing releases page for the channel. */
export function releasesPageUrl(id: ReleaseChannelId): string {
  return `https://github.com/${RELEASE_CHANNELS[id].repo}/releases/latest`;
}

/**
 * Base URL the assets of the release tagged `tag` hang off — plugin manifests,
 * checksums, binaries.
 */
export function releaseAssetsUrlForTag(id: ReleaseChannelId, tag: string): string {
  return `https://github.com/${RELEASE_CHANNELS[id].repo}/releases/download/${tag}`;
}

/**
 * Same, for a bare version (no leading `v`) as returned by useLatestVersion.
 */
export function releaseAssetsUrl(id: ReleaseChannelId, version: string): string {
  return releaseAssetsUrlForTag(id, `v${encodeURIComponent(version)}`);
}

/** Same, resolved by GitHub to whatever the channel's latest release is. */
export function releaseAssetsUrlLatest(id: ReleaseChannelId): string {
  return `https://github.com/${RELEASE_CHANNELS[id].repo}/releases/latest/download`;
}
