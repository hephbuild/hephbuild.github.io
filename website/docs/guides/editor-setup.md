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
| Diagnostics | Flags a `target()` or `provider_state()` call that's missing a required field — a base field like `name`, or, once `driver`/`provider` is set, a field required by that driver or provider. |
| Completion | `target`, `file`, `glob`, `struct`, `provider_state`, `heph.core.*`, and every provider function complete with their signatures and inline docs. Address strings (`//pkg:name`) complete packages and target names as you type. Inside a `target(driver="exec", …)` call, the driver's accepted fields complete with types and descriptions. |
| Hover | Signature and documentation for any builtin or provider function. Hover a `target()` call to see the addresses it produced and, once its `driver` is set, that driver's config fields with their types and descriptions. Same for `provider_state()`: once its `provider` is set, hover shows that provider's state fields instead of a generic signature. |
| Go-to-definition | Jump to the BUILD file that defines an address — both `//pkg:name` and relative `:name` forms. |
| Formatting | Format-on-save rewrites the open BUILD file to canonical style. Uses the same rules as [`heph tool build-fmt`](/docs/guides/formatting-build-files), respecting the workspace `indent` setting and the `# heph:fmt skip-file` directive. |

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

### Other editors

Any editor with LSP support works. The relevant settings are:

- **Command**: `heph tool build-lsp`
- **Transport**: stdio
- **Root marker**: `.hephconfig`
- **File patterns**: `BUILD` (or your workspace's configured names)
