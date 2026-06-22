# Vendored: caveman-shrink

`compress.cjs` is vendored **verbatim** from the `caveman-shrink` MCP server in
[JuliusBrussee/caveman](https://github.com/JuliusBrussee/caveman) (MIT). It is a
pure-Node, zero-dependency prose compressor: it strips articles, filler, hedging
and pleasantries while leaving fenced/inline code, URLs, filesystem paths,
version numbers and code-looking identifiers byte-for-byte untouched.

We use it from `scripts/caveman-compress.mjs` to compress the LLM-facing markdown
the build emits (the per-page `.md` files produced by `docusaurus-plugin-llms`)
before the site is published.

## Do not edit

This is third-party code, copied as-is so the build stays offline and
reproducible (no fetching a moving `main` branch during CI). To update it,
re-copy the upstream file and keep the `.cjs` extension:

```
curl -fsSL https://raw.githubusercontent.com/JuliusBrussee/caveman/main/src/mcp-servers/caveman-shrink/compress.js \
  -o scripts/vendor/caveman-shrink/compress.cjs
```

The `.cjs` extension keeps it CommonJS (it uses `module.exports`) and matches the
`*.cjs` entry in `.eslintrc.cjs`'s `ignorePatterns`, so the repo's strict
TypeScript-only ESLint config never tries to parse it.
