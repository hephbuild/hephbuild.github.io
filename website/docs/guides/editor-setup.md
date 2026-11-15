---
title: "Editor setup"
sidebar_position: 6
description: Connect your editor to heph's language server for BUILD files, and to the .hephconfig schema for config validation.
---

# Editor setup

heph ships a language server that connects to any editor supporting the Language
Server Protocol. It provides diagnostics, completion, hover documentation,
go-to-definition, and document formatting for BUILD files. For `.hephconfig`,
heph prints a schema your editor can validate against (see
[Validating `.hephconfig`](#validating-hephconfig)).

## What it provides

| Feature | What you get |
|---------|-------------|
| Diagnostics | Syntax errors as you type (the first error on each line), and a `target()` or `provider_state()` call that's missing a required field — a base field like `name`, or, once `driver`/`provider` is set, a field required by that driver or provider. A field written as a literal of the wrong type, or as a string outside the field's accepted values, is flagged too. |
| Completion | See [Completion](#completion). |
| Hover | Signature and documentation for any builtin or provider function. Hover a `target()` call to see the addresses it produced and, once its `driver` is set, that driver's config fields with their types and descriptions. Same for `provider_state()`: once its `provider` is set, hover shows that provider's state fields instead of a generic signature. Hover a field name for its type and description, and a `heph.<plugin>.<function>` name for its signature. |
| Go-to-definition | Jump from an address — both `//pkg:name` and relative `:name` forms — to the call in its package's BUILD file that declared the target: the `target()` call for a direct target, or the outermost helper call (e.g. `tool("go")`) for a target a helper declares, even one loaded from another file or whose name the helper computes. Unsaved edits in an open BUILD file count. If the package doesn't evaluate, it falls back to the target's `name = "…"` line, then to the BUILD file; a package address jumps to its BUILD file. Also jumps from a `load()` path to the loaded file, from a loaded symbol to its `def`, and from a name to its `def` elsewhere in the package. |
| Formatting | Format-on-save rewrites the open BUILD file to canonical style. Uses the same rules as [`heph tool build-fmt`](/docs/guides/formatting-build-files), respecting the workspace `indent` setting and the `# heph:fmt skip-file` directive. |

## Completion

| Where the cursor is | What completes |
|---------------------|----------------|
| `driver = "` in `target()` | Driver names |
| `provider = "` in `provider_state()` | Provider names |
| A string value of another field in `target()` or `provider_state()` (`workdir = "`) | The field's accepted values, when it has a fixed set of them |
| A keyword name in `target()` | The base fields plus the selected driver's fields, minus the ones already written |
| A keyword name in `provider_state()` | `provider` plus the selected provider's fields, minus the ones already written |
| A keyword name in a call to another function (`my_rule(`, `glob(`) | The function's remaining parameters, inserted as `name = `, ahead of the usual suggestions |
| After `heph.` | Plugin names and `core` |
| After `heph.<plugin>.` | That plugin's functions |
| A string starting with `//` or `:` | Packages and targets |
| The first argument of `load(` | Package paths |
| A later string argument of `load(` | The `def`s exported by the loaded file |

Completion keeps working while the file doesn't parse — typically when you are
midway through typing a call or string. An error later in the file doesn't
affect the suggestions at the cursor.

## VS Code

Install the [heph extension](https://marketplace.visualstudio.com/items?itemName=hephbuild.heph-nightly) from the marketplace. It configures the language server automatically.

## Connecting an editor

The language server runs over stdio. Configure your editor's LSP client to
launch `heph tool build-lsp`.

:::warning
The `heph tool build-lsp` command is not part of the stable public API and may change without notice.
:::

### Neovim

```lua title="~/.config/nvim/init.lua"
vim.api.nvim_create_autocmd("BufRead", {
  pattern = "BUILD",
  callback = function()
    vim.lsp.start({
      name = "heph",
      cmd = { "heph", "tool", "build-lsp" },
      root_dir = vim.fs.root(0, ".hephconfig"),
    })
  end,
})
```

### Workspaces

The server handles a single workspace: the first workspace folder your editor
sends, which must be inside the heph repository it was started in. A BUILD file
outside that repository only gets generic Starlark completion and hover.

### Other editors

Any editor with LSP support works. The relevant settings are:

- **Command**: `heph tool build-lsp`
- **Transport**: stdio
- **Root marker**: `.hephconfig`
- **File patterns**: `BUILD` (or your workspace's configured names)

## Validating `.hephconfig`

heph prints a JSON Schema of `.hephconfig` that your editor can use for
completion, hover and validation. It covers `.hephconfig`, the legacy
`.hephconfig2`, and every [profile](/docs/reference/configuration#profiles--layered-config-overlays)
(`ci.hephconfig`). Any editor that runs yaml-language-server can use it.

Write the schema to a file:

```sh
heph tool config-schema > tools/hephconfig.schema.json
```

The schema comes from the binary itself. In a workspace that pins a
[`version`](/docs/reference/configuration#pinning-the-version), heph switches to
the pinned release first, so the schema matches the heph that reads your config.
The command doesn't read your config, so it also works outside a workspace.
heph doesn't publish the schema at a URL. This command is the only source.

Write it to a tracked path such as `tools/hephconfig.schema.json` so your whole
team gets it, or to a path outside the repository just for yourself.
Regenerate it when the pinned version changes. Don't put it in `.heph/`, which
is gitignored and holds heph's cache.

### Neovim

Mark the config files as YAML, then map the schema to them in yamlls:

```lua title="~/.config/nvim/init.lua"
vim.filetype.add({
  filename = {
    [".hephconfig"] = "yaml",
    [".hephconfig2"] = "yaml",
  },
  pattern = {
    [".*%.hephconfig2?$"] = "yaml",
  },
})

vim.lsp.config("yamlls", {
  settings = {
    yaml = {
      schemas = {
        ["/path/to/repo/tools/hephconfig.schema.json"] = {
          "**/.hephconfig",
          "**/*.hephconfig",
          "**/.hephconfig2",
          "**/*.hephconfig2",
        },
      },
    },
  },
})
vim.lsp.enable("yamlls")
```

The `**/` globs match the base file and every profile, in any directory.

### VS Code

The heph extension doesn't register the schema yet. Map it in the YAML
extension's `yaml.schemas` setting, using the same globs as for Neovim.

### A single file

Put a modeline at the top of the file. This works in any editor that runs
yaml-language-server:

```yaml title=".hephconfig"
# yaml-language-server: $schema=tools/hephconfig.schema.json
```

### Quote numbers in text fields

heph loads a plain number where it expects text, but the schema flags it.
Usually a number there is a mistake: `version: 1.10` loads as `1.1`. Quote the
value (`version: "1.10"`) and heph and the schema agree.

### What the schema doesn't check

The schema never rejects a config that heph loads, apart from the numbers above.
It can be looser than heph, though:

- **Plugin `options`.** Each plugin checks its own keys. The schema only checks
  that `options` is a map.
- **Profile merges.** The schema sees one file at a time. A profile that sets a
  cache's `read` without its `uri` passes the schema. Whether the merged config
  is complete is checked when heph loads the files together.
- **`~` for an empty section.** `resources:` with nothing after it loads, and
  so do `plugins:` and `caches:`. The schema also accepts `resources: ~`, which
  heph refuses.
- **Extreme values.** The schema doesn't catch a resource amount too large to
  store, or a `cpu` fraction below 0.000001.

### Using the schema from a script or plugin

The document's layout isn't stable: key order, definition names, and titles and
descriptions can all change. Hand it whole to a validator, and don't `$ref`
into it from another schema. A tool that runs the command should:

- Use the output only if the command exits 0 and stdout parses as JSON with a
  `$schema` key. Otherwise use no schema, or a copy it saved earlier, and don't
  retry.
- Set a timeout. In a pinned workspace, heph may first download the pinned
  release.

The command fails in a workspace pinned to a heph release that predates it
(exit code 2), in a pinned workspace while offline before the pinned release is
downloaded, and when `.hephconfig` isn't valid YAML.
