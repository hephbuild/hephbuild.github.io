---
title: "GitHub Actions"
sidebar_position: 11
description: Live build-status PR comments and step summaries for GitHub Actions.
---

# GitHub Actions

The `gha` hook observes the engine's build-event stream and surfaces build
progress in GitHub Actions:

- **Live PR comment** — a sticky comment on the current pull request is created
  at job start and patched on a timer. It shows targets matched, built, cached,
  and failed, plus any targets running longer than 10 seconds. One comment per
  CI job; a job's multiple heph steps each get their own collapsible section, so
  earlier steps' results are preserved as later steps update. A new failing
  target patches the comment immediately instead of waiting for the next timer
  tick, then holds off for 10 seconds before the next early update — so several
  targets failing together produce one refresh, not a burst of them.
- **Step summary** — the full markdown is written once to
  `$GITHUB_STEP_SUMMARY` when the command finishes.
- **Failure annotations** — a `::error::` workflow command for each failing
  target, emitted the moment the failure is seen. See
  [Failure annotations](#failure-annotations).
- **Machine-readable output** — `$GITHUB_OUTPUT` keys, and optionally a JSON
  report file, for a later step or an agent to consume. See
  [Machine-readable output](#machine-readable-output).

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
      jsonPath: ""             # optional
      annotations: true        # optional
```

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `refreshSecs` | `number` | `30` | How often (in seconds) the live PR comment is patched while the build runs. Minimum 1. |
| `summaryPath` | `string` | `$GITHUB_STEP_SUMMARY` | Path where the final markdown is written at the end of the run. When neither the option nor the env var is set, the step summary is skipped. |
| `tokenEnv` | `string` | `GITHUB_TOKEN` | Name of the environment variable holding the GitHub API token used for PR comment operations. |
| `jsonPath` | `string` | unset | Path to write the full run report as JSON at the end of the run. Unset skips the file. See [Machine-readable output](#machine-readable-output). |
| `annotations` | `boolean` | `true` | Emit a `::error::` workflow command for each failing target. See [Failure annotations](#failure-annotations). |

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

The heading emoji reflects the current state: ⏳ while the command is running,
✅ once the command finishes without error, ❌ if any target failed.

A total shown as `~40` means the matcher hasn't resolved all targets yet; the
tilde drops once resolution is complete.

When failures occur a **Failed** section is appended, listing each failed target
address and the first line of its error message.

## One comment per job, one section per step

The comment is scoped by `GITHUB_JOB` — one comment per CI job, never
duplicated (found by a hidden HTML marker). Within the comment, each heph
invocation owns a section keyed by its command line (the arguments passed to
`heph`). A job with three separate `heph run` steps produces one comment with
three independently-updated sections, so earlier steps' results are preserved
as later steps write theirs.

Each new workflow run (identified by `GITHUB_RUN_ID` and `GITHUB_RUN_ATTEMPT`)
starts the comment fresh — the previous build's sections are cleared when the
first step of a new run writes to the comment. Steps within the same run
continue to preserve each other's sections as described above.

## Failure annotations

A failing target gets a GitHub Actions `::error::` annotation the moment its
failure is seen — not after the whole build finishes. Annotations appear
inline in the job log at the point of failure and on the run's summary page.
They cost no API call and are unaffected by GitHub's API rate limits, which is
why they're the fastest way a failure reaches a human.

```
::error title=heph //base:proto::exit status: 1: proto/api.proto:41:3: "UserId" is not defined.
```

Only a target that fails on its own gets an annotation. A target that fails
only because one of its dependencies failed does not — one broken dependency
blocking thousands of downstream targets still produces a single annotation,
for the target that actually broke.

Annotations are target-level: there's no `file=`/`line=` pointing at a
specific source line, since heph has no way to know which line a target's
failure came from.

Set `annotations: false` to turn this off.

## Machine-readable output

Two surfaces are meant for a later workflow step or an agent to read, not for
a human to look at.

### `$GITHUB_OUTPUT`

Written once, when the run finishes, so a later step can read it as
`${{ steps.<step-id>.outputs.heph_failed }}`:

| Key | Example | Notes |
|-----|---------|-------|
| `heph_status` | `failed` | `ok`, `failed`, or `running` |
| `heph_failed` | `2` | number of failing targets |
| `heph_blocked` | `4117` | targets blocked by a failure elsewhere in the graph |
| `heph_executed` | `338` | targets actually run |
| `heph_cached` | `19802` | targets served from cache |
| `heph_elapsed_ms` | `468000` | build duration in milliseconds |
| `heph_elapsed` | `7m48s` | build duration, formatted |
| `heph_cache_hit_rate` | `0.983` | omitted entirely when the cache was never consulted |
| `heph_json_path` | `/tmp/heph.json` | present only when `jsonPath` is set |

### `jsonPath`

Set `jsonPath` to write the full run report to a file when the run finishes:

```yaml title="ci.hephconfig"
options:
  jsonPath: ${{ runner.temp }}/heph.json
```

```json title="heph.json"
{
  "schema": "heph.gha/1",
  "status": "failed",
  "command": "run //...",
  "elapsed_ms": 468000,
  "fail_fast": false,
  "targets": {
    "matched": 20140, "done": 15923, "failed": 2,
    "blocked": 4117, "cached": 15802, "executed": 338
  },
  "cache": {
    "local_hits": 15650, "remote_hits": 152, "misses": 338, "hit_rate": 0.983
  },
  "failures": [
    {
      "addr": "//base:proto",
      "driver": "exec",
      "duration_ms": 3000,
      "exit_status": "exit status: 1",
      "blocked_count": 4109,
      "message": "process exited with status 1",
      "log_tail": "proto/api.proto:41:3: \"UserId\" is not defined."
    }
  ],
  "slowest": [
    { "addr": "//services/api:image", "driver": "exec", "duration_ms": 252000 }
  ]
}
```

`failures` lists only targets that failed on their own; a target blocked by
one of those failures is counted in that entry's `blocked_count` instead of
getting its own entry. Unset by default — no file is written.

### The embedded copy in the step summary

The step summary also carries a compact copy of the same report, wrapped in an
HTML comment:

```
<!-- heph:json {"schema":"heph.gha/1","status":"failed","truncated":false,"json_path":null,...} -->
```

This is for a reader that can only fetch the step summary and has no
filesystem access. It's capped at 2 KiB, so it carries only counters, status,
and the addresses of the targets that failed — no log tails, no slowest list.
If even the addresses don't fit the cap, the oldest ones are dropped and
`truncated: true` plus `failures_omitted` are set, so a reader knows to fall
back to `jsonPath` (when set) for the complete report.
