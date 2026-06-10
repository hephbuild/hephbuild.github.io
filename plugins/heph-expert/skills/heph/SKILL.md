---
name: heph
description: >-
  Expert knowledge of the heph build system (hephbuild.github.io). Use this
  skill whenever the user is working in a heph workspace or mentions heph,
  .hephconfig, BUILD files with target()/glob()/file(), heph addresses like
  //pkg:name or //@heph/..., the heph CLI (heph run, heph inspect, heph query,
  heph validate, heph tool gc/gen-gitignore), heph caching/cache hits, target
  sandboxes, codegen (copy / in_place), output groups, drivers (bash, sh, exec,
  nix, go_*) or providers (buildfile, go, query). Also use it for ANY task that
  involves writing, reading, debugging, or reviewing heph BUILD files, tuning
  .hephconfig, diagnosing why a target rebuilt or a cache missed, or setting up
  heph in CI — even when the user does not say the word "heph" explicitly but
  the files or commands make it clear.
version: 0.1.1
---

# heph build system

heph is an open-source build system and task orchestrator. You define
**targets**; heph hashes their inputs, runs each action in parallel inside a
**sandbox**, and content-addresses the output. Same inputs ⇒ byte-identical
artifacts, on a laptop or in CI. Tagline: **"Build once. Trust the cache."**

> Canonical docs: <https://hephbuild.github.io/> · LLM index:
> <https://hephbuild.github.io/llms.txt> · Repo:
> <https://github.com/hephbuild/heph>. When precise, current detail matters
> (especially flags, plugin options, or behavior that may have changed), fetch
> the matching `*.md` doc page rather than guessing.

## The model in one paragraph

A build is a directed acyclic graph of targets. Each target is a name + a set of
declared inputs + the action that turns them into outputs. heph hashes every
input (`hashin`) before running anything; a matching digest already in the cache
is a **cache hit**, so the stored output is returned instead of re-running.
Targets with no edge between them run concurrently. Every input must be
declared — the sandbox contains *only* declared inputs, so an undeclared read
fails fast instead of silently corrupting the cache.

```python title="BUILD"
target(
    name = "server",
    driver = "bash",
    run = "go build -o $OUT .",
    deps = [glob("**/*.go"), "//gen:assets"],
    out = "server",
)
```

```bash
$ heph run //app:server
0.565s · 1 / 1 done · 1 cached · 0 failed
```

## How to use this skill

Start here, then read the reference file that matches the task. Each reference
is self-contained and mirrors the official docs.

| If the task is about… | Read |
|---|---|
| The mental model: targets, the DAG, dependencies, sandbox, caching, reproducibility, codegen | `references/concepts.md` |
| Writing/editing BUILD files: `target()`, `file()`, `glob()`, `load()`, `heph.core`, exec driver fields, env vars, dep kinds, output groups, codegen modes | `references/authoring.md` |
| Running heph: every CLI command and flag (`run`, `inspect …`, `query`, `validate`, `tool gc/gen-gitignore/completions`) | `references/cli.md` |
| `.hephconfig`: registering plugins, `version`, `homeDir`, `memCache`, `fuse`, `lock` | `references/configuration.md` |
| Which plugin/driver/provider does what (exec, fs, group, hostbin, nix, textfile, go, buildfile, query) and addresses | `references/plugins.md` |

> **Go is its own plugin.** Setting up or debugging Go under heph — enabling the
> `go` provider and its drivers, `gotool`/`skip`, and wiring generated code
> (`go_src`, `go_codegen_root`, `go_codegen_deps`) and fixtures (`go_test_data`)
> — is owned by the dedicated **`heph-go`** plugin (skill `heph-go`, agent
> `heph-go-expert`, commands `/heph-go:*`). Hand Go-specific work off to it; this
> skill keeps only the general model and a one-paragraph pointer in `plugins.md`.

## Operating rules when helping in a heph workspace

1. **Declare every input.** If `run` reads a file, it must arrive via `deps`,
   `tools`, or `glob()`/`file()`. A missing input is a build failure by design,
   not a runtime surprise. Never advise "just read it from the repo."
2. **Keep targets small and explicit.** Finer graphs ⇒ more cache hits and more
   parallelism. Prefer splitting over one mega-target.
3. **Reach for `heph inspect` before guessing.** `heph inspect hashin <addr>`
   answers "what makes up the cache key", `deps` shows the edges, `def`/`spec`
   show the resolved/raw definition. Nothing executes unless a provider must
   run to answer.
4. **Debug failures in the sandbox.** `heph run <addr> --shell` drops into the
   exact inputs/tools/env the target runs with (bash/sh drivers). Recommend this
   over adding debug prints.
5. **Distinguish the three dependency kinds** (`deps` / `hash_deps` /
   `runtime_deps`) and the three codegen-vs-cache choices — they are the most
   common source of "why did/didn't this rebuild" confusion. See
   `references/authoring.md`.
6. **Driver-defined vs engine-defined fields.** `target()` only interprets
   `name`, `driver`, `labels`, `transitive`. Everything else (`run`, `deps`,
   `out`, `env`, `cache`, `codegen`, …) is forwarded verbatim to the named
   driver, which defines its meaning. Check the driver's page when unsure.
7. **CI = warm cache + frozen codegen.** `heph run <target> --frozen` asserts
   the committed tree already matches generated output; `heph validate` catches
   codegen output conflicts; `heph tool gen-gitignore` keeps `copy` outputs out
   of git. See the `/heph-ci` command and `references/cli.md`.
8. **Reproducibility is the contract.** Non-hermetic targets opt out of caching
   guarantees — flag them and recommend keeping them rare.

## Address quick-reference

```
//lib/auth:lib            // package "lib/auth", target "lib"
//:name                   // target in the root package
//app:compile|bin         // the "bin" output group of //app:compile
//...                     // matcher: everything (used by run/query/validate)
//cmd/...                 // matcher: everything under cmd/
//@heph/bin:go            // host binary wrapped as a target (hostbin)
//@heph/fs:file@f=…       // a single workspace file (usually via file())
//@heph/query:name@label=lint  // dynamic group of targets (query)
```

Full anatomy and the `@heph/*` table: `references/plugins.md` and
<https://hephbuild.github.io/docs/reference/addresses.md>.
