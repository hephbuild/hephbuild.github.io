# heph-expert

A Claude Code plugin that makes Claude an expert on the
[heph](https://hephbuild.github.io/) build system — a content-addressed build
system and task orchestrator ("Build once. Trust the cache.").

## What's inside

- **Skill `heph`** — auto-activates whenever you're in a heph workspace
  (`.hephconfig`, BUILD files, `heph` commands, `//pkg:name` addresses). It
  carries the whole model and points Claude to per-topic references:
  - `concepts.md` — targets, the DAG, dependencies, sandbox, caching,
    reproducibility, codegen
  - `authoring.md` — `target()`/`file()`/`glob()`/`load()`, `heph.core`, exec
    driver fields, dependency kinds, output groups, sandbox env vars
  - `cli.md` — every command and flag (`run`, `inspect …`, `query`, `validate`,
    `tool gc`/`gen-gitignore`/`completions`)
  - `configuration.md` — `.hephconfig` keys and plugin registration
  - `plugins.md` — exec/fs/group/hostbin/nix/textfile/go/buildfile/query and the
    `@heph/*` address families
- **Agent `heph-expert`** — a specialist subagent for non-trivial work:
  designing/refactoring a target graph, diagnosing rebuilds, debugging sandboxes,
  tuning config.
- **Commands**:
  - `/heph-expert:heph-target` — scaffold a new target from a description
  - `/heph-expert:heph-debug` — debug a failing target in its sandbox
  - `/heph-expert:heph-explain` — explain why a target did/didn't rebuild
  - `/heph-expert:heph-ci` — set up or review heph in CI

## Install

This plugin ships from the heph docs repository, which doubles as the
marketplace (its `.claude-plugin/marketplace.json` lists this plugin via a
relative `./plugins/heph-expert` source):

```bash
# in Claude Code
/plugin marketplace add hephbuild/hephbuild.github.io
/plugin install heph-expert@heph-marketplace
```

## Keeping it current

The references mirror the official docs as of authoring. Every docs page has a
`.md` twin (indexed at <https://hephbuild.github.io/llms.txt>); the skill and
agent are told to fetch the live page when a flag or option must be exact. To
refresh the bundled copies, re-pull from `hephbuild.github.io/docs/**.md`.

## License

MIT (matches the plugin manifest; adjust to taste).
