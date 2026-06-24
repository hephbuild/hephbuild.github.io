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
