---
title: "Editor setup"
sidebar_position: 6
description: Connect your editor to heph's BUILD-file language server for completion, hover, and go-to-definition.
---

# Editor setup

heph ships a BUILD-file language server that connects to any editor supporting
the Language Server Protocol. It provides completion, hover documentation, and
go-to-definition inside `BUILD` files.

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

Set the file-type trigger to files matching your workspace's BUILD file pattern
(the default is files named `BUILD`; see the
[buildfile provider's `patterns` option](/docs/plugins/buildfile#configuration)).

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

## The language server target

Every workspace exposes a synthetic, uncached target that starts the language
server:

```
//@heph/build:lsp
```

Editors that prefer to reference a build target rather than a bare binary can
use this address instead of `heph tool build-lsp`. Both start the same server.
