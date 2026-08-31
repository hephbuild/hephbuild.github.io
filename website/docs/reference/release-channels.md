---
title: "Release channels"
sidebar_position: 4
description: Where heph releases come from — dev and stable — and how to pick one.
---

# Release channels

A **release channel** is the stream a heph release comes from: the `heph`
binary, the plugin manifests published beside it, and their checksums. Every
channel publishes the same asset names — only the cadence and the repository
differ.

| Channel   | Cadence | Releases |
|-----------|---------|----------|
| `dev`     | Cut from every change on main. Newest features, fastest moving. **Default.** | [hephbuild/heph-artifacts-v1](https://github.com/hephbuild/heph-artifacts-v1/releases/latest) |
| `stable`  | Tagged releases. Fewer, slower, vetted. | [hephbuild/heph](https://github.com/hephbuild/heph/releases/latest) |

:::note
`dev` is the default everywhere today — the installer, and every version and
URL these docs show. Pick `stable` when you want a slower-moving pin.
:::

## Reading the docs on a channel

Every code block that carries a version or a plugin URL has a channel selector
above it. Pick a channel and the whole page rewrites: the `version:` pin, the
plugin manifest URLs, and the install command all switch to that channel. The
choice sticks across pages.

:::tip
`?channel=stable` on any docs URL pins the page to that channel for the visit,
without changing your saved choice — handy for sharing a link that reads the way
you meant it.
:::

## Installing from a channel

The installer takes the channel in `HEPH_CHANNEL`:

```bash title="terminal"
HEPH_CHANNEL=stable curl -fsSL https://hephbuild.github.io/install.sh | sh
```

Omit it for `dev`. `HEPH_VERSION` pins a tag within the channel:

```bash title="terminal"
HEPH_CHANNEL=stable HEPH_VERSION=v1.2.3 curl -fsSL https://hephbuild.github.io/install.sh | sh
```

## Pinning plugins from a channel

A `url:` plugin entry names the release it comes from, so it carries the channel
in its URL — keep it on the same channel as the version you pinned:

```yaml title=".hephconfig"
version: <HEPH_VERSION>
plugins:
  - url: <HEPH_ARTIFACTS_URL>/heph-go-plugin.json
```

See [Configuration](/docs/reference/configuration#pinning-the-version) for the
`version` key and [Pinning manifests with checksums](/docs/reference/configuration#pinning-manifests-with-checksums)
for locking a manifest to a digest.

## Switching channels

Nothing is stateful about a channel: change the `version:` pin and the plugin
URLs in `.hephconfig`, and the next run downloads and re-execs into the release
you named. Binaries are cached per tag, so switching back is instant.
