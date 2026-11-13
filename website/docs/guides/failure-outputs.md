---
title: "Failed targets"
sidebar_position: 4
description: Keep traces, screenshots and reports from a failed target, keep a fixer's fixes when it fails, and find them afterwards.
---

# Failed targets

A failing target can leave behind what you need to fix it: its log, the
diagnostics only a failed run produces (test traces, screenshots, a junit
report), and the fixes a fixer made before it gave up. heph keeps all three in
the target's **failure slot**.

```python title="BUILD"
target(
    name = "e2e",
    driver = "bash",
    run = "npx playwright test",
    failure_out = {"report": ["test-results/", "playwright-report/"]},
)

target(
    name = "lint_fix",
    driver = "bash",
    codegen = "in_place",  # fixes are written back even when eslint exits 1
    deps = {"src": glob("*.ts")},
    out = glob("*.ts"),
    run = "eslint --fix $SRC_SRC",
)
```

## The failure slot

Every failed target gets a slot at `<home>/failures/<addr-key>/`
(`.heph/failures/…` by default). It can hold:

| Part | What | Written when |
| --- | --- | --- |
| `log.txt` | The run's full process log | The run produced a log (never for a [credential](/docs/concepts/credentials) target) |
| `out/` | The `failure_out` matches | The run exited non-zero and a declared path matched |
| `fixes.txt` | Every path an `in_place` write-back changed, one per line | Fixes were written back on failure |

There is one slot per target, with no history:

- The next failure of the same target replaces the whole slot.
- The slot is cleared when the target next resolves, on a cache hit or when
  its next run starts. A passing run leaves no slot behind.
