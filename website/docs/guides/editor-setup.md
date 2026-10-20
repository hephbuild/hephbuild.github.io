---
title: "Editor setup"
sidebar_position: 6
description: Connect your editor to heph's language server for diagnostics, completion, hover, go-to-definition, and formatting.
---

# Editor setup

heph ships a language server that connects to any editor supporting the Language
Server Protocol. It provides diagnostics, completion, hover documentation,
go-to-definition, and document formatting.

## What it provides

| Feature | What you get |
|---------|-------------|
| Diagnostics | Syntax errors as you type (the first error on each line), and a `target()` or `provider_state()` call that's missing a required field — a base field like `name`, or, once `driver`/`provider` is set, a field required by that driver or provider. |
| Completion | See [Completion](#completion). |
| Hover | Signature and documentation for any builtin or provider function. Hover a `target()` call to see the addresses it produced and, once its `driver` is set, that driver's config fields with their types and descriptions. Same for `provider_state()`: once its `provider` is set, hover shows that provider's state fields instead of a generic signature. Hover a field name for its type and description, and a `heph.<plugin>.<function>` name for its signature. |
| Go-to-definition | Jump to the BUILD file that defines an address — both `//pkg:name` and relative `:name` forms. Also jumps from a `load()` path to the loaded file, from a loaded symbol to its `def`, and from a name to its `def` elsewhere in the package. |
| Formatting | Format-on-save rewrites the open BUILD file to canonical style. Uses the same rules as [`heph tool build-fmt`](/docs/guides/formatting-build-files), respecting the workspace `indent` setting and the `# heph:fmt skip-file` directive. |

## Completion

| Where the cursor is | What completes |
|---------------------|----------------|
| `driver = "` in `target()` | Driver names |
| `provider = "` in `provider_state()` | Provider names |
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
