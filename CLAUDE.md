# CLAUDE.md

heph marketing site + docs. npm workspaces: `uikit` (antd-based UI kit) + `website` (Docusaurus). Everything runs inside `devenv shell` so local == CI (see `devenv.nix`).

## Commands (run inside `devenv shell`)

- `install` / `lint` / `build` / `dev` — devenv scripts mirrored by CI.
- `npm run start` (= `dev`) — Docusaurus dev server on **port 3000** (builds uikit first via `prestart`).

## Screenshots (Playwright)

Browsers come from nixpkgs, NOT `npx playwright install`. The npm `playwright` dep is pinned to match `pkgs.playwright-driver` (currently **1.59.1**) — when bumping one, bump the other (`nix eval --raw nixpkgs#playwright-driver.version`).

To capture the site:

1. Start the dev server if nothing is on port 3000. Launch it **detached** (a plain
   `... &` inside a `bash -c` dies when that subshell exits — use the run-in-background
   tool or `exec`):
   `devenv shell bash -- -c 'cd website && exec npx docusaurus start --port 3000 --no-open'`
   then poll `curl -sf http://localhost:3000` until HTTP 200. First boot rebuilds uikit
   (~30–60s). If you change node_modules (`npm ci`/`install`), restart the server — a
   running server breaks on module reshuffle.
2. Screenshot:
   `screenshot <url> [out.png] [desktop|mobile]`
   e.g. `screenshot http://localhost:3000 .screenshots/home.png mobile`
3. Read the PNG to view it. Output goes in `.screenshots/` (gitignored).

Full-page PNG, waits for network idle. `desktop` = 1440×900 @2x, `mobile` = iPhone 13. Script: `scripts/screenshot.mjs`.
