---
title: "GitHub Actions"
sidebar_position: 11
description: Live build-status PR comments and step summaries for GitHub Actions.
---

# GitHub Actions

The `gha` hook observes the engine's build-event stream and surfaces build
progress in GitHub Actions two ways:

- **Live PR comment** — a sticky comment on the current pull request is created
  at job start and patched on a timer. It shows targets matched, built, cached,
  and failed, plus any targets running longer than 10 seconds. One comment per
  CI job; a job's multiple heph steps each get their own collapsible section, so
  earlier steps' results are preserved as later steps update.
- **Step summary** — the full markdown is written once to
  `$GITHUB_STEP_SUMMARY` when the command finishes.

The live comment is only created when running inside a pull request (GitHub
populates `GITHUB_EVENT_PATH` or `GITHUB_REF` with the PR number). On a push,
schedule, or manual dispatch there is no PR to comment on — only the step
summary is written.

## What it is

`gha` is a **hook** — a third plugin kind alongside providers and drivers. A
hook receives every `BuildEvent` the engine emits but never produces or runs
targets. It runs in the same process as heph on a background thread.

## Enabling it

The GHA plugin is an **external plugin** — it ships as a shared library
(cdylib) with a manifest file (`heph-gha-plugin.json`).

### Loading from a URL

```yaml title=".hephconfig"
plugins:
  - url: https://github.com/hephbuild/heph-artifacts-v1/releases/download/v<HEPH_VERSION_URL>/heph-gha-plugin.json
    checksum: sha256:<hex>   # optional; pin from heph-gha-plugin.json.sha256
```

See [Pinning manifests with checksums](/docs/reference/configuration#pinning-manifests-with-checksums)
for details.

### CI-only via a profile overlay

The hook only makes sense in CI, so the recommended pattern is to load it from
a profile overlay so local runs are unaffected:

```yaml title="ci.hephconfig"
plugins:
  - url: https://github.com/hephbuild/heph-artifacts-v1/releases/download/v<HEPH_VERSION_URL>/heph-gha-plugin.json
    checksum: sha256:<hex>
```

```yaml title=".github/workflows/build.yml"
jobs:
  build:
    permissions:
      pull-requests: write   # required for the live PR comment
    steps:
      - uses: actions/checkout@v4
      - name: Build
        env:
          HEPH_PROFILES: ci
        run: heph run //... --no-tui
```

See [Profiles](/docs/reference/configuration#profiles--layered-config-overlays) for
how profile overlays work.

## GitHub token permissions

The live PR comment is written via the GitHub REST API using `GITHUB_TOKEN` by
default. The token must have `pull-requests: write` permission:

```yaml title=".github/workflows/build.yml"
permissions:
  pull-requests: write
```

The hook needs three things to create or update the comment:

1. A non-empty `GITHUB_TOKEN` (or the env var named by `tokenEnv`)
2. `GITHUB_REPOSITORY` set by Actions
3. A PR number — read from the event payload (`GITHUB_EVENT_PATH`) or inferred
   from the ref (`refs/pull/<N>/merge` or `/head`)

When any of the three is absent the comment is silently skipped and a log
message is emitted. The step summary is always written regardless.

## Options

```yaml title="ci.hephconfig"
plugins:
  - url: https://github.com/hephbuild/heph-artifacts-v1/releases/download/v<HEPH_VERSION_URL>/heph-gha-plugin.json
    options:
      refreshSecs: 30          # optional
      summaryPath: ""          # optional
      tokenEnv: GITHUB_TOKEN   # optional
```

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `refreshSecs` | `number` | `30` | How often (in seconds) the live PR comment is patched while the build runs. Minimum 1. |
| `summaryPath` | `string` | `$GITHUB_STEP_SUMMARY` | Path where the final markdown is written at the end of the run. When neither the option nor the env var is set, the step summary is skipped. |
| `tokenEnv` | `string` | `GITHUB_TOKEN` | Name of the environment variable holding the GitHub API token used for PR comment operations. |

## What the comment looks like

While the build runs the comment shows live progress:

```markdown
## ⏳ heph: run //...

**Targets:** 12 / ~40 &nbsp;•&nbsp; **built:** 3 &nbsp;•&nbsp; **cached:** 9 &nbsp;•&nbsp; **failed:** 0

<details><summary>🐢 Slow targets (1)</summary>

| target | phase | running for |
| --- | --- | --- |
| `//heavy:compile` | execute | 23s |

</details>
```

The heading emoji reflects the current state: ⏳ while running, ✅ once every
matched target finishes without error, ❌ as soon as any target fails.

A total shown as `~40` means the matcher hasn't resolved all targets yet; the
tilde drops once resolution is complete.

When failures occur a **Failed** section is appended, listing each failed target
address and the first line of its error message.

## One comment per job, one section per step

The comment is scoped by `GITHUB_JOB` — one comment per CI job, reused across
reruns (found by a hidden HTML marker, never duplicated). Within the comment,
each heph invocation owns a section keyed by its command line (the arguments
passed to `heph`). A job with three separate `heph run` steps produces one
comment with three independently-updated sections, so earlier steps' results
are preserved as later steps write theirs.
