---
title: "Using heph in CI"
sidebar_position: 2
description: Run builds in CI with stable output, codegen checks, and a warm cache.
---

# Using heph in CI

heph behaves the same in CI as on your laptop — same inputs, same artifacts. A
few flags make CI runs cleaner and turn heph's guarantees into gates.

## Plain log output

The interactive TUI assumes a terminal. In CI, force log-only output with
`--no-tui`.

## Fail on stale codegen

[Codegen](/docs/concepts/codegen) targets normally write into the tree. In CI you
want the opposite: assert the committed tree already matches what codegen would
produce, without writing anything. That is `--frozen`:

```bash title="terminal"
heph run //... --frozen
```

If a generated file is missing or out of date, the run exits non-zero with a
diff — so a contributor who forgot to regenerate gets a red build, not a silent
drift.

## Validate the workspace

[`heph validate`](/docs/guides/validate) checks that every target resolves, that
no two `codegen = copy` targets write to the same path, and that `.gitignore` is
current — all in one read-only command:

```bash title="terminal"
heph validate
```

It reports every problem it finds, not just the first one.

## Reuse the cache

The [cache](/docs/concepts/caching) is keyed by input hash, so persisting it
between CI runs turns unchanged targets into instant hits. Cache the heph home
directory (set with [`homeDir`](/docs/reference/configuration#keys)) across jobs
using your CI's caching mechanism, keyed on your lockfiles.

## Diagnosing a build that stops making progress

If a run goes quiet — nothing advances for a while even though work is still
outstanding — heph appends a paragraph naming what's open, for how long, and
whether any bytes are moving to `<homeDir>/diag/stall-<pid>.log`, and logs the
path:

```
WARN No progress; wrote a stall diagnostic path=.heph3/diag/stall-4711.log quiet_for_s=512 open=98
```

The report itself goes to the file rather than the log stream, so it doesn't
bury the build output it's meant to annotate. It's appended rather than
overwritten on each escalation, so the file keeps the full history — an early
"quiet for 60s" line followed by a later "quiet for 512s" line for the same
targets says wedged, where either alone just says slow.

Tune or disable it with `--stall-notice`:

```bash title="terminal"
heph run //... --stall-notice=5m   # only report after 5 minutes without progress
heph run //... --stall-notice=off  # disable
```

Default threshold is 60s. The report is a diagnostic, not a stable interface —
don't parse it.

## Live build status (GitHub Actions)

The [GitHub Actions hook](../plugins/gha.md) writes a live status comment on the
pull request under review and a step summary when the command finishes. Load it
from a `ci.hephconfig` overlay so it only activates in CI:

```yaml title="ci.hephconfig"
plugins:
  - url: https://github.com/hephbuild/heph-artifacts-v1/releases/download/v<HEPH_VERSION_URL>/heph-gha-plugin.json
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

See the [GitHub Actions plugin page](../plugins/gha.md) for the full options
reference.

## A representative job

```bash title="terminal"
heph run //... --frozen        # build everything; fail on stale codegen
heph run //...                 # run tests / checks
heph validate                  # check targets resolve and .gitignore is current
```