- `heph tool gc` drops slots older than 7 days; change the age with
  `--failure-max-age-days`. See [Failure logs](/docs/concepts/caching#failure-logs).

The failure box prints where each part is:

```text
× target failed: //web:e2e
╰─▶ process exited with status: exit status: 1
    ╭─[log]
    …
    ╰────
  full log: /ws/.heph/failures/web_e2e-…/log.txt
  outputs: /ws/.heph/failures/web_e2e-…/out
```

## Keeping diagnostics with `failure_out`

`failure_out` on an [`exec`/`bash`](/docs/plugins/exec) target lists files to
keep when the run fails. It has the same shape as `out`: a string, a list, or a
dict of group to list. Paths are relative to the package and may be globs.
Groups only name the paths in the BUILD file; the slot does not split by group.

- **Kept only when the process failed.** It must have exited non-zero,
  including when killed by a signal or stopped by its
  [`timeout`](/docs/plugins/exec#timeouts). Nothing is kept after a cancellation
  (fail-fast, Ctrl-C), a failure before the process ran (sandbox, credentials,
  runner), or under `--shell`. A passing run pays nothing.
- **Layout mirrors the workspace.** A match lands at
  `out/<workspace-relative path>`, so relative links inside a report still
  work:
  `npx playwright show-report .heph/failures/<addr-key>/out/web/playwright-report`.
- **A path that matches nothing is skipped**, not an error.
- **Files are copies.** Editing a file in the slot changes nothing else. Empty
  directories are not kept.
- **Symlinks don't escape the sandbox.** A link pointing outside it is not
  followed.
- **Never written into the tree.** A `failure_out` path that falls inside an
  `in_place` output lands only in the slot.
- **No size cap.** A suite that records video can fill the slot with
  gigabytes. Declare only what you need.

These paths are refused when the BUILD file is parsed:

- a path with a `..` segment;
- an absolute path;
- the package root itself: `.`, an empty path, or a pattern of only `*` and
  `**` (such as `**`). Name what to keep instead, such as `test-results/`.

An [entrypoint](/docs/guides/entrypoints) refuses `failure_out` altogether:
what it wrote is already where it wrote it.

:::warning
heph does not filter `failure_out`. Whatever you list is kept, even for a
target whose outputs are credential material. Keep secrets out of it.
:::

## Fixes written back on failure

A `codegen = "in_place"` target writes its fixes back even when the tool exits
with a code from 1 to 127, and the target still fails. A fixer like
`eslint --fix` with unfixable errors left keeps the fixes it could make.
`codegen = "in_place_on_success"` opts out: a failed run writes nothing back.

| Run ends with | `in_place` | `in_place_on_success` |
| --- | --- | --- |
| Exit 0 | Written back | Written back |
| Exit code 1–127 | Written back; the target still fails | Nothing written |
| Exit code 128 and above | Nothing written: counts as a signal | Nothing written |
| Killed by a signal, or a `timeout` | Nothing written | Nothing written |
| Cancelled, or failed before the process ran | Nothing written | Nothing written |
| `--frozen` | Nothing written, and no diff | Nothing written |
| `--shell` | Nothing written | Nothing written |

A shell reports a killed child as 128 plus the signal number (137 for an OOM
kill), and a fixer cut off mid-write can leave a half-written file, so heph
writes nothing back after any of these. If an `in_place` source changed while
the target ran, nothing is written either.

The failure box names what was written, and how to undo it:

```text
  fixes written, target still failed (re-run to verify; codegen = "in_place_on_success" opts out):
    web/a.ts
    web/b.ts
  restore with (takes the index version; uncommitted edits to these files are lost):
    git -C /ws --literal-pathspecs checkout -- web/a.ts web/b.ts
```

Past ten files the box shows the first ten, and the full list is in the slot's
`fixes.txt`. When nothing was written, the box says why:

```text
  fixes not written: exit 137 (128+, treated as a signal)
```

:::warning
The restore hint puts back the index version of each file. Any edit you had
not staged in those files is lost.
:::

:::tip
Use `in_place_on_success` for a tool that rewrites a file through a temporary
copy and can fail halfway (`cmd < "$f" > "$f.out"; mv "$f.out" "$f"`). With
`in_place`, the empty or partial file it leaves behind is written over your
source when it exits 1.
:::

An `in_place` transform must be **idempotent**: running it over its own output
changes nothing. heph relies on it to make the next run over the fixed tree a
cache hit. See [Codegen](/docs/concepts/codegen#in_place--rewrite-existing-sources).

## Finding a failure

`heph inspect failure` prints where a target's last failure was kept. It reads
the slot and builds nothing:

```bash title="terminal"
$ heph inspect failure //web:e2e
slot: /ws/.heph/failures/web_e2e-…
log: /ws/.heph/failures/web_e2e-…/log.txt
out: /ws/.heph/failures/web_e2e-…/out
```

`--json` prints one object. Paths are absolute, and an absent part is `null`:

```json
{
  "addr": "//web:e2e",
  "slot": "/ws/.heph/failures/web_e2e-…",
  "hashin": "…",
  "failed_at": 1762790400000,
  "log": "/ws/.heph/failures/web_e2e-…/log.txt",
  "out": "/ws/.heph/failures/web_e2e-…/out",
  "fixes": null
}
```

`failed_at` is in milliseconds since the Unix epoch. `hashin` is the input hash
of the run that failed, which may no longer be the target's.

With no recorded failure (the target never failed, or passed or hit the cache
since):

- the text form prints `no recorded failure for <addr>` on stderr and exits 1;
- `--json` prints `null` and exits 0.

A script or an agent reads "no failure" as `null`; a non-zero exit means the
command itself failed.

## Uploading from CI

heph uploads nothing. Add a step that uploads the slots:

```yaml title=".github/workflows/ci.yml"
- uses: actions/upload-artifact@v4
  if: failure()
  with:
    name: heph-failures
    path: .heph/failures/*/out/**
```

The glob assumes the default `.heph` home. To upload one target's failure
wherever the home is, read the path from `heph inspect failure --json`:

```yaml title=".github/workflows/ci.yml"
- id: e2e_failure
  if: failure()
  run: echo "out=$(heph inspect failure --json //web:e2e | jq -r '.out // empty')" >> "$GITHUB_OUTPUT"
- uses: actions/upload-artifact@v4
  if: failure() && steps.e2e_failure.outputs.out != ''
  with:
    name: e2e-failure
    path: ${{ steps.e2e_failure.outputs.out }}
```

There is no command that lists every recorded failure. Ask per target, or glob
the slots.

## Caching

Nothing about failure outputs affects a cache key. `failure_out` is not part of
the target's definition hash, and `in_place`, `in_place_on_success`, `copy` and
no codegen all hash the same. What a failure keeps never enters the cache. Fixes
written back are ordinary edits to your tree, hashed as inputs on the next run.

## Upgrading

- **`in_place` now writes back on failure.** Every existing `codegen = "in_place"`
  target writes its fixes back after an exit code from 1 to 127, including the
  Go plugin's `lint` and `format` targets. Switch to `in_place_on_success` to
  keep the previous behaviour.
- **One rebuild per `exec`/`bash` codegen target.** Every `exec` or `bash`
  target with a `codegen` field runs again once on the first build after
  upgrading.
- **Rebuild plugins.** Plugins must be rebuilt against the new plugin ABI
  (0.21.0); heph refuses one built against 0.20.
- **Downgrading can lose a slot.** An older heph deletes a slot that has `out/`
  or `fixes.txt` but no `log.txt`.
