---
title: "Editor setup"
sidebar_position: 6
description: Connect your editor to heph's language server for completion, hover, and go-to-definition.
---

# Editor setup

heph ships a language server that connects to any editor supporting the Language
Server Protocol. It provides completion, hover documentation, and
go-to-definition.

## What it provides

| Feature | What you get |
|---------|-------------|
| Completion | `target`, `file`, `glob`, `struct`, `provider_state`, `heph.core.*`, and every provider function complete with their signatures and inline docs. Address strings (`//pkg:name`) complete packages and target names as you type. Inside a `target(driver="exec", …)` call, the driver's accepted fields complete with types and descriptions. |
| Hover | Signature and documentation for any builtin or provider function. Hover a `target()` call to see the addresses it produced. |
| Go-to-definition | Jump to the BUILD file that defines an address — both `//pkg:name` and relative `:name` forms. |

## Connecting an editor

The language server runs over stdio. Configure your editor's LSP client to
launch:

```
heph tool build-lsp
```

### VS Code

Install the [heph extension](https://marketplace.visualstudio.com/items?itemName=hephbuild.heph-nightly) from the marketplace. It configures the language server automatically.

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
