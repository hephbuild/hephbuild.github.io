# hephbuild.github.io

Marketing site **+** documentation for **heph** — an open-source build system &
task orchestrator. Built from the *Blueprint* design system: a light,
technical, hairline-and-cobalt aesthetic.

## Layout

This is an npm-workspaces monorepo split in two:

| Workspace | Package | What it is |
| --- | --- | --- |
| [`uikit/`](./uikit) | `@heph/uikit` | A thin, swappable **proxy layer over Ant Design** + bespoke blueprint primitives. Built as a library with **Vite 8** + `vite-plugin-dts`. |
| [`website/`](./website) | `@heph/website` | The **Docusaurus** site — bespoke landing page + documentation. Consumes only `@heph/uikit`. |

The repo root also doubles as a **Claude Code plugin marketplace**
(`.claude-plugin/marketplace.json` + [`plugins/heph-expert/`](./plugins/heph-expert)) —
see [Claude Code plugin](#claude-code-plugin) below. These directories are not
part of the Docusaurus build.

### `@heph/uikit`

Every antd component the site uses is re-exported through this package, themed
once via antd's `ConfigProvider` (`UIKitProvider` + `theme.ts`) against the
Blueprint design tokens (`styles/tokens.css`). The website **never imports
`antd` or `lucide-react` directly** — so the design system is a one-package
swap away. Alongside the proxies sit composable brand primitives: `Logo`,
`Cross`/`Corners`, `Eyebrow`, `Coord`, `Dim`, `Ruler`.

### `@heph/website`

Docusaurus 3 with a fully bespoke landing page (`src/pages/index.tsx` →
`src/components/landing/`), a few placeholder docs (`docs/`), and the antd theme
provider mounted globally via a swizzled `src/theme/Root.tsx`.

## Toolchain

- **Node 24** (provided by devenv)
- **TypeScript 6** — strict, all TypeScript, no JavaScript
- **Vite 8** for the uikit library build
- **ESLint** — Airbnb preset + `airbnb-typescript`, strict (`--max-warnings 0`)

## Develop

Everything runs inside `devenv shell` so local and CI are identical:

```bash
devenv shell install   # npm ci
devenv shell dev       # build uikit, then start the docs/site dev server
devenv shell lint      # eslint . --max-warnings 0
devenv shell build     # build uikit, then the static site into website/build
```

Or with plain npm (Node ≥ 22):

```bash
npm ci
npm run build:uikit    # the website resolves @heph/uikit from its built dist
npm start              # dev server (prestart rebuilds the uikit)
npm run build          # uikit + website
```

## Deploy

`.github/workflows/deploy.yml` builds entirely inside `devenv shell` (Nix +
`devenv.sh`) and publishes `website/build` to **GitHub Pages** on every push to
`main`.

## Claude Code plugin

This repo also serves a [Claude Code](https://claude.com/claude-code) plugin
marketplace. `.claude-plugin/marketplace.json` lists **`heph-expert`** — a
skill + agent + commands that make Claude an expert on the heph build system —
via a relative `./plugins/heph-expert` source.

```bash
# in Claude Code
/plugin marketplace add hephbuild/hephbuild.github.io
/plugin install heph-expert@heph-marketplace
```

The plugin's `plugins/heph-expert/skills/heph/references/*.md` are distilled
from the docs pages in this repo. **When heph behavior changes, update the docs
page and its reference twin in the same PR** so the bundled references don't
drift. See [`plugins/heph-expert/README.md`](./plugins/heph-expert/README.md).
