---
title: "Sandbox"
sidebar_position: 6
description: The isolated directory a target runs in, why isolation matters, and how to inspect it.
---

# Sandbox

Every target runs in a **sandbox**: an isolated directory containing only its
declared inputs. No ambient filesystem access, no implicit dependencies — if a
target needs a file, it must declare it.

## Why isolate

Isolation is what makes the [input hash](/docs/concepts/caching) honest. If a
target could read a file it never declared, that file would change its output
without changing its hash — and the cache would hand back a stale, wrong
artifact. The sandbox makes undeclared reads impossible: a missing dependency
fails the build immediately instead of corrupting the cache.

This is also what guarantees [reproducibility](/docs/concepts/reproducibility) —
two machines with the same declared inputs assemble byte-identical sandboxes.

## Assembly mode

By default heph assembles each sandbox by materializing the declared inputs into
it. For large input sets that copying can dominate, so heph can instead present
inputs through a FUSE overlay. It is opt-in via the
[`fuse`](/docs/reference/configuration#fuse--sandbox-overlay) block in
`.hephconfig`:

```yaml title=".hephconfig"
fuse:
  enabled: auto   # true | false | auto
```

:::warning
The FUSE overlay is in development and not yet fully functional. Leave it off
for production builds.
:::

`auto` lets the engine choose per target. The sandbox's contents are identical
either way — only how the files get there differs.

## Output collisions

Every file in a sandbox has exactly one owner. If two different dependencies
each try to place a file at the same path, the build fails instead of
silently picking one:

```text
output collision: pkg/go.mod is produced by two different targets
(//pkg:_a and //pkg:_b); a sandbox file may be provided by only one target
```

The check runs before the sandbox is assembled, so a conflict is caught
immediately rather than producing a sandbox whose contents depend on
materialization order.

A dependency reached more than once — through a diamond in the build graph, or
by listing the same target twice — is not a collision: the same target
claiming the same path repeatedly still resolves to one file. Two targets are
also free to populate different files under a shared parent directory; only
the file paths themselves are compared.

To resolve a real collision, narrow one dependency so it no longer overlaps
the other — for example, exclude the conflicting path from a
[glob](/docs/plugins/fs), or depend on a single named
[output group](/docs/concepts/dependencies#outputs-and-groups) instead of a
target's full output:

```python title="BUILD"
deps = [
    glob("**/*", exclude = ["go.mod", "go.sum"]),
    ":go_mod",   # already provides go.mod and go.sum
],
```

## Symlinks in outputs

A target may output symlinks, as long as each one stays inside its own output.
When heph collects a target's outputs from its sandbox, it checks two rules and
fails the target if either is broken. This holds for every driver that runs in
a sandbox (`exec`, `bash`, and plugin drivers such as Go and OCI):

| Rule | Fails on |
|------|----------|
| An output glob or declared path never goes **through** a symlinked directory. | `out = "out/**/*.js"` when `out/vendor` is a link to a directory; `out = "out/vendor/x.js"` or `out = "out/vendor/lib/"` when `out/vendor` is a link. |
| A symlink in an output must be **relative** and point to a file or directory in the **same output group**. | `ln -s /etc/hosts l`, `ln -s ../../x l`, a link to a file the target didn't output, a link to a file in another output group. |

A glob that only *matches* a link (its last component) outputs the link itself,
which is then held to the second rule:

```python title="BUILD"
target(
    name = "assets",
    driver = "bash",
    run = [
        "mkdir -p out/real && echo hi > out/real/a.txt",
        "ln -s real out/current",      # relative, points inside the output
    ],
    out = ["out/*", "out/real/*"],     # matches out/current as a link: OK
)
```

To output what a linked directory holds, output the real directory, or copy
the files into place instead of linking them. Links heph creates itself for a
target's dependencies are followed, so a broad glob over the sandbox still
collects them. A mounted [scratch directory](/docs/concepts/scratch) is not:
keep output globs away from it.

The error names the link it refused and why, for example
`… heph does not follow it`. These rules are checked only when a target runs:
a result already in the cache from before them is still served, while a fresh
build of the same target fails.

## Inspecting a sandbox

When a target fails, step inside its sandbox with the exact inputs, tools, and
environment it runs with. The [exec](/docs/plugins/exec#interactive-debugging-with---shell)
driver opens an interactive shell:

```bash title="terminal"
heph run //app:server --shell
```

From there you can list `$SRC_*`, re-run the command by hand, and see precisely
what the target sees.
