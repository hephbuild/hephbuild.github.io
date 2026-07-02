# heph concepts

The mental model behind heph. Source pages under
`https://hephbuild.github.io/docs/concepts/`.

## Contents
- [Targets & the DAG](#targets--the-dag)
- [Dependencies](#dependencies)
- [Sandbox](#sandbox)
- [Caching](#caching)
- [Reproducibility](#reproducibility)
- [Codegen](#codegen)

---

## Targets & the DAG

A **target** is the unit of work: a name, a set of declared inputs, and the
action that turns those inputs into outputs. Targets are addressed by a
`//`-prefixed path, e.g. `//app:server`, `//lib/auth:lib`, `//proto:api`.

Edges between targets form a directed acyclic graph. heph walks it bottom-up: a
target runs only once all its dependencies have produced their outputs.
Independent targets run concurrently across all cores.

| Term | Meaning |
|---|---|
| `target` | A named, cacheable unit of work. |
| `hashin` | The hash of a target's complete inputs (the cache key). |
| `cache hit` | A `hashin` already present in the cache. |
| `sandbox` | The isolated directory an action runs in. |

Rule of thumb: keep targets small and explicit. The finer the graph, the more
heph can cache and parallelize.

## Dependencies

A dependency is an edge: one target consuming another's outputs. Edges define
both **order** (a target runs only after its deps produce outputs) and **data
flow** (those outputs are made available to the dependent).

Declare an edge by referencing another target's address, or by the value
returned from `target()` — which *is* its address:

```python title="BUILD"
lib = target(name = "lib", driver = "bash", run = "go build -o $OUT .", out = "lib")

target(
    name = "image",
    driver = "bash",
    deps = ["//assets:bundle", lib],   # address string OR the returned handle
    run = "...",
    out = "image",
)
```

Outputs may be split into named **output groups**; a dependent can select a
single group with the `|group` selector (`//app:compile|bin`) so it doesn't
rebuild when an unrelated group changes. *How* a dep's files are surfaced is the
driver's job — the exec driver exposes each group via `$SRC_<group>` inside the
sandbox.

Every input must be declared. If a target reads a file it didn't list, the
sandbox won't contain it and the build fails fast.

## Sandbox

Every target runs in a **sandbox**: an isolated directory containing only its
declared inputs. No ambient filesystem access, no implicit dependencies.

Why isolate: it keeps the input hash *honest*. If a target could read an
undeclared file, that file would change the output without changing the hash —
and the cache would hand back a stale, wrong artifact. The sandbox makes
undeclared reads impossible. It is also what guarantees reproducibility: two
machines with the same declared inputs assemble byte-identical sandboxes.

**Assembly mode.** By default heph materializes (copies) declared inputs into
the sandbox. For large input sets that copy can dominate, so heph can instead
present inputs through a FUSE overlay — opt-in via the `fuse` block in
`.hephconfig` (`true | false | auto`; `auto` decides per target). Contents are
identical either way; only how the files get there differs.

**Inspecting.** When a target fails, step inside with
`heph run <addr> --shell` (bash/sh drivers): you get the exact inputs, tools and
env, can list `$SRC_*`, and re-run the command by hand.

## Caching

heph caches at the granularity of a target. Before running, it hashes the
target's complete inputs into one digest; if that digest is already cached, the
stored output is returned — a **cache hit**.

**What goes into the hash:** sources, dependencies' outputs, the tools used, the
environment, and the target definition itself. Change any ⇒ digest changes ⇒
re-run. Identical ⇒ cached bytes, locally or in CI. Because outputs are
content-addressed by their inputs, a cache hit is *provably* the artifact you
would have built — trustworthy, not a guess.

**Fixed-point caching:** a target whose inputs equal its outputs reaches a fixed
point — re-running produces the same digest, so it's a hit and never executes
again. This is what makes idempotent `in_place` codegen (e.g. a formatter) free
to re-run once the tree is already formatted.

**Per-target control** lives on the driver. The exec driver's `cache` field is a
bool or `{enabled, remote, history}`.

**In-memory cache:** within a run, results are also kept in memory; size it with
the `memCache` block (`capacityBytes: 0` disables it).

**Filesystem scan cache:** workspace file scans (glob expansion, package
discovery) are cached across runs, validated against file/directory metadata —
edits always trigger a re-scan. Transparent, no configuration. To rule it out
while debugging, set `HEPH_DEBUG_CACHED_WALKER=0` (every scan reads the
filesystem directly).

**Reclaim space:** `heph tool gc` sweeps the on-disk cache and removes artifacts
no longer reachable from any current target.

## Reproducibility

The central promise is **byte-identical outputs**: same inputs ⇒ same artifact,
every machine, every time. Enforced by:

1. **Inputs hashed before anything runs** — sources, tool versions, env, and
   rule definition all fold into one digest.
2. **Actions run hermetically** — the sandbox exposes only declared inputs.
3. **Outputs are content-addressed** — the input digest is the key, the output
   bytes are the value.

Non-hermetic targets opt out of caching guarantees; use them sparingly.

## Codegen

Most targets keep outputs inside heph's cache/sandbox and never touch the source
tree. **Codegen targets are the exception** — they materialize outputs *back
into the workspace* so tools that read the tree directly (editor, compiler,
`go list`, `grep`) see them as if hand-written. Turn it on with the `codegen`
field on an exec target, choosing **how** outputs land:

| Mode | Produces | Tracked in git? | Needs gitignore? |
|---|---|---|---|
| `copy` | **New** files the target creates (proto stubs, generated clients, asset manifests) | No | Yes |
| `in_place` | Rewrites of **existing** sources (formatters, codemods, auto-fixing linters) | Yes | No |

- `copy` outputs are stamped so a later `glob()` **excludes** them, and they
  belong in `.gitignore`. `heph tool gen-gitignore` scans every `copy` output
  and maintains a managed block in the root `.gitignore` (scoped, anchored to
  workspace root, idempotent, non-destructive).
- `in_place` transforms tracked files in place; keep them **idempotent** (run
  twice = same bytes) so output stays reproducible and diffs stay stable.

**`in_place` vs. `copy` ownership:** an `in_place` target never writes into a
file a `copy` target owns (stamped output). A colliding path is left
untouched — the `copy` target's content survives, only that file is skipped.
`--frozen` applies the same exemption. Point `copy` and `in_place` targets at
disjoint files rather than relying on this.

**Conflict detection:** two `copy` targets must never claim overlapping output
paths (including containment, e.g. a dir output that encompasses a file output).
`heph validate` flags these across the workspace.

**CI verification:** `heph run <codegen-target> --frozen` computes the generated
output but **writes nothing**, comparing against disk and exiting non-zero with
a unified diff if they differ. Works for both modes (a `copy` target fails if
its file is missing/stale; `in_place` fails if a source isn't already in its
transformed form). Wire it into CI so a forgotten `heph run` becomes a red build
with an exact diff instead of a drifting tree.
