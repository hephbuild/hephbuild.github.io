# heph-go

A Claude Code plugin focused on one thing: **getting Go set up correctly under
the [heph](https://hephbuild.github.io/) build system's `go` provider.**

heph's go provider *generates* every Go target (`:build`, `:test`, `:xtest`) from
`go.mod` and your sources — you never hand-write `target()` for Go code. What you
*do* configure is the provider, the toolchain, and the two things heph can't
infer: generated code and runtime test files. This plugin makes Claude an expert
at exactly that.

## What's inside

- **Skill `heph-go`** — auto-activates when you're working with Go under heph.
  Covers enabling the provider + the `go_golist`/`go_embed`/`go_testmain`
  drivers, `gotool`/`skip` options, and the wiring knobs:
  - **`go_src`** — label a codegen target so its generated `.go`/embed output is
    compiled into the package (`:build`, `:test`).
  - **`go_test_data`** — label a target so its outputs are staged into the test
    sandbox as fixtures.
  - **`go_codegen_root` / `go_codegen_deps`** — `provider_state` knobs for
    cross-package codegen and generators that aren't labelled `go_src`.
  - **`test.skip`** — turn off test targets for a subtree.

  Deep detail lives in `skills/heph-go/references/go-plugin.md`.
- **Agent `heph-go-expert`** — a specialist subagent for non-trivial Go-in-heph
  work: enabling the provider, wiring generated code, debugging missing
  embeds/fixtures, pinning the toolchain.
- **Commands**:
  - `/heph-go:heph-go-setup` — enable and configure the go provider in `.hephconfig`.
  - `/heph-go:heph-go-codegen` — wire generated code (`go_src`/`go_codegen_root`/
    `go_codegen_deps`) and fixtures (`go_test_data`) into a package.
  - `/heph-go:heph-go-check` — audit a workspace's Go setup and fix what's wrong.

## Code vs data — the one rule to remember

- Code the package **imports** (protobuf stubs, mocks, `//go:embed` assets) →
  label the producing target **`go_src`**.
- Files a test **reads at runtime** (golden files, fixtures) → label it
  **`go_test_data`**.

Getting this backwards is the most common Go-under-heph bug.

## Install

This plugin ships from the heph docs repository, which doubles as the marketplace
(its `.claude-plugin/marketplace.json` lists this plugin via a relative
`./plugins/heph-go` source):

```bash
# in Claude Code
/plugin marketplace add hephbuild/hephbuild.github.io
/plugin install heph-go@heph-marketplace
```

For the broader heph model (targets, caching, sandbox, BUILD authoring), install
the companion `heph-expert` plugin from the same marketplace.

## Keeping it current

The reference mirrors <https://hephbuild.github.io/docs/plugins/go> as of
authoring; every docs page has a `.md` twin (indexed at
<https://hephbuild.github.io/llms.txt>). The skill and agent are told to fetch the
live page when an option, label, or `provider_state` key must be exact. Per the
repo's reference-drift rule, when the go provider's behavior changes, update both
`website/docs/plugins/go.md` and `skills/heph-go/references/go-plugin.md` in the
same PR.

## License

MIT (matches the plugin manifest).
