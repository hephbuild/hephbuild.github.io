---
title: "Using heph in CI"
sidebar_position: 2
description: Run builds in CI with stable output, codegen checks, and a warm cache.
---

# Using heph in CI

heph behaves the same in CI as on your laptop — same inputs, same artifacts. A
few flags make CI runs cleaner and turn heph's guarantees into gates.

## Plain log output

The interactive TUI assumes a terminal. In CI, force log-only output:

```bash title="terminal"
heph run //... --no-tui
```

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

## Check the .gitignore is in sync

`copy` codegen outputs belong in `.gitignore`, and heph maintains that block for
you. Make CI fail if it's out of date:

```bash title="terminal"
heph tool gen-gitignore
git diff --exit-code .gitignore
```

## Reuse the cache

The [cache](/docs/concepts/caching) is keyed by input hash, so persisting it
between CI runs turns unchanged targets into instant hits. Cache the heph home
directory (set with [`homeDir`](/docs/reference/configuration#keys)) across jobs
using your CI's caching mechanism, keyed on your lockfiles.

## A representative job

```bash title="terminal"
heph run //... --no-tui --frozen        # build everything; fail on stale codegen
heph run //... --no-tui                 # run tests / checks
heph tool gen-gitignore && git diff --exit-code .gitignore
```
