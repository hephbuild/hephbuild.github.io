---
title: "HTTP Fetch"
sidebar_position: 12
description: Downloads a URL into a cacheable file output, with an address-templated URL and optional checksum verification.
---

# HTTP Fetch

The HTTP Fetch plugin downloads a file from a URL into a cacheable output. The
URL can be templated over the target's own address arguments, so one target
definition serves every platform, version, or other axis a caller asks for —
this is how heph itself fetches platform-specific tool binaries.

## Driver

A **driver** is the component that knows how to execute a target's action,
turning a resolved target into runnable work. This plugin registers the
`http_fetch` driver.

## Enabling it

Built-in and always-on. No configuration in `.hephconfig` is required — just
use the `http_fetch` driver name in your targets.

## Usage

```python title="BUILD"
target(
    name = "dl",
    driver = "http_fetch",
    url = "https://example.com/releases/v1.2.3/tool_{goos}_{goarch}",
    sha256 = "<sha256hex>",
    executable = True,
)
```

```bash title="terminal"
heph run //tools:dl                            # host platform
heph run //tools:dl@goos=linux,goarch=amd64    # a specific platform
```

Each `{arg}` placeholder in `url` is substituted from the target address's own
args (the `@key=value,...` part of the address) — `{{` and `}}` are literal
braces. Rendering happens before the target is hashed, so the *rendered* URL
— not the template — determines the cache key: each argument combination is
its own cache entry. A placeholder the address doesn't set is a hard error,
not a silent fetch of the wrong file.

## Fields

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `url` | `string` | required | URL template to fetch. |
| `sha256` | `string` | none | Expected SHA-256 of the downloaded bytes, in hex. When set, a mismatch fails the build. When omitted, the file is fetched **unverified** — the target is only as reproducible as the remote server, and a warning naming the actual hash is logged so you can pin it. |
| `out` | `string` | the URL's last path segment | Output filename, relative to the target's package. Required when the URL has no usable last segment (for example one ending in `/`). |
| `executable` | `bool` | `false` | Mark the fetched file executable. |

## Notes

Fetching has no inputs from the rest of the build graph — the bytes come from
the network. There's nothing to declare as a dependency beyond the target
itself; reference it from `deps`/`tools` like any other target once fetched.
