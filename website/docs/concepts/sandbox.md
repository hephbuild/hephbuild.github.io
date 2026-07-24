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

## Inspecting a sandbox

When a target fails, step inside its sandbox with the exact inputs, tools, and
environment it runs with. The [exec](/docs/plugins/exec#interactive-debugging-with---shell)
driver opens an interactive shell:

```bash title="terminal"
heph run //app:server --shell
```

From there you can list `$SRC_*`, re-run the command by hand, and see precisely
what the target sees.
