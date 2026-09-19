---
sidebar_position: 2
title: Getting started
description: Install heph and write your first .hephconfig.
---

# Getting started

Install heph:

```bash title="terminal"
<HEPH_INSTALL_ENV>curl -fsSL https://hephbuild.github.io/install.sh | sh
```

Then drop a `.hephconfig` at the root of your repository. Pin the version so
every machine and CI run resolves the same toolchain — byte for byte:

```yaml title=".hephconfig"
version: <HEPH_VERSION>
```

The version above comes from a [release channel](/docs/reference/release-channels)
— `dev` by default. Switch the selector on any code block to read the page
for the other channel.

From here, enable the [plugins](/docs/plugins) that you require and get building!
A good plugin to get started is [buildfile](/docs/plugins/buildfile).
