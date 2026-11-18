{ pkgs, ... }:

{
  languages.javascript = {
    enable = true;
    # Node 24 (current LTS). Node 26 is not released yet (~Oct 2026).
    package = pkgs.nodejs_24;
    npm.enable = true;
  };

  # Playwright browsers come from nixpkgs (not `npx playwright install`), so the
  # npm `playwright` dep MUST match this driver version. Check with:
  #   nix eval --raw nixpkgs#playwright-driver.version   (currently 1.59.1)
  packages = [ pkgs.playwright-driver.browsers ];
  env = {
    PLAYWRIGHT_BROWSERS_PATH = pkgs.playwright-driver.browsers;
    PLAYWRIGHT_SKIP_VALIDATE_HOST_REQUIREMENTS = "true";
    # npm install must NOT try to download its own browsers — use the nix ones.
    PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD = "1";
    # onnxruntime-node (pulled in by transformers.js for build-time search
    # embeddings) downloads its CUDA add-on from GitHub releases on linux-x64
    # during `npm ci`. We only run on CPU, and that asset 404s — skip it. The
    # CPU binaries ship inside the npm package.
    ONNXRUNTIME_NODE_INSTALL_CUDA = "skip";
  };

  # Scripts mirrored by CI (see .github/workflows/deploy.yml) so local and CI
  # runs are identical — everything happens inside `devenv shell`.
  scripts.install.exec = "npm ci";
  scripts.lint.exec = "npm run lint";
  scripts.build.exec = "npm run build";
  scripts.dev.exec = "npm run start";
  # Screenshot a URL. Usage: screenshot <url> [out.png] [desktop|mobile]
  scripts.screenshot.exec = "node scripts/screenshot.mjs";
}
