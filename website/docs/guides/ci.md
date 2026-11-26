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

## Selectors that match nothing fail the run

`heph run` exits non-zero if its selector matches no targets. A typo'd label,
an unbuilt variant, or a package matcher outside the workspace used to build
nothing and exit 0 — indistinguishable from a job that legitimately had
nothing to do. Now it fails loud instead. Debug a selector that isn't
matching what you expect with:

```bash title="terminal"
heph query -e '<expr>'
```

This only applies to `heph run`. A `heph query` that matches nothing is a
legitimate answer.

## Validate the workspace

[`heph validate`](/docs/guides/validate) checks that every target resolves, that
no two `codegen = copy` targets write to the same path, and that `.gitignore` is
current — all in one read-only command:

```bash title="terminal"
heph validate
```

It reports every problem it finds, not just the first one.

## Machine-readable results

`heph run --json` prints one JSON entry per matched target on stdout, written
as each one finishes. Everything else — failure boxes, warnings — stays on
stderr, and the exit code is the same as without `--json`.

```bash title="terminal"
heph run //... --json
heph run test //... --jq '.[] | select(.outcome == "failed") | .addr'
heph run //cmd/server:bin --fields +outputs
```

Entries come in completion order, not address order. A dependency the
selector did not match gets no entry.

| Field | Meaning |
|---|---|
| `addr` | The target's address. |
| `outcome` | `cached`, `ran`, `failed`, `blocked` or `cancelled`. |
| `cache` | `local`, `remote` or `miss`; `null` when no cache was consulted (`--force`, caching off, or it failed before the lookup). |
| `remote` | The name of the remote cache a `remote` hit came from. |
| `duration_ms` | From the start of its resolution to its end. |
| `exit_code` | Its process's exit code: `0` for `ran`, the code for a failed run; `null` when nothing ran or a signal ended it. |
| `timed_out` | It failed because its run outlasted its `timeout`. |
| `error` | Why it failed, on one line; `null` on success. |
| `blocked_by` | For `blocked`: the failed dependency at the root of it. |
| `failure` | `{log, out, fixes}`, as [`heph inspect failure`](/docs/guides/failure-outputs#finding-a-failure) prints it; `null` unless it failed running. |
| `outputs` | Not printed by default. Its output files, as `--list-out` prints them. Selecting it downloads a remote hit's outputs. |
| `hashin` | Not printed by default. Its input hash. |

The outcomes:

| Outcome | Means |
|---|---|
| `cached` | No process ran; the result came from a cache (`cache` says which). |
| `ran` | It ran and succeeded. A cache hit whose blobs turned out to be gone is rebuilt and reads as a miss. |
| `failed` | Its own run failed, or resolving it did. |
| `blocked` | It did not run because a dependency failed. |
| `cancelled` | Ctrl-C stopped the run while it was pending. |

`--fields` picks the fields (`+outputs` adds one to the defaults, `--fields
help` lists them) and `--jq` filters the list inside heph, with no `jq`
installed.

The list is closed with `]` only when it is whole. A `--fail-fast` stop, a
package that could not be evaluated, or Ctrl-C leaves it open, so `jq` rejects
it instead of reading a short list as complete. A failed target does not.

:::note
`--shell`, `--cat-out`, `--list-out` and `--raw` need stdout or the terminal,
so they are refused with `--json`, `--fields` or `--jq` (exit 2). `--copy-out`
and `--output` combine with it. An [entrypoint](/docs/guides/entrypoints) has
no JSON form: `heph run <entrypoint> --json` is refused before anything runs
(exit 2).
:::

## Upload what a failure kept

heph uploads nothing itself. Add a step that uploads failure slots, so the
[`failure_out`](/docs/guides/failure-outputs) traces and reports of a red job
are one click away:

```yaml title=".github/workflows/ci.yml"
- uses: actions/upload-artifact@v4
  if: failure()
  with:
    name: heph-failures
    path: .heph/failures/*/out/**
```

See [Uploading from CI](/docs/guides/failure-outputs#uploading-from-ci) for
one target's slot wherever the home directory is.

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
